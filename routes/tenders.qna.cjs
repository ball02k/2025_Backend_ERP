const express = require('express');

// ============================================================================
// LEGACY: This is the OLD Tender module
// ============================================================================
// For NEW work, prefer the RFx/Request module:
//   - Backend: routes/rfx*.cjs, routes/requests.cjs
//   - Frontend: RequestInvite, RfxDetails, etc.
// This legacy code is kept for backwards compatibility only.
// ============================================================================

const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');
const { getTenantId } = require('../lib/tenant');
const { writeAudit } = require('./audit.writer.cjs');

router.use(requireAuth);
const t = (req) => getTenantId(req);

// Helpers
async function getTender(req, rfxId) {
  const r = await prisma.rfx.findFirst({ where: { id: Number(rfxId), tenantId: t(req) }});
  if (!r) throw Object.assign(new Error('Not found'), { status: 404 });
  return r;
}
function assert(condition, status = 400, message = 'Bad request') {
  if (!condition) {
    const e = new Error(message);
    e.status = status;
    throw e;
  }
}

// GET: list QnA (threaded or flat)
router.get('/:rfxId/qna', async (req, res, next) => {
  try {
    const { rfxId } = req.params;
    const { visibility, status, since, threaded } = req.query;
    await getTender(req, rfxId);

    const where = { tenantId: t(req), rfxId: Number(rfxId) };
    if (visibility) where.visibility = visibility;
    if (status) where.status = status;
    if (since) {
      const sinceDate = new Date(since);
      assert(!Number.isNaN(sinceDate.getTime()), 400, 'Invalid since date');
      where.createdAt = { gte: sinceDate };
    }

    const rows = await prisma.rfxQna.findMany({
      where,
      orderBy: [{ parentId: 'asc' }, { createdAt: 'asc' }],
    });

    if (threaded === '1') {
      // naive threader
      const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] }]));
      const roots = [];
      for (const r of byId.values()) {
        if (r.parentId && byId.has(r.parentId)) byId.get(r.parentId).children.push(r);
        else roots.push(r);
      }
      return res.json(roots);
    }
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// POST: create internal clarification (question or answer)
router.post('/:rfxId/qna', async (req, res, next) => {
  try {
    const { rfxId } = req.params;
    const { content, parentId, visibility = 'internal', attachments } = req.body;
    await getTender(req, rfxId);
    assert(content && content.trim().length, 400, 'Content required');

    const row = await prisma.rfxQna.create({
      data: {
        tenantId: t(req),
        rfxId: Number(rfxId),
        parentId: parentId ? Number(parentId) : null,
        visibility,
        status: 'open',
        authorRole: 'internal',
        authorUserId: req.user?.id || 'unknown',
        content,
        attachments: attachments ? JSON.stringify(attachments) : null,
      },
    });

    await writeAudit(req, {
      entity: 'rfx_qna',
      entityId: row.id,
      action: 'create',
      after: row,
      reason: 'Internal QnA created',
    });

    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

// PATCH: edit internal QnA (internal only; cannot edit supplier posts; cannot edit public once locked)
router.patch('/:rfxId/qna/:id', async (req, res, next) => {
  try {
    const { rfxId, id } = req.params;
    await getTender(req, rfxId);
    const q = await prisma.rfxQna.findFirst({ where: { id: Number(id), tenantId: t(req) }});
    assert(q, 404, 'Not found');
    assert(q.authorRole === 'internal', 409, 'Only internal posts can be edited');
    assert(q.status !== 'locked', 409, 'Thread locked');

    const before = q;
    const data = {};
    if (typeof req.body.content === 'string') data.content = req.body.content;
    if (req.body.attachments !== undefined) {
      data.attachments = req.body.attachments ? JSON.stringify(req.body.attachments) : null;
    }
    data.editedAt = new Date();
    data.editedBy = req.user?.id || 'unknown';

    const whereUpdate = { id: q.id, tenantId: t(req) };
    const result = await prisma.rfxQna.updateMany({ where: whereUpdate, data });
    assert(result.count === 1, 500, 'Failed to update QnA');
    const upd = await prisma.rfxQna.findFirst({ where: whereUpdate });
    await writeAudit(req, { entity: 'rfx_qna', entityId: q.id, action: 'update', before, after: upd, reason: 'Edit QnA' });
    res.json(upd);
  } catch (e) {
    next(e);
  }
});

// POST: publish internal -> public (broadcast to all invitees)
router.post('/:rfxId/qna/:id/publish', async (req, res, next) => {
  try {
    const { rfxId, id } = req.params;
    await getTender(req, rfxId);
    const q = await prisma.rfxQna.findFirst({ where: { id: Number(id), tenantId: t(req) }});
    assert(q, 404, 'Not found');
    assert(q.authorRole === 'internal', 409, 'Only internal can publish');
    assert(q.status !== 'locked', 409, 'Thread locked');

    const before = q;
    const data = { visibility: 'public', editedAt: new Date(), editedBy: req.user?.id || 'unknown' };
    const whereUpdate = { id: q.id, tenantId: t(req) };
    const result = await prisma.rfxQna.updateMany({ where: whereUpdate, data });
    assert(result.count === 1, 500, 'Failed to publish QnA');
    const upd = await prisma.rfxQna.findFirst({ where: whereUpdate });

    // TODO: optional notify all invitees (email/webhook)
    // await notifyInvitees(Number(rfxId), 'qna_published', upd);

    await writeAudit(req, { entity: 'rfx_qna', entityId: q.id, action: 'publish', before, after: upd, reason: 'Publish QnA' });
    res.json(upd);
  } catch (e) {
    next(e);
  }
});

// POST: lock a thread (no further edits/replies)
router.post('/:rfxId/qna/:id/lock', async (req, res, next) => {
  try {
    const { rfxId, id } = req.params;
    await getTender(req, rfxId);
    const q = await prisma.rfxQna.findFirst({ where: { id: Number(id), tenantId: t(req) }});
    assert(q, 404, 'Not found');

    const before = q;
    const whereUpdate = { id: q.id, tenantId: t(req) };
    const result = await prisma.rfxQna.updateMany({ where: whereUpdate, data: { status: 'locked' } });
    assert(result.count === 1, 500, 'Failed to lock QnA');
    const upd = await prisma.rfxQna.findFirst({ where: whereUpdate });
    await writeAudit(req, { entity: 'rfx_qna', entityId: q.id, action: 'lock', before, after: upd, reason: 'Lock QnA' });
    res.json(upd);
  } catch (e) {
    next(e);
  }
});

// POST: close all QnA after deadline (bulk lock)
router.post('/:rfxId/qna/close-all', async (req, res, next) => {
  try {
    const { rfxId } = req.params;
    const tender = await getTender(req, rfxId);
    const now = new Date();
    // Optional: only allow if past deadline
    if (tender.deadline && now < new Date(tender.deadline)) {
      return res.status(409).json({ message: 'Cannot close before deadline' });
    }
    const upd = await prisma.rfxQna.updateMany({
      where: { tenantId: t(req), rfxId: Number(rfxId), status: 'open' },
      data: { status: 'locked' },
    });
    await writeAudit(req, { entity: 'rfx_qna', entityId: 0, action: 'bulk_lock', after: upd, reason: 'Close all QnA' });
    res.json({ updated: upd.count });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
