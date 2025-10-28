const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');

const router = express.Router();

router.use(requireAuth);

const tenantIdOf = (req) => req.user && req.user.tenantId;

const ensureRequest = async (tenantId, rfxId) => {
  const req = await prisma.request.findFirst({ where: { tenantId, id: rfxId } });
  if (!req) {
    const err = new Error('NOT_FOUND');
    err.status = 404;
    throw err;
  }
  return req;
};

// ---- Canonical fetch (builder + live consume this) ----
router.get('/:rfxId', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const rfxId = Number(req.params.rfxId);
    const rfx = await ensureRequest(tenantId, rfxId);

    // Pull everything the UI needs in one go
    const [sections, questions, criteria, invites] = await Promise.all([
      prisma.rfxSection.findMany({
        where: { tenantId, rfxId },
        orderBy: { sortOrder: 'asc' }
      }),
      prisma.rfxQuestion.findMany({
        where: { tenantId, rfxId },
        orderBy: { id: 'asc' }
      }),
      prisma.rfxCriterion.findMany({
        where: { tenantId, rfxId },
        orderBy: { id: 'asc' }
      }),
      prisma.rfxInvite.findMany({
        where: { tenantId, rfxId },
        orderBy: { id: 'asc' }
      })
    ]);

    res.json({
      ...rfx,
      sections,
      questions,
      criteria,
      invites
    });
  } catch (e) { next(e); }
});

// ---- Publish: transitions to "live" and freezes builder edits ----
router.post('/:rfxId/publish', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const rfxId = Number(req.params.rfxId);

    // Verify it exists and is in draft
    const rfx = await ensureRequest(tenantId, rfxId);
    if (rfx.status !== 'draft') {
      const err = new Error('Can only publish draft tenders');
      err.status = 409;
      throw err;
    }

    const updated = await prisma.request.update({
      where: { id: rfxId },
      data: {
        status: 'live',
        issuedAt: new Date()
      },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// ---- Extend deadline: allowed when live ----
router.post('/:rfxId/extend-deadline', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const rfxId = Number(req.params.rfxId);
    const { deadline } = req.body;

    if (!deadline) {
      const err = new Error('deadline is required');
      err.status = 400;
      throw err;
    }

    const rfx = await ensureRequest(tenantId, rfxId);
    if (rfx.status !== 'live') {
      const err = new Error('Only live tenders can change deadline');
      err.status = 409;
      throw err;
    }

    const updated = await prisma.request.update({
      where: { id: rfxId },
      data: { deadline: new Date(deadline) }
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// ---- Invite more suppliers: allowed when live ----
router.post('/:rfxId/invites', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const rfxId = Number(req.params.rfxId);
    const { supplierId } = req.body;

    if (!supplierId) {
      const err = new Error('supplierId is required');
      err.status = 400;
      throw err;
    }

    const rfx = await ensureRequest(tenantId, rfxId);
    if (rfx.status !== 'live') {
      const err = new Error('Only live tenders can add invites');
      err.status = 409;
      throw err;
    }

    const token = crypto.randomBytes(16).toString('hex');
    const invite = await prisma.rfxInvite.create({
      data: {
        tenantId,
        rfxId,
        supplierId: Number(supplierId),
        status: 'draft',
        token
      }
    });
    res.status(201).json(invite);
  } catch (e) { next(e); }
});

module.exports = router;
