const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');

const router = express.Router();

router.use(requireAuth);

const tenantIdOf = (req) => req.user && req.user.tenantId;

const ensureRecord = async (getter) => {
  const row = await getter;
  if (!row) {
    const err = new Error('NOT_FOUND');
    err.status = 404;
    throw err;
  }
  return row;
};

const ensureRequest = (tenantId, rfxId) =>
  ensureRecord(prisma.request.findFirst({ where: { tenantId, id: rfxId } }));

const ensureEditable = async (tenantId, rfxId) => {
  const req = await ensureRequest(tenantId, rfxId);
  if ((req.status || '').toLowerCase() !== 'draft') {
    const err = new Error('RFX_LOCKED');
    err.status = 409;
    throw err;
  }
  return req;
};

const numeric = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// ---- Sections ----
router.get('/:rfxId/sections', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const rfxId = Number(req.params.rfxId);
    await ensureRequest(tenantId, rfxId);
    const rows = await prisma.rfxSection.findMany({
      where: { tenantId, rfxId },
      orderBy: { sortOrder: 'asc' }
    });
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/:rfxId/sections', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const rfxId = Number(req.params.rfxId);
    await ensureEditable(tenantId, rfxId);
    const { title, sortOrder = 0 } = req.body || {};
    const row = await prisma.rfxSection.create({
      data: {
        tenantId,
        rfxId,
        title,
        sortOrder: numeric(sortOrder, 0)
      }
    });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.patch('/sections/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = tenantIdOf(req);
    const section = await ensureRecord(
      prisma.rfxSection.findFirst({ where: { id: Number(id), tenantId } })
    );
    await ensureEditable(tenantId, section.rfxId);
    const data = {};
    if (typeof req.body?.title === 'string') data.title = req.body.title;
    if (req.body?.sortOrder != null) data.sortOrder = numeric(req.body.sortOrder, section.sortOrder);
    if (!Object.keys(data).length) return res.json(section);
    const row = await prisma.rfxSection.update({
      where: { id: section.id },
      data,
    });
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/sections/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = tenantIdOf(req);
    const section = await prisma.rfxSection.findFirst({ where: { id: Number(id), tenantId } });
    if (!section) return res.status(404).json({ error: 'NOT_FOUND' });
    await ensureEditable(tenantId, section.rfxId);
    await prisma.rfxSection.delete({ where: { id: section.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ---- Questions ----
router.get('/:rfxId/questions', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const rfxId = Number(req.params.rfxId);
    await ensureRequest(tenantId, rfxId);
    const rows = await prisma.rfxQuestion.findMany({
      where: { tenantId, rfxId },
      orderBy: [{ sectionId: 'asc' }, { sortOrder: 'asc' }]
    });
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/:rfxId/questions', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const rfxId = Number(req.params.rfxId);
    await ensureEditable(tenantId, rfxId);
    const { sectionId, prompt, guidance, responseType, options, required = true, weight, sortOrder = 0 } = req.body || {};
    const row = await prisma.rfxQuestion.create({
      data: {
        tenantId,
        rfxId,
        sectionId: sectionId ? Number(sectionId) : null,
        prompt,
        guidance,
        responseType,
        options,
        required: !!required,
        weight: weight === '' ? null : weight,
        sortOrder: numeric(sortOrder, 0)
      }
    });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.patch('/questions/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = tenantIdOf(req);
    const question = await ensureRecord(
      prisma.rfxQuestion.findFirst({ where: { id: Number(id), tenantId } })
    );
    await ensureEditable(tenantId, question.rfxId);
    const data = {};
    if (req.body?.prompt !== undefined) data.prompt = req.body.prompt;
    if (req.body?.guidance !== undefined) data.guidance = req.body.guidance;
    if (req.body?.responseType !== undefined) data.responseType = req.body.responseType;
    if (req.body?.options !== undefined) data.options = req.body.options;
    if ('required' in req.body) data.required = !!req.body.required;
    if ('weight' in req.body) data.weight = req.body.weight === '' ? null : req.body.weight;
    if ('sortOrder' in req.body) data.sortOrder = numeric(req.body.sortOrder, question.sortOrder);
    if ('sectionId' in req.body) {
      const raw = req.body.sectionId;
      data.sectionId = raw === null || raw === '' ? null : Number(raw);
    }
    if (!Object.keys(data).length) return res.json(question);
    const row = await prisma.rfxQuestion.update({ where: { id: question.id }, data });
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/questions/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = tenantIdOf(req);
    const question = await prisma.rfxQuestion.findFirst({ where: { id: Number(id), tenantId } });
    if (!question) return res.status(404).json({ error: 'NOT_FOUND' });
    await ensureEditable(tenantId, question.rfxId);
    await prisma.rfxQuestion.delete({ where: { id: question.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ---- Criteria (Scoring) ----
router.get('/:rfxId/criteria', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const rfxId = Number(req.params.rfxId);
    await ensureRequest(tenantId, rfxId);
    const rows = await prisma.rfxCriterion.findMany({
      where: { tenantId, rfxId }
    });
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/:rfxId/criteria', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const rfxId = Number(req.params.rfxId);
    await ensureEditable(tenantId, rfxId);
    const { name, type, weight, config } = req.body || {};
    const row = await prisma.rfxCriterion.create({
      data: { tenantId, rfxId, name, type, weight: weight === '' ? null : weight, config }
    });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.patch('/criteria/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = tenantIdOf(req);
    const criterion = await ensureRecord(
      prisma.rfxCriterion.findFirst({ where: { id: Number(id), tenantId } })
    );
    await ensureEditable(tenantId, criterion.rfxId);
    const data = {};
    if (req.body?.name !== undefined) data.name = req.body.name;
    if (req.body?.type !== undefined) data.type = req.body.type;
    if ('weight' in req.body) data.weight = req.body.weight === '' ? null : req.body.weight;
    if (req.body?.config !== undefined) data.config = req.body.config;
    if (!Object.keys(data).length) return res.json(criterion);
    const row = await prisma.rfxCriterion.update({ where: { id: criterion.id }, data });
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/criteria/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = tenantIdOf(req);
    const criterion = await prisma.rfxCriterion.findFirst({ where: { id: Number(id), tenantId } });
    if (!criterion) return res.status(404).json({ error: 'NOT_FOUND' });
    await ensureEditable(tenantId, criterion.rfxId);
    await prisma.rfxCriterion.delete({ where: { id: criterion.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ---- Supplier Invites ----
router.get('/:rfxId/invites', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const rfxId = Number(req.params.rfxId);
    await ensureRequest(tenantId, rfxId);
    const rows = await prisma.rfxInvite.findMany({
      where: { tenantId, rfxId },
      orderBy: { createdAt: 'asc' }
    });
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/:rfxId/invites', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const rfxId = Number(req.params.rfxId);
    await ensureEditable(tenantId, rfxId);
    const supplierId = Number(req.body?.supplierId);
    if (!Number.isFinite(supplierId)) return res.status(400).json({ error: 'INVALID_SUPPLIER' });
    const token = crypto.randomBytes(16).toString('hex');
    const row = await prisma.rfxInvite.create({
      data: { tenantId, rfxId, supplierId, status: 'draft', token }
    });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.post('/invites/:id/send', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = tenantIdOf(req);
    const invite = await ensureRecord(
      prisma.rfxInvite.findFirst({ where: { id: Number(id), tenantId } })
    );
    const row = await prisma.rfxInvite.update({
      where: { id: invite.id },
      data: { status: 'sent', sentAt: new Date() }
    });
    res.json(row);
  } catch (e) { next(e); }
});

// ---- Issue RfX (freeze builder edits, move to live) ----
router.post('/:rfxId/issue', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const rfxId = Number(req.params.rfxId);
    const request = await ensureEditable(tenantId, rfxId);
    const updated = await prisma.request.update({
      where: { id: request.id },
      data: { status: 'open', updatedAt: new Date() }
    });
    if (request.packageId) {
      await prisma.tender.updateMany({
        where: { tenantId, packageId: request.packageId },
        data: { status: 'open' }
      }).catch(() => {});
    }
    res.json({ ok: true, request: updated });
  } catch (e) { next(e); }
});

module.exports = router;
