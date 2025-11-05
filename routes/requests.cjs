// CANONICAL: Core Request/Tender Model API
// This is the primary CRUD API for the Request model (backend name for Tenders).
// Used by RfxDetails.jsx (canonical Tender UI) for fetching/updating tender data.
// User-facing route: /api/requests/* (internal detail - UI shows "Tenders")

const express = require('express');
const router = express.Router();
const { prisma, Prisma } = require('../utils/prisma.cjs');
const { computeRequestScore } = require('../services/rfx_scoring.cjs');
const { requirePerm } = require('../middleware/checkPermission.cjs');

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function assertTenant(where, tenantId) {
  return { ...where, tenantId };
}

// ---- Requests CRUD ----
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { q, status, limit = 20, offset = 0 } = req.query;
    const where = { tenantId };
    if (status) where.status = String(status);
    // Optional: filter by project via attached package
    if (req.query.projectId != null && req.query.projectId !== '') {
      const pid = Number(req.query.projectId);
      if (Number.isFinite(pid)) {
        where.package = { ...(where.package || {}), projectId: pid };
      }
    }
    // Optional: due by date (deadline <= date)
    if (req.query.dueBy) {
      const d = new Date(String(req.query.dueBy));
      if (!isNaN(d.getTime())) {
        where.deadline = { lte: d };
      }
    }
    if (q) {
      const term = String(q);
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { type: { contains: term, mode: 'insensitive' } },
      ];
    }
    // OrderBy: support "field.asc|desc" with safe whitelist
    const rawOb = typeof req.query.orderBy === 'string' ? req.query.orderBy : '';
    let orderBy = [];
    if (rawOb) {
      const m = /^(\w+)\.(asc|desc)$/i.exec(rawOb);
      if (m) {
        const field = m[1];
        const dir = m[2].toLowerCase();
        const map = { title: 'title', status: 'status', dueDate: 'deadline', deadline: 'deadline', createdAt: 'createdAt', updatedAt: 'updatedAt', id: 'id', stage: 'stage' };
        const prismaField = map[field];
        if (prismaField) {
          orderBy.push({ [prismaField]: dir });
        }
      }
    }
    // Fallback stable sort
    if (!orderBy.length) orderBy = [{ updatedAt: 'desc' }, { id: 'desc' }];

    const [total, rows] = await Promise.all([
      prisma.request.count({ where }),
      prisma.request.findMany({
        where,
        take: Number(limit),
        skip: Number(offset),
        orderBy,
      }),
    ]);

    // Additive enrichments per request: supplier, project, submissionsCount
    let items = rows;
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      let bestByRequest = new Map();
      try {
        const decisions = await prisma.awardDecision.findMany({
          where: { tenantId, requestId: { in: ids }, decision: { in: ['awarded', 'preferred'] } },
          orderBy: [{ decidedAt: 'desc' }],
        });
        for (const d of decisions) {
          const existing = bestByRequest.get(d.requestId);
          if (!existing || existing.decision !== 'awarded') bestByRequest.set(d.requestId, d);
        }
      } catch (_) {}

      let supplierMap = new Map();
      try {
        const supplierIds = Array.from(new Set(Array.from(bestByRequest.values()).map((d) => d.supplierId).filter((v) => Number.isFinite(v))));
        const suppliers = supplierIds.length
          ? await prisma.supplier.findMany({ where: { tenantId, id: { in: supplierIds } }, select: { id: true, name: true } })
          : [];
        supplierMap = new Map(suppliers.map((s) => [s.id, s]));
      } catch (_) {}

      let projectByPackage = new Map();
      let packageMap = new Map();
      try {
        const packageIds = Array.from(new Set(rows.map((r) => r.packageId).filter((v) => v != null && Number.isFinite(Number(v)))));
        const packages = packageIds.length
          ? await prisma.package.findMany({
              where: { id: { in: packageIds }, project: { tenantId } },
              select: { id: true, name: true, projectId: true, project: { select: { id: true, name: true } } },
            })
          : [];
        projectByPackage = new Map(packages.map((p) => [p.id, p.project]));
        packageMap = new Map(packages.map((p) => [p.id, { id: p.id, name: p.name, projectId: p.projectId }]));
      } catch (_) {}

      let subsByRequest = new Map();
      try {
        const respCounts = await prisma.requestResponse.groupBy({
          by: ['requestId'],
          where: { tenantId, requestId: { in: ids }, submittedAt: { not: null } },
          _count: { _all: true },
        });
        subsByRequest = new Map(respCounts.map((g) => [g.requestId, g._count._all]));
      } catch (_) {}

      items = rows.map((r) => {
        const d = bestByRequest.get(r.id);
        const supplier = d ? (supplierMap.get(d.supplierId) || { id: d.supplierId, name: null }) : null;
        const pkg = r.packageId ? packageMap.get(r.packageId) || null : null;
        const project = r.packageId ? projectByPackage.get(r.packageId) || null : null;
        const submissionsCount = subsByRequest.get(r.id) || 0;
        return { ...r, supplier, package: pkg, project, submissionsCount };
      });
    }
    res.json({ total, rows: items });
  } catch (e) {
    console.warn('requests.list fallback', e?.code || e?.message || e);
    res.json({ total: 0, rows: [] });
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = toInt(req.params.id);
    const row = await prisma.request.findFirst({ where: { tenantId, id } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row });
  } catch (e) { next(e); }
});

