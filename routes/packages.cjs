const router = require('express').Router();
const { prisma, Prisma, toDecimal } = require('../lib/prisma.js');
const { writeAudit } = require('../lib/audit.cjs');
const { isPackageSourced } = require('../lib/sourcing.cjs');

function getTenantId(req) {
  return req.user?.tenantId || req.tenantId || 'demo';
}

function toNumber(value) {
  if (value == null) return null;
  if (value instanceof Prisma.Decimal) {
    try { return Number(value); } catch (_) { return null; }
  }
  if (typeof value === 'bigint') {
    try { return Number(value); } catch (_) { return null; }
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function serializePackage(pkg) {
  if (!pkg) return pkg;
  const { contracts = [], budgetItems = [], lineItems = [], ...rest } = pkg;

  const packageLineToBudget = new Map();
  if (Array.isArray(lineItems)) {
    for (const li of lineItems) {
      if (!li || li.id == null) continue;
      packageLineToBudget.set(li.id, li.budgetLineItemId ?? null);
    }
  }

  const contractSummaries = contracts.map((c) => {
    const supplier = c?.supplier ? { id: c.supplier.id, name: c.supplier.name } : null;
    const lines = Array.isArray(c?.lineItems)
      ? c.lineItems.map((li) => {
          const budgetLineId =
            li?.budgetLineId != null
              ? li.budgetLineId
              : (li?.packageLineItemId != null ? packageLineToBudget.get(li.packageLineItemId) ?? null : null);
          return {
            id: li.id,
            budgetLineId,
            packageLineItemId: li.packageLineItemId ?? null,
            description: li.description || null,
            total: toNumber(li.total),
          };
        })
      : [];
    return {
      id: c.id,
      title: c.title,
      contractRef: c.contractRef,
      status: c.status,
      awardValue: toNumber(c.value),
      supplier,
      currency: c.currency,
      startDate: c.startDate,
      endDate: c.endDate,
      lineItems: lines,
    };
  });

  const assignmentByBudgetId = new Map();
  for (const contract of contractSummaries) {
    const supplier = contract.supplier ? { ...contract.supplier } : null;
    const assignmentSummary = {
      contractId: contract.id,
      contractTitle: contract.title,
      contractRef: contract.contractRef,
      status: contract.status,
      supplier,
      currency: contract.currency,
      awardValue: contract.awardValue,
    };
    for (const line of contract.lineItems || []) {
      if (!line || line.budgetLineId == null) continue;
      if (!assignmentByBudgetId.has(line.budgetLineId)) {
        assignmentByBudgetId.set(line.budgetLineId, []);
      }
      assignmentByBudgetId.get(line.budgetLineId).push(assignmentSummary);
    }
  }

  const budgetLines = budgetItems
    .filter((it) => it?.budgetLine)
    .map((it) => {
      const bl = it.budgetLine;
      const assignments = assignmentByBudgetId.get(bl.id) || [];
      const primary = assignments[0] || null;
      return {
        id: bl.id,
        description: bl.description,
        qty: bl.qty != null ? Number(bl.qty) : null,
        unit: bl.unit || null,
        rate: bl.rate != null ? Number(bl.rate) : null,
        total: bl.total != null ? Number(bl.total) : Number(bl.amount || 0),
        costCode: bl.costCode
          ? { id: bl.costCode.id, code: bl.costCode.code, description: bl.costCode.description || '' }
          : null,
        assignments,
        supplier: primary?.supplier || null,
        supplierName: primary?.supplier?.name || null,
        contract: primary
          ? {
              id: primary.contractId,
              title: primary.contractTitle,
              contractRef: primary.contractRef,
              status: primary.status,
            }
          : null,
        contractTitle: primary?.contractTitle || null,
      };
    });

  const primaryContract = contractSummaries[0] || null;
  return {
    ...rest,
    scope: rest.scopeSummary ?? null,
    contract: primaryContract
      ? {
          id: primaryContract.id,
          title: primaryContract.title,
          contractRef: primaryContract.contractRef,
          status: primaryContract.status,
          currency: primaryContract.currency,
          awardValue: primaryContract.awardValue,
          supplier: primaryContract.supplier || null,
        }
      : null,
    contracts: contractSummaries,
    budgetLines,
  };
}

const ACTIVE_CONTRACT_STATUSES = ['draft', 'active', 'executed', 'live'];
const INACTIVE_STATUSES = ['cancelled', 'canceled', 'closed', 'terminated', 'withdrawn', 'void', 'archived'];

function parseLimit(raw, { fallback = 100, max = 200 } = {}) {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.floor(numeric)));
}

