const { prisma, Prisma } = require('../utils/prisma.cjs');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function toNumber(value, field) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new HttpError(400, `${field} must be a number`);
  }
  return num;
}

async function createContract({
  tenantId,
  userId,
  projectId,
  packageId,
  supplierId,
  awardValue,
  currency = 'GBP',
  title,
  contractType,
  startDate,
  endDate,
}) {
  if (!tenantId) throw new HttpError(400, 'Missing tenant');
  const projectNum = toNumber(projectId, 'projectId');
  const packageNum = toNumber(packageId, 'packageId');
  const supplierNum = toNumber(supplierId, 'supplierId');
  if (awardValue == null || awardValue === '') throw new HttpError(400, 'awardValue must be provided');
  const awardDecimal = new Prisma.Decimal(awardValue);

  const [project, pkg, supplier] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectNum, tenantId } }),
    prisma.package.findFirst({ where: { id: packageNum, project: { tenantId }, projectId: projectNum } }),
    prisma.supplier.findFirst({ where: { id: supplierNum, tenantId } }),
  ]);

  if (!project) throw new HttpError(404, 'Project not found for tenant');
  if (!pkg) throw new HttpError(404, 'Package not found for tenant or not linked to project');
  if (!supplier) throw new HttpError(404, 'Supplier not found for tenant');

  const fallbackTitle = title || `Contract – ${pkg.name || `Package #${packageNum}`} – ${supplier.name || `Supplier #${supplierNum}`}`;

  const contract = await prisma.contract.create({
    data: {
      tenantId,
      createdByUserId: userId ? Number(userId) : null,
      projectId: projectNum,
      packageId: packageNum,
      supplierId: supplierNum,
      title: fallbackTitle,
      awardValue: awardDecimal,
      currency,
      contractType: contractType || null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
    include: {
      project: { select: { id: true, name: true } },
      package: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
    },
  });

  return contract;
}

module.exports = {
  createContract,
  HttpError,
};
