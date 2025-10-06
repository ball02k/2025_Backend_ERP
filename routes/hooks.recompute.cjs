const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function recomputeEstimatesForProject(tenantId, projectId) {
  // Sum contract values by package and update matching budget lines
  const contracts = await prisma.contract.findMany({
    where: { projectId: Number(projectId) },
    select: { packageId: true, value: true },
  });
  const byPkg = new Map();
  for (const c of contracts) {
    if (!c.packageId) continue;
    byPkg.set(c.packageId, (byPkg.get(c.packageId) || 0) + Number(c.value || 0));
  }
  for (const [packageId, sum] of byPkg.entries()) {
    await prisma.budgetLine.updateMany({
      where: { tenantId, projectId: Number(projectId), packageId: Number(packageId) },
      data: { estimated: sum },
    });
  }
}

async function recomputeActualsForProject(tenantId, projectId) {
  // Sum invoice gross by packageId
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, projectId: Number(projectId) },
    select: { packageId: true, gross: true, net: true, vat: true },
  });
  const byPkg = new Map();
  for (const inv of invoices) {
    const pkg = inv.packageId ?? null;
    if (!pkg) continue;
    const amount = inv.gross != null ? Number(inv.gross) : (Number(inv.net || 0) + Number(inv.vat || 0));
    byPkg.set(pkg, (byPkg.get(pkg) || 0) + amount);
  }
  for (const [packageId, sum] of byPkg.entries()) {
    await prisma.budgetLine.updateMany({
      where: { tenantId, projectId: Number(projectId), packageId: Number(packageId) },
      data: { actual: sum },
    });
  }
}

async function recomputeProjectFinancials(tenantId, projectId) {
  await recomputeEstimatesForProject(tenantId, projectId);
  await recomputeActualsForProject(tenantId, projectId);
}

module.exports = {
  recomputeEstimatesForProject,
  recomputeActualsForProject,
  recomputeProjectFinancials,
};

