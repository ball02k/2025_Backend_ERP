const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { safeJson } = require('../lib/serialize.cjs');
const { recomputeProjectFinancials } = require('./hooks.recompute.cjs');

router.get('/projects/:projectId/budget', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const rows = await prisma.budgetLine.findMany({ where: { tenantId, projectId }, orderBy: [{ code: 'asc' }, { id: 'asc' }] });
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
      const data = {
        tenantId,
        projectId,
        code: l.code ?? null,
        name: l.name ?? null,
        description: l.description ?? null,
        lineType: l.lineType ?? null,
        planned: l.planned != null ? Number(l.planned) : 0,
        packageId: l.packageId != null ? Number(l.packageId) : null,
      };
      if (l.id) {
        await prisma.budgetLine.update({ where: { id: Number(l.id) }, data });
      } else {
        await prisma.budgetLine.create({ data });
      }
      count++;
    }
    await recomputeProjectFinancials(tenantId, projectId);
    res.json({ ok: true, count });
  } catch (e) { next(e); }
});

router.patch('/projects/:projectId/budget/:id', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const id = Number(req.params.id);
    const updated = await prisma.budgetLine.update({ where: { id }, data: req.body || {} });
    await recomputeProjectFinancials(tenantId, projectId);
    const row = safeJson(updated); row.links = buildLinks('budgetLine', row);
    res.json(row);
  } catch (e) { next(e); }
});

module.exports = router;

