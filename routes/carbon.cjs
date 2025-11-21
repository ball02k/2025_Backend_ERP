const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { recomputeProjectSnapshot } = require('../services/projectSnapshot');

function getPaging(req) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// GET /api/carbon/project/:projectId/summary
router.get('/project/:projectId/summary', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.projectId);

    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { name: true, code: true, carbonTarget: true, carbonBudget: true },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get all emissions for this project
    const entries = await prisma.carbonEntry.findMany({
      where: { projectId, tenantId, isDeleted: false },
      select: { scope: true, category: true, calculatedKgCO2e: true, activityDate: true },
    });

    const totalEmissions = entries.reduce((sum, e) => sum + Number(e.calculatedKgCO2e || 0), 0) / 1000; // Convert to tonnes
    const byScope = {};
    const byCategory = {};

    entries.forEach(e => {
      const scope = e.scope || 'Unknown';
      const cat = e.category || 'Unknown';
      byScope[scope] = (byScope[scope] || 0) + Number(e.calculatedKgCO2e || 0) / 1000;
      byCategory[cat] = (byCategory[cat] || 0) + Number(e.calculatedKgCO2e || 0) / 1000;
    });

    const target = Number(project.carbonTarget || 0);
    const status = target > 0 && totalEmissions <= target ? 'ON_TRACK' : target > 0 ? 'EXCEEDING' : 'NO_TARGET';

    res.json({
      project: project.name,
      projectCode: project.code,
      target,
      budget: Number(project.carbonBudget || 0),
      totalEmissions: parseFloat(totalEmissions.toFixed(2)),
      netEmissions: parseFloat(totalEmissions.toFixed(2)),
      status,
      byScope,
      byCategory,
      entryCount: entries.length,
    });
  } catch (err) {
    console.error('Carbon summary error:', err);
    res.status(500).json({ error: 'Failed to fetch carbon summary' });
  }
});

// GET /api/carbon/entries
router.get('/entries', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { projectId, scope, category, supplierId, year, month, q, search } = req.query;
    const { take, skip } = getPaging(req);
    const where = {
      tenantId,
      isDeleted: false,
      ...(projectId ? { projectId: Number(projectId) } : {}),
      ...(scope ? { scope: String(scope) } : {}),
      ...(category ? { category: String(category) } : {}),
      ...(supplierId ? { supplierId: Number(supplierId) } : {}),
      ...(year ? { periodYear: Number(year) } : {}),
      ...(month ? { periodMonth: Number(month) } : {}),
    };
    if (q || search) {
      const s = String(q || search);
      where.OR = [
        { category: { contains: s, mode: 'insensitive' } },
        { notes: { contains: s, mode: 'insensitive' } },
        { materialOrFuel: { contains: s, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.carbonEntry.findMany({ where, orderBy: { activityDate: 'desc' }, take, skip }),
      prisma.carbonEntry.count({ where }),
    ]);
    res.json({ items, total, data: { items, total } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list Carbon entries' });
  }
});

// POST /api/carbon/entries
router.post('/entries', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const b = req.body || {};
    const required = ['projectId', 'scope', 'category', 'activityDate', 'quantity', 'unit', 'emissionFactor', 'factorUnit'];
    for (const k of required) if (b[k] == null || b[k] === '') return res.status(400).json({ error: `Missing ${k}` });
    const projectId = Number(b.projectId);
    const proj = await prisma.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null } });
    if (!proj) return res.status(400).json({ error: 'Invalid projectId' });
    const qty = Number(b.quantity);
    const ef = Number(b.emissionFactor);
    const calc = isFinite(qty) && isFinite(ef) ? qty * ef : 0;
  const created = await prisma.carbonEntry.create({
    data: {
        tenantId,
        projectId,
        scope: String(b.scope),
        category: String(b.category),
        activityDate: new Date(b.activityDate),
        quantity: qty,
        unit: String(b.unit),
        emissionFactor: ef,
        factorUnit: String(b.factorUnit),
        calculatedKgCO2e: calc,
        supplierId: b.supplierId ? Number(b.supplierId) : null,
        purchaseOrderId: b.purchaseOrderId ? Number(b.purchaseOrderId) : null,
        poLineId: b.poLineId ? Number(b.poLineId) : null,
        deliveryId: b.deliveryId ? Number(b.deliveryId) : null,
        factorSource: b.factorSource || null,
        factorRef: b.factorRef || null,
        materialOrFuel: b.materialOrFuel || null,
        vehicleType: b.vehicleType || null,
        fuelType: b.fuelType || null,
        notes: b.notes || null,
        periodMonth: b.periodMonth != null ? Number(b.periodMonth) : null,
        periodYear: b.periodYear != null ? Number(b.periodYear) : null,
        createdByUserId: req.user?.id ? String(req.user.id) : null,
      },
    });
  try { await recomputeProjectSnapshot(prisma, { projectId }); } catch (_) {}
  res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create Carbon entry' });
  }
});

