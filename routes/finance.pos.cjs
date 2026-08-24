const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const requireFinanceRole = require('../middleware/requireFinanceRole.cjs');
const { prisma } = require('../utils/prisma.cjs');
const {
  evaluatePurchaseOrderLock,
  enforceDecision,
  sendCommercialLock,
} = require('../services/commercialLockService.cjs');

router.use(requireAuth);
router.use(requireFinanceRole);


function toOrderBy(order) {
  const def = { orderDate: 'desc' };
  if (!order || typeof order !== 'string') return def;
  const [key, dirRaw] = String(order).split('.');
  const dir = (dirRaw || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const allowed = new Set(['orderDate', 'createdAt', 'updatedAt', 'total', 'code']);
  const k = allowed.has(key) ? key : 'orderDate';
  return { [k]: dir };
}

async function nextPoCode(tenantId) {
  const y = new Date().getFullYear();
  const prefix = `PO-${y}-`;
  const latest = await prisma.purchaseOrder.findFirst({
    where: { tenantId, code: { startsWith: prefix } },
    orderBy: { id: 'desc' },
    select: { code: true },
  });
  const match = latest?.code ? String(latest.code).match(/-(\d+)$/) : null;
  let next = match ? Number(match[1]) + 1 : 1;
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = `${prefix}${String(next).padStart(4, '0')}`;
    const existing = await prisma.purchaseOrder.findFirst({ where: { tenantId, code }, select: { id: true } });
    if (!existing) return code;
    next++;
  }
  return `${prefix}${Date.now().toString().slice(-6)}`;
}

async function enforcePoUnlocked(req, poId, action, proposedChanges = {}) {
  const decision = await evaluatePurchaseOrderLock({
    prisma,
    tenantId: req.user?.tenantId,
    purchaseOrderId: poId,
    action,
    proposedChanges,
  });
  await enforceDecision(req, 'PurchaseOrder', poId, `purchase_order.${action}`, decision);
}

