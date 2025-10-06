const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { safeJson } = require('../lib/serialize.cjs');

router.get('/projects/:projectId/overview', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const bl = await prisma.budgetLine.findMany({ where: { tenantId, projectId }, select: { planned: true, estimated: true, actual: true } });
    let baseline = 0, estimate = 0, actual = 0;
    for (const b of bl) {
      baseline += Number(b.planned || 0);
      estimate += Number(b.estimated || 0);
      actual += Number(b.actual || 0);
    }
    const [contracts, openVars, approvedVars] = await Promise.all([
      prisma.contract.count({ where: { projectId } }),
      prisma.variation.count({ where: { tenantId, projectId, status: 'submitted' } }),
      prisma.variation.count({ where: { tenantId, projectId, status: 'approved' } }),
    ]);
    const data = {
      projectId,
      totals: {
        baseline,
        estimate,
        actual,
        varianceVsBaseline: estimate - baseline,
        varianceVsEstimate: actual - estimate,
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

