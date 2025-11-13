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
  const contractLines = await prisma.contractLineItem.findMany({
    where: { tenantId, contractId: contract.id },
    orderBy: [{ id: 'asc' }],
  });
  const pkg = contract.package
    ? { ...contract.package, scope: contract.package.scopeSummary ?? null }
    : null;
  return toJson({ ...contract, package: pkg, budgetLines, lines: contractLines });
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
  const awardValue = computeAwardValue(lines, data.value);

  const netValue = data.value != null ? toDecimal(data.value) : awardValue;

  const retentionDecimal = data.retentionPct != null ? toDecimal(data.retentionPct, { allowNull: true }) : null;

  const created = await prisma.contract.create({
    data: {
      tenantId,
      projectId,
      packageId,
      supplierId,
      title: String(data.title || data.name || `Contract ${new Date().toISOString()}`),
      contractRef: data.reference || data.contractRef || null,
      status: data.status ? String(data.status).toLowerCase() : 'draft',
      value: netValue,
      currency: data.currency || 'GBP',
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      retentionPct: retentionDecimal,
      paymentTerms: data.paymentTerms || null,
      notes: data.notes || null,
    },
    include: {
      supplier: { select: { id: true, name: true } },
      package: { select: { id: true, name: true, scopeSummary: true } },
    },
  });

  if (lines.length) {
    for (const line of lines) {
      const qty = toDecimal(line.qty ?? line.quantity ?? 0, { allowNull: true });
      const rate = toDecimal(line.rate ?? line.unitRate ?? 0, { allowNull: true });
      const total = toDecimal(line.total ?? line.amount ?? 0, { allowNull: true });
      await prisma.contractLineItem.create({
        data: {
          tenantId,
          contractId: created.id,
          description: line.description || line.code || 'Line',
          qty,
          rate,
          total,
          costCode: line.costCode ? line.costCode.code || line.costCode : null,
        },
      });
    }
  }

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
  if (existing.status && existing.status.toLowerCase() === 'approved') {
    return enrichContract(existing, tenantId);
  }

  let awardValue = existing.value;
  if (existing.packageId) {
    const items = await prisma.packageLineItem.findMany({
      where: { tenantId, packageId: existing.packageId },
    });
    if (items.length) awardValue = computeAwardValue(items, awardValue);
  }

  const updated = await prisma.contract.update({
    where: { id: existing.id },
    data: {
      status: 'approved',
      value: awardValue,
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
    changes: { status: 'approved', awardValue: Number(awardValue) },
  });

  return enrichContract(updated, tenantId);
}

module.exports = {
  listContracts,
  getContract,
  createContract,
  approveContract,
};
