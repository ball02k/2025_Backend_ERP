const express = require('express');
const { prisma } = require('../utils/prisma.cjs');
const { requireAuth } = require('../lib/auth.cjs');

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

const ensureRequest = (tenantId, requestId) =>
  ensureRecord(prisma.request.findFirst({ where: { tenantId, id: requestId } }));

const ensureEditable = async (tenantId, requestId) => {
  const request = await ensureRequest(tenantId, requestId);
  if (request.status !== 'draft' && request.status !== 'open') {
    const err = new Error('REQUEST_LOCKED');
    err.status = 409;
    throw err;
  }
  return request;
};

const numeric = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// ---- Sections ----
router.get('/:tenderId/sections', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const requestId = Number(req.params.tenderId);
    await ensureRequest(tenantId, requestId);

    const sections = await prisma.requestSection.findMany({
      where: { tenantId, requestId },
      orderBy: { order: 'asc' }
    });

    // Load questions for each section
    const sectionsWithQuestions = await Promise.all(
      sections.map(async (section) => {
        const questions = await prisma.requestQuestion.findMany({
          where: { tenantId, requestId, sectionId: section.id },
          orderBy: { order: 'asc' }
        });
        return {
          ...section,
          name: section.title,
          orderIndex: section.order,
          questions: questions.map(q => ({
            ...q,
            text: q.prompt,
            type: q.qType,
            isRequired: q.required,
            orderIndex: q.order,
            weight: q.weight ? parseFloat(q.weight) : 0
          }))
        };
      })
    );

    res.json(sectionsWithQuestions);
  } catch (e) { next(e); }
});

router.post('/:tenderId/sections', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const requestId = Number(req.params.tenderId);
    await ensureEditable(tenantId, requestId);

    const { name, description, orderIndex = 0 } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Section name is required' });
    }

    const section = await prisma.requestSection.create({
      data: {
        tenantId,
        requestId,
        title: name.trim(),
        order: numeric(orderIndex, 0),
        weight: null
      }
    });

    // Transform response to match expected format
    res.status(201).json({
      ...section,
      name: section.title,
      orderIndex: section.order
    });
  } catch (e) { next(e); }
});

router.put('/sections/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = tenantIdOf(req);

    const section = await ensureRecord(
      prisma.requestSection.findFirst({ where: { id: Number(id), tenantId } })
    );

    await ensureEditable(tenantId, section.requestId);

    const data = {};
    if (typeof req.body?.name === 'string') data.title = req.body.name.trim();
    if (req.body?.orderIndex != null) data.order = numeric(req.body.orderIndex, section.order);

    if (!Object.keys(data).length) return res.json({ ...section, name: section.title, orderIndex: section.order });

    const updated = await prisma.requestSection.update({
      where: { id: section.id },
      data,
    });

    res.json({ ...updated, name: updated.title, orderIndex: updated.order });
  } catch (e) { next(e); }
});

router.delete('/sections/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = tenantIdOf(req);

    const section = await prisma.requestSection.findFirst({
      where: { id: Number(id), tenantId }
    });

    if (!section) return res.status(404).json({ error: 'NOT_FOUND' });

    await ensureEditable(tenantId, section.requestId);

    // Delete associated questions first
    await prisma.requestQuestion.deleteMany({
      where: { tenantId, sectionId: section.id }
    });

    await prisma.requestSection.delete({ where: { id: section.id } });

    res.status(204).end();
  } catch (e) { next(e); }
});

// ---- Questions ----
router.get('/:tenderId/questions', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const requestId = Number(req.params.tenderId);
    await ensureRequest(tenantId, requestId);

    const questions = await prisma.requestQuestion.findMany({
      where: { tenantId, requestId },
      orderBy: [{ sectionId: 'asc' }, { order: 'asc' }]
    });

    // Transform to expected format
    const transformed = questions.map(q => ({
      ...q,
      text: q.prompt,
      type: q.qType,
      isRequired: q.required,
      orderIndex: q.order,
      weight: q.weight ? parseFloat(q.weight) : 0
    }));

    res.json(transformed);
  } catch (e) { next(e); }
});

