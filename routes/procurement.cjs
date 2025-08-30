const express = require('express');
const router = express.Router();
const { prisma, dec } = require('../utils/prisma.cjs');
const { requireProjectMember } = require('../middleware/membership.cjs');
const { recomputeProcurement } = require('../services/projectSnapshot');

function getTenantId(req) {
  return req.user && req.user.tenantId;
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

async function resolveSupplierIdByName(tenantId, maybeName) {
  const name = (maybeName || '').trim();
  if (!name) return null;
  const s = await prisma.supplier.findFirst({
    where: { tenantId, name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  return s?.id || null;
}

async function attachSupplierInfo(rows, tenantId) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const ids = Array.from(
    new Set(list.map((r) => r.supplierId).filter((v) => Number.isFinite(Number(v))))
  );
  if (!ids.length) return rows;
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, name: true, status: true, performanceScore: true },
  });
  const map = new Map(suppliers.map((s) => [s.id, s]));
  const decorate = (r) => ({ ...r, supplierInfo: r.supplierId ? map.get(r.supplierId) || null : null });
  return Array.isArray(rows) ? rows.map(decorate) : decorate(rows);
}

// List POs
router.get('/pos', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { projectId } = req.query;
    const where = { tenantId, ...(projectId ? { projectId: Number(projectId) } : {}) };
    const rowsRaw = await prisma.purchaseOrder.findMany({
      where,
      include: {
        lines: true,
        deliveries: true,
        // Minimal relation for FE linking
        project: { select: { id: true, name: true } },
      },
    });
    const rows = await attachSupplierInfo(rowsRaw, tenantId);
    res.json(rows);
  } catch (e) { next(e); }
});

// Get PO by id
router.get('/pos/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const rowRaw = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: {
        lines: true,
        deliveries: true,
        // Minimal relation for FE linking
        project: { select: { id: true, name: true } },
      },
    });
    if (!rowRaw) return res.status(404).json({ error: 'Not found' });
    const row = await attachSupplierInfo(rowRaw, tenantId);
    res.json(row);
  } catch (e) { next(e); }
});

// Create PO
router.post('/pos', requireProjectMember, async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { lines = [], ...data } = req.body;
  // Supplier resolution: prefer supplierId; fallback to supplierName/supplier string
  let supplierId = data.supplierId;
  if (!supplierId && data.supplierName) supplierId = await resolveSupplierIdByName(tenantId, data.supplierName);
  if (!supplierId && data.supplier) supplierId = await resolveSupplierIdByName(tenantId, data.supplier);

  const createdRaw = await prisma.purchaseOrder.create({
    data: {
      ...data,
      tenantId,
      ...(supplierId ? { supplierId: Number(supplierId) } : {}),
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
    include: {
      lines: true,
      deliveries: true,
      // Minimal relation for FE linking
      project: { select: { id: true, name: true } },
    },
  });
    const created = await attachSupplierInfo(createdRaw, tenantId);
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

    // Membership check via middleware
    req.query.projectId = String(existing.projectId);
    await new Promise((resolve, reject) => requireProjectMember(req, res, (err) => err ? reject(err) : resolve()));

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
      // Supplier resolution on update
      let supplierId = data.supplierId;
      if (!supplierId && data.supplierName) supplierId = await resolveSupplierIdByName(tenantId, data.supplierName);
      if (!supplierId && data.supplier) supplierId = await resolveSupplierIdByName(tenantId, data.supplier);

      await tx.purchaseOrder.updateMany({
        where: { id, tenantId },
        data: {
          ...data,
          ...(supplierId ? { supplierId: Number(supplierId) } : {}),
          ...(data.orderDate ? { orderDate: new Date(data.orderDate) } : {}),
          ...(data.total !== undefined ? { total: dec(data.total) } : {}),
        },
      });
      return tx.purchaseOrder.findFirst({
        where: { id, tenantId },
        include: {
          lines: true,
          deliveries: true,
          // Minimal relation for FE linking
          project: { select: { id: true, name: true } },
        },
      });
    });
    const updatedWithSupplier = await attachSupplierInfo(updated, tenantId);

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

    res.json(updatedWithSupplier);
  } catch (e) { next(e); }
});

// Delete PO
router.delete('/pos/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const existing = await prisma.purchaseOrder.findFirst({ where: { id, tenantId }, select: { projectId: true } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    // Membership check via middleware
    req.query.projectId = String(existing.projectId);
    await new Promise((resolve, reject) => requireProjectMember(req, res, (err) => err ? reject(err) : resolve()));

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
    // Resolve project via PO and check membership
    const po = await prisma.purchaseOrder.findFirst({ where: { id: Number(body.poId), tenantId }, select: { projectId: true } });
    if (!po) return res.status(400).json({ error: 'Invalid poId' });
    req.query.projectId = String(po.projectId);
    await new Promise((resolve, reject) => requireProjectMember(req, res, (err) => err ? reject(err) : resolve()));
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
    // Membership check via PO's project
    req.query.projectId = String(existing.po.projectId);
    await new Promise((resolve, reject) => requireProjectMember(req, res, (err) => err ? reject(err) : resolve()));
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