// Full bundle: request + sections (+ nested questions)
router.get('/:id/bundle', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = toInt(req.params.id);
    const reqRow = await prisma.request.findFirst({ where: { tenantId, id } });
    if (!reqRow) return res.status(404).json({ error: 'Not found' });
    const [sections, questions] = await Promise.all([
      prisma.requestSection.findMany({ where: { tenantId, requestId: id }, orderBy: [{ order: 'asc' }, { id: 'asc' }] }),
      prisma.requestQuestion.findMany({ where: { tenantId, requestId: id }, orderBy: [{ order: 'asc' }, { id: 'asc' }] }),
    ]);
    const secMap = new Map(sections.map((s) => [s.id, { ...s, questions: [] }]));
    for (const q of questions) {
      const sec = secMap.get(q.sectionId);
      if (sec) sec.questions.push(q);
    }
    res.json({ data: { request: reqRow, sections: Array.from(secMap.values()) } });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { title, type, deadline, totalStages = 1, weighting, addenda, packageId } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    // Optional: attach to a package, enforcing package assignment rules
    let pkgId = null;
    if (packageId != null) {
      const pid = Number(packageId);
      if (!Number.isFinite(pid)) return res.status(400).json({ error: 'Invalid packageId' });
      // Ensure package exists under this tenant via project relation
      const pkg = await prisma.package.findFirst({ where: { id: pid, project: { tenantId } }, select: { id: true } });
      if (!pkg) return res.status(400).json({ error: 'PACKAGE_NOT_FOUND' });
      // Enforce: not already assigned to an active/awarded RFx
      const existing = await prisma.request.findMany({ where: { tenantId, packageId: pid } });
      const hasOpen = existing.some((r) => (r.status || '').toLowerCase() !== 'closed');
      const hasAwarded = existing.some((r) => (r.status || '').toLowerCase() === 'awarded');
      if (hasOpen || hasAwarded) {
        return res.status(400).json({ error: 'PACKAGE_ALREADY_ASSIGNED' });
      }
      pkgId = pid;
    }
    const created = await prisma.request.create({
      data: {
        tenantId,
        title: String(title),
        ...(type ? { type: String(type) } : {}),
        ...(deadline ? { deadline: new Date(deadline) } : {}),
        totalStages: Number(totalStages) || 1,
        ...(weighting != null ? { weighting } : {}),
        ...(addenda ? { addenda: String(addenda) } : {}),
        ...(pkgId != null ? { packageId: pkgId } : {}),
      },
    });
    res.json({ data: created });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = toInt(req.params.id);
    const existing = await prisma.request.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { title, type, status, deadline, stage, totalStages, weighting, addenda } = req.body || {};
    const updated = await prisma.request.update({
      where: { id },
      data: {
        ...(title ? { title: String(title) } : {}),
        ...(type ? { type: String(type) } : {}),
        ...(status ? { status: String(status) } : {}),
        ...(deadline ? { deadline: new Date(deadline) } : {}),
        ...(Number.isFinite(Number(stage)) ? { stage: Number(stage) } : {}),
        ...(Number.isFinite(Number(totalStages)) ? { totalStages: Number(totalStages) } : {}),
        ...(weighting != null ? { weighting } : {}),
        ...(addenda != null ? { addenda: addenda === null ? null : String(addenda) } : {}),
      },
    });
    res.json({ data: updated });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = toInt(req.params.id);
    const row = await prisma.request.findFirst({ where: { tenantId, id } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    const [secCount, invCount, respCount] = await Promise.all([
      prisma.requestSection.count({ where: { tenantId, requestId: id } }),
      prisma.requestInvite.count({ where: { tenantId, requestId: id } }),
      prisma.requestResponse.count({ where: { tenantId, requestId: id } }),
    ]);
    if (secCount || invCount || respCount) {
      return res.status(400).json({ error: 'REQUEST_HAS_DEPENDENCIES' });
    }
    await prisma.request.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/publish', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = toInt(req.params.id);
    const row = await prisma.request.findFirst({ where: { tenantId, id } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    const updated = await prisma.request.update({ where: { id }, data: { status: 'published' } });
    res.json({ data: updated });
  } catch (e) { next(e); }
});

router.post('/:id/deadline', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = toInt(req.params.id);
    const { deadline } = req.body || {};
    if (!deadline) return res.status(400).json({ error: 'deadline is required' });
    const row = await prisma.request.findFirst({ where: { tenantId, id } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    const updated = await prisma.request.update({ where: { id }, data: { deadline: new Date(deadline) } });
    res.json({ data: updated });
  } catch (e) { next(e); }
});

// ---- Sections ----
router.get('/:id/sections', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const rows = await prisma.requestSection.findMany({ where: { tenantId, requestId }, orderBy: [{ order: 'asc' }, { id: 'asc' }] });
    res.json({ data: rows });
  } catch (e) { next(e); }
});

