const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { recomputeProjectSnapshot } = require('../services/projectSnapshot');

function getPaging(req) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// GET /api/hs/events
router.get('/events', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { projectId, type, status, severity, from, to, q, search } = req.query;
    const { take, skip } = getPaging(req);
    const where = {
      tenantId,
      isDeleted: false,
      ...(projectId ? { projectId: Number(projectId) } : {}),
      ...(type ? { type: String(type) } : {}),
      ...(status ? { status: String(status) } : {}),
      ...(severity ? { severity: String(severity) } : {}),
    };
    if (from || to) {
      where.eventDate = {};
      if (from) where.eventDate.gte = new Date(from);
      if (to) where.eventDate.lte = new Date(to);
    }
    if (q || search) {
      const s = String(q || search);
      where.OR = [
        { title: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { tags: { contains: s.toLowerCase() } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.hsEvent.findMany({ where, orderBy: { updatedAt: 'desc' }, take, skip }),
      prisma.hsEvent.count({ where }),
    ]);
    res.json({ items, total, data: { items, total } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list H&S events' });
  }
});

// POST /api/hs/events
router.post('/events', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const b = req.body || {};
    const required = ['projectId', 'type', 'title', 'description', 'eventDate'];
    for (const k of required) if (!b[k]) return res.status(400).json({ error: `Missing ${k}` });
    const projectId = Number(b.projectId);
    const proj = await prisma.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null } });
    if (!proj) return res.status(400).json({ error: 'Invalid projectId' });
    const created = await prisma.hsEvent.create({
      data: {
        tenantId,
        projectId,
        type: String(b.type),
        title: String(b.title),
        description: String(b.description),
        eventDate: new Date(b.eventDate),
        location: b.location || null,
        reportedByUserId: b.reportedByUserId || null,
        assignedToUserId: b.assignedToUserId || null,
        status: b.status || 'open',
        severity: b.severity || null,
        initialRiskRating: b.initialRiskRating || null,
        residualRiskRating: b.residualRiskRating || null,
        personsInvolved: b.personsInvolved || null,
        lostTimeHours: b.lostTimeHours != null ? Number(b.lostTimeHours) : null,
        isRIDDOR: b.isRIDDOR != null ? !!b.isRIDDOR : null,
        riddorRef: b.riddorRef || null,
        regulatorNotified: b.regulatorNotified != null ? !!b.regulatorNotified : null,
        regulatorName: b.regulatorName || null,
        notificationDate: b.notificationDate ? new Date(b.notificationDate) : null,
        immediateAction: b.immediateAction || null,
        rootCause: b.rootCause || null,
        correctiveActions: b.correctiveActions || null,
        targetClose: b.targetClose ? new Date(b.targetClose) : null,
        tags: b.tags || null,
        createdByUserId: req.user?.id ? String(req.user.id) : null,
      },
    });
    try { await recomputeProjectSnapshot(prisma, { projectId }); } catch (_) {}
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create H&S event' });
  }
});

// GET /api/hs/events/:id
router.get('/events/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const row = await prisma.hsEvent.findFirst({ where: { id, tenantId, isDeleted: false } });
    if (!row) return res.status(404).json({ error: 'H&S event not found' });
    res.json({ data: row });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load H&S event' });
  }
});

// PATCH /api/hs/events/:id
router.patch('/events/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const exists = await prisma.hsEvent.findFirst({ where: { id, tenantId, isDeleted: false } });
    if (!exists) return res.status(404).json({ error: 'H&S event not found' });
    const b = req.body || {};
    await prisma.hsEvent.update({
      where: { id },
      data: {
        ...(b.type !== undefined ? { type: b.type } : {}),
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(b.description !== undefined ? { description: b.description } : {}),
        ...(b.eventDate !== undefined ? { eventDate: b.eventDate ? new Date(b.eventDate) : null } : {}),
        ...(b.location !== undefined ? { location: b.location } : {}),
        ...(b.reportedByUserId !== undefined ? { reportedByUserId: b.reportedByUserId } : {}),
        ...(b.assignedToUserId !== undefined ? { assignedToUserId: b.assignedToUserId } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
        ...(b.severity !== undefined ? { severity: b.severity } : {}),
        ...(b.initialRiskRating !== undefined ? { initialRiskRating: b.initialRiskRating } : {}),
        ...(b.residualRiskRating !== undefined ? { residualRiskRating: b.residualRiskRating } : {}),
        ...(b.personsInvolved !== undefined ? { personsInvolved: b.personsInvolved } : {}),
        ...(b.lostTimeHours !== undefined ? { lostTimeHours: b.lostTimeHours != null ? Number(b.lostTimeHours) : null } : {}),
        ...(b.isRIDDOR !== undefined ? { isRIDDOR: !!b.isRIDDOR } : {}),
        ...(b.riddorRef !== undefined ? { riddorRef: b.riddorRef } : {}),
        ...(b.regulatorNotified !== undefined ? { regulatorNotified: !!b.regulatorNotified } : {}),
        ...(b.regulatorName !== undefined ? { regulatorName: b.regulatorName } : {}),
        ...(b.notificationDate !== undefined ? { notificationDate: b.notificationDate ? new Date(b.notificationDate) : null } : {}),
        ...(b.immediateAction !== undefined ? { immediateAction: b.immediateAction } : {}),
        ...(b.rootCause !== undefined ? { rootCause: b.rootCause } : {}),
        ...(b.correctiveActions !== undefined ? { correctiveActions: b.correctiveActions } : {}),
        ...(b.targetClose !== undefined ? { targetClose: b.targetClose ? new Date(b.targetClose) : null } : {}),
        ...(b.closedAt !== undefined ? { closedAt: b.closedAt ? new Date(b.closedAt) : null } : {}),
        ...(b.tags !== undefined ? { tags: b.tags } : {}),
        updatedByUserId: req.user?.id ? String(req.user.id) : null,
      },
    });
    const updated = await prisma.hsEvent.findFirst({ where: { id, tenantId } });
    try { await recomputeProjectSnapshot(prisma, { projectId: updated.projectId }); } catch (_) {}
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update H&S event' });
  }
});

// DELETE /api/hs/events/:id
router.delete('/events/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const exists = await prisma.hsEvent.findFirst({ where: { id, tenantId, isDeleted: false } });
    if (!exists) return res.status(404).json({ error: 'H&S event not found' });
    await prisma.hsEvent.update({ where: { id }, data: { isDeleted: true } });
    try { await recomputeProjectSnapshot(prisma, { projectId: exists.projectId }); } catch (_) {}
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete H&S event' });
  }
});

// GET /api/hs/events/:id/documents
router.get('/events/:id/documents', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const docs = await prisma.document.findMany({
      where: { tenantId, links: { some: { tenantId, hsEventId: id } } },
      orderBy: { uploadedAt: 'desc' },
    });
    res.json({ items: docs, total: docs.length, data: { items: docs, total: docs.length } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list H&S documents' });
  }
});

module.exports = router;