// GET /api/carbon/entries/:id
router.get('/entries/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const row = await prisma.carbonEntry.findFirst({ where: { id, tenantId, isDeleted: false } });
    if (!row) return res.status(404).json({ error: 'Carbon entry not found' });
    res.json({ data: row });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load Carbon entry' });
  }
});

// PATCH /api/carbon/entries/:id
router.patch('/entries/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const exists = await prisma.carbonEntry.findFirst({ where: { id, tenantId, isDeleted: false } });
    if (!exists) return res.status(404).json({ error: 'Carbon entry not found' });
    const b = req.body || {};
    const data = {};
    for (const k of ['scope','category','unit','factorUnit','factorSource','factorRef','materialOrFuel','vehicleType','fuelType','notes']) if (k in b) data[k] = b[k];
    if ('activityDate' in b) data.activityDate = b.activityDate ? new Date(b.activityDate) : null;
    if ('quantity' in b) data.quantity = Number(b.quantity);
    if ('emissionFactor' in b) data.emissionFactor = Number(b.emissionFactor);
    if ('periodMonth' in b) data.periodMonth = b.periodMonth != null ? Number(b.periodMonth) : null;
    if ('periodYear' in b) data.periodYear = b.periodYear != null ? Number(b.periodYear) : null;
    // Recompute calculatedKgCO2e when inputs provided
    const qty = 'quantity' in data ? Number(data.quantity) : Number(exists.quantity);
    const ef = 'emissionFactor' in data ? Number(data.emissionFactor) : Number(exists.emissionFactor);
    data.calculatedKgCO2e = qty * ef;
    await prisma.carbonEntry.update({ where: { id }, data });
    const updated = await prisma.carbonEntry.findFirst({ where: { id, tenantId } });
    try { await recomputeProjectSnapshot(prisma, { projectId: updated.projectId }); } catch (_) {}
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update Carbon entry' });
  }
});

// DELETE /api/carbon/entries/:id
router.delete('/entries/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const exists = await prisma.carbonEntry.findFirst({ where: { id, tenantId, isDeleted: false } });
    if (!exists) return res.status(404).json({ error: 'Carbon entry not found' });
    await prisma.carbonEntry.update({ where: { id }, data: { isDeleted: true } });
    try { await recomputeProjectSnapshot(prisma, { projectId: exists.projectId }); } catch (_) {}
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete Carbon entry' });
  }
});

// GET /api/carbon/entries/:id/documents
router.get('/entries/:id/documents', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const docs = await prisma.document.findMany({
      where: { tenantId, links: { some: { tenantId, carbonEntryId: id } } },
      orderBy: { uploadedAt: 'desc' },
    });
    res.json({ items: docs, total: docs.length, data: { items: docs, total: docs.length } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list Carbon documents' });
  }
});

module.exports = router;
