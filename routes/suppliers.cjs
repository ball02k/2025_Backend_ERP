const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');

// Helpers
function parseIntOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

// LIST
router.get('/', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { q, status, sort = 'name', dir = 'asc', limit = 50, offset = 0 } = req.query;
    const where = { tenantId };
    if (status) where.status = String(status);
    if (q) {
      const term = String(q);
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { companyRegNo: { contains: term, mode: 'insensitive' } },
        { vatNo: { contains: term, mode: 'insensitive' } },
      ];
    }
    const orderBy = [];
    const field = ['name', 'status', 'createdAt', 'updatedAt', 'performanceScore'].includes(String(sort)) ? String(sort) : 'name';
    orderBy.push({ [field]: String(dir).toLowerCase() === 'desc' ? 'desc' : 'asc' });
    if (field !== 'name') orderBy.push({ name: 'asc' });
    const [rows, total] = await Promise.all([
      prisma.supplier.findMany({ where, orderBy, take: Number(limit), skip: Number(offset) }),
      prisma.supplier.count({ where }),
    ]);
    res.json({ data: rows, meta: { total, limit: Number(limit), offset: Number(offset) } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

// DETAIL
router.get('/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const row = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch supplier' });
  }
});

// CREATE
router.post('/', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { name, status, companyRegNo, vatNo, insuranceExpiry, hsAccreditations, performanceScore } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const created = await prisma.supplier.create({
      data: {
        tenantId,
        name: String(name),
        ...(status ? { status: String(status) } : {}),
        ...(companyRegNo ? { companyRegNo: String(companyRegNo) } : {}),
        ...(vatNo ? { vatNo: String(vatNo) } : {}),
        ...(insuranceExpiry ? { insuranceExpiry: new Date(insuranceExpiry) } : {}),
        ...(hsAccreditations ? { hsAccreditations: String(hsAccreditations) } : {}),
        ...(performanceScore != null ? { performanceScore } : {}),
      },
    });
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { name, status, companyRegNo, vatNo, insuranceExpiry, hsAccreditations, performanceScore } = req.body || {};
    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name) } : {}),
        ...(status !== undefined ? { status: String(status) } : {}),
        ...(companyRegNo !== undefined ? { companyRegNo: companyRegNo ? String(companyRegNo) : null } : {}),
        ...(vatNo !== undefined ? { vatNo: vatNo ? String(vatNo) : null } : {}),
        ...(insuranceExpiry !== undefined ? { insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : null } : {}),
        ...(hsAccreditations !== undefined ? { hsAccreditations: hsAccreditations ? String(hsAccreditations) : null } : {}),
        ...(performanceScore !== undefined ? { performanceScore } : {}),
      },
    });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update supplier' });
  }
});

// SOFT DELETE
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await prisma.supplier.update({ where: { id }, data: { status: 'suspended' } });
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
});

// INSIGHT
router.get('/:id/insight', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const supplier = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!supplier) return res.status(404).json({ error: 'Not found' });

    const now = new Date();
    const insuranceValid = !!(supplier.insuranceExpiry && supplier.insuranceExpiry > now);
    const hs = (supplier.hsAccreditations || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    // Procurement linkage
    const pos = await prisma.purchaseOrder.findMany({
      where: { tenantId, supplierId: id },
      select: { id: true, status: true, orderDate: true, total: true },
    });
    const poIds = pos.map((p) => p.id);
    const openPOs = pos.filter((p) => p.status === 'Open').length;
    const committedValue = pos.reduce((sum, p) => sum + Number(p.total || 0), 0);
    const lastPODate = pos.reduce((max, p) => (!max || (p.orderDate && p.orderDate > max) ? p.orderDate : max), null);

    // Performance: on-time deliveries percentage for this supplier
    let onTimeDeliveryPct = null;
    if (poIds.length > 0) {
      const deliveries = await prisma.delivery.findMany({
        where: { tenantId, poId: { in: poIds } },
        select: { expectedAt: true, receivedAt: true },
      });
      const delivered = deliveries.filter((d) => d.receivedAt).length;
      const onTime = deliveries.filter((d) => d.receivedAt && d.expectedAt && d.receivedAt <= d.expectedAt).length;
      onTimeDeliveryPct = delivered > 0 ? Math.round((onTime / delivered) * 100) : null;
    }

    // Placeholder for defectRate until we track defects/returns
    const defectRate = null;

    res.json({
      compliance: { insuranceValid, insuranceExpiry: supplier.insuranceExpiry, hsAccreditations: hs },
      performance: { score: supplier.performanceScore, onTimeDeliveryPct, defectRate },
      financialExposure: { openPOs, committedValue, lastPODate },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to compute supplier insight' });
  }
});

module.exports = router;