function parseCursor(raw) {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
}

function buildCursorOptions(cursor) {
  if (!cursor) return {};
  return { skip: 1, cursor: { id: cursor } };
}

function isUnknownFieldError(err) {
  const message = String(err?.message || '').toLowerCase();
  if (!message) return false;
  if (message.includes('unknown') && (message.includes('field') || message.includes('argument'))) {
    return true;
  }
  return message.includes('relation') && message.includes('not found');
}

async function findPackageForTenant(packageId, tenantId) {
  try {
    const pkg = await prisma.package.findFirst({
      where: { id: packageId, project: { tenantId } },
      select: { id: true, projectId: true },
    });
    if (pkg) return pkg;
  } catch (err) {
    if (!isUnknownFieldError(err)) throw err;
  }

  try {
    const pkg = await prisma.package.findFirst({
      where: { id: packageId },
      select: {
        id: true,
        projectId: true,
        project: { select: { tenantId: true } },
      },
    });
    if (!pkg) return null;
    if (pkg.project?.tenantId != null && String(pkg.project.tenantId) !== String(tenantId)) {
      return null;
    }
    return { id: pkg.id, projectId: pkg.projectId };
  } catch (err) {
    if (isUnknownFieldError(err)) return null;
    throw err;
  }
}

async function fetchUnsourcedWithRelations({ tenantId, take, cursor }) {
  const baseWhere = {
    project: { tenantId },
    tenders: { none: { tenantId, status: { not: 'cancelled' } } },
    contracts: { none: { tenantId, status: { in: ACTIVE_CONTRACT_STATUSES } } },
  };

  const attempts = [
    {
      where: {
        ...baseWhere,
        directAwards: { none: { tenantId, status: { notIn: INACTIVE_STATUSES } } },
        internalResourceAssignments: { none: { tenantId, status: { notIn: INACTIVE_STATUSES } } },
      },
    },
    {
      where: {
        ...baseWhere,
        directAwards: { none: { tenantId, status: { notIn: INACTIVE_STATUSES } } },
      },
    },
    { where: baseWhere },
  ];

  const select = { id: true, name: true, updatedAt: true };

  for (const attempt of attempts) {
    try {
      return await prisma.package.findMany({
        where: attempt.where,
        orderBy: { updatedAt: 'desc' },
        take,
        ...buildCursorOptions(cursor),
        select,
      });
    } catch (err) {
      if (!isUnknownFieldError(err)) throw err;
    }
  }

  return null;
}

function mapUnsourced(pkg) {
  if (!pkg) return null;
  const label = pkg.name || `Package ${pkg.id}`;
  return {
    id: pkg.id,
    name: pkg.name || null,
    label,
    updatedAt: pkg.updatedAt,
  };
}

// GET /api/packages/:id/check-sourcing — read-only guard for package actions.
router.get('/packages/:id/check-sourcing', async (req, res) => {
  const tenantId = getTenantId(req);
  if (!tenantId) return res.status(401).json({ error: 'UNAUTHENTICATED' });

  const packageId = Number(req.params.id);
  if (!Number.isFinite(packageId)) return res.status(400).json({ error: 'INVALID_PACKAGE_ID' });

  const traceId = req._rid || req.headers['x-request-id'] || null;

  try {
    const pkg = await findPackageForTenant(packageId, tenantId);
    if (!pkg) {
      console.warn(`[REQ ${traceId}] packages.check-sourcing not found`, { tenantId, packageId });
      return res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });
    }

    const sourced = await isPackageSourced(prisma, tenantId, packageId);
    console.info(`[REQ ${traceId}] packages.check-sourcing`, { tenantId, packageId, sourced });
    return res.json({ sourced });
  } catch (err) {
    console.error(`[REQ ${traceId}] packages.check-sourcing error`, err);
    return res.status(500).json({ error: 'FAILED_TO_CHECK_SOURCING' });
  }
});

