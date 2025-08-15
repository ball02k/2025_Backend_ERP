const express = require('express');
const router = express.Router();
const { prisma, dec } = require('../utils/prisma.cjs');
const { recomputeProcurement } = require('../services/projectSnapshot');

function getTenantId(req) {
  return req.headers['x-tenant-id'] || 'demo';
}

async function adjustSnapshot(projectId, tenantId, field, delta) {
  const where = { projectId, tenantId };
  if (delta < 0) where[field] = { gt: 0 };
  const data = { updatedAt: new Date() };
  data[field] = delta > 0 ? { increment: delta } : { decrement: Math.abs(delta) };
  const res = await prisma.projectSnapshot.updateMany({ where, data });
  if (res.count === 0) {
    const createData = { projectId, tenantId, procurementPOsOpen: 0, procurementCriticalLate: 0 };
    if (delta > 0) createData[field] = delta;
    await prisma.projectSnapshot.create({ data: createData });
  }
}

// List POs
router.get('/pos', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { projectId } = req.query;
    const where = { tenantId, ...(projectId ? { projectId: Number(projectId) } : {}) };
    const rows = await prisma.purchaseOrder.findMany({
      where,
      include: { lines: true, deliveries: true },
    });
    res.json(rows);
  } catch (e) { next(e); }
});

// Get PO by id
router.get('/pos/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const row = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: { lines: true, deliveries: true },
    });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { next(e); }
});

// Create PO
router.post('/pos', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { lines = [], ...data } = req.body;
    const created = await prisma.purchaseOrder.create({
      data: {
        ...data,
        tenantId,
        ...(data.orderDate ? { orderDate: new Date(data.orderDate) } : {}),
        total: data.total !== undefined ? dec(data.total) : undefined,
        lines: {
          create: lines.map((l) => ({
            tenantId,
            item: l.item,
            qty: dec(l.qty),
            unit: l.unit,
            unitCost: dec(l.unitCost),
            lineTotal: dec(l.lineTotal),
          })),
        },
      },
      include: { lines: true, deliveries: true },
    });
    if (created.status === 'Open') {
      await adjustSnapshot(created.projectId, tenantId, 'procurementPOsOpen', 1);
    }
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// Update PO
router.put('/pos/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const existing = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { lines = [], ...data } = req.body;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.pOLine.deleteMany({ where: { poId: id, tenantId } });
      if (lines.length) {
        await tx.pOLine.createMany({
          data: lines.map((l) => ({
            tenantId,
            poId: id,
            item: l.item,
            qty: dec(l.qty),
            unit: l.unit,
            unitCost: dec(l.unitCost),
            lineTotal: dec(l.lineTotal),
          })),
        });
      }
      await tx.purchaseOrder.updateMany({
        where: { id, tenantId },
        data: {
          ...data,
          ...(data.orderDate ? { orderDate: new Date(data.orderDate) } : {}),
          ...(data.total !== undefined ? { total: dec(data.total) } : {}),
        },
      });
      return tx.purchaseOrder.findFirst({
        where: { id, tenantId },
        include: { lines: true, deliveries: true },
      });
    });

    if (existing.status === 'Open' && updated.status !== 'Open') {
      await adjustSnapshot(existing.projectId, tenantId, 'procurementPOsOpen', -1);
    } else if (existing.status !== 'Open' && updated.status === 'Open') {
      await adjustSnapshot(updated.projectId, tenantId, 'procurementPOsOpen', 1);
    } else if (
      existing.status === 'Open' &&
      updated.status === 'Open' &&
      existing.projectId !== updated.projectId
    ) {
      await adjustSnapshot(existing.projectId, tenantId, 'procurementPOsOpen', -1);
      await adjustSnapshot(updated.projectId, tenantId, 'procurementPOsOpen', 1);
    }

    res.json(updated);
  } catch (e) { next(e); }
});

// Delete PO
router.delete('/pos/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const existing = await prisma.purchaseOrder.findFirst({ where: { id, tenantId }, select: { projectId: true } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await prisma.$transaction(async (tx) => {
      await tx.pOLine.deleteMany({ where: { poId: id, tenantId } });
      await tx.delivery.deleteMany({ where: { poId: id, tenantId } });
      await tx.purchaseOrder.deleteMany({ where: { id, tenantId } });
    });
    await recomputeProcurement(existing.projectId, tenantId);
    res.status(204).end();
  } catch (e) { next(e); }
});

// Create Delivery
router.post('/deliveries', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const body = req.body;
    const created = await prisma.delivery.create({
      data: {
        tenantId,
        poId: body.poId,
        expectedAt: new Date(body.expectedAt),
        ...(body.receivedAt ? { receivedAt: new Date(body.receivedAt) } : {}),
        note: body.note,
      },
      include: { po: true },
    });
    const now = new Date();
    if (created.expectedAt < now && !created.receivedAt) {
      await adjustSnapshot(created.po.projectId, tenantId, 'procurementCriticalLate', 1);
    }
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// Update Delivery
router.put('/deliveries/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const existing = await prisma.delivery.findFirst({
      where: { id, tenantId },
      include: { po: true },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const wasOverdue = existing.expectedAt < new Date() && !existing.receivedAt;

    const { expectedAt, receivedAt, note } = req.body;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.delivery.updateMany({
        where: { id, tenantId },
        data: {
          ...(expectedAt ? { expectedAt: new Date(expectedAt) } : {}),
          ...(receivedAt !== undefined ? { receivedAt: receivedAt ? new Date(receivedAt) : null } : {}),
          ...(note !== undefined ? { note } : {}),
        },
      });
      return tx.delivery.findFirst({ where: { id, tenantId }, include: { po: true } });
    });

    const now = new Date();
    const isOverdue = updated.expectedAt < now && !updated.receivedAt;
    if (!wasOverdue && isOverdue) {
      await adjustSnapshot(updated.po.projectId, tenantId, 'procurementCriticalLate', 1);
    } else if (wasOverdue && !isOverdue) {
      await adjustSnapshot(updated.po.projectId, tenantId, 'procurementCriticalLate', -1);
    }

    res.json(updated);
  } catch (e) { next(e); }
});

module.exports = router;