router.post('/:id/sections', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const { title, weight, order = 0 } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    const created = await prisma.requestSection.create({
      data: {
        tenantId,
        requestId,
        title: String(title),
        ...(weight != null ? { weight: new Prisma.Decimal(weight) } : {}),
        order: Number(order) || 0,
      },
    });
    res.json({ data: created });
  } catch (e) { next(e); }
});

router.patch('/sections/:sectionId', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const sectionId = toInt(req.params.sectionId);
    const section = await prisma.requestSection.findFirst({ where: { tenantId, id: sectionId } });
    if (!section) return res.status(404).json({ error: 'Not found' });
    const { title, weight, order } = req.body || {};
    const updated = await prisma.requestSection.update({
      where: { id: sectionId },
      data: {
        ...(title ? { title: String(title) } : {}),
        ...(weight != null ? { weight: new Prisma.Decimal(weight) } : {}),
        ...(Number.isFinite(Number(order)) ? { order: Number(order) } : {}),
      },
    });
    res.json({ data: updated });
  } catch (e) { next(e); }
});

router.delete('/sections/:sectionId', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const sectionId = toInt(req.params.sectionId);
    const section = await prisma.requestSection.findFirst({ where: { tenantId, id: sectionId } });
    if (!section) return res.status(404).json({ error: 'Not found' });
    const qCount = await prisma.requestQuestion.count({ where: { tenantId, sectionId } });
    if (qCount > 0) return res.status(400).json({ error: 'SECTION_HAS_QUESTIONS' });
    await prisma.requestSection.delete({ where: { id: sectionId } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- Questions ----
router.get('/:id/questions', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const rows = await prisma.requestQuestion.findMany({ where: { tenantId, requestId }, orderBy: [{ order: 'asc' }, { id: 'asc' }] });
    res.json({ data: rows });
  } catch (e) { next(e); }
});

router.post('/:id/questions', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const { sectionId, qType, prompt, required, options, weight, calc, order = 0 } = req.body || {};
    if (!sectionId || !qType || !prompt) return res.status(400).json({ error: 'sectionId, qType, prompt are required' });
    // Ensure section belongs to request and tenant
    const section = await prisma.requestSection.findFirst({ where: { tenantId, id: Number(sectionId), requestId } });
    if (!section) return res.status(400).json({ error: 'Invalid sectionId' });
    const created = await prisma.requestQuestion.create({
      data: {
        tenantId,
        requestId,
        sectionId: Number(sectionId),
        qType: String(qType),
        prompt: String(prompt),
        required: !!required,
        ...(options != null ? { options } : {}),
        ...(weight != null ? { weight: new Prisma.Decimal(weight) } : {}),
        ...(calc != null ? { calc } : {}),
        order: Number(order) || 0,
      },
    });
    res.json({ data: created });
  } catch (e) { next(e); }
});

router.patch('/questions/:questionId', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const questionId = toInt(req.params.questionId);
    const q = await prisma.requestQuestion.findFirst({ where: { tenantId, id: questionId } });
    if (!q) return res.status(404).json({ error: 'Not found' });
    const { sectionId, qType, prompt, required, options, weight, calc, order } = req.body || {};
    if (sectionId) {
      const section = await prisma.requestSection.findFirst({ where: { tenantId, id: Number(sectionId), requestId: q.requestId } });
      if (!section) return res.status(400).json({ error: 'Invalid sectionId' });
    }
    const updated = await prisma.requestQuestion.update({
      where: { id: questionId },
      data: {
        ...(sectionId ? { sectionId: Number(sectionId) } : {}),
        ...(qType ? { qType: String(qType) } : {}),
        ...(prompt ? { prompt: String(prompt) } : {}),
        ...(required != null ? { required: !!required } : {}),
        ...(options != null ? { options } : {}),
        ...(weight != null ? { weight: new Prisma.Decimal(weight) } : {}),
        ...(calc != null ? { calc } : {}),
        ...(Number.isFinite(Number(order)) ? { order: Number(order) } : {}),
      },
    });
    res.json({ data: updated });
  } catch (e) { next(e); }
});

router.delete('/questions/:questionId', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const questionId = toInt(req.params.questionId);
    const q = await prisma.requestQuestion.findFirst({ where: { tenantId, id: questionId } });
    if (!q) return res.status(404).json({ error: 'Not found' });
    await prisma.requestQuestion.delete({ where: { id: questionId } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- Invites ----
router.get('/:id/invites', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const rows = await prisma.requestInvite.findMany({ where: { tenantId, requestId }, orderBy: [{ id: 'desc' }] });
    res.json({ data: rows });
  } catch (e) { next(e); }
});

router.post('/:id/invites', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const { supplierId, email } = req.body || {};
    if (!supplierId || !email) return res.status(400).json({ error: 'supplierId and email are required' });
    const created = await prisma.requestInvite.create({
      data: { tenantId, requestId, supplierId: Number(supplierId), email: String(email).toLowerCase(), status: 'invited' },
    });
    res.json({ data: created });
  } catch (e) { next(e); }
});

