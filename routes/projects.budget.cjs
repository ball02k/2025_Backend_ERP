const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { safeJson } = require('../lib/serialize.cjs');
const { recomputeProjectFinancials } = require('./hooks.recompute.cjs');
const {
  evaluateBudgetLineLock,
  enforceDecision,
  sendCommercialLock,
} = require('../services/commercialLockService.cjs');
// Reuse import handlers to avoid mount/proxy issues
let importHandlers;
try { importHandlers = require('./budgets.import.cjs'); } catch (_) { importHandlers = null; }

const budgetLineSelect = {
  id: true,
  tenantId: true,
  projectId: true,
  code: true,
  categoryId: true,
  budgetCategory: { select: { id: true, code: true, name: true, color: true, sortOrder: true } },
  periodMonth: true,
  description: true,
  qty: true,
  unit: true,
  rate: true,
  total: true,
  amount: true,
  planned: true,
  estimated: true,
  actual: true,
  createdAt: true,
  updatedAt: true,
  costCodeId: true,
  packageItems: {
    select: {
      packageId: true,
      package: { select: { id: true, name: true } },
    },
  },
};

function toCategoryCode(value) {
  const code = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return code || null;
}

async function resolveBudgetCategoryId(tenantId, userId, value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const existing = await prisma.budgetCategory.findFirst({
    where: {
      tenantId,
      OR: [
        { id: raw },
        { code: { equals: raw, mode: 'insensitive' } },
        { name: { equals: raw, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const baseCode = toCategoryCode(raw);
  if (!baseCode) return null;
  let code = baseCode;
  let attempt = 1;
  while (await prisma.budgetCategory.findFirst({ where: { tenantId, code }, select: { id: true } })) {
    attempt += 1;
    code = `${baseCode}_${attempt}`;
  }

  const created = await prisma.budgetCategory.create({
    data: {
      tenantId,
      code,
      name: raw,
      createdBy: userId ? String(userId) : 'system',
    },
    select: { id: true },
  });
  return created.id;
}

function shapeBudgetLine(row) {
  const data = safeJson(row);
  data.category = data.budgetCategory?.name || data.categoryId || null;
  data.packages = Array.isArray(data.packageItems)
    ? data.packageItems.map((pi) => ({ id: pi?.package?.id || pi.packageId, name: pi?.package?.name || `#${pi.packageId}` }))
    : [];
  data.links = buildLinks('budgetLine', data);
  return data;
}

function readNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const n = Number(String(value).replace(/[£,]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function normaliseLegacyBudgetLine(input = {}) {
  const explicitTotal = input.total ?? input.amount ?? input.planned ?? input.estimated;
  const qtyFromInput = input.qty ?? input.quantity;
  const rateFromInput = input.rate ?? input.unitRate;
  const qty = readNumber(qtyFromInput, explicitTotal != null ? 1 : 0);
  const rate = readNumber(rateFromInput, 0);
  const computedTotal = qty > 0 && rate > 0 ? qty * rate : 0;
  const total = explicitTotal != null ? readNumber(explicitTotal, 0) : computedTotal;

  return {
    qty,
    rate: rate > 0 ? rate : (qty > 0 ? total / qty : 0),
    total,
    unit: input.unit ?? input.uom ?? (total > 0 ? 'item' : null),
  };
}

router.get('/projects/:projectId/budget', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const rows = await prisma.budgetLine.findMany({
      where: { tenantId, projectId },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: budgetLineSelect,
    });
    const data = rows.map(shapeBudgetLine);
    res.json({ items: data, total: data.length });
  } catch (e) { next(e); }
});

router.post('/projects/:projectId/budget', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    let count = 0;
    for (const l of lines) {
      const categoryId = l.categoryId !== undefined
        ? await resolveBudgetCategoryId(tenantId, req.user?.id, l.categoryId)
        : (l.category !== undefined ? await resolveBudgetCategoryId(tenantId, req.user?.id, l.category) : null);
      const values = normaliseLegacyBudgetLine(l);
      // Map incoming payload to schema fields
      const data = {
        tenantId,
        projectId,
        code: l.code ?? null,
        categoryId,
        periodMonth: l.periodMonth ?? null,
        description: l.description ?? null,
        qty: values.qty,
        unit: values.unit,
        rate: values.rate,
        total: values.total,
        amount: values.total,
        planned: values.total,
        costCodeId: l.costCodeId ?? null,
      };
      if (l.id) {
        const lockDecision = await evaluateBudgetLineLock({
          prisma,
          tenantId,
          projectId,
          budgetLineId: Number(l.id),
          action: 'update',
          proposedChanges: data,
        });
        await enforceDecision(req, 'BudgetLine', Number(l.id), 'UPSERT_UPDATE', lockDecision);
        await prisma.budgetLine.update({ where: { id: Number(l.id) }, data });
      } else {
        await prisma.budgetLine.create({ data });
      }
      count++;
    }
    try { await recomputeProjectFinancials(tenantId, projectId); } catch (_) {}
    res.json({ ok: true, count });
  } catch (e) {
    if (sendCommercialLock(res, e)) return;
    next(e);
  }
});

router.patch('/projects/:projectId/budget/:id', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const id = Number(req.params.id);
    // Sanitize patch: only allow known fields and map planned->amount
    const b = req.body || {};
    const data = {};
    if (b.code !== undefined) data.code = b.code ?? null;
    if (b.categoryId !== undefined) data.categoryId = await resolveBudgetCategoryId(tenantId, req.user?.id, b.categoryId);
    if (b.category !== undefined) data.categoryId = await resolveBudgetCategoryId(tenantId, req.user?.id, b.category);
    if (b.periodMonth !== undefined) data.periodMonth = b.periodMonth ?? null;
    if (b.description !== undefined) data.description = b.description ?? null;
    if (
      b.qty !== undefined ||
      b.quantity !== undefined ||
      b.rate !== undefined ||
      b.unitRate !== undefined ||
      b.total !== undefined ||
      b.amount !== undefined ||
      b.planned !== undefined ||
      b.estimated !== undefined
    ) {
      const values = normaliseLegacyBudgetLine(b);
      data.qty = values.qty;
      data.unit = values.unit;
      data.rate = values.rate;
      data.total = values.total;
      data.amount = values.total;
      data.planned = values.total;
    }
    if (b.costCodeId !== undefined) data.costCodeId = b.costCodeId ?? null;
    const lockDecision = await evaluateBudgetLineLock({
      prisma,
      tenantId,
      projectId,
      budgetLineId: id,
      action: 'update',
      proposedChanges: data,
    });
    await enforceDecision(req, 'BudgetLine', id, 'UPDATE', lockDecision);
    const updated = await prisma.budgetLine.update({ where: { id }, data, select: budgetLineSelect });
    try { await recomputeProjectFinancials(tenantId, projectId); } catch (_) {}
    res.json(shapeBudgetLine(updated));
  } catch (e) {
    if (sendCommercialLock(res, e)) return;
    next(e);
  }
});

module.exports = router;
// Attach import endpoints here too to guarantee availability under this router
if (importHandlers && importHandlers.previewHandler && importHandlers.commitHandler) {
  router.post('/projects/:projectId/budgets/import', importHandlers.previewHandler);
  router.post('/projects/:projectId/budgets/commit', importHandlers.commitHandler);
}
