const express = require('express');
const { Prisma } = require('@prisma/client');
const { prisma } = require('../utils/prisma.cjs');
const { requireTenant } = require('../middleware/tenant.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');
const { writeAudit } = require('../lib/audit.cjs');
const { checkSupplierCompliance } = require('../lib/compliance.cjs');

const router = express.Router();

function toDecimal(value, fallback = 0) {
  if (value instanceof Prisma.Decimal) return value;
  if (value == null || value === '') return new Prisma.Decimal(fallback);
  try {
    return new Prisma.Decimal(value);
  } catch (_) {
    return new Prisma.Decimal(fallback);
  }
}

function decimalSum(values) {
  return values.reduce((acc, value) => {
    if (value instanceof Prisma.Decimal) {
      return acc.plus(value);
    }
    if (value == null) return acc;
    try {
      return acc.plus(new Prisma.Decimal(value));
    } catch (_) {
      return acc;
    }
  }, new Prisma.Decimal(0));
}

async function logAwardEvent({ tenantId, userId, entityId, action, details }) {
  if (!tenantId || entityId == null) return;
  await writeAudit(tenantId, userId ?? null, action, 'Package', entityId, details || {});
}

async function logBlockedAward(tenantId, userId, packageId, code, extra = {}) {
  await logAwardEvent({
    tenantId,
    userId,
    entityId: Number(packageId) || 0,
    action: 'award_blocked',
    details: { code, ...extra },
  });
}

async function fetchPackageLineRows(tenantId, packageId) {
  const snapshots = await prisma.packageLineItem.findMany({
    where: { tenantId, packageId },
    orderBy: { id: 'asc' },
  });
  let lineRows = snapshots.map((line) => ({ ...line, __source: 'snapshot' }));

  if (!lineRows.length) {
    const legacyItems = await prisma.packageItem.findMany({
      where: { tenantId, packageId },
      orderBy: { id: 'asc' },
      include: {
        budgetLine: {
          select: {
            id: true,
            description: true,
            qty: true,
            rate: true,
            total: true,
            amount: true,
            unit: true,
            code: true,
            costCode: { select: { code: true } },
          },
        },
      },
    });
    if (legacyItems.length) {
      lineRows = legacyItems.map((item) => {
        const bl = item.budgetLine || {};
        const qty = toDecimal(bl.qty ?? 0, 0);
        const rate = toDecimal(bl.rate ?? 0, 0);
        let total = bl.total instanceof Prisma.Decimal ? bl.total : null;
        if (!total && bl.amount != null) {
          try {
            total = new Prisma.Decimal(bl.amount);
          } catch (_) {
            total = null;
          }
        }
        if (!total) {
          try {
            total = qty.mul(rate);
          } catch (_) {
            total = new Prisma.Decimal(0);
          }
        }
        const budgetLineId =
          bl && bl.id != null
            ? Number(bl.id)
            : Number.isFinite(Number(item.budgetLineId))
            ? Number(item.budgetLineId)
            : null;
        return {
          id: item.id,
          budgetLineItemId: Number.isFinite(budgetLineId) ? budgetLineId : null,
          description: bl.description || `Budget Line ${bl.id ?? item.budgetLineId ?? item.id}`,
          qty,
          rate,
          total,
          costCode: bl.costCode?.code || bl.code || null,
          unit: bl.unit || null,
          __source: 'legacy',
        };
      });
    }
  }

  return lineRows;
}