router.post('/:tenderId/questions', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const requestId = Number(req.params.tenderId);
    await ensureEditable(tenantId, requestId);

    const {
      sectionId,
      text,
      type,
      weight,
      options,
      isRequired = false,
      helpText,
      orderIndex = 0,
      referenceDocUrl,
      referenceDocName,
      scoringCriteria
    } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Question text is required' });
    }

    if (!type) {
      return res.status(400).json({ error: 'Question type is required' });
    }

    const question = await prisma.requestQuestion.create({
      data: {
        tenantId,
        requestId,
        sectionId: sectionId ? Number(sectionId) : null,
        prompt: text.trim(),
        qType: type,
        weight: numeric(weight, 0),
        options: options || null,
        required: !!isRequired,
        helpText: helpText ? helpText.trim() : null,
        order: numeric(orderIndex, 0),
        referenceDocUrl: referenceDocUrl || null,
        referenceDocName: referenceDocName || null,
        scoringCriteria: scoringCriteria ? scoringCriteria.trim() : null
      }
    });

    // Transform response to match expected format
    res.status(201).json({
      ...question,
      text: question.prompt,
      type: question.qType,
      isRequired: question.required,
      orderIndex: question.order,
      weight: question.weight ? parseFloat(question.weight) : 0
    });
  } catch (e) { next(e); }
});

router.put('/questions/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = tenantIdOf(req);

    const question = await ensureRecord(
      prisma.requestQuestion.findFirst({ where: { id: Number(id), tenantId } })
    );

    await ensureEditable(tenantId, question.requestId);

    const data = {};
    if (req.body?.text !== undefined) data.prompt = req.body.text.trim();
    if (req.body?.type !== undefined) data.qType = req.body.type;
    if (req.body?.options !== undefined) data.options = req.body.options;
    if ('isRequired' in req.body) data.required = !!req.body.isRequired;
    if (req.body?.helpText !== undefined) data.helpText = req.body.helpText ? req.body.helpText.trim() : null;
    if ('weight' in req.body) data.weight = numeric(req.body.weight, 0);
    if ('orderIndex' in req.body) data.order = numeric(req.body.orderIndex, question.order);
    if (req.body?.referenceDocUrl !== undefined) data.referenceDocUrl = req.body.referenceDocUrl || null;
    if (req.body?.referenceDocName !== undefined) data.referenceDocName = req.body.referenceDocName || null;
    if (req.body?.scoringCriteria !== undefined) data.scoringCriteria = req.body.scoringCriteria ? req.body.scoringCriteria.trim() : null;

    if ('sectionId' in req.body) {
      const raw = req.body.sectionId;
      data.sectionId = raw === null || raw === '' ? null : Number(raw);
    }

    if (!Object.keys(data).length) {
      return res.json({
        ...question,
        text: question.prompt,
        type: question.qType,
        isRequired: question.required,
        orderIndex: question.order,
        weight: question.weight ? parseFloat(question.weight) : 0
      });
    }

    const updated = await prisma.requestQuestion.update({
      where: { id: question.id },
      data
    });

    // Transform response to match expected format
    res.json({
      ...updated,
      text: updated.prompt,
      type: updated.qType,
      isRequired: updated.required,
      orderIndex: updated.order,
      weight: updated.weight ? parseFloat(updated.weight) : 0
    });
  } catch (e) { next(e); }
});

router.delete('/questions/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = tenantIdOf(req);

    const question = await prisma.requestQuestion.findFirst({
      where: { id: Number(id), tenantId }
    });

    if (!question) return res.status(404).json({ error: 'NOT_FOUND' });

    await ensureEditable(tenantId, question.requestId);
    await prisma.requestQuestion.delete({ where: { id: question.id } });

    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
