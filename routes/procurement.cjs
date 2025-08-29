const express = require('express');
const router = express.Router();
const { prisma, dec } = require('../utils/prisma.cjs');
const { recomputeProcurement } = require('../services/projectSnapshot');
const { requireProjectMember } = require('../middleware/membership.cjs');

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

async function loadPo(req, res, next) {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!po) return res.status(404).json({ error: 'Not found' });
    req.po = po;
    req.params.projectId = String(po.projectId);
    next();
  } catch (e) { next(e); }
}

async function attachPoFromBody(req, res, next) {
  try {
    const tenantId = req.user.tenantId;
    const poId = Number(req.body.poId);
    if (!poId) return res.status(400).json({ error: 'poId required' });
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: poId, tenantId },
      select: { id: true, projectId: true },
    });
    if (!po) return res.status(404).json({ error: 'PO not found' });
    req.po = po;
    req.params.projectId = String(po.projectId);
    next();
  } catch (e) { next(e); }
}

async function loadDelivery(req, res, next) {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const delivery = await prisma.delivery.findFirst({
      where: { id, tenantId },
      include: { po: true },
    });
    if (!delivery) return res.status(404).json({ error: 'Not found' });
    req.delivery = delivery;
    req.params.projectId = String(delivery.po.projectId);
    next();
  } catch (e) { next(e); }
}

// List POs
router.get('/pos', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
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
    const tenantId = req.user.tenantId;
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
router.post('/pos', requireProjectMember, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
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
router.put('/pos/:id', loadPo, requireProjectMember, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = req.po;

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
router.delete('/pos/:id', loadPo, requireProjectMember, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = req.po;

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
router.post('/deliveries', attachPoFromBody, requireProjectMember, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
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
router.put('/deliveries/:id', loadDelivery, requireProjectMember, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = req.delivery;
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
