const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { safeJson } = require('../lib/serialize.cjs');
const { recomputeProjectFinancials } = require('./hooks.recompute.cjs');

const budgetLineSelect = {
  id: true,
  tenantId: true,
  projectId: true,
  code: true,
  category: true,
  periodMonth: true,
  description: true,
  amount: true,
  planned: true,
  estimated: true,
  actual: true,
  createdAt: true,
  updatedAt: true,
  costCodeId: true,
};

router.get('/projects/:projectId/budget', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const rows = await prisma.budgetLine.findMany({
      where: { tenantId, projectId },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: budgetLineSelect,
    });
    const data = rows.map(r => { const row = safeJson(r); row.links = buildLinks('budgetLine', row); return row; });
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
      // Map incoming payload to schema fields
      const data = {
        tenantId,
        projectId,
        code: l.code ?? null,
        category: l.category ?? null,
        periodMonth: l.periodMonth ?? null,
        description: l.description ?? null,
        amount: l.planned != null ? Number(l.planned) : (l.amount != null ? Number(l.amount) : 0),
        costCodeId: l.costCodeId ?? null,
      };
      if (l.id) {
        await prisma.budgetLine.update({ where: { id: Number(l.id) }, data });
      } else {
        await prisma.budgetLine.create({ data });
      }
      count++;
    }
    try { await recomputeProjectFinancials(tenantId, projectId); } catch (_) {}
    res.json({ ok: true, count });
  } catch (e) { next(e); }
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
    if (b.category !== undefined) data.category = b.category ?? null;
    if (b.periodMonth !== undefined) data.periodMonth = b.periodMonth ?? null;
    if (b.description !== undefined) data.description = b.description ?? null;
    if (b.amount !== undefined) data.amount = Number(b.amount) || 0;
    if (b.planned !== undefined && data.amount === undefined) data.amount = Number(b.planned) || 0;
    if (b.costCodeId !== undefined) data.costCodeId = b.costCodeId ?? null;
    const updated = await prisma.budgetLine.update({ where: { id }, data, select: budgetLineSelect });
    try { await recomputeProjectFinancials(tenantId, projectId); } catch (_) {}
    const row = safeJson(updated); row.links = buildLinks('budgetLine', row);
    res.json(row);
  } catch (e) { next(e); }
});

module.exports = router;
