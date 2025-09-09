const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { recomputeProjectSnapshot } = require('../services/projectSnapshot');

function getPaging(req) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// GET /api/qa/records
router.get('/records', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { projectId, status, type, q, search } = req.query;
    const { take, skip } = getPaging(req);
    const where = {
      tenantId,
      isDeleted: false,
      ...(projectId ? { projectId: Number(projectId) } : {}),
      ...(status ? { status: String(status) } : {}),
      ...(type ? { type: String(type) } : {}),
    };
    if (q || search) {
      const s = String(q || search);
      where.OR = [
        { title: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { tags: { contains: s.toLowerCase() } },
        { reference: { contains: s, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.qaRecord.findMany({ where, orderBy: { updatedAt: 'desc' }, take, skip }),
      prisma.qaRecord.count({ where }),
    ]);
    res.json({ items, total, data: { items, total } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list QA records' });
  }
});

// POST /api/qa/records
router.post('/records', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const b = req.body || {};
    const required = ['projectId', 'type', 'title'];
    for (const k of required) if (!b[k]) return res.status(400).json({ error: `Missing ${k}` });
    const projectId = Number(b.projectId);
    const proj = await prisma.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null } });
    if (!proj) return res.status(400).json({ error: 'Invalid projectId' });

    const created = await prisma.qaRecord.create({
      data: {
        tenantId,
        projectId,
        type: String(b.type),
        title: String(b.title),
        description: b.description || null,
        trade: b.trade || null,
        location: b.location || null,
        lot: b.lot || null,
        status: b.status || 'open',
        raisedByUserId: b.raisedByUserId || null,
        assignedToUserId: b.assignedToUserId || null,
        dueDate: b.dueDate ? new Date(b.dueDate) : null,
        itpRef: b.itpRef || null,
        testMethod: b.testMethod || null,
        acceptanceCriteria: b.acceptanceCriteria || null,
        remedialAction: b.remedialAction || null,
        targetClose: b.targetClose ? new Date(b.targetClose) : null,
        tags: b.tags || null,
        reference: b.reference || null,
        createdByUserId: req.user?.id ? String(req.user.id) : null,
      },
    });
    try { await recomputeProjectSnapshot(prisma, { projectId }); } catch (_) {}
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create QA record' });
  }
});

// GET /api/qa/records/:id (include items)
router.get('/records/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const rec = await prisma.qaRecord.findFirst({ where: { id, tenantId, isDeleted: false }, include: { items: true } });
    if (!rec) return res.status(404).json({ error: 'QA record not found' });
    res.json({ data: rec });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load QA record' });
  }
});

// PATCH /api/qa/records/:id
router.patch('/records/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const exists = await prisma.qaRecord.findFirst({ where: { id, tenantId, isDeleted: false } });
    if (!exists) return res.status(404).json({ error: 'QA record not found' });
    const b = req.body || {};
    await prisma.qaRecord.update({
      where: { id },
      data: {
        ...(b.type !== undefined ? { type: b.type } : {}),
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(b.description !== undefined ? { description: b.description } : {}),
        ...(b.trade !== undefined ? { trade: b.trade } : {}),
        ...(b.location !== undefined ? { location: b.location } : {}),
        ...(b.lot !== undefined ? { lot: b.lot } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
        ...(b.raisedByUserId !== undefined ? { raisedByUserId: b.raisedByUserId } : {}),
        ...(b.assignedToUserId !== undefined ? { assignedToUserId: b.assignedToUserId } : {}),
        ...(b.dueDate !== undefined ? { dueDate: b.dueDate ? new Date(b.dueDate) : null } : {}),
        ...(b.itpRef !== undefined ? { itpRef: b.itpRef } : {}),
        ...(b.testMethod !== undefined ? { testMethod: b.testMethod } : {}),
        ...(b.acceptanceCriteria !== undefined ? { acceptanceCriteria: b.acceptanceCriteria } : {}),
        ...(b.remedialAction !== undefined ? { remedialAction: b.remedialAction } : {}),
        ...(b.targetClose !== undefined ? { targetClose: b.targetClose ? new Date(b.targetClose) : null } : {}),
        ...(b.tags !== undefined ? { tags: b.tags } : {}),
        ...(b.reference !== undefined ? { reference: b.reference } : {}),
        updatedByUserId: req.user?.id ? String(req.user.id) : null,
      },
    });
    const updated = await prisma.qaRecord.findFirst({ where: { id, tenantId }, include: { items: true } });
    try { await recomputeProjectSnapshot(prisma, { projectId: updated.projectId }); } catch (_) {}
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update QA record' });
  }
});

// DELETE /api/qa/records/:id
router.delete('/records/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const exists = await prisma.qaRecord.findFirst({ where: { id, tenantId, isDeleted: false } });
    if (!exists) return res.status(404).json({ error: 'QA record not found' });
    await prisma.qaRecord.update({ where: { id }, data: { isDeleted: true } });
    try { await recomputeProjectSnapshot(prisma, { projectId: exists.projectId }); } catch (_) {}
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete QA record' });
  }
});

// POST /api/qa/records/:id/items
router.post('/records/:id/items', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const exists = await prisma.qaRecord.findFirst({ where: { id, tenantId, isDeleted: false } });
    if (!exists) return res.status(404).json({ error: 'QA record not found' });
    const b = req.body || {};
    if (!b.item) return res.status(400).json({ error: 'Missing item' });
    const created = await prisma.qaItem.create({
      data: {
        tenantId,
        qaRecordId: id,
        item: String(b.item),
        result: b.result || 'open',
        notes: b.notes || null,
        responsibleParty: b.responsibleParty || null,
        dueDate: b.dueDate ? new Date(b.dueDate) : null,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create QA item' });
  }
});

// PATCH /api/qa/items/:itemId
router.patch('/items/:itemId', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const itemId = Number(req.params.itemId);
    const exists = await prisma.qaItem.findFirst({ where: { id: itemId, tenantId } });
    if (!exists) return res.status(404).json({ error: 'QA item not found' });
    const b = req.body || {};
    const updated = await prisma.qaItem.update({
      where: { id: itemId },
      data: {
        ...(b.item !== undefined ? { item: b.item } : {}),
        ...(b.result !== undefined ? { result: b.result } : {}),
        ...(b.notes !== undefined ? { notes: b.notes } : {}),
        ...(b.responsibleParty !== undefined ? { responsibleParty: b.responsibleParty } : {}),
        ...(b.dueDate !== undefined ? { dueDate: b.dueDate ? new Date(b.dueDate) : null } : {}),
        ...(b.closedAt !== undefined ? { closedAt: b.closedAt ? new Date(b.closedAt) : null } : {}),
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update QA item' });
  }
});

// DELETE /api/qa/items/:itemId
router.delete('/items/:itemId', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const itemId = Number(req.params.itemId);
    const exists = await prisma.qaItem.findFirst({ where: { id: itemId, tenantId } });
    if (!exists) return res.status(404).json({ error: 'QA item not found' });
    await prisma.qaItem.delete({ where: { id: itemId } });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete QA item' });
  }
});

// GET /api/qa/records/:id/documents
router.get('/records/:id/documents', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const docs = await prisma.document.findMany({
      where: { tenantId, links: { some: { tenantId, qaRecordId: id } } },
      orderBy: { uploadedAt: 'desc' },
    });
    res.json({ items: docs, total: docs.length, data: { items: docs, total: docs.length } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list QA documents' });
  }
});

module.exports = router;