router.post('/:id/invites/:inviteId/resend', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const inviteId = toInt(req.params.inviteId);
    const inv = await prisma.requestInvite.findFirst({ where: { tenantId, id: inviteId, requestId } });
    if (!inv) return res.status(404).json({ error: 'Not found' });
    const updated = await prisma.requestInvite.update({ where: { id: inviteId }, data: { status: 'invited', respondedAt: null } });
    res.json({ data: updated });
  } catch (e) { next(e); }
});

// ---- Q&A ----
router.get('/:id/qna', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const rows = await prisma.requestQna.findMany({ where: { tenantId, requestId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    res.json({ data: rows });
  } catch (e) { next(e); }
});

router.post('/:id/qna', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const { supplierId, question, attachments } = req.body || {};
    if (!question) return res.status(400).json({ error: 'question is required' });
    const created = await prisma.requestQna.create({
      data: { tenantId, requestId, supplierId: supplierId ? Number(supplierId) : null, question: String(question), ...(attachments != null ? { attachments } : {}) },
    });
    res.json({ data: created });
  } catch (e) { next(e); }
});

router.post('/qna/:qnaId/answer', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const qnaId = toInt(req.params.qnaId);
    const { answer } = req.body || {};
    const qna = await prisma.requestQna.findFirst({ where: { tenantId, id: qnaId } });
    if (!qna) return res.status(404).json({ error: 'Not found' });
    const updated = await prisma.requestQna.update({ where: { id: qnaId }, data: { answer: answer ? String(answer) : null, answeredAt: answer ? new Date() : null } });
    res.json({ data: updated });
  } catch (e) { next(e); }
});

// ---- Responses ----
router.get('/:id/responses', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
    const stage = req.query.stage ? Number(req.query.stage) : undefined;
    const where = { tenantId, requestId, ...(Number.isFinite(supplierId) ? { supplierId } : {}), ...(Number.isFinite(stage) ? { stage } : {}) };
    const rows = await prisma.requestResponse.findMany({ where, orderBy: [{ stage: 'asc' }, { submittedAt: 'desc' }, { id: 'desc' }] });
    res.json({ data: rows });
  } catch (e) { next(e); }
});

router.post('/:id/responses/submit', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const { supplierId, stage = 1, answers, files } = req.body || {};
    const sid = Number(supplierId);
    const stg = Number(stage) || 1;
    if (!Number.isFinite(sid)) return res.status(400).json({ error: 'supplierId is required' });
    const reqRow = await prisma.request.findFirst({ where: { tenantId, id: requestId } });
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    if (reqRow.status !== 'published') return res.status(400).json({ error: 'REQUEST_NOT_PUBLISHED' });
    if (Number.isFinite(reqRow.totalStages) && stg > reqRow.totalStages) return res.status(400).json({ error: 'INVALID_STAGE' });
    if (reqRow.deadline && new Date(reqRow.deadline) < new Date()) return res.status(400).json({ error: 'DEADLINE_PASSED' });

    if (stg > 1) {
      const prev = await prisma.requestResponse.findFirst({ where: { tenantId, requestId, supplierId: sid, stage: stg - 1, status: 'submitted' } });
      if (!prev) return res.status(400).json({ error: 'PREVIOUS_STAGE_NOT_SUBMITTED' });
    }

    const existing = await prisma.requestResponse.findFirst({ where: { tenantId, requestId, supplierId: sid, stage: stg } });
    const data = {
      tenantId,
      requestId,
      supplierId: sid,
      stage: stg,
      answers: answers || {},
      ...(files != null ? { files } : {}),
      submittedAt: new Date(),
      status: 'submitted',
    };
    let row;
    if (existing) {
      row = await prisma.requestResponse.update({ where: { id: existing.id }, data });
    } else {
      row = await prisma.requestResponse.create({ data });
    }
    res.json({ data: row });
  } catch (e) { next(e); }
});

// ---- Scoring ----
router.post('/:id/scoring/activate', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const { weighting } = req.body || {};
    const row = await prisma.request.findFirst({ where: { tenantId, id: requestId } });
    if (!row) return res.status(404).json({ error: 'Request not found' });
    const updated = await prisma.request.update({ where: { id: requestId }, data: { weighting: weighting || {} } });
    res.json({ data: updated });
  } catch (e) { next(e); }
});

// Fetch current scoring/weighting config
router.get('/:id/scoring', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const row = await prisma.request.findFirst({ where: { tenantId, id: requestId } });
    if (!row) return res.status(404).json({ error: 'Request not found' });
    res.json({ data: row.weighting || {} });
  } catch (e) { next(e); }
});

// Update only weighting.scale with validation of question IDs
router.patch('/:id/scoring/scale', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const { scale } = req.body || {};
    if (!scale || typeof scale !== 'object') return res.status(400).json({ error: 'scale object is required' });

    const row = await prisma.request.findFirst({ where: { tenantId, id: requestId } });
    if (!row) return res.status(404).json({ error: 'Request not found' });

    const perQuestion = (scale && scale.perQuestion) || {};
    const keys = Object.keys(perQuestion);
    if (keys.length) {
      const qids = keys.map((k) => Number(k)).filter((n) => Number.isFinite(n));
      const existing = await prisma.requestQuestion.findMany({
        where: { tenantId, requestId, id: { in: qids } },
        select: { id: true },
      });
      const existingSet = new Set(existing.map((x) => x.id));
      const invalid = qids.filter((id) => !existingSet.has(id));
      if (invalid.length) return res.status(400).json({ error: 'INVALID_QUESTION_IDS', invalid });
    }

    const current = row.weighting && typeof row.weighting === 'object' ? row.weighting : {};
    const updated = await prisma.request.update({
      where: { id: requestId },
      data: { weighting: { ...current, scale } },
    });
    res.json({ data: updated.weighting || {} });
  } catch (e) { next(e); }
});