async function findLineConflicts(tenantId, lineRows) {
  if (!Array.isArray(lineRows) || !lineRows.length) return [];

  const budgetLineIds = [];
  const packageLineItemIds = [];
  for (const line of lineRows) {
    if (line.__source === 'snapshot' && Number.isFinite(Number(line.id))) {
      packageLineItemIds.push(Number(line.id));
    }
    if (line.budgetLineItemId != null && Number.isFinite(Number(line.budgetLineItemId))) {
      budgetLineIds.push(Number(line.budgetLineItemId));
    }
  }

  let conflicts = [];
  if (budgetLineIds.length) {
    conflicts = await prisma.contractLineItem.findMany({
      where: {
        tenantId,
        budgetLineId: { in: budgetLineIds },
      },
      select: {
        id: true,
        budgetLineId: true,
        contract: {
          select: {
            id: true,
            title: true,
            packageId: true,
            supplier: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  if (packageLineItemIds.length) {
    const fallbackConflicts = await prisma.contractLineItem.findMany({
      where: {
        tenantId,
        packageLineItemId: { in: packageLineItemIds },
      },
      select: {
        id: true,
        packageLineItemId: true,
        contract: {
          select: {
            id: true,
            title: true,
            packageId: true,
            supplier: { select: { id: true, name: true } },
          },
        },
      },
    });
    const seenIds = new Set(conflicts.map((c) => c.id));
    for (const row of fallbackConflicts) {
      if (seenIds.has(row.id)) continue;
      conflicts.push(row);
    }
  }

  return conflicts.map((c) => ({
    contractId: c.contract?.id ?? null,
    contractTitle: c.contract?.title ?? null,
    packageId: c.contract?.packageId ?? null,
    supplier: c.contract?.supplier ?? null,
    budgetLineId: c.budgetLineId ?? null,
    packageLineItemId: c.packageLineItemId ?? null,
  }));
}

async function createAwardRecords({
  tenantId,
  projectId,
  packageId,
  supplierId,
  awardType,
  lineRows,
  userId,
  complianceOk,
  overrideReason,
  contractMeta = {},
  contractValueOverride = null,
  updatePackageData,
}) {
  const contractValue =
    contractValueOverride instanceof Prisma.Decimal
      ? contractValueOverride
      : contractValueOverride != null
        ? new Prisma.Decimal(contractValueOverride)
        : decimalSum(
            lineRows.map((line) => {
              if (line.total instanceof Prisma.Decimal) return line.total;
              if (line.qty instanceof Prisma.Decimal && line.rate instanceof Prisma.Decimal) {
                try {
                  return line.qty.mul(line.rate);
                } catch (_) {
                  return new Prisma.Decimal(0);
                }
              }
              return new Prisma.Decimal(0);
            })
          );

  const decisionLabel = complianceOk ? 'approved' : 'approved_with_override';

  const result = await prisma.$transaction(async (tx) => {
    let overrideRecord = null;
    if (!complianceOk && overrideReason) {
      overrideRecord = await tx.complianceOverride.create({
        data: {
          tenantId,
          supplierId,
          packageId,
          reason: overrideReason,
          createdById: userId,
        },
      });
    }

    const awardDecision = await tx.awardDecision.create({
      data: {
        tenantId,
        projectId,
        packageId,
        supplierId,
        awardType,
        decision: decisionLabel,
        reason: complianceOk ? null : overrideReason,
        decidedById: userId,
      },
    });

    const contract = await tx.contract.create({
      data: {
        tenantId,
        projectId,
        packageId,
        supplierId,
        status: 'draft',
        title: contractMeta.title || `Contract - ${contractMeta.packageName || packageId}`,
        contractRef: contractMeta.contractRef || null,
        value: contractValue,
        currency: contractMeta.currency || 'GBP',
        startDate: contractMeta.startDate ? new Date(contractMeta.startDate) : null,
        endDate: contractMeta.endDate ? new Date(contractMeta.endDate) : null,
        retentionPct:
          contractMeta.retentionPct != null ? new Prisma.Decimal(contractMeta.retentionPct) : null,
        paymentTerms: contractMeta.paymentTerms || null,
        notes: contractMeta.notes || null,
        internalTeam: null,
      },
    });

    for (const line of lineRows) {
      const qty = line.qty instanceof Prisma.Decimal ? line.qty : new Prisma.Decimal(line.qty || 0);
      const rate = line.rate instanceof Prisma.Decimal ? line.rate : new Prisma.Decimal(line.rate || 0);
      let total = line.total instanceof Prisma.Decimal ? line.total : null;
      if (!total) {
        try {
          total = qty.mul(rate);
        } catch (_) {
          total = new Prisma.Decimal(0);
        }
      }
      await tx.contractLineItem.create({
        data: {
          tenantId,
          contractId: contract.id,
          description: line.description || `Line ${line.id}`,
          qty,
          rate,
          total,
          costCode: line.costCode || null,
          packageLineItemId: line.__source === 'snapshot' ? line.id ?? null : null,
          budgetLineId:
            line.budgetLineItemId != null && Number.isFinite(Number(line.budgetLineItemId))
              ? Number(line.budgetLineItemId)
              : null,
        },
      });
    }

    const packageUpdatePayload = typeof updatePackageData === 'function'
      ? updatePackageData(contractValue)
      : updatePackageData;

    if (packageUpdatePayload) {
      await tx.package.update({
        where: { id: packageId },
        data: packageUpdatePayload,
      });
    }

    return { awardDecision, contract, overrideRecord };
  });

  await writeAudit(tenantId, userId, 'AWARD_DECISION_CREATED', 'AwardDecision', result.awardDecision.id, {
    projectId,
    packageId,
    supplierId,
    decision: decisionLabel,
    overrideReason,
  });

  await writeAudit(tenantId, userId, 'CONTRACT_CREATED_FROM_AWARD', 'Contract', result.contract.id, {
    projectId,
    packageId,
    supplierId,
    value: result.contract.value?.toString?.() || null,
    status: result.contract.status,
  });

  await writeAudit(tenantId, userId, 'PACKAGE_AWARD_CREATED', 'Package', packageId, {
    projectId,
    supplierId,
    contractId: result.contract.id,
    awardDecisionId: result.awardDecision.id,
    value: result.contract.value?.toString?.() || null,
  });

  return {
    awardDecisionId: result.awardDecision.id,
    contractId: result.contract.id,
    overrideId: result.overrideRecord?.id ?? null,
    contractValue,
  };
}

router.post('/awards', requireAuth, async (req, res) => {
  let tenantId;
  try {
    tenantId = requireTenant(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Tenant context required' });
  }

  const body = req.body || {};
  const projectId = Number(body.projectId);
  const packageId = Number(body.packageId);
  const supplierId = Number(body.supplierId);
  const awardType = String(body.awardType || '').toLowerCase();
  const overrideReason = body.overrideReason ? String(body.overrideReason).trim() : null;
  const userId = req.user?.id != null ? Number(req.user.id) : null;

  if (!Number.isFinite(projectId) || !Number.isFinite(packageId) || !Number.isFinite(supplierId) || !awardType) {
    return res.status(400).json({ error: 'projectId, packageId, supplierId, and awardType are required' });
  }

  try {
    const [project, pkg, supplier] = await Promise.all([
      prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true, name: true, code: true } }),
      prisma.package.findFirst({
        where: { id: packageId, projectId, project: { tenantId } },
        select: { id: true, name: true, projectId: true, awardValue: true, awardSupplierId: true },
      }),
      prisma.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true, name: true } }),
    ]);

    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!pkg) return res.status(404).json({ error: 'Package not found' });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const compliance = await checkSupplierCompliance({ tenantId, supplierId });
    if (!compliance.ok && !overrideReason) {
      return res.status(400).json({ error: 'Supplier failed compliance', missing: compliance.missing || [] });
    }

    let lineRows = await fetchPackageLineRows(tenantId, packageId);
    if (!lineRows.length) {
      return res
        .status(400)
        .json({ error: 'NO_PACKAGE_LINES', message: 'Add budget lines to the package before awarding.' });
    }

    const conflicts = await findLineConflicts(tenantId, lineRows);
    if (conflicts.length) {
      return res.status(409).json({
        error: 'BUDGET_LINES_ALREADY_CONTRACTED',
        message: 'One or more budget lines already belong to an existing contract.',
        conflicts,
      });
    }

    const contractMeta = {
      title: body.title || `Contract - ${pkg.name || pkg.id}`,
      contractRef: body.contractRef || null,
      currency: body.currency || 'GBP',
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      retentionPct: body.retentionPct != null ? body.retentionPct : null,
      paymentTerms: body.paymentTerms || null,
      notes: body.notes || null,
      packageName: pkg.name || pkg.id,
    };

    const result = await createAwardRecords({
      tenantId,
      projectId,
      packageId,
      supplierId,
      awardType,
      lineRows,
      userId,
      complianceOk: compliance.ok,
      overrideReason,
      contractMeta,
      contractValueOverride: null,
    });

    res.status(201).json({
      awardId: result.awardDecisionId,
      contractId: result.contractId,
      overrideId: result.overrideId,
    });
  } catch (err) {
    console.error('[awards.create] failed', err);
    res.status(500).json({ error: 'Failed to create award' });
  }
});

