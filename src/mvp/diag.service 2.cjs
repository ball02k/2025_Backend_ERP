const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
function n(x) { return Number(x || 0); }

async function projectIntegrity(tenantId, projectId) {
  // Gather data; adapt to schema (Request has no direct projectId)
  const [budget, packs, requests, contracts, vars, invoices, cvrLines] = await Promise.all([
    prisma.budgetLine.findMany({ where: { tenantId, projectId }, select: { id: true, planned: true, costCodeId: true } }),
    prisma.package.findMany({ where: { projectId }, select: { id: true, costCodeId: true } }),
    prisma.request.findMany({ where: { tenantId, package: { projectId } }, select: { id: true } }).catch(() => []),
    prisma.contract.findMany({ where: { tenantId, projectId }, select: { id: true, value: true, endDate: true, packageId: true } }),
    prisma.variation.findMany({ where: { tenantId, projectId }, select: { id: true, type: true, status: true, amount: true, contractId: true, packageId: true } }).catch(() => []),
    prisma.invoice.findMany({ where: { tenantId, projectId }, select: { id: true, amount: true } }).catch(() => []),
    prisma.cVRLine?.findMany?.({ where: { tenantId, projectId } }).catch?.(() => []) || [],
  ]);

  const requestIds = requests.map((r) => r.id);
  const subs = requestIds.length
    ? await prisma.rFxSubmission.findMany({ where: { tenantId, rfxId: { in: requestIds } }, select: { id: true, supplierId: true } })
    : [];

  const baseline = budget.reduce((a, x) => a + n(x.planned), 0);
  const committed = contracts.reduce((a, x) => a + n(x.value), 0);
  const adjusted = (vars || [])
    .filter((v) => (v.type || '').toUpperCase() === 'CONTRACT_VARIATION' && (v.status || '').toLowerCase() === 'approved')
    .reduce((a, x) => a + n(x.amount), 0);
  const estimate = committed + adjusted;
  const actual = (invoices || []).reduce((a, x) => a + n(x.amount), 0);

  const flags = [];
  const pkgsNoCode = packs.filter((p) => !p.costCodeId).map((p) => p.id);
  if (pkgsNoCode.length) flags.push({ code: 'PKG_NO_CODE', msg: `Packages missing cost codes: ${pkgsNoCode.join(',')}` });

  const blNoCode = budget.filter((b) => !b.costCodeId).map((b) => b.id);
  if (blNoCode.length) flags.push({ code: 'BUD_NO_CODE', msg: `Budget lines missing cost codes: ${blNoCode.join(',')}` });

  const expiredVarRefs = (vars || [])
    .filter((v) => (v.type || '').toUpperCase() === 'CONTRACT_VARIATION' && v.contractId)
    .filter((v) => {
      const c = contracts.find((c) => c.id === v.contractId);
      return c && c.endDate && new Date(c.endDate) < new Date();
    })
    .map((v) => v.id);
  if (expiredVarRefs.length) flags.push({ code: 'VAR_EXPIRED_CONTRACT', msg: `Variations reference expired contracts: ${expiredVarRefs.join(',')}` });

  const packsNoContract = packs.filter((p) => !contracts.some((c) => c.packageId === p.id)).map((p) => p.id);
  if (packsNoContract.length && subs.length) flags.push({ code: 'PKG_NO_CONTRACT', msg: `Packages with submissions but no contract: ${packsNoContract.join(',')}` });

  return {
    counts: {
      budget: budget.length,
      packages: packs.length,
      rfx: requests.length,
      submissions: subs.length,
      contracts: contracts.length,
      variations: vars.length,
      invoices: invoices.length,
      cvrLines: cvrLines.length,
    },
    totals: { baseline, committed, adjusted, estimate, actual, varianceVsBaseline: estimate - baseline, varianceVsEstimate: actual - estimate },
    flags,
  };
}

module.exports = { projectIntegrity };