function sendFinanceError(res, error, message) {
  if (sendCommercialLock(res, error)) return;
  res.status(500).json({ error: message });
}

  // LIST POs (with document presence)
  router.get('/finance/pos', async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const { q, projectId, supplierId, status, dateFrom, dateTo, limit = '25', offset = '0', orderBy = 'orderDate.desc' } = req.query;
      const where = { tenantId };
    if (q) where.OR = [{ code: { contains: String(q), mode: 'insensitive' } }, { supplier: { contains: String(q), mode: 'insensitive' } }];
    if (projectId) where.projectId = Number(projectId);
    if (supplierId) where.supplierId = Number(supplierId);
    if (status) where.status = String(status);
    if (dateFrom || dateTo) where.orderDate = { gte: dateFrom ? new Date(String(dateFrom)) : undefined, lte: dateTo ? new Date(String(dateTo)) : undefined };

    const [items, total] = await Promise.all([
      prisma.purchaseOrder.findMany({ where, skip: Number(offset), take: Math.min(Number(limit) || 25, 100), orderBy: toOrderBy(String(orderBy)), include: { lines: false, project: { select: { id: true, code: true, name: true } } } }),
      prisma.purchaseOrder.count({ where }),
    ]);
    // Fetch latest document link per PO
    const ids = items.map((i) => i.id);
    let links = [];
    if (ids.length) {
      links = await prisma.documentLink.findMany({
        where: { tenantId, poId: { in: ids } },
        orderBy: { createdAt: 'desc' },
      });
    }
    const linkMap = new Map();
    for (const l of links) if (!linkMap.has(l.poId)) linkMap.set(l.poId, l);
    const { buildLinks } = require('../lib/buildLinks.cjs');
    const out = items.map((i) => {
      const link = linkMap.get(i.id);
      const documentId = link ? link.documentId : null;
      const documentUrl = link ? `/api/documents/${String(link.documentId)}/download` : null;
      const row = { ...i, documentId, documentUrl };
      row.links = buildLinks('po', { ...row, project: row.project });
      return row;
    });
    res.json({ items: out, rows: out, total });
    } catch (e) {
      console.warn('pos.list fallback', e?.code || e?.message || e);
      res.json({ items: [], rows: [], total: 0 });
    }
  });

  // CREATE PO (blank header)
  router.post('/finance/pos', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { projectId, supplierId, supplier, notes } = req.body || {};
    if (!Number.isFinite(Number(projectId))) return res.status(400).json({ error: 'projectId required' });
    let supplierName = supplier || null;
    let supplierIdNum = supplierId != null ? Number(supplierId) : null;
    if (supplierIdNum) {
      const s = await prisma.supplier.findFirst({ where: { id: supplierIdNum } });
      supplierName = supplierName || (s ? s.name : null);
    }
    const code = await nextPoCode(tenantId);
    const po = await prisma.purchaseOrder.create({
      data: { tenantId, projectId: Number(projectId), code, supplier: supplierName || 'Unknown', supplierId: supplierIdNum, status: 'Open', total: 0, internalNotes: notes || null },
    });
    // Audit
    try { await prisma.auditLog.create({ data: { entity: 'PurchaseOrder', entityId: String(po.id), action: 'create', userId: req.user?.id ?? null, changes: { create: { projectId, supplierId } } } }); } catch (_e) {}
    res.json(po);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create PO' });
  }
});

  // GET PO details (+ latest document link)
  router.get('/finance/pos/:id', async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      const po = await prisma.purchaseOrder.findFirst({ where: { id, tenantId }, include: { lines: true, deliveries: true, project: { select: { id: true, name: true } } } });
      if (!po) return res.status(404).json({ error: 'NOT_FOUND' });
      let document = null;
      try {
        const link = await prisma.documentLink.findFirst({ where: { tenantId, poId: id }, orderBy: { createdAt: 'desc' } });
        if (link) {
          document = { id: link.documentId.toString(), downloadUrl: `/api/documents/${link.documentId.toString()}/download` };
        }
      } catch (_) {}
      res.json({ ...po, document });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load PO' });
    }
  });

  // UPDATE header
  router.put('/finance/pos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { supplier, status, notes, total } = req.body || {};
    const data = {};
    if (supplier !== undefined) data.supplier = supplier;
    if (status !== undefined) data.status = status;
    if (notes !== undefined) data.internalNotes = notes;
    if (total !== undefined) data.total = Number(total);
    await enforcePoUnlocked(req, id, 'update', data);
    const updated = await prisma.purchaseOrder.update({ where: { id }, data });
    try { await prisma.auditLog.create({ data: { entity: 'PurchaseOrder', entityId: String(id), action: 'update', userId: req.user?.id ?? null, changes: { set: data } } }); } catch(_e) {}
    res.json(updated);
  } catch (e) {
    sendFinanceError(res, e, 'Failed to update PO');
  }
});

  // Add line(s)
  router.post('/finance/pos/:id/lines', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const lines = Array.isArray(req.body) ? req.body : (Array.isArray(req.body?.lines) ? req.body.lines : []);
    if (!lines.length) return res.status(400).json({ error: 'No lines provided' });
    await enforcePoUnlocked(req, id, 'add_line', { lines: true });
    let lineNo = Number(req.body?.start || 1);
    const created = [];
    for (const l of lines) {
      const qty = Number(l.qty || 0);
      const unitCost = Number(l.unitCost || l.rate || 0);
      const lineTotal = Number.isFinite(l.total) ? Number(l.total) : qty * unitCost;
      const row = await prisma.pOLine.create({ data: { tenantId, poId: id, item: String(l.description || l.item || ''), qty, unit: String(l.unit || ''), unitCost, lineTotal } });
      created.push(row);
      lineNo++;
    }
    // refresh PO total
    const sum = await prisma.pOLine.aggregate({ where: { poId: id }, _sum: { lineTotal: true } });
    await prisma.purchaseOrder.update({ where: { id }, data: { total: sum._sum.lineTotal || 0 } });
    try { await prisma.auditLog.create({ data: { entity: 'PurchaseOrder', entityId: String(id), action: 'update_lines', userId: req.user?.id ?? null, changes: { add: created.length } } }); } catch(_e) {}
    res.json({ items: created });
  } catch (e) {
    sendFinanceError(res, e, 'Failed to add PO lines');
  }
});

  // Update a line
  router.put('/finance/pos/:id/lines/:lineId', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const poId = Number(req.params.id);
    const id = Number(req.params.lineId);
    const existingLine = await prisma.pOLine.findFirst({
      where: { id, poId, tenantId },
      select: { id: true, qty: true, unitCost: true },
    });
    if (!existingLine) return res.status(404).json({ error: 'PO line not found' });
    const { item, description, qty, unit, unitCost, lineTotal } = req.body || {};
    const data = {};
    if (item !== undefined || description !== undefined) data.item = String(description ?? item ?? '');
    if (qty !== undefined) data.qty = Number(qty);
    if (unit !== undefined) data.unit = String(unit);
    if (unitCost !== undefined) data.unitCost = Number(unitCost);
    if (lineTotal !== undefined) data.lineTotal = Number(lineTotal);
    if (lineTotal === undefined && (qty !== undefined || unitCost !== undefined)) {
      const nextQty = qty !== undefined ? Number(qty) : Number(existingLine.qty || 0);
      const nextUnitCost = unitCost !== undefined ? Number(unitCost) : Number(existingLine.unitCost || 0);
      data.lineTotal = nextQty * nextUnitCost;
    }
    await enforcePoUnlocked(req, poId, 'update_line', data);
    const row = await prisma.pOLine.update({ where: { id }, data });
    const sum = await prisma.pOLine.aggregate({ where: { poId }, _sum: { lineTotal: true } });
    await prisma.purchaseOrder.update({ where: { id: poId }, data: { total: sum._sum.lineTotal || 0 } });
    try { await prisma.auditLog.create({ data: { entity: 'POLine', entityId: String(id), action: 'update', userId: req.user?.id ?? null, changes: { set: data } } }); } catch(_e) {}
    res.json(row);
  } catch (e) {
    sendFinanceError(res, e, 'Failed to update PO line');
  }
});

  // Delete a line
  router.delete('/finance/pos/:id/lines/:lineId', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const poId = Number(req.params.id);
    const id = Number(req.params.lineId);
    const existingLine = await prisma.pOLine.findFirst({
      where: { id, poId, tenantId },
      select: { id: true },
    });
    if (!existingLine) return res.status(404).json({ error: 'PO line not found' });
    await enforcePoUnlocked(req, poId, 'delete_line', { lines: true });
    await prisma.pOLine.delete({ where: { id } });
    const sum = await prisma.pOLine.aggregate({ where: { poId }, _sum: { lineTotal: true } });
    await prisma.purchaseOrder.update({ where: { id: poId }, data: { total: sum._sum.lineTotal || 0 } });
    try { await prisma.auditLog.create({ data: { entity: 'POLine', entityId: String(id), action: 'delete', userId: req.user?.id ?? null } } ); } catch(_e) {}
    res.json({ ok: true });
  } catch (e) {
    sendFinanceError(res, e, 'Failed to delete PO line');
  }
});