router.post('/packages/:packageId/award', requireAuth, async (req, res) => {
  let tenantId;
  try {
    tenantId = requireTenant(req);
  } catch (err) {
    return res
      .status(err.status || 400)
      .json({ code: 'TENANT_REQUIRED', message: err.message || 'Tenant context required' });
  }

  const packageId = Number(req.params.packageId);
  const userId = req.user?.id != null ? Number(req.user.id) : null;

  if (!Number.isFinite(packageId)) {
    await logBlockedAward(tenantId, userId, Number(req.params.packageId) || 0, 'BAD_REQUEST', { message: 'Invalid package id' });
    return res.status(400).json({ code: 'BAD_REQUEST', message: 'Invalid package id' });
  }

  const body = req.body || {};
  const supplierId = Number(body.supplierId);
  if (!Number.isFinite(supplierId)) {
    await logBlockedAward(tenantId, userId, packageId, 'SUPPLIER_REQUIRED');
    return res.status(400).json({ code: 'SUPPLIER_REQUIRED', message: 'supplierId is required' });
  }

  if (body.awardValue === undefined) {
    await logBlockedAward(tenantId, userId, packageId, 'AWARD_VALUE_REQUIRED');
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'awardValue is required' });
  }

  let awardValueDecimal = null;
  const numericValue = Number(body.awardValue);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    await logBlockedAward(tenantId, userId, packageId, 'INVALID_AWARD_VALUE');
    return res.status(400).json({ code: 'INVALID_AWARD_VALUE', message: 'awardValue must be a positive number' });
  }
  awardValueDecimal = new Prisma.Decimal(numericValue);

  const selectedLineIds = Array.isArray(body.selectedLineIds)
    ? body.selectedLineIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  const overrideFlag = Boolean(body.override);
  const overrideReasonRaw = body.overrideReason ? String(body.overrideReason).trim() : '';
  if (overrideFlag && !overrideReasonRaw) {
    await logBlockedAward(tenantId, userId, packageId, 'OVERRIDE_REASON_REQUIRED');
    return res
      .status(400)
      .json({ code: 'OVERRIDE_REASON_REQUIRED', message: 'overrideReason required when override=true' });
  }

  try {
    const pkg = await prisma.package.findFirst({
      where: { id: packageId, project: { tenantId } },
      select: {
        id: true,
        name: true,
        projectId: true,
        awardSupplierId: true,
        awardValue: true,
      },
    });

    if (!pkg) {
      await logBlockedAward(tenantId, userId, packageId, 'NOT_FOUND');
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Package not found' });
    }

    if (pkg.awardSupplierId != null) {
      await logBlockedAward(tenantId, userId, packageId, 'ALREADY_AWARDED');
      return res.status(409).json({ code: 'ALREADY_AWARDED', message: 'Package already awarded' });
    }

    const project = await prisma.project.findFirst({
      where: { id: pkg.projectId, tenantId },
      select: { id: true },
    });
    if (!project) {
      await logBlockedAward(tenantId, userId, packageId, 'NOT_FOUND');
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Package not found' });
    }

    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
      select: { id: true },
    });
    if (!supplier) {
      await logBlockedAward(tenantId, userId, packageId, 'SUPPLIER_NOT_FOUND');
      return res.status(400).json({ code: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found' });
    }

    let lineRows = await fetchPackageLineRows(tenantId, packageId);
    if (!lineRows.length) {
      await logBlockedAward(tenantId, userId, packageId, 'NO_PACKAGE_LINES');
      return res
        .status(400)
        .json({ code: 'NO_PACKAGE_LINES', message: 'Add budget lines to the package before awarding.' });
    }

    if (selectedLineIds.length) {
      const idSet = new Set(selectedLineIds.map((id) => Number(id)));
      const filtered = lineRows.filter((line) => {
        const lineId = Number(line.id);
        const budgetId = line.budgetLineItemId != null ? Number(line.budgetLineItemId) : null;
        return idSet.has(lineId) || (budgetId != null && idSet.has(budgetId));
      });
      if (!filtered.length) {
        await logBlockedAward(tenantId, userId, packageId, 'NO_SELECTED_LINES');
        return res
          .status(400)
          .json({ code: 'NO_SELECTED_LINES', message: 'Selected line items were not found in the package.' });
      }
      if (filtered.length !== idSet.size) {
        const foundIds = new Set(
          filtered.flatMap((line) => {
            const ids = [];
            if (Number.isFinite(Number(line.id))) ids.push(Number(line.id));
            if (line.budgetLineItemId != null && Number.isFinite(Number(line.budgetLineItemId))) {
              ids.push(Number(line.budgetLineItemId));
            }
            return ids;
          })
        );
        const missing = Array.from(idSet).filter((id) => !foundIds.has(id));
        if (missing.length) {
          await logBlockedAward(tenantId, userId, packageId, 'LINE_IDS_INVALID', { missing });
          return res.status(400).json({
            code: 'LINE_IDS_INVALID',
            message: 'Some selectedLineIds were not found in the package.',
            missing,
          });
        }
      }
      lineRows = filtered;
    }

    const conflicts = await findLineConflicts(tenantId, lineRows);
    if (conflicts.length) {
      await logBlockedAward(tenantId, userId, packageId, 'LINES_ALREADY_CONTRACTED', { conflicts });
      return res.status(409).json({
        code: 'LINES_ALREADY_CONTRACTED',
        message: 'One or more selected lines already belong to a contract.',
        conflicts,
      });
    }

    const compliance = await checkSupplierCompliance({ tenantId, supplierId });
    const complianceOk = compliance?.ok !== false;
    const effectiveOverrideReason = overrideFlag ? overrideReasonRaw : null;

    if (!complianceOk && !overrideFlag) {
      await logBlockedAward(tenantId, userId, packageId, 'COMPLIANCE_MISSING', {
        missing: Array.isArray(compliance?.missing) ? compliance.missing : [],
      });
      return res.status(409).json({
        code: 'COMPLIANCE_MISSING',
        missing: Array.isArray(compliance?.missing) ? compliance.missing : [],
        allowOverride: true,
        message: 'Supplier missing required compliance.',
      });
    }

    const contractMeta = {
      title: `Contract - ${pkg.name || pkg.id}`,
      contractRef: null,
      currency: 'GBP',
      packageName: pkg.name || pkg.id,
    };

    const result = await createAwardRecords({
      tenantId,
      projectId: pkg.projectId,
      packageId: pkg.id,
      supplierId,
      awardType: 'direct',
      lineRows,
      userId,
      complianceOk: complianceOk || (overrideFlag && !!effectiveOverrideReason),
      overrideReason: effectiveOverrideReason,
      contractMeta,
      contractValueOverride: awardValueDecimal,
      updatePackageData: (value) => ({
        awardSupplierId: supplierId,
        awardValue: awardValueDecimal ?? value,
      }),
    });

    res.status(201).json({
      awardId: result.awardDecisionId,
      contractId: result.contractId,
      packageId: pkg.id,
      supplierId,
      committed: Number(result.contractValue),
    });
  } catch (err) {
    console.error('[packages.award] failed', err);
    res.status(500).json({ code: 'AWARD_FAILED', message: 'Failed to create award' });
  }
});

module.exports = router;
