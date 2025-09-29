const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { recomputeProjectSnapshot } = require('../services/projectSnapshot');

function asItemsTotal(payload, itemsKey = 'items') {
  const d = payload && payload.data && payload.data.items ? payload.data : payload;
  return { items: d[itemsKey] || d.items || [], total: d.total || (d.meta ? d.meta.total : 0) };
}

// Normalize pagination
function getPaging(req) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// GET /api/rfis
router.get('/', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { projectId, status, q, search } = req.query;
    const { take, skip } = getPaging(req);
    const where = {
      tenantId,
      isDeleted: false,
      ...(projectId ? { projectId: Number(projectId) } : {}),
      ...(status ? { status: String(status) } : {}),
    };
    if (q || search) {
      const s = String(q || search);
      where.OR = [
        { rfiNumber: { contains: s, mode: 'insensitive' } },
        { subject: { contains: s, mode: 'insensitive' } },
        { question: { contains: s, mode: 'insensitive' } },
        { tags: { contains: s.toLowerCase() } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.rfi.findMany({ where, orderBy: { updatedAt: 'desc' }, take, skip }),
      prisma.rfi.count({ where }),
    ]);
    res.json({ items, total, data: { items, total } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list RFIs' });
  }
});

// POST /api/rfis
router.post('/', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const body = req.body || {};
    const required = ['projectId', 'rfiNumber', 'subject', 'question'];
    for (const k of required) if (body[k] == null || body[k] === '') return res.status(400).json({ error: `Missing ${k}` });
    const projectId = Number(body.projectId);
    const proj = await prisma.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null } });
    if (!proj) return res.status(400).json({ error: 'Invalid projectId' });

    const created = await prisma.rfi.create({
      data: {
        tenantId,
        projectId,
        rfiNumber: String(body.rfiNumber),
        subject: String(body.subject),
        question: String(body.question),
        status: body.status || 'open',
        priority: body.priority || 'med',
        discipline: body.discipline || null,
        packageId: body.packageId ? Number(body.packageId) : null,
        requestedByUserId: body.requestedByUserId || null,
        assignedToUserId: body.assignedToUserId || null,
        toCompanyId: body.toCompanyId ? Number(body.toCompanyId) : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        ccEmails: body.ccEmails || null,
        tags: body.tags || null,
        location: body.location || null,
        originatorRef: body.originatorRef || null,
        createdByUserId: req.user?.id ? String(req.user.id) : null,
      },
    });
    try { await recomputeProjectSnapshot(prisma, { projectId }); } catch (_) {}
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create RFI' });
  }
});

// GET /api/rfis/:id
router.get('/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const row = await prisma.rfi.findFirst({ where: { id, tenantId, isDeleted: false } });
    if (!row) return res.status(404).json({ error: 'RFI not found' });
    res.json({ data: row });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load RFI' });
  }
});

// PATCH /api/rfis/:id
router.patch('/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const existing = await prisma.rfi.findFirst({ where: { id, tenantId, isDeleted: false } });
    if (!existing) return res.status(404).json({ error: 'RFI not found' });
    const body = req.body || {};

    await prisma.rfi.update({
      where: { id },
      data: {
        ...(body.subject !== undefined ? { subject: body.subject } : {}),
        ...(body.question !== undefined ? { question: body.question } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.discipline !== undefined ? { discipline: body.discipline } : {}),
        ...(body.packageId !== undefined ? { packageId: body.packageId ? Number(body.packageId) : null } : {}),
        ...(body.requestedByUserId !== undefined ? { requestedByUserId: body.requestedByUserId } : {}),
        ...(body.assignedToUserId !== undefined ? { assignedToUserId: body.assignedToUserId } : {}),
        ...(body.toCompanyId !== undefined ? { toCompanyId: body.toCompanyId ? Number(body.toCompanyId) : null } : {}),
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(body.dueDate) : null } : {}),
        ...(body.responseText !== undefined ? { responseText: body.responseText } : {}),
        ...(body.responseByUserId !== undefined ? { responseByUserId: body.responseByUserId } : {}),
        ...(body.respondedAt !== undefined ? { respondedAt: body.respondedAt ? new Date(body.respondedAt) : null } : {}),
        ...(body.costImpact !== undefined ? { costImpact: body.costImpact } : {}),
        ...(body.scheduleImpact !== undefined ? { scheduleImpact: body.scheduleImpact } : {}),
        ...(body.changeRequired !== undefined ? { changeRequired: !!body.changeRequired } : {}),
        ...(body.ccEmails !== undefined ? { ccEmails: body.ccEmails } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(body.originatorRef !== undefined ? { originatorRef: body.originatorRef } : {}),
        ...(body.closedAt !== undefined ? { closedAt: body.closedAt ? new Date(body.closedAt) : null } : {}),
        ...(body.voidReason !== undefined ? { voidReason: body.voidReason } : {}),
        updatedByUserId: req.user?.id ? String(req.user.id) : null,
      },
    });
    const updated = await prisma.rfi.findFirst({ where: { id, tenantId } });
    try { await recomputeProjectSnapshot(prisma, { projectId: updated.projectId }); } catch (_) {}
    res.json({ data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update RFI' });
  }
});

// DELETE /api/rfis/:id (soft)
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.rfi.findFirst({ where: { id, tenantId, isDeleted: false } });
    if (!existing) return res.status(404).json({ error: 'RFI not found' });
    await prisma.rfi.update({ where: { id }, data: { isDeleted: true } });
    try { await recomputeProjectSnapshot(prisma, { projectId: existing.projectId }); } catch (_) {}
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete RFI' });
  }
});

// GET /api/rfis/:id/documents
router.get('/:id/documents', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const docs = await prisma.document.findMany({
      where: { tenantId, links: { some: { tenantId, rfiId: id } } },
      orderBy: { uploadedAt: 'desc' },
    });
    res.json({ items: docs, total: docs.length, data: { items: docs, total: docs.length } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list RFI documents' });
  }
});

module.exports = router;