const { generatePoPdfAndStore } = require('../services/pdf.cjs');

// Issue PO (set status + date) and generate document
router.post('/finance/pos/:id/issue', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const po = await prisma.purchaseOrder.update({ where: { id }, data: { status: 'Issued', orderDate: new Date() } });
    let documentId = null;
    try {
      documentId = await generatePoPdfAndStore(id, tenantId);
    } catch (e) {
      // Non-fatal: return PO even if doc gen fails
      documentId = null;
    }
    try { await prisma.auditLog.create({ data: { entity: 'PurchaseOrder', entityId: String(id), action: 'issue', userId: req.user?.id ?? null, changes: { documentId } } }); } catch(_e) {}
    res.json({ ...po, documentId });
  } catch (e) {
    res.status(500).json({ error: 'Failed to issue PO' });
  }
});

// Receive/Receipt (map to Delivery)
  router.post('/finance/pos/:id/receipt', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const note = req.body?.note || null;
    const row = await prisma.delivery.create({ data: { tenantId, poId: id, expectedAt: new Date(), receivedAt: new Date(), note } });
    try { await prisma.auditLog.create({ data: { entity: 'PurchaseOrder', entityId: String(id), action: 'receipt', userId: req.user?.id ?? null, changes: { note } } }); } catch(_e) {}
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: 'Failed to record receipt' });
  }
});

// Close PO
  router.post('/finance/pos/:id/close', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const po = await prisma.purchaseOrder.update({ where: { id }, data: { status: 'Closed' } });
    try { await prisma.auditLog.create({ data: { entity: 'PurchaseOrder', entityId: String(id), action: 'close', userId: req.user?.id ?? null } }); } catch(_e) {}
    res.json(po);
  } catch (e) {
    res.status(500).json({ error: 'Failed to close PO' });
  }
  });

  // Generate PO document (HTML/PDF) on demand
  router.post('/finance/pos/:id/generate-pdf', async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const id = Number(req.params.id);
      const po = await prisma.purchaseOrder.findFirst({ where: { id, tenantId } });
      if (!po) return res.status(404).json({ error: 'NOT_FOUND' });
      const documentId = await generatePoPdfAndStore(id, tenantId);
      try { await prisma.auditLog.create({ data: { entity: 'PurchaseOrder', entityId: String(id), action: 'generate_pdf', userId: req.user?.id ?? null, changes: { documentId } } }); } catch(_) {}
      return res.json({ ok: true, documentId: documentId && documentId.toString ? documentId.toString() : String(documentId) });
    } catch (e) {
      res.status(500).json({ error: 'Failed to generate PO document' });
    }
  });

module.exports = router;
