const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/projects/:projectId/overview', async (req, res, next) => {
  try {
    const tenantId = req.tenantId; const projectId = Number(req.params.projectId);
    const [bl, cs, vs, inv, openRfx, awarded] = await Promise.all([
      prisma.budgetLine.findMany({ where: { tenantId, projectId }, select: { planned: true } }),
      prisma.contract.findMany({ where: { tenantId, projectId }, select: { value: true } }).catch(()=>[]),
      prisma.variation.findMany({ where: { tenantId, projectId, status: 'approved', type: 'CONTRACT_VARIATION' }, select: { amount: true } }).catch(()=>[]),
      prisma.invoice.findMany({ where: { tenantId, projectId }, select: { amount: true } }).catch(()=>[]),
      prisma.request.count({ where: { tenantId, package: { projectId }, status: { not: 'awarded' } } }).catch(()=>0),
      prisma.request.count({ where: { tenantId, package: { projectId }, status: 'awarded' } }).catch(()=>0)
    ]);
    const baseline = bl.reduce((a, x) => a + Number(x.planned || 0), 0);
    const committed = cs.reduce((a, x) => a + Number(x.value || 0), 0);
    const adjusted = vs.reduce((a, x) => a + Number(x.amount || 0), 0);
    const estimate = committed + adjusted;
    const actual = inv.reduce((a, x) => a + Number(x.amount || 0), 0);
    res.json({ totals: { baseline, committed, adjusted, estimate, actual, varianceVsBaseline: estimate - baseline, varianceVsEstimate: actual - estimate }, counts: { rfxOpen: openRfx, contractsAwarded: awarded } });
  } catch (e) { next(e); }
});

module.exports = router;