// GET /api/packages/unsourced — list packages without active sourcing.
router.get('/packages/unsourced', async (req, res) => {
  const tenantId = getTenantId(req);
  if (!tenantId) return res.status(401).json({ error: 'UNAUTHENTICATED' });

  const limit = parseLimit(req.query?.limit, { fallback: 100, max: 200 });
  const cursor = parseCursor(req.query?.cursor);
  const take = limit + 1;
  const traceId = req._rid || req.headers['x-request-id'] || null;

  let rows = null;
  let usedFallback = false;

  try {
    rows = await fetchUnsourcedWithRelations({ tenantId, take, cursor });
  } catch (err) {
    console.warn(`[REQ ${traceId}] packages.unsourced relation filter error`, err);
  }

  if (!rows) {
    usedFallback = true;
    const batch = await prisma.package.findMany({
      where: { project: { tenantId } },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(500, take),
      ...buildCursorOptions(cursor),
      select: { id: true, name: true, updatedAt: true },
    });

    const filtered = [];
    for (const pkg of batch) {
      // Sequential checks are acceptable for the capped fallback batch.
      // eslint-disable-next-line no-await-in-loop
      const sourced = await isPackageSourced(prisma, tenantId, pkg.id);
      if (!sourced) {
        filtered.push(pkg);
      }
      if (filtered.length >= take) {
        break;
      }
    }
    rows = filtered;
  }

  rows = rows || [];
  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const items = sliced.map(mapUnsourced).filter(Boolean);
  const nextCursor = hasMore ? String(sliced[sliced.length - 1].id) : null;

  console.info(`[REQ ${traceId}] packages.unsourced`, {
    tenantId,
    limit,
    cursor,
    returned: items.length,
    nextCursor,
    usedFallback,
  });

  res.json({ items, nextCursor });
});

