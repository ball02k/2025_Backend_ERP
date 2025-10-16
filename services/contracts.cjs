const { prisma, Prisma, toDecimal } = require('../lib/prisma.js');
const { writeAudit } = require('../lib/audit.cjs');

function toJson(row) {
  if (!row) return row;
  return JSON.parse(
    JSON.stringify(row, (_, value) => (typeof value === 'bigint' ? value.toString() : value)),
  );
}

async function ensureProject(tenantId, projectId) {
  return prisma.project.findFirst({ where: { tenantId, id: Number(projectId) }, select: { id: true } });
}

async function ensurePackage(tenantId, projectId, packageId) {
  if (!packageId) return null;
  return prisma.package.findFirst({ where: { id: Number(packageId), projectId: Number(projectId), project: { tenantId } }, select: { id: true, projectId: true } });
}

async function ensureSupplier(tenantId, supplierId) {
  return prisma.supplier.findFirst({ where: { tenantId, id: Number(supplierId) }, select: { id: true, name: true } });
}

async function fetchBudgetLines(tenantId, projectId, budgetLineIds = []) {
  if (!budgetLineIds || budgetLineIds.length === 0) return [];
  return prisma.budgetLine.findMany({
    where: { tenantId, projectId: Number(projectId), id: { in: budgetLineIds.map(Number).filter(Number.isFinite) } },
    include: { costCode: true },
  });
}

function computeAwardValue(lines, explicitValue) {
  let total = new Prisma.Decimal(0);
  for (const line of lines) {
    if (!line) continue;
    const source = line.total ?? line.amount ?? 0;
    const dec = source instanceof Prisma.Decimal ? source : new Prisma.Decimal(source);
    total = total.add(dec);
  }
  if (lines.length === 0 && explicitValue != null) {
    return toDecimal(explicitValue, { fallback: 0 });
  }
  return lines.length ? total : toDecimal(explicitValue ?? 0, { fallback: 0 });
}

async function enrichContract(contract, tenantId) {
  if (!contract) return null;
  let budgetLines = [];
  if (contract.packageId) {
    const items = await prisma.packageItem.findMany({
      where: { tenantId, packageId: contract.packageId },
      include: { budgetLine: { include: { costCode: true } } },
      orderBy: [
        { budgetLine: { position: 'asc' } },
        { budgetLine: { sortOrder: 'asc' } },
        { budgetLineId: 'asc' },
      ],
    });
    budgetLines = items
      .filter((it) => it?.budgetLine)
      .map((it) => {
        const bl = it.budgetLine;
        return {
          id: bl.id,
          description: bl.description,
          qty: bl.qty != null ? Number(bl.qty) : null,
          unit: bl.unit || null,
          rate: bl.rate != null ? Number(bl.rate) : null,
          total: bl.total != null ? Number(bl.total) : Number(bl.amount || 0),
          costCode: bl.costCode
            ? { id: bl.costCode.id, code: bl.costCode.code, description: bl.costCode.description || '' }
            : null,
        };
      });
  }
  const pkg = contract.package
    ? { ...contract.package, scope: contract.package.scopeSummary ?? null }
    : null;
  return toJson({ ...contract, package: pkg, budgetLines });
}

async function listContracts({ tenantId, projectId }) {
  const where = { tenantId };
  if (projectId) where.projectId = Number(projectId);
  const contracts = await prisma.contract.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      supplier: { select: { id: true, name: true } },
      package: { select: { id: true, name: true, scopeSummary: true } },
    },
  });
  return Promise.all(contracts.map((c) => enrichContract(c, tenantId)));
}

async function getContract({ tenantId, contractId }) {
  const contract = await prisma.contract.findFirst({
    where: { tenantId, id: Number(contractId) },
    include: {
      supplier: { select: { id: true, name: true } },
      package: { select: { id: true, name: true, scopeSummary: true, projectId: true } },
    },
  });
  return enrichContract(contract, tenantId);
}

async function createContract({ tenantId, userId, data = {}, req }) {
  const projectId = Number(data.projectId);
  if (!Number.isFinite(projectId)) {
    throw Object.assign(new Error('projectId required'), { status: 400 });
  }
  const project = await ensureProject(tenantId, projectId);
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });

  const supplierId = Number(data.supplierId);
  if (!Number.isFinite(supplierId)) {
    throw Object.assign(new Error('supplierId required'), { status: 400 });
  }
  const supplier = await ensureSupplier(tenantId, supplierId);
  if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });

  let packageId = data.packageId != null ? Number(data.packageId) : null;
  if (packageId != null) {
    const pkg = await ensurePackage(tenantId, projectId, packageId);
    if (!pkg) throw Object.assign(new Error('Package not found'), { status: 404 });
  }

  const budgetLineIds = Array.isArray(data.budgetLineIds)
    ? data.budgetLineIds.map(Number).filter(Number.isFinite)
    : [];
  const lines = await fetchBudgetLines(tenantId, projectId, budgetLineIds);
  const awardValue = computeAwardValue(lines, data.awardValue);

  const created = await prisma.contract.create({
    data: {
      tenantId,
      projectId,
      packageId,
      supplierId,
      title: String(data.title || `Contract ${new Date().toISOString()}`),
      status: 'Draft',
      awardValue,
      currency: data.currency || 'GBP',
      contractType: data.contractType || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      createdByUserId: userId != null ? Number(userId) : null,
    },
    include: {
      supplier: { select: { id: true, name: true } },
      package: { select: { id: true, name: true, scopeSummary: true } },
    },
  });

  await writeAudit({
    prisma,
    req,
    userId,
    entity: 'Contract',
    entityId: created.id,
    action: 'CONTRACT_CREATE',
    changes: {
      projectId,
      supplierId,
      packageId,
      awardValue: Number(awardValue),
      budgetLineIds: budgetLineIds.length ? budgetLineIds : undefined,
    },
  });

  return enrichContract(created, tenantId);
}

async function approveContract({ tenantId, contractId, userId, req }) {
  const existing = await prisma.contract.findFirst({
    where: { tenantId, id: Number(contractId) },
    include: {
      supplier: { select: { id: true, name: true } },
      package: { select: { id: true, name: true, projectId: true, scopeSummary: true } },
    },
  });
  if (!existing) throw Object.assign(new Error('Contract not found'), { status: 404 });
  if (existing.status === 'Approved') return enrichContract(existing, tenantId);

  let awardValue = existing.awardValue;
  if (existing.packageId) {
    const items = await prisma.packageItem.findMany({
      where: { tenantId, packageId: existing.packageId },
      include: { budgetLine: true },
    });
    const lines = items.map((it) => it.budgetLine).filter(Boolean);
    if (lines.length) awardValue = computeAwardValue(lines, awardValue);
  }

  const updated = await prisma.contract.update({
    where: { id: existing.id },
    data: {
      status: 'Approved',
      awardValue,
    },
    include: {
      supplier: { select: { id: true, name: true } },
      package: { select: { id: true, name: true, scopeSummary: true } },
    },
  });

  await writeAudit({
    prisma,
    req,
    userId,
    entity: 'Contract',
    entityId: updated.id,
    action: 'CONTRACT_APPROVE',
    changes: { status: 'Approved', awardValue: Number(awardValue) },
  });

  return enrichContract(updated, tenantId);
}

module.exports = {
  listContracts,
  getContract,
  createContract,
  approveContract,
};