// Update scoring policy: 'open' | 'closed_only'
router.patch('/:id/scoring/policy', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const { policy } = req.body || {};
    const pol = String(policy || '').toLowerCase();
    if (!pol || (pol !== 'open' && pol !== 'closed_only')) {
      return res.status(400).json({ error: 'INVALID_POLICY', allowed: ['open', 'closed_only'] });
    }
    const row = await prisma.request.findFirst({ where: { tenantId, id: requestId } });
    if (!row) return res.status(404).json({ error: 'Request not found' });
    const weighting = row.weighting && typeof row.weighting === 'object' ? row.weighting : {};
    const scoring = weighting.scoring && typeof weighting.scoring === 'object' ? weighting.scoring : {};
    const updated = await prisma.request.update({
      where: { id: requestId },
      data: { weighting: { ...weighting, scoring: { ...scoring, policy: pol } } },
    });
    res.json({ data: updated.weighting || {} });
  } catch (e) { next(e); }
});

// Get scoring readiness (policy, status, deadline, isClosed, canScoreNow)
router.get('/:id/scoring/status', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const row = await prisma.request.findFirst({ where: { tenantId, id: requestId } });
    if (!row) return res.status(404).json({ error: 'Request not found' });
    const weighting = row.weighting && typeof row.weighting === 'object' ? row.weighting : {};
    const scoringCfg = weighting.scoring || {};
    const policy = (scoringCfg.policy || weighting.scoringPolicy || 'open').toLowerCase();
    const statusLower = String(row.status || '').toLowerCase();
    const now = new Date();
    const deadline = row.deadline ? new Date(row.deadline) : null;
    const isClosed = (deadline && deadline <= now) || statusLower === 'awarded';

    let canScoreNow = false;
    let reason = undefined;
    if (policy === 'closed_only') {
      canScoreNow = isClosed;
      if (!canScoreNow) reason = 'WAIT_UNTIL_CLOSED_OR_AWARDED';
    } else {
      canScoreNow = statusLower === 'published' || statusLower === 'awarded';
      if (!canScoreNow) reason = 'REQUEST_NOT_PUBLISHED';
    }

    const roles = Array.isArray(req.user?.roles) ? req.user.roles.map((r) => String(r).toLowerCase()) : [];
    const canOverride = roles.includes('admin');

    res.json({
      data: {
        policy,
        status: row.status,
        deadline: row.deadline,
        isClosed,
        canScoreNow,
        reason: reason || null,
        canOverride,
      },
    });
  } catch (e) { next(e); }
});

// getMCQScore moved to services/rfx_scoring.cjs

// Preview scoring (no persistence) with optional scale override via query param `scale` as JSON
router.get('/:id/score/:supplierId/preview', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const supplierId = toInt(req.params.supplierId);
    const requestRow = await prisma.request.findFirst({ where: { tenantId, id: requestId } });
    if (!requestRow) return res.status(404).json({ error: 'Request not found' });

    // Policy enforcement with admin override
    const weightingCfg = (requestRow.weighting && typeof requestRow.weighting === 'object') ? requestRow.weighting : {};
    const scoringCfgObj = weightingCfg.scoring || {};
    const scoringPolicy = (scoringCfgObj.policy || weightingCfg.scoringPolicy || 'open').toLowerCase();
    const statusLower = String(requestRow.status || '').toLowerCase();
    const now = new Date();
    const deadline = requestRow.deadline ? new Date(requestRow.deadline) : null;
    const isClosed = (deadline && deadline <= now) || statusLower === 'awarded';
    const roles = Array.isArray(req.user?.roles) ? req.user.roles.map((r) => String(r).toLowerCase()) : [];
    const isAdmin = roles.includes('admin');
    const overrideFlag = String(req.query?.override || '').toLowerCase() === '1' || String(req.query?.override || '').toLowerCase() === 'true';
    const canOverride = overrideFlag && isAdmin;
    if (!canOverride) {
      if (scoringPolicy === 'closed_only') {
        if (!isClosed) return res.status(400).json({ error: 'SCORING_NOT_AVAILABLE', policy: 'closed_only', deadline: requestRow.deadline || null });
      } else {
        if (statusLower !== 'published' && statusLower !== 'awarded') return res.status(400).json({ error: 'REQUEST_NOT_PUBLISHED_FOR_SCORING' });
      }
    }

    // Scale from query ?scale={...} or saved weighting.scale
    let scaleCfg;
    if (req.query && typeof req.query.scale === 'string' && req.query.scale.trim().length) {
      try { scaleCfg = JSON.parse(req.query.scale); } catch { return res.status(400).json({ error: 'INVALID_SCALE_JSON' }); }
    }
    if (!scaleCfg) scaleCfg = weightingCfg.scale || {};

    const result = await computeRequestScore({ tenantId, requestId, supplierId, scaleCfg, prisma });
    res.json({ supplierId, score: result.score, sections: result.sections, normalization: result.normalization, override: canOverride || undefined, preview: true });
  } catch (e) { next(e); }
});

