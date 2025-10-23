const router = require('express').Router();
const { prisma, Prisma } = require('../utils/prisma.cjs');
const { requireProjectMember, assertProjectMember } = require('../middleware/membership.cjs');
const { checkSupplierCompliance } = require('../services/compliance.service.cjs');

function toDecimal(value) {
  try {
    return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value || 0);
  } catch (_) {
    return new Prisma.Decimal(0);
  }
}

router.post('/packages/:id/direct-award', requireProjectMember, async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = req.user?.id ? Number(req.user.id) : null;
  const packageId = Number(req.params.id);

  if (!tenantId || !Number.isFinite(packageId)) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }

  try {
    const body = req.body || {};
    const supplierId = Number(body.supplierId);
    if (!Number.isFinite(supplierId)) {
      return res.status(400).json({ error: 'SUPPLIER_REQUIRED' });
    }

    const mode = (body.mode || 'all').toString();
    const selectedLineIds = Array.isArray(body.lineItemIds)
      ? body.lineItemIds.map(Number).filter(Number.isFinite)
      : [];

    const pkg = await prisma.package.findFirst({
      where: { id: packageId },
      select: {
        id: true,
        projectId: true,
        name: true,
        status: true,
        awardValue: true,
        awardSupplierId: true,
      },
    });
    if (!pkg) {
      return res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });
    }

    if (!req.membership && Number.isFinite(pkg.projectId)) {
      const membership = await assertProjectMember({
        tenantId,
        projectId: pkg.projectId,
        userId,
      });
      const roles = Array.isArray(req.user?.roles) ? req.user.roles : req.user?.role ? [req.user.role] : [];
      const isAdmin = roles.includes('admin');
      if (!membership && !isAdmin) {
        return res.status(403).json({ error: 'NOT_A_PROJECT_MEMBER' });
      }
    }

    const packageLineItems = await prisma.packageLineItem.findMany({
      where: { packageId: pkg.id, tenantId },
      orderBy: { id: 'asc' },
    });

    if (!packageLineItems.length) {
      return res.status(400).json({ error: 'NO_PACKAGE_LINES' });
    }

    const selectedSet = new Set(selectedLineIds);
    const chosenLines =
      mode === 'selected'
        ? packageLineItems.filter(
            (line) =>
              selectedSet.has(Number(line.budgetLineItemId)) ||
              selectedSet.has(Number(line.id))
          )
        : packageLineItems;

    if (!chosenLines.length) {
      return res.status(400).json({ error: 'NO_SELECTED_LINES' });
    }

    const chosenBudgetLineIds = chosenLines
      .map((line) => (line.budgetLineItemId != null ? Number(line.budgetLineItemId) : null))
      .filter((id) => Number.isFinite(id));
    const chosenPackageLineItemIds = chosenLines.map((line) => line.id).filter((id) => Number.isFinite(id));

    let conflicts = [];
    if (chosenBudgetLineIds.length) {
      conflicts = await prisma.contractLineItem.findMany({
        where: {
          tenantId,
          budgetLineId: { in: chosenBudgetLineIds },
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

    if (chosenPackageLineItemIds.length) {
      const fallback = await prisma.contractLineItem.findMany({
        where: {
          tenantId,
          packageLineItemId: { in: chosenPackageLineItemIds },
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
      const seen = new Set(conflicts.map((c) => c.id));
      for (const row of fallback) {
        if (seen.has(row.id)) continue;
        conflicts.push(row);
      }
    }

    if (conflicts.length) {
      return res.status(409).json({
        error: 'LINES_ALREADY_CONTRACTED',
        message: 'Some selected budget lines are already linked to a contract.',
        conflicts: conflicts.map((c) => ({
          contractId: c.contract?.id ?? null,
          contractTitle: c.contract?.title ?? null,
          packageId: c.contract?.packageId ?? null,
          supplier: c.contract?.supplier ?? null,
          budgetLineId: c.budgetLineId ?? null,
          packageLineItemId: c.packageLineItemId ?? null,
        })),
      });
    }

    const chosenItems =
      chosenLines;

    let subtotal = new Prisma.Decimal(0);
    const lineSnapshots = chosenItems.map((line) => {
      const qtyDecimal = toDecimal(line.qty ?? 0);
      const rateDecimal = toDecimal(line.rate ?? 0);
      let totalDecimal = line.total instanceof Prisma.Decimal ? line.total : null;
      if (!totalDecimal) {
        try {
          totalDecimal = qtyDecimal.mul(rateDecimal);
        } catch (_) {
          totalDecimal = new Prisma.Decimal(0);
        }
      }
      subtotal = subtotal.add(totalDecimal);
      return {
        packageLineItemId: line.id ?? null,
        budgetLineId: line.budgetLineItemId != null ? Number(line.budgetLineItemId) : null,
        description: line.description || '',
        qty: qtyDecimal,
        rate: rateDecimal,
        total: totalDecimal,
        costCode: line.costCode || null,
      };
    });

    const calcNet = Number(subtotal);
    const requestedAmount = body.awardAmount != null ? Number(body.awardAmount) : calcNet;
    const awardAmount = Number.isFinite(requestedAmount) ? requestedAmount : calcNet;
    const overrideApplied = Math.round((awardAmount - calcNet) * 100) !== 0;
    if (overrideApplied && !body.overrideReason) {
      return res.status(400).json({ error: 'OVERRIDE_REASON_REQUIRED' });
    }

    const compliance = await checkSupplierCompliance(tenantId, supplierId);
    if (!compliance.ok && !body.complianceOverrideReason) {
      return res.status(400).json({ error: 'COMPLIANCE_BLOCK', details: compliance });
    }

    const awardDate = body.awardDate ? new Date(body.awardDate) : new Date();
    const title = (body.name && body.name.toString().trim()) || pkg.name || 'Direct Award';
    const contractRef = (body.awardRef && body.awardRef.toString().trim()) || `DA-${pkg.id}-${Date.now()}`;

    const data = {
      tenantId,
      projectId: pkg.projectId,
      packageId: pkg.id,
      supplierId,
      title,
      contractRef,
      value: toDecimal(awardAmount),
      status: 'draft',
      startDate: awardDate,
      endDate: body.endDate ? new Date(body.endDate) : null,
      currency: body.currency || 'GBP',
      notes: body.notes || null,
      retentionPct:
        body.retentionPct == null || body.retentionPct === ''
          ? null
          : toDecimal(body.retentionPct, { allowNull: true }),
      paymentTerms: body.paymentTerms || null,
    };

    const awardAmountDecimal = toDecimal(awardAmount);

    let created;
    await prisma.$transaction(async (tx) => {
      created = await tx.contract.create({
        data: {
          ...data,
          value: awardAmountDecimal,
        },
      });

      if (lineSnapshots.length) {
        for (const line of lineSnapshots) {
          await tx.contractLineItem.create({
            data: {
              tenantId,
              contractId: created.id,
              description: line.description,
              qty: line.qty,
              rate: line.rate,
              total: line.total,
              costCode: line.costCode || null,
              packageLineItemId: line.packageLineItemId,
              budgetLineId: line.budgetLineId,
            },
          });
        }
      }

      await tx.package.update({
        where: { id: pkg.id },
        data: {
          status: 'awarded',
          awardSupplierId: pkg.awardSupplierId ? pkg.awardSupplierId : supplierId,
          awardValue: (() => {
            const existing = pkg.awardValue instanceof Prisma.Decimal
              ? pkg.awardValue
              : new Prisma.Decimal(pkg.awardValue || 0);
            return existing.add(awardAmountDecimal);
          })(),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entity: 'Contract',
          entityId: String(created.id),
          action: 'direct_award.create',
          changes: {
            packageId: pkg.id,
            supplierId,
            mode,
            selectedLineIds: lineSnapshots.map((l) => l.budgetLineId),
            calcNet,
            awardAmount,
            overrideApplied,
            overrideReason: overrideApplied ? body.overrideReason || null : null,
            complianceOk: compliance.ok,
            complianceFails: compliance.fails,
            complianceOverrideReason: body.complianceOverrideReason || null,
          },
        },
      });
    });

    try {
      const { recomputeProjectFinancials } = require('./hooks.recompute.cjs');
      await recomputeProjectFinancials(tenantId, pkg.projectId);
    } catch (recomputeErr) {
      console.warn('recomputeProjectFinancials error', recomputeErr?.message || recomputeErr);
    }

    return res.status(201).json({
      id: created.id,
      projectId: created.projectId,
      packageId: created.packageId,
      contractNumber: created.contractNumber,
    });
  } catch (error) {
    console.error('direct-award error', error);
    return res.status(500).json({ error: 'DIRECT_AWARD_FAILED' });
  }
});

module.exports = router;
