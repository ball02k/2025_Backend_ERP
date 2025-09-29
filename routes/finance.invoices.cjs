const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const requireFinanceRole = require('../middleware/requireFinanceRole.cjs');
const { prisma } = require('../utils/prisma.cjs');

router.use(requireAuth);
router.use(requireFinanceRole);


function toOrderBy(order) {
  const def = { createdAt: 'desc' };
  if (!order || typeof order !== 'string') return def;
  const [key, dirRaw] = String(order).split('.');
  const dir = (dirRaw || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const allowed = new Set(['createdAt', 'updatedAt', 'issueDate', 'dueDate', 'gross', 'number']);
  const k = allowed.has(key) ? key : 'createdAt';
  return { [k]: dir };
}

// LIST invoices
router.get('/finance/invoices', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { q, projectId, supplierId, status, dateFrom, dateTo, limit = '25', offset = '0', orderBy = 'createdAt.desc' } = req.query;
    const where = { tenantId };
    if (q) where.OR = [{ number: { contains: String(q), mode: 'insensitive' } }];
    if (projectId) where.projectId = Number(projectId);
    if (supplierId) where.supplierId = Number(supplierId);
    if (status) where.status = String(status);
    if (dateFrom || dateTo) where.issueDate = { gte: dateFrom ? new Date(String(dateFrom)) : undefined, lte: dateTo ? new Date(String(dateTo)) : undefined };

    const [items, total] = await Promise.all([
      prisma.invoice.findMany({ where, skip: Number(offset), take: Math.min(Number(limit) || 25, 100), orderBy: toOrderBy(String(orderBy)) }),
      prisma.invoice.count({ where }),
    ]);
    res.json({ items, total });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list invoices' });
  }
});

// CREATE invoice (simple JSON; for files, upload via /api/documents first and link out-of-band)
router.post('/finance/invoices', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { projectId, supplierId, number, issueDate, dueDate, net, vat, gross, status, documentId } = req.body || {};
    if (!Number.isFinite(Number(projectId))) return res.status(400).json({ error: 'projectId required' });
    if (!number) return res.status(400).json({ error: 'number required' });
    const inv = await prisma.invoice.create({
      data: {
        tenantId,
        projectId: Number(projectId),
        supplierId: supplierId != null ? Number(supplierId) : null,
        number: String(number),
        issueDate: issueDate ? new Date(issueDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        net: Number(net || 0),
        vat: Number(vat || 0),
        gross: Number(gross || 0),
        status: status || 'Open',
        documentId: documentId != null ? BigInt(documentId) : undefined,
      },
    });
    try { await prisma.auditLog.create({ data: { entity: 'Invoice', entityId: String(inv.id), action: 'create', userId: req.user?.id ?? null, changes: { create: { number } } } }); } catch(_e) {}
    // Queue OCR job if document attached
    if (documentId != null) {
      await prisma.ocrJob.create({ data: { tenantId, documentId: BigInt(documentId), kind: 'invoice', status: 'queued', invoiceId: inv.id, provider: process.env.OCR_MODE || 'stub' } });
    }
    res.json(inv);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// GET invoice details
router.get('/finance/invoices/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const inv = await prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!inv) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(inv);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load invoice' });
  }
});

// UPDATE invoice header
router.put('/finance/invoices/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { number, issueDate, dueDate, net, vat, gross, status, supplierId, projectId } = req.body || {};
    const data = {};
    if (number !== undefined) data.number = String(number);
    if (issueDate !== undefined) data.issueDate = issueDate ? new Date(issueDate) : null;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (net !== undefined) data.net = Number(net);
    if (vat !== undefined) data.vat = Number(vat);
    if (gross !== undefined) data.gross = Number(gross);
    if (status !== undefined) data.status = String(status);
    if (supplierId !== undefined) data.supplierId = supplierId != null ? Number(supplierId) : null;
    if (projectId !== undefined) data.projectId = Number(projectId);
    const updated = await prisma.invoice.update({ where: { id }, data });
    try { await prisma.auditLog.create({ data: { entity: 'Invoice', entityId: String(id), action: 'update', userId: req.user?.id ?? null, changes: { set: data } } }); } catch(_e) {}
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

router.post('/finance/invoices/:id/approve', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const updated = await prisma.invoice.update({ where: { id }, data: { status: 'Approved' } });
    try { await prisma.auditLog.create({ data: { entity: 'Invoice', entityId: String(id), action: 'approve', userId: req.user?.id ?? null } }); } catch(_e) {}
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Failed to approve invoice' });
  }
});

router.post('/finance/invoices/:id/reject', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const updated = await prisma.invoice.update({ where: { id }, data: { status: 'Rejected' } });
    try { await prisma.auditLog.create({ data: { entity: 'Invoice', entityId: String(id), action: 'reject', userId: req.user?.id ?? null } }); } catch(_e) {}
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Failed to reject invoice' });
  }
});

module.exports = router;
