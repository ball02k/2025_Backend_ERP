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
    const contracts = await prisma.contract.count({ where: { projectId } });
    const data = {
      projectId,
      totals: {
        baseline,
        estimate,
        actual,
        varianceVsBaseline: estimate - baseline,
        varianceVsEstimate: actual - estimate,
      },
      counts: { contracts },
      updatedAt: new Date().toISOString(),
    };
    res.json(safeJson(data));
  } catch (e) { next(e); }
});

module.exports = router;

