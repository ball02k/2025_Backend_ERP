const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /mvp/projects/:id/cvr?period=YYYY-MM
router.get('/mvp/projects/:projectId/cvr', async (req, res, next) => {
  try {
    const tenantId = req.tenantId; const projectId = Number(req.params.projectId); const period = String(req.query.period || '').trim();
    const where = { tenantId, projectId, ...(period ? { period } : {}) };
    const cvr = await prisma.costValueReconciliation.findFirst({ where, orderBy: { createdAt: 'desc' } });
    if (!cvr) return res.json(null);
    const lines = await prisma.cVRLine.findMany({ where: { tenantId, cvrId: cvr.id }, orderBy: { id: 'asc' } });
    res.json({ ...cvr, lines });
  } catch (e) { next(e); }
});

// POST /mvp/projects/:id/cvr/seed-from-packages { period }
router.post('/mvp/projects/:projectId/cvr/seed-from-packages', async (req, res, next) => {
  try {
    const tenantId = req.tenantId; const projectId = Number(req.params.projectId); const period = String(req.body?.period || '').trim();
    const pkg = await prisma.package.findMany({ where: { projectId } });
    const contracts = await prisma.contract.findMany({ where: { projectId } });
    const vars = await prisma.variation.findMany({ where: { tenantId, projectId, status: 'approved', type: 'CONTRACT_VARIATION' } });
    const committedByPkg = new Map();
    contracts.forEach((c) => { const k = c.packageId || 0; committedByPkg.set(k, (committedByPkg.get(k) || 0) + Number(c.value || 0)); });
    const adjustedByPkg = new Map();
    vars.forEach((v) => { const k = v.packageId || 0; adjustedByPkg.set(k, (adjustedByPkg.get(k) || 0) + Number(v.amount || 0)); });
    const cvr = await prisma.costValueReconciliation.create({ data: { tenantId, projectId, period, budget: 0, committed: 0, actual: 0, earnedValue: 0, costVariance: 0, costToComplete: 0, marginPct: 0 } });
    for (const p of pkg) {
      const committed = committedByPkg.get(p.id) || 0; const adjusted = adjustedByPkg.get(p.id) || 0;
      await prisma.cVRLine.create({ data: { tenantId, cvrId: cvr.id, packageId: p.id, budget: 0, committed, actual: 0, earnedValue: 0, variance: 0, adjustment: 0, adjusted } });
    }
    const lines = await prisma.cVRLine.findMany({ where: { tenantId, cvrId: cvr.id } });
    res.json({ id: cvr.id, period: cvr.period, lines });
  } catch (e) { next(e); }
});

// POST /mvp/projects/:id/cvr/seed-from-previous { period, fromPeriod }
router.post('/mvp/projects/:projectId/cvr/seed-from-previous', async (req, res, next) => {
  try {
    const tenantId = req.tenantId; const projectId = Number(req.params.projectId); const period = String(req.body?.period || '').trim(); const fromPeriod = String(req.body?.fromPeriod || '').trim();
    const prev = await prisma.costValueReconciliation.findFirst({ where: { tenantId, projectId, period: fromPeriod } });
    if (!prev) return res.status(404).json({ error: 'Previous CVR not found' });
    const cvr = await prisma.costValueReconciliation.create({ data: { tenantId, projectId, period, budget: prev.budget, committed: prev.committed, actual: prev.actual, earnedValue: prev.earnedValue, costVariance: prev.costVariance, costToComplete: prev.costToComplete, marginPct: prev.marginPct } });
    const lines = await prisma.cVRLine.findMany({ where: { tenantId, cvrId: prev.id } });
    for (const l of lines) {
      await prisma.cVRLine.create({ data: { tenantId, cvrId: cvr.id, packageId: l.packageId, costCode: l.costCode, budget: l.budget, committed: l.committed, actual: l.actual, earnedValue: l.earnedValue, variance: l.variance, adjustment: l.adjustment, adjusted: l.adjusted || 0, variationId: l.variationId || null } });
    }
    const newLines = await prisma.cVRLine.findMany({ where: { tenantId, cvrId: cvr.id } });
    res.json({ id: cvr.id, period: cvr.period, lines: newLines });
  } catch (e) { next(e); }
});

module.exports = router;

