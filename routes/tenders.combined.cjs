const express = require('express');
const router  = express.Router();
const { prisma } = require('../lib/prisma');
const { requireAuth } = require('../lib/auth');
const { getTenantId } = require('../lib/tenant');
const { buildTenderQuestionSuggestions } = require('../services/tenderQuestionSuggestions.stub.cjs');

router.use(requireAuth);
const t = (req) => getTenantId(req);

// GET full tender (settings + questions + invites + criteria + responses + qna)
router.get('/:tenderId/full', async (req, res, next) => {
  try {
    const id = Number(req.params.tenderId);
    const data = await prisma.rfx.findFirst({
      where: { id, tenantId: t(req) },
      include: {
        package: true,
        rfxSection: { include: { rfxQuestion: true }, orderBy: { sortOrder: 'asc' } },
        rfxCriterion: { orderBy: { id: 'asc' } },
        rfxInvite: true,
        rfxResponse: true,
        rfxQna: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!data) return res.status(404).json({ message: 'Not found' });
    res.json(data);
  } catch (e) { next(e); }
});

// PATCH tender settings (draft only)
router.patch('/:tenderId', async (req, res, next) => {
  try {
    const id = Number(req.params.tenderId);
    const tender = await prisma.rfx.findFirst({ where: { id, tenantId: t(req) }});
    if (!tender) return res.status(404).json({ message: 'Not found' });
    if (tender.status !== 'draft') return res.status(409).json({ message: 'Cannot edit – not draft' });
    const { title, description, deadline, budget, reviewers } = req.body;
    const updated = await prisma.rfx.update({
      where: { id },
      data: {
        title, description,
        deadline: deadline ? new Date(deadline) : null,
        budget: budget ? Number(budget) : null,
        reviewers: reviewers ? JSON.stringify(reviewers) : null,
      },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// Publish tender (draft -> live)
router.post('/:tenderId/publish', async (req, res, next) => {
  try {
    const id = Number(req.params.tenderId);
    const tender = await prisma.rfx.findFirst({ where: { id, tenantId: t(req) }});
    if (!tender || tender.status !== 'draft') return res.status(409).json({ message: 'Not draft' });
    const updated = await prisma.rfx.update({ where: { id }, data: { status: 'live' }});
    res.json(updated);
  } catch (e) { next(e); }
});

// Extend deadline (live only)
router.post('/:tenderId/extend', async (req, res, next) => {
  try {
    const id = Number(req.params.tenderId);
    const { deadline } = req.body;
    const tender = await prisma.rfx.findFirst({ where: { id, tenantId: t(req) }});
    if (!tender || tender.status !== 'live') return res.status(409).json({ message: 'Not live' });
    const updated = await prisma.rfx.update({
      where: { id },
      data: { deadline: new Date(deadline) },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// Create Q&A entry (question or answer)
// For supplier questions: authorRole='supplier'; for internal answers: authorRole='internal'
router.post('/:tenderId/qna', async (req, res, next) => {
  try {
    const id = Number(req.params.tenderId);
    const { content, authorRole, parentId } = req.body;
    const tender = await prisma.rfx.findFirst({ where: { id, tenantId: t(req) }});
    if (!tender) return res.status(404).json({ message:'Not found' });
    const qna = await prisma.rfxQna.create({
      data: {
        tenantId: t(req),
        rfxId: id,
        content,
        authorRole,
        parentId: parentId ? Number(parentId) : null,
      },
    });
    res.status(201).json(qna);
  } catch (e) { next(e); }
});

// Suggest questions (local heuristic stub – swap for AI later)
router.post('/:tenderId/suggest-questions', async (req, res, next) => {
  try {
    const id = Number(req.params.tenderId);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: 'Invalid tender id' });
    }

    const tender = await prisma.rfx.findFirst({
      where: { id, tenantId: t(req) },
      include: {
        package: true,
        rfxSection: {
          include: { rfxQuestion: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!tender) return res.status(404).json({ message: 'Not found' });

    const { focus, focusAreas, categories, limit, maxSuggestions } = req.body || {};
    const focusInput = focus ?? focusAreas ?? categories;
    const suggestions = buildTenderQuestionSuggestions({
      tender,
      focus: focusInput,
      limit: limit ?? maxSuggestions ?? undefined,
    });

    res.json({
      tenderId: id,
      count: suggestions.length,
      suggestions,
    });
  } catch (e) { next(e); }
});

module.exports = router;
