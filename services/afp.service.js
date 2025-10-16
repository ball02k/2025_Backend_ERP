const { prisma, Prisma, dec } = require('../utils/prisma.cjs');

const baseInclude = {
  project: true,
  supplier: true,
  contract: true,
};

async function listAfps(tenantId, filters = {}, pagination = { page: 1, pageSize: 25 }) {
  const { projectId, supplierId, status, q } = filters || {};
  const where = { tenantId };
  if (projectId) where.projectId = Number(projectId);
  if (supplierId) where.supplierId = Number(supplierId);
  if (status) where.status = String(status);
  if (q) where.OR = [
    { applicationNo: { contains: String(q), mode: 'insensitive' } },
    { reference: { contains: String(q), mode: 'insensitive' } },
  ];
  const page = Number(pagination.page || 1);
  const pageSize = Number(pagination.pageSize || 25);
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    prisma.applicationForPayment.findMany({ where, include: baseInclude, orderBy: { applicationDate: 'desc' }, skip, take: pageSize }),
    prisma.applicationForPayment.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

async function getAfp(tenantId, id) {
  return prisma.applicationForPayment.findFirst({ where: { tenantId, id: Number(id) }, include: baseInclude });
}

async function createAfp(tenantId, userId, data) {
  const year = new Date().getUTCFullYear();
  const seq = await prisma.applicationForPayment.count({ where: { tenantId } });
  const applicationNo = `AFP-${year}-${String(seq + 1).padStart(5, '0')}`;

  const created = await prisma.applicationForPayment.create({
    data: {
      tenantId,
      projectId: Number(data.projectId),
      supplierId: data.supplierId != null ? Number(data.supplierId) : null,
      contractId: data.contractId != null ? Number(data.contractId) : null,
      applicationNo,
      applicationDate: new Date(data.applicationDate),
      periodStart: new Date(data.periodStart),
      periodEnd: new Date(data.periodEnd),
      assessmentDate: data.assessmentDate ? new Date(data.assessmentDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      currency: data.currency || 'GBP',
      grossToDate: dec(data.grossToDate),
      variationsValue: dec(data.variationsValue),
      prelimsValue: dec(data.prelimsValue),
      retentionValue: dec(data.retentionValue),
      mosValue: dec(data.mosValue),
      offsiteValue: dec(data.offsiteValue),
      deductionsValue: dec(data.deductionsValue),
      netClaimed: dec(data.netClaimed),
      status: 'submitted',
      reference: data.reference || null,
      notes: data.notes || null,
    },
    include: baseInclude,
  });

  await audit(userId, 'ApplicationForPayment', created.id, 'create', { create: created });
  return created;
}

async function updateAfp(tenantId, userId, id, patch) {
  const before = await getAfp(tenantId, id);
  if (!before) throw new Error('Not found');
  const data = mapNumericAndDates(patch);
  const updated = await prisma.applicationForPayment.update({ where: { id: Number(id) }, data, include: baseInclude });
  await audit(userId, 'ApplicationForPayment', updated.id, 'update', { set: patch });
  return updated;
}

async function issueNotice(tenantId, userId, id, { type, reason }) {
  const afp = await getAfp(tenantId, id);
  if (!afp) throw new Error('Not found');
  if (type === 'payment') {
    const updated = await prisma.applicationForPayment.update({ where: { id: Number(id) }, data: { paymentNoticeIssuedAt: new Date(), status: 'payment_notice' }, include: baseInclude });
    await audit(userId, 'ApplicationForPayment', updated.id, 'payment_notice', {});
    return updated;
  }
  if (type === 'pay_less') {
    const updated = await prisma.applicationForPayment.update({ where: { id: Number(id) }, data: { payLessNoticeIssuedAt: new Date(), payLessReason: reason || '', status: 'pay_less_notice' }, include: baseInclude });
    await audit(userId, 'ApplicationForPayment', updated.id, 'pay_less_notice', { reason: reason || '' });
    return updated;
  }
  throw new Error('Unknown notice type');
}

async function certifyAfp(tenantId, userId, id, { certifiedAmount, notes }) {
  const afp = await getAfp(tenantId, id);
  if (!afp) throw new Error('Not found');
  const updated = await prisma.applicationForPayment.update({
    where: { id: Number(id) },
    data: {
      certifiedAmount: certifiedAmount != null ? dec(certifiedAmount) : null,
      certifiedDate: new Date(),
      certifiedByUserId: Number(userId) || null,
      certificationNotes: notes || null,
      status: 'certified',
    },
    include: baseInclude,
  });

  // Optional side-effects (only if related modules exist)
  try { await syncAfpToInvoice(tenantId, updated); } catch (_) {}
  try { await syncAfpToCvr(tenantId, updated); } catch (_) {}

  await audit(userId, 'ApplicationForPayment', updated.id, 'certify', { certifiedAmount });
  return updated;
}

function mapNumericAndDates(src = {}) {
  const m = {};
  const numKeys = ['projectId','supplierId','certifiedByUserId'];
  const moneyKeys = ['grossToDate','variationsValue','prelimsValue','retentionValue','mosValue','offsiteValue','deductionsValue','netClaimed','certifiedAmount'];
  const dateKeys = ['applicationDate','periodStart','periodEnd','assessmentDate','dueDate','certifiedDate'];
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v === undefined) continue;
    if (numKeys.includes(k)) m[k] = v == null ? null : Number(v);
    else if (moneyKeys.includes(k)) m[k] = v == null ? null : dec(v);
    else if (dateKeys.includes(k)) m[k] = v ? new Date(v) : null;
    else m[k] = v;
  }
  if (src.contractId !== undefined) m.contractId = src.contractId == null ? null : Number(src.contractId);
  return m;
}

async function audit(userId, entity, entityId, action, changes) {
  try {
    await prisma.auditLog.create({ data: { userId: Number(userId) || null, entity, entityId: String(entityId), action, changes: changes || {} } });
  } catch (_) {}
}

async function syncAfpToInvoice(tenantId, afp) {
  // Optional: create a placeholder approved invoice if finance module expects one
  try {
    // Best-effort: do nothing if model fields differ
    // Could create an invoice with number = applicationNo, but avoid guessing fields
  } catch (_) {}
}

async function syncAfpToCvr(_tenantId, _afp) {
  // CVR model may not exist; intentionally no-op
}

module.exports = { listAfps, getAfp, createAfp, updateAfp, issueNotice, certifyAfp };