router.get('/packages', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { projectId } = req.query || {};
    const where = { project: { tenantId } };
    if (projectId) where.projectId = Number(projectId);

    const packages = await prisma.package.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: {
        awardSupplier: { select: { id: true, name: true } },
        contracts: {
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            contractRef: true,
            status: true,
            value: true,
            currency: true,
            startDate: true,
            endDate: true,
            supplier: { select: { id: true, name: true } },
            lineItems: {
              select: {
                id: true,
                budgetLineId: true,
                packageLineItemId: true,
                description: true,
                total: true,
              },
            },
          },
        },
        budgetItems: {
          include: { budgetLine: { include: { costCode: true } } },
        },
        lineItems: {
          select: { id: true, budgetLineItemId: true },
        },
        requests: {
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, title: true },
        },
      },
    });

    const payload = packages.map((pkg) => {
      const base = serializePackage(pkg);

      // Determine sourcing status and related info
      let sourcingStatus = null;
      let tenderId = null;
      let contractId = null;

      // Check for active tender (Request table)
      const latestRequest = pkg.requests && pkg.requests[0];
      if (latestRequest && ['draft', 'open', 'issued', 'evaluating'].includes(latestRequest.status)) {
        sourcingStatus = 'tender';
        tenderId = latestRequest.id;
      }

      // Check for contract (takes precedence if exists)
      const primaryContract = pkg.contracts && pkg.contracts[0];
      if (primaryContract) {
        contractId = primaryContract.id;
        // If there's a contract without an active tender, it's likely a direct award
        if (!sourcingStatus) {
          sourcingStatus = 'direct_award';
        }
      }

      // Future: could check for 'internal_resource' flag on package
      // if (pkg.isInternal) sourcingStatus = 'internal_resource';

      return {
        ...base,
        awardSupplier: pkg.awardSupplier ? { id: pkg.awardSupplier.id, name: pkg.awardSupplier.name } : null,
        sourcingStatus,
        tenderId,
        contractId,
      };
    });

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.post('/packages/:packageId/add-budget-lines', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.user?.id;
    const packageId = Number(req.params.packageId);
    if (!Number.isFinite(packageId)) return res.status(400).json({ error: 'Invalid package id' });

    const rawIds =
      (Array.isArray(req.body?.lineItemIds) && req.body.lineItemIds) ||
      (Array.isArray(req.body?.budgetLineIds) && req.body.budgetLineIds) ||
      [];
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ error: 'lineItemIds array required' });
    }

    const ids = rawIds
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (!ids.length) return res.status(400).json({ error: 'lineItemIds must contain numbers' });

    const pkg = await prisma.package.findFirst({
      where: { id: packageId, project: { tenantId } },
      select: { id: true, projectId: true },
    });
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const budgetLines = await prisma.budgetLine.findMany({
      where: {
        id: { in: ids },
        tenantId,
        projectId: pkg.projectId,
      },
    });
    if (!budgetLines.length) {
      return res.status(404).json({ error: 'Budget lines not found for package/project' });
    }
    const missing = ids.filter((id) => !budgetLines.some((line) => line.id === id));
    if (missing.length) {
      return res.status(404).json({ error: 'Some budget lines not found', missing });
    }

    const existingSnapshots = await prisma.packageLineItem.findMany({
      where: {
        tenantId,
        packageId: pkg.id,
        budgetLineItemId: { in: ids },
      },
      select: { budgetLineItemId: true },
    });
    const existingSet = new Set(existingSnapshots.map((row) => row.budgetLineItemId));

    const existingLegacy = await prisma.packageItem.findMany({
      where: {
        tenantId,
        packageId: pkg.id,
        budgetLineId: { in: ids },
      },
      select: { budgetLineId: true },
    });
    const legacySet = new Set(existingLegacy.map((row) => row.budgetLineId));

    const linesToAdd = budgetLines.filter((line) => !existingSet.has(line.id));
    if (!linesToAdd.length) {
      return res.status(200).json({
        added: 0,
        skipped: ids.length,
        existing: Array.from(new Set([...existingSet, ...legacySet])),
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const items = [];
      for (const line of linesToAdd) {
        const qty = toDecimal(line.qty ?? 0);
        const rate = toDecimal(line.rate ?? 0, { fallback: 0 });
        let total = line.total instanceof Prisma.Decimal ? line.total : null;
        if (!total) {
          try {
            total = qty.mul(rate);
          } catch (_) {
            total = new Prisma.Decimal(0);
          }
        }
        const description = line.description || line.code || `Budget Line ${line.id}`;
        const item = await tx.packageLineItem.create({
          data: {
            tenantId,
            packageId: pkg.id,
            budgetLineItemId: line.id,
            description,
            qty,
            rate,
            total,
            costCode: line.code || null,
          },
        });
        if (!legacySet.has(line.id)) {
          await tx.packageItem.create({
            data: {
              tenantId,
              packageId: pkg.id,
              budgetLineId: line.id,
            },
          });
          legacySet.add(line.id);
        }
        items.push(item);
      }
      return items;
    });

    await writeAudit({
      prisma,
      req,
      userId,
      entity: 'Package',
      entityId: pkg.id,
      action: 'bulk_add_from_budget',
      changes: { budgetLineIds: created.map((item) => item.budgetLineItemId) },
    });

    res.status(201).json({ added: created.length, items: created, skipped: Array.from(existingSet) });
  } catch (err) {
    next(err);
  }
});