router.post('/:id/score/:supplierId', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const supplierId = toInt(req.params.supplierId);
    const requestRow = await prisma.request.findFirst({ where: { tenantId, id: requestId } });
    if (!requestRow) return res.status(404).json({ error: 'Request not found' });

    // Enforce scoring policy (allow admin override via ?override=1 or body.override=true)
    const weightingCfg = (requestRow.weighting && typeof requestRow.weighting === 'object') ? requestRow.weighting : {};
    const scoringCfgObj = weightingCfg.scoring || {};
    const scoringPolicy = (scoringCfgObj.policy || weightingCfg.scoringPolicy || 'open').toLowerCase();
    const statusLower = String(requestRow.status || '').toLowerCase();
    const now = new Date();
    const deadline = requestRow.deadline ? new Date(requestRow.deadline) : null;
    const isClosed = (deadline && deadline <= now) || statusLower === 'awarded';
    const roles = Array.isArray(req.user?.roles) ? req.user.roles.map((r) => String(r).toLowerCase()) : [];
    const isAdmin = roles.includes('admin');
    const overrideFlag = String(req.query?.override || '').toLowerCase() === '1' || String(req.query?.override || '').toLowerCase() === 'true' || req.body?.override === true;
    const canOverride = overrideFlag && isAdmin;
    if (!canOverride) {
      if (scoringPolicy === 'closed_only') {
        if (!isClosed) {
          return res.status(400).json({ error: 'SCORING_NOT_AVAILABLE', policy: 'closed_only', deadline: requestRow.deadline || null });
        }
      } else {
        // 'open' policy: must be published
        if (statusLower !== 'published' && statusLower !== 'awarded') {
          return res.status(400).json({ error: 'REQUEST_NOT_PUBLISHED_FOR_SCORING' });
        }
      }
    }

    // Scale config: prefer body override; fallback to saved weighting.scale
    const rawScale = req.body && Object.prototype.hasOwnProperty.call(req.body, 'scale') ? (req.body.scale || {}) : (weightingCfg.scale || {});
    const scaleCfg = rawScale || {};
    const result = await computeRequestScore({ tenantId, requestId, supplierId, scaleCfg, prisma });
    if (result.latestResponseId) {
      await prisma.requestResponse.update({ where: { id: result.latestResponseId }, data: { score: new Prisma.Decimal(result.score) } });
    }
    res.json({ supplierId, score: result.score, sections: result.sections, normalization: result.normalization, override: canOverride || undefined });
  } catch (e) { next(e); }
});

// ---- Award / Decline ----
router.post('/:id/award', requirePerm('procurement:award'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const { supplierId, reason } = req.body || {};
    if (!supplierId) return res.status(400).json({ error: 'supplierId is required' });
    const reqRow = await prisma.request.findFirst({ where: { tenantId, id: requestId } });
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });

    // Upsert winner
    const winner = await prisma.awardDecision.upsert({
      where: { id: 0 }, // force create via try-find-then-update pattern
      update: {},
      create: { tenantId, requestId, supplierId: Number(supplierId), decision: 'awarded', reason: reason ? String(reason) : null, decidedBy: Number(req.user.id), decidedAt: new Date() },
    }).catch(async () => {
      const existing = await prisma.awardDecision.findFirst({ where: { tenantId, requestId, supplierId: Number(supplierId) } });
      if (existing) {
        return prisma.awardDecision.update({ where: { id: existing.id }, data: { decision: 'awarded', reason: reason ? String(reason) : null, decidedBy: Number(req.user.id), decidedAt: new Date() } });
      }
      return prisma.awardDecision.create({ data: { tenantId, requestId, supplierId: Number(supplierId), decision: 'awarded', reason: reason ? String(reason) : null, decidedBy: Number(req.user.id), decidedAt: new Date() } });
    });

    // Decline all others
    const others = await prisma.awardDecision.findMany({ where: { tenantId, requestId, NOT: { supplierId: Number(supplierId) } } });
    const otherSupplierIds = new Set(others.map((o) => o.supplierId));
    // Update existing others
    await prisma.awardDecision.updateMany({ where: { tenantId, requestId, NOT: { supplierId: Number(supplierId) } }, data: { decision: 'declined', decidedAt: new Date() } });
    // Optionally create declined rows for invitees without decisions
    const invitees = await prisma.requestInvite.findMany({ where: { tenantId, requestId } });
    const toCreate = invitees.map((i) => i.supplierId).filter((sid) => sid !== Number(supplierId) && !otherSupplierIds.has(sid));
    for (const sid of toCreate) {
      await prisma.awardDecision.create({ data: { tenantId, requestId, supplierId: sid, decision: 'declined', decidedAt: new Date() } });
    }

    // Update request status
    await prisma.request.update({ where: { id: requestId }, data: { status: 'awarded' } });
    res.json({ data: { winner } });
  } catch (e) { next(e); }
});

