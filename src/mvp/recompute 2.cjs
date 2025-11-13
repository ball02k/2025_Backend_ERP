const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function recomputeProject(tenantId, projectId) {
  // Lightweight recompute: re-derive totals consistently with MVP overview
  const [bl, cs, vs, inv] = await Promise.all([
    prisma.budgetLine.findMany({ where: { tenantId, projectId }, select: { planned: true } }),
    prisma.contract.findMany({ where: { tenantId, projectId }, select: { value: true } }),
    prisma.variation.findMany({ where: { tenantId, projectId, status: 'approved', type: 'CONTRACT_VARIATION' }, select: { amount: true } }).catch(() => []),
    prisma.invoice.findMany({ where: { tenantId, projectId }, select: { amount: true } }).catch(() => []),
  ]);
  const baseline = bl.reduce((a, x) => a + Number(x.planned || 0), 0);
  const committed = cs.reduce((a, x) => a + Number(x.value || 0), 0);
  const adjusted = vs.reduce((a, x) => a + Number(x.amount || 0), 0);
  const estimate = committed + adjusted;
  const actual = inv.reduce((a, x) => a + Number(x.amount || 0), 0);
  return { baseline, committed, adjusted, estimate, actual };
}

module.exports = { recomputeProject };

