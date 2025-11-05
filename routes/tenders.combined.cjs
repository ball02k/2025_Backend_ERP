// ============================================================================
// LEGACY: Old Combined Tender API
// ============================================================================
// This is deprecated legacy code for the old TenderEditor UI.
// For NEW work, use the canonical RFx/Request module:
//   - Backend: routes/rfx.cjs, routes/requests.cjs
//   - Frontend: RfxDetails.jsx (shown to users as "Tenders")
// This file is kept for backwards compatibility only.
// ============================================================================

const express = require('express');
const router  = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { requireAuth } = require('../lib/auth');
const { getTenantId } = require('../lib/tenant');
const { buildTenderQuestionSuggestions } = require('../services/tenderQuestionSuggestions.stub.cjs');

router.use(requireAuth);
const t = (req) => getTenantId(req);

// GET full tender (settings + questions + invites + criteria + responses + qna)
// NOTE: Using Request table (existing tender system) not Rfx table
router.get('/:tenderId/full', async (req, res, next) => {
  try {
    const id = Number(req.params.tenderId);
    const data = await prisma.request.findFirst({
      where: { id, tenantId: t(req) },
      include: {
        package: true,
      },
    });
    if (!data) return res.status(404).json({ message: 'Not found' });

    // Transform to expected format
    const result = {
      ...data,
      deadline: data.deadline || data.issueDate,
      budget: data.package?.budget || null,
      reviewers: null, // Not stored on Request model
      description: data.addenda || null, // Using addenda as description
    };

    res.json(result);
  } catch (e) { next(e); }
});

// PATCH tender settings (draft only)
router.patch('/:tenderId', async (req, res, next) => {
  try {
    const id = Number(req.params.tenderId);
    const tender = await prisma.request.findFirst({ where: { id, tenantId: t(req) }});
    if (!tender) return res.status(404).json({ message: 'Not found' });
    if (tender.status !== 'draft' && tender.status !== 'open') return res.status(409).json({ message: 'Cannot edit – not draft/open' });
    const { title, description, deadline, budget, reviewers } = req.body;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    // Store description in addenda field since Request model doesn't have description
    if (description !== undefined) updateData.addenda = description;
    if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
    // Note: budget and reviewers don't exist on Request model either

    const updated = await prisma.request.update({
      where: { id },
      data: updateData,
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// Publish tender (draft -> live/issued)
router.post('/:tenderId/publish', async (req, res, next) => {
  try {
    const id = Number(req.params.tenderId);
    const tender = await prisma.request.findFirst({ where: { id, tenantId: t(req) }});
    if (!tender || (tender.status !== 'draft' && tender.status !== 'open')) return res.status(409).json({ message: 'Not draft/open' });
    const updated = await prisma.request.update({ where: { id }, data: { status: 'issued', issuedAt: new Date() }});
    res.json(updated);
  } catch (e) { next(e); }
});

// Extend deadline (issued/live only)
router.post('/:tenderId/extend', async (req, res, next) => {
  try {
    const id = Number(req.params.tenderId);
    const { deadline } = req.body;
    const tender = await prisma.request.findFirst({ where: { id, tenantId: t(req) }});
    if (!tender || tender.status !== 'issued') return res.status(409).json({ message: 'Not issued' });
    const updated = await prisma.request.update({
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


// ============================================================================
// LEGACY: This is the OLD Tender module
// ============================================================================
// For NEW work, prefer the RFx/Request module:
//   - Backend: routes/rfx*.cjs, routes/requests.cjs
//   - Frontend: RequestInvite, RfxDetails, etc.
// This legacy code is kept for backwards compatibility only.
// ============================================================================

module.exports = router;