// ---- Procurement Integration Stub ----
router.post('/:id/create-po', async (req, res) => {
  res.status(501).json({ error: 'PO creation not implemented yet' });
});

// ---- Duplicate Request (clone sections + questions) ----
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = toInt(req.params.id);
    const src = await prisma.request.findFirst({ where: { tenantId, id } });
    if (!src) return res.status(404).json({ error: 'Not found' });
    const includeWeighting = req.body && Object.prototype.hasOwnProperty.call(req.body, 'includeWeighting')
      ? !!req.body.includeWeighting
      : (String(req.query?.includeWeighting || '').toLowerCase() !== 'false');
    const rawSuffix = (req.body && req.body.titleSuffix) || req.query?.titleSuffix;
    const titleSuffix = rawSuffix != null ? String(rawSuffix) : null;

    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.request.create({
        data: {
          tenantId,
          title: `${src.title} ${titleSuffix ? titleSuffix : '(Copy)'}`.trim(),
          type: src.type,
          status: 'draft',
          deadline: null,
          stage: 1,
          totalStages: src.totalStages || 1,
          weighting: includeWeighting ? (src.weighting || undefined) : undefined,
          addenda: null,
        },
      });

      const srcSections = await tx.requestSection.findMany({ where: { tenantId, requestId: id }, orderBy: [{ order: 'asc' }, { id: 'asc' }] });
      const srcQuestions = await tx.requestQuestion.findMany({ where: { tenantId, requestId: id }, orderBy: [{ order: 'asc' }, { id: 'asc' }] });

      const sectionIdMap = new Map();
      for (const s of srcSections) {
        const newS = await tx.requestSection.create({
          data: {
            tenantId,
            requestId: created.id,
            title: s.title,
            weight: s.weight != null ? s.weight : undefined,
            order: s.order,
          },
        });
        sectionIdMap.set(s.id, newS.id);
      }

      for (const q of srcQuestions) {
        const newSectionId = sectionIdMap.get(q.sectionId);
        if (!newSectionId) continue; // skip if mapping missing
        await tx.requestQuestion.create({
          data: {
            tenantId,
            requestId: created.id,
            sectionId: newSectionId,
            qType: q.qType,
            prompt: q.prompt,
            required: q.required,
            options: q.options || undefined,
            weight: q.weight != null ? q.weight : undefined,
            calc: q.calc || undefined,
            order: q.order,
          },
        });
      }

      return { id: created.id, sections: srcSections.length, questions: srcQuestions.length };
    });

    res.json({ data: result });
  } catch (e) { next(e); }
});

// ---- Export Request (JSON) ----
router.get('/:id/export', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = toInt(req.params.id);
    const includeWeighting = String(req.query?.includeWeighting || 'true').toLowerCase() !== 'false';
    const compact = String(req.query?.compact || 'false').toLowerCase() === 'true' || String(req.query?.compact || '') === '1';
    const reqRow = await prisma.request.findFirst({ where: { tenantId, id } });
    if (!reqRow) return res.status(404).json({ error: 'Not found' });
    const [sections, questions] = await Promise.all([
      prisma.requestSection.findMany({ where: { tenantId, requestId: id }, orderBy: [{ order: 'asc' }, { id: 'asc' }] }),
      prisma.requestQuestion.findMany({ where: { tenantId, requestId: id }, orderBy: [{ order: 'asc' }, { id: 'asc' }] }),
    ]);
    const secMap = new Map(
      sections.map((s) => [
        s.id,
        compact
          ? { title: s.title, weight: s.weight ?? null, order: s.order, questionCount: 0 }
          : { title: s.title, weight: s.weight ?? null, order: s.order, questions: [] },
      ])
    );
    if (compact) {
      for (const q of questions) {
        const tgt = secMap.get(q.sectionId);
        if (tgt) tgt.questionCount = (tgt.questionCount || 0) + 1;
      }
    } else {
      for (const q of questions) {
        const tgt = secMap.get(q.sectionId);
        if (!tgt) continue;
        tgt.questions.push({ qType: q.qType, prompt: q.prompt, required: q.required, options: q.options ?? null, weight: q.weight ?? null, calc: q.calc ?? null, order: q.order });
      }
    }
    const payload = {
      request: {
        title: reqRow.title,
        type: reqRow.type,
        status: reqRow.status,
        deadline: reqRow.deadline,
        stage: reqRow.stage,
        totalStages: reqRow.totalStages,
        addenda: reqRow.addenda,
        ...(includeWeighting ? { weighting: reqRow.weighting || null } : {}),
      },
      sections: Array.from(secMap.values()),
      version: 1,
      exportedAt: new Date().toISOString(),
    };
    res.json({ data: payload });
  } catch (e) { next(e); }
});

