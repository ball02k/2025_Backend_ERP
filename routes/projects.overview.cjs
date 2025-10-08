const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { safeJson } = require('../lib/serialize.cjs');

router.get('/projects/:projectId/overview', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const [bl, cs, vs, inv, fc] = await Promise.all([
      prisma.budgetLine.findMany({ where: { tenantId, projectId }, select: { planned: true } }),
      prisma.contract.findMany({ where: { tenantId, projectId }, select: { value: true } }),
      prisma.variation.findMany({ where: { tenantId, projectId, status: 'approved', type: 'CONTRACT_VARIATION' }, select: { amount: true } }),
      prisma.invoice.findMany({ where: { tenantId, projectId }, select: { amount: true } }),
      prisma.forecast.findMany({ where: { tenantId, projectId }, select: { amount: true } }),
    ]);
    const baseline = bl.reduce((a, x) => a + Number(x.planned || 0), 0);
    const committed = cs.reduce((a, x) => a + Number(x.value || 0), 0);
    const adjusted = vs.reduce((a, x) => a + Number(x.amount || 0), 0);
    const estimate = committed + adjusted;
    const actual = inv.reduce((a, x) => a + Number(x.amount || 0), 0);
    const forecast = fc.reduce((a, x) => a + Number(x.amount || 0), 0);
    const [contracts, openVars, approvedVars] = await Promise.all([
      prisma.contract.count({ where: { projectId } }),
      prisma.variation.count({ where: { tenantId, projectId, status: 'submitted' } }),
      prisma.variation.count({ where: { tenantId, projectId, status: 'approved' } }),
    ]);
    const data = {
      projectId,
      totals: {
        baseline,
        committed,
        adjusted,
        estimate,
        actual,
        forecast,
        varianceVsBaseline: estimate - baseline,
        varianceVsEstimate: actual - estimate,
      },
      derived: {
        budgetTotal: baseline,
        tendersAwardedValue: committed,
        variationsImpact: adjusted,
      },
      finance: {
        committed,
        actual,
        forecast,
      },
      counts: {
        contracts,
        variationsOpen: openVars,
        variationsApproved: approvedVars,
      },
      updatedAt: new Date().toISOString(),
    };
    res.json(safeJson(data));
  } catch (e) { next(e); }
});

module.exports = router;
