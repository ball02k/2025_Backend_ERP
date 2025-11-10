const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { safeJson } = require('../lib/serialize.cjs');

router.get('/projects/:projectId/overview', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const [bl, cs, vs, inv, fc, project] = await Promise.all([
      prisma.budgetLine.findMany({ where: { tenantId, projectId }, select: { total: true, amount: true } }),
      prisma.contract.findMany({ where: { tenantId, projectId }, select: { value: true } }),
      prisma.variation.findMany({ where: { tenantId, projectId, status: 'approved', type: 'CONTRACT_VARIATION' }, select: { amount: true } }),
      prisma.invoice.findMany({ where: { tenantId, projectId }, select: { amount: true } }),
      prisma.forecast.findMany({ where: { tenantId, projectId }, select: { amount: true } }),
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true, code: true, status: true } }),
    ]);
    // Calculate budget from BudgetLine totals (sum of all line items)
    const budget = bl.reduce((a, x) => a + Number(x.total || x.amount || 0), 0);
    const committed = cs.reduce((a, x) => a + Number(x.value || 0), 0);
    const adjusted = vs.reduce((a, x) => a + Number(x.amount || 0), 0);
    const estimate = committed + adjusted;
    const actual = inv.reduce((a, x) => a + Number(x.amount || 0), 0);
    const forecastTotal = fc.reduce((a, x) => a + Number(x.amount || 0), 0);
    const [contracts, openVars, approvedVars] = await Promise.all([
      prisma.contract.count({ where: { projectId } }),
      prisma.variation.count({ where: { tenantId, projectId, status: 'submitted' } }),
      prisma.variation.count({ where: { tenantId, projectId, status: 'approved' } }),
    ]);

    // Calculate margin percentage
    const marginPct = budget > 0 ? ((budget - actual) / budget) * 100 : 0;

    const data = {
      projectId,
      name: project?.name || '',
      code: project?.code || '',
      status: project?.status || 'Active',
      // NEW: Frontend-compatible structure
      overviewV2: {
        widgets: {
          cvr: {
            budget,
            committed,
            actual,
            forecast: forecastTotal || estimate,
            marginPct,
          },
        },
        health: {
          finance: budget > 0 && actual > budget * 0.9 ? 'red' : budget > 0 && actual > budget * 0.75 ? 'amber' : 'green',
        },
        tables: {
          rfis: [],
          variations: [],
          pos: [],
        },
      },
      // Legacy structure for backwards compatibility
      totals: {
        baseline: budget,
        committed,
        adjusted,
        estimate,
        actual,
        forecast: forecastTotal,
        varianceVsBaseline: estimate - budget,
        varianceVsEstimate: actual - estimate,
      },
      derived: {
        budgetTotal: budget,
        tendersAwardedValue: committed,
        variationsImpact: adjusted,
      },
      finance: {
        committed,
        actual,
        forecast: forecastTotal,
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