// ---- Supplier summary for a request ----
router.get('/:id/suppliers/summary', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const requestId = toInt(req.params.id);
    const reqRow = await prisma.request.findFirst({ where: { tenantId, id: requestId } });
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });

    const [invites, responses, decisions] = await Promise.all([
      prisma.requestInvite.findMany({ where: { tenantId, requestId } }),
      prisma.requestResponse.findMany({ where: { tenantId, requestId } }),
      prisma.awardDecision.findMany({ where: { tenantId, requestId } }),
    ]);
    const supplierIds = new Set([
      ...invites.map((i) => i.supplierId),
      ...responses.map((r) => r.supplierId),
    ]);
    const suppliers = await prisma.supplier.findMany({ where: { tenantId, id: { in: Array.from(supplierIds) } }, select: { id: true, name: true, status: true } });
    const sMap = new Map(suppliers.map((s) => [s.id, s]));
    const invitedSet = new Set(invites.map((i) => i.supplierId));
    const decMap = new Map(decisions.map((d) => [d.supplierId, d]));

    const bySupplier = new Map();
    for (const r of responses) {
      if (!bySupplier.has(r.supplierId)) bySupplier.set(r.supplierId, []);
      bySupplier.get(r.supplierId).push(r);
    }

    const rows = Array.from(supplierIds).map((sid) => {
      const sup = sMap.get(sid) || { id: sid, name: 'Unknown', status: null };
      const list = bySupplier.get(sid) || [];
      const submitted = list.filter((x) => x.status === 'submitted');
      const last = submitted.sort((a, b) => (a.submittedAt && b.submittedAt ? new Date(b.submittedAt) - new Date(a.submittedAt) : b.id - a.id))[0];
      const stageStats = {};
      for (const r of list) {
        const st = r.stage;
        if (!stageStats[st]) stageStats[st] = { submitted: 0, in_progress: 0 };
        if (r.status === 'submitted') stageStats[st].submitted++; else stageStats[st].in_progress++;
      }
      const decision = decMap.get(sid);
      return {
        supplierId: sid,
        supplierName: sup.name,
        supplierStatus: sup.status,
        invited: invitedSet.has(sid),
        submittedCount: submitted.length,
        stagesTotal: reqRow.totalStages || 1,
        latestScore: last && last.score != null ? Number(last.score) : null,
        lastSubmittedAt: last ? last.submittedAt : null,
        stageStats,
        decision: decision ? decision.decision : null,
      };
    });

    res.json({ total: rows.length, rows });
  } catch (e) { next(e); }
});

// ---- Import Request (JSON) ----
router.post('/import', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const body = req.body || {};
    const data = body.data || body; // allow raw payload or wrapped
    if (!data || !data.request || !Array.isArray(data.sections)) {
      return res.status(400).json({ error: 'INVALID_IMPORT_PAYLOAD' });
    }
    const includeWeighting = body && Object.prototype.hasOwnProperty.call(body, 'includeWeighting')
      ? !!body.includeWeighting
      : true;
    const rawSuffix = body && body.titleSuffix;
    const titleSuffix = rawSuffix != null ? String(rawSuffix) : null;
    // Validate question qType against allowlist
    const allowedQ = new Set(['text', 'textarea', 'number', 'numeric', 'score', 'mcq', 'select', 'single_choice']);
    for (let si = 0; si < data.sections.length; si++) {
      const s = data.sections[si];
      const qs = Array.isArray(s.questions) ? s.questions : [];
      for (let qi = 0; qi < qs.length; qi++) {
        const q = qs[qi];
        const qt = String(q.qType || '').toLowerCase();
        if (!allowedQ.has(qt)) {
          return res.status(400).json({ error: 'INVALID_QTYPE', sectionIndex: si, questionIndex: qi, qType: q.qType });
        }
      }
    }
    const base = data.request;
    const created = await prisma.$transaction(async (tx) => {
      const reqCreated = await tx.request.create({
        data: {
          tenantId,
          title: `${String(base.title || 'Imported RFx')}${titleSuffix ? ' ' + titleSuffix : ''}`.trim(),
          type: String(base.type || 'RFP'),
          status: 'draft',
          deadline: null,
          stage: 1,
          totalStages: Number(base.totalStages || 1),
          addenda: base.addenda ? String(base.addenda) : null,
          ...(includeWeighting && base.weighting ? { weighting: base.weighting } : {}),
        },
      });

      // Create sections and questions
      for (const s of data.sections) {
        const sec = await tx.requestSection.create({
          data: {
            tenantId,
            requestId: reqCreated.id,
            title: String(s.title || 'Section'),
            weight: s.weight != null ? s.weight : undefined,
            order: Number(s.order || 0),
          },
        });
        const qs = Array.isArray(s.questions) ? s.questions : [];
        for (const q of qs) {
          await tx.requestQuestion.create({
            data: {
              tenantId,
              requestId: reqCreated.id,
              sectionId: sec.id,
              qType: String(q.qType || 'text'),
              prompt: String(q.prompt || ''),
              required: !!q.required,
              options: q.options != null ? q.options : undefined,
              weight: q.weight != null ? q.weight : undefined,
              calc: q.calc != null ? q.calc : undefined,
              order: Number(q.order || 0),
            },
          });
        }
      }

      return { id: reqCreated.id };
    });
    res.json({ data: created });
  } catch (e) { next(e); }
});

module.exports = router;