router.patch('/packages/:packageId', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.user?.id;
    const packageId = Number(req.params.packageId);
    if (!Number.isFinite(packageId)) return res.status(400).json({ error: 'Invalid package id' });

    const existing = await prisma.package.findFirst({
      where: { id: packageId, project: { tenantId } },
      include: {
        awardSupplier: { select: { id: true, name: true } },
        contracts: {
          where: { tenantId },
          select: {
            id: true,
            title: true,
            contractRef: true,
            status: true,
            value: true,
            currency: true,
            startDate: true,
            endDate: true,
            supplier: { select: { id: true, name: true } },
            lineItems: {
              select: {
                id: true,
                budgetLineId: true,
                packageLineItemId: true,
                description: true,
                total: true,
              },
            },
          },
        },
        budgetItems: { include: { budgetLine: { include: { costCode: true } } } },
        lineItems: { select: { id: true, budgetLineItemId: true } },
      },
    });
    if (!existing) return res.status(404).json({ error: 'Package not found' });

    const data = {};
    const {
      name,
      scopeSummary,
      scope,
      trade,
      status,
      awardSupplierId,
      awardValue,
      targetAwardDate,
      requiredOnSite,
      deadline,
      leadTimeWeeks,
      contractForm,
      retentionPct,
      paymentTerms,
    } = req.body || {};

    if (name !== undefined) data.name = name;
    if (scopeSummary !== undefined || scope !== undefined) data.scopeSummary = scopeSummary ?? scope ?? null;
    if (trade !== undefined) data.trade = trade;
    if (status !== undefined) data.status = status;
    if (leadTimeWeeks !== undefined) data.leadTimeWeeks = leadTimeWeeks != null ? Number(leadTimeWeeks) : null;
    if (contractForm !== undefined) data.contractForm = contractForm || null;
    if (paymentTerms !== undefined) data.paymentTerms = paymentTerms || null;
    if (retentionPct !== undefined) {
      data.retentionPct = retentionPct != null ? toDecimal(retentionPct, { fallback: 0 }) : null;
    }
    if (targetAwardDate !== undefined) data.targetAwardDate = targetAwardDate ? new Date(targetAwardDate) : null;
    if (requiredOnSite !== undefined) data.requiredOnSite = requiredOnSite ? new Date(requiredOnSite) : null;
    if (deadline !== undefined) data.deadline = deadline ? new Date(deadline) : null;
    if (awardValue !== undefined) {
      data.awardValue = awardValue != null ? toDecimal(awardValue, { fallback: 0 }) : null;
    }
    if (awardSupplierId !== undefined) {
      if (awardSupplierId == null) {
        data.awardSupplierId = null;
      } else {
        const supplier = await prisma.supplier.findFirst({
          where: { tenantId, id: Number(awardSupplierId) },
          select: { id: true },
        });
        if (!supplier) return res.status(400).json({ error: 'Award supplier not found' });
        data.awardSupplierId = supplier.id;
      }
    }

    if (Object.keys(data).length === 0) {
      return res.json(serializePackage(existing));
    }

    const updated = await prisma.package.update({
      where: { id: existing.id },
      data,
      include: {
        awardSupplier: { select: { id: true, name: true } },
        contracts: {
          where: { tenantId },
          include: { supplier: { select: { id: true, name: true } } },
        },
        budgetItems: { include: { budgetLine: { include: { costCode: true } } } },
      },
    });

    await writeAudit({
      prisma,
      req,
      userId,
      entity: 'Package',
      entityId: updated.id,
      action: 'PACKAGE_UPDATE',
      changes: data,
    });

    res.json(
      serializePackage({
        ...updated,
        awardSupplier: updated.awardSupplier ? { id: updated.awardSupplier.id, name: updated.awardSupplier.name } : null,
      }),
    );
  } catch (err) {
    next(err);
  }
});

// GET /packages/:id/contracts — helper to get contracts for a package
router.get('/packages/:id/contracts', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const packageId = Number(req.params.id);
    if (!Number.isFinite(packageId)) {
      return res.status(400).json({ error: 'Invalid package id' });
    }

    // Verify package exists
    const pkg = await prisma.package.findFirst({
      where: { id: packageId, project: { tenantId } },
      select: { id: true },
    });
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    // Fetch contracts for this package
    const contracts = await prisma.contract.findMany({
      where: { packageId, tenantId },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        supplier: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    });

    res.json({ items: contracts, total: contracts.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
