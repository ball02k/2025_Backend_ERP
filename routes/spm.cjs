const express = require('express');
const router = express.Router();
const { prisma, Prisma } = require('../utils/prisma.cjs');

function validateKpis(kpis) {
  if (!Array.isArray(kpis)) return { ok: true, sum: 0 };
  let sum = 0;
  for (const k of kpis) {
    const w = Number(k?.weight ?? 1);
    if (!Number.isFinite(w)) return { ok: false, error: 'INVALID_WEIGHT_VALUE' };
    sum += w;
  }
  if (sum <= 0) return { ok: false, error: 'INVALID_WEIGHTS_SUM' };
  return { ok: true, sum };
}

function toInt(v) { const n = Number(v); return Number.isFinite(n) ? n : NaN; }

// ---- Templates ----
router.get('/templates', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { q, active, limit = 50, offset = 0 } = req.query;
    const where = { tenantId };
    if (active != null) where.active = String(active) !== 'false';
    if (q) {
      const term = String(q);
      where.OR = [{ name: { contains: term, mode: 'insensitive' } }];
    }
    const [total, rows] = await Promise.all([
      prisma.spmTemplate.count({ where }),
      prisma.spmTemplate.findMany({ where, take: Number(limit), skip: Number(offset), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    ]);
    res.json({ total, rows });
  } catch (e) { next(e); }
});

router.get('/templates/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = toInt(req.params.id);
    const row = await prisma.spmTemplate.findFirst({ where: { tenantId, id } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row });
  } catch (e) { next(e); }
});

router.post('/templates', async (req, res, next) => {
  try {
    // Admin enforcement can be added via roles; for now assume requireAuth handles org roles
    const tenantId = req.user.tenantId;
    const { name, categories, kpis, active } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (kpis != null) {
      const v = validateKpis(kpis);
      if (!v.ok) return res.status(400).json({ error: v.error });
    }
    const row = await prisma.spmTemplate.create({
      data: { tenantId, name: String(name), ...(categories != null ? { categories } : {}), ...(kpis != null ? { kpis } : {}), ...(active != null ? { active: !!active } : {}) },
    });
    const meta = kpis != null ? { weightsSum: validateKpis(kpis).sum, notice: Math.abs(validateKpis(kpis).sum - 1) < 1e-6 ? null : 'WEIGHTS_NOT_NORMALIZED' } : undefined;
    res.json({ data: row, ...(meta ? { meta } : {}) });
  } catch (e) { next(e); }
});

router.patch('/templates/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = toInt(req.params.id);
    const existing = await prisma.spmTemplate.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { name, categories, kpis, active } = req.body || {};
    if (kpis != null) {
      const v = validateKpis(kpis);
      if (!v.ok) return res.status(400).json({ error: v.error });
    }
    const updated = await prisma.spmTemplate.update({
      where: { id },
      data: { ...(name ? { name: String(name) } : {}), ...(categories != null ? { categories } : {}), ...(kpis != null ? { kpis } : {}), ...(active != null ? { active: !!active } : {}) },
    });
    const meta = kpis != null ? { weightsSum: validateKpis(kpis).sum, notice: Math.abs(validateKpis(kpis).sum - 1) < 1e-6 ? null : 'WEIGHTS_NOT_NORMALIZED' } : undefined;
    res.json({ data: updated, ...(meta ? { meta } : {}) });
  } catch (e) { next(e); }
});

router.post('/templates/:id/publish', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId; const id = toInt(req.params.id);
    const existing = await prisma.spmTemplate.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const row = await prisma.spmTemplate.update({ where: { id }, data: { active: true } });
    res.json({ data: row });
  } catch (e) { next(e); }
});

router.post('/templates/:id/unpublish', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId; const id = toInt(req.params.id);
    const existing = await prisma.spmTemplate.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const row = await prisma.spmTemplate.update({ where: { id }, data: { active: false } });
    res.json({ data: row });
  } catch (e) { next(e); }
});

// ---- Scorecards ----
router.get('/scorecards', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { supplierId, month, status, limit = 50, offset = 0 } = req.query;
    const where = { tenantId };
    if (supplierId) where.supplierId = Number(supplierId);
    if (month) where.periodMonth = String(month);
    if (status) where.status = String(status);
    const [total, rows] = await Promise.all([
      prisma.spmScorecard.count({ where }),
      prisma.spmScorecard.findMany({ where, take: Number(limit), skip: Number(offset), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    ]);
    res.json({ total, rows });
  } catch (e) { next(e); }
});

router.get('/scorecards/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId; const id = toInt(req.params.id);
    const sc = await prisma.spmScorecard.findFirst({ where: { tenantId, id } });
    if (!sc) return res.status(404).json({ error: 'Not found' });
    const scores = await prisma.spmScore.findMany({ where: { tenantId, scorecardId: sc.id } });
    res.json({ data: { ...sc, scores } });
  } catch (e) { next(e); }
});

// Create scorecard from template
router.post('/scorecards', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { supplierId, templateId, periodMonth } = req.body || {};
    if (!supplierId || !templateId || !periodMonth) return res.status(400).json({ error: 'supplierId, templateId, periodMonth required' });
    const tpl = await prisma.spmTemplate.findFirst({ where: { tenantId, id: Number(templateId), active: true } });
    if (!tpl) return res.status(404).json({ error: 'Template not found or inactive' });

    // Idempotent: one scorecard per supplier+month+template
    const existing = await prisma.spmScorecard.findFirst({ where: { tenantId, supplierId: Number(supplierId), periodMonth: String(periodMonth), templateId: Number(templateId) } });
    if (existing) return res.json({ data: existing, created: false });

    const created = await prisma.$transaction(async (tx) => {
      const sc = await tx.spmScorecard.create({ data: { tenantId, supplierId: Number(supplierId), templateId: Number(templateId), periodMonth: String(periodMonth), status: 'open' } });
      const kpis = Array.isArray(tpl.kpis) ? tpl.kpis : [];
      for (const k of kpis) {
        const cat = String(k.category || k.cat || 'General');
        const name = String(k.kpi || k.name || 'KPI');
        const weight = k.weight != null ? new Prisma.Decimal(k.weight) : new Prisma.Decimal(1);
        await tx.spmScore.create({ data: { tenantId, scorecardId: sc.id, category: cat, kpi: name, weight } });
      }
      return sc;
    });

    res.json({ data: created, created: true });
  } catch (e) { next(e); }
});

// Update scores and compute total
router.patch('/scorecards/:id/score', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId; const id = toInt(req.params.id);
    const sc = await prisma.spmScorecard.findFirst({ where: { tenantId, id } });
    if (!sc) return res.status(404).json({ error: 'Not found' });
    const { entries, status } = req.body || {};
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries array required' });

    await prisma.$transaction(async (tx) => {
      for (const e of entries) {
        const sid = e.id ? Number(e.id) : null;
        const where = sid ? { id: sid, tenantId } : { tenantId, scorecardId: sc.id, category: String(e.category || ''), kpi: String(e.kpi || '') };
        const row = await tx.spmScore.findFirst({ where });
        if (!row) continue;
        const data = {
          ...(e.value != null ? { value: new Prisma.Decimal(e.value) } : {}),
          ...(e.comment != null ? { comment: String(e.comment) } : {}),
          ...(e.weight != null ? { weight: new Prisma.Decimal(e.weight) } : {}),
        };
        await tx.spmScore.update({ where: { id: row.id }, data });
      }

      const rows = await tx.spmScore.findMany({ where: { tenantId, scorecardId: sc.id } });
      let sum = 0; let wsum = 0;
      for (const r of rows) {
        const w = Number(r.weight); const v = r.value != null ? Number(r.value) : null;
        if (v != null && Number.isFinite(v) && Number.isFinite(w)) { sum += v * w; wsum += w; }
      }
      const total = wsum > 0 ? sum / wsum : null;
      await tx.spmScorecard.update({ where: { id: sc.id }, data: { totalScore: total != null ? new Prisma.Decimal(total) : null, ...(status ? { status: String(status) } : {}) } });

      // Snapshot rollup: update supplier.performanceScore with latest
      // Find latest (max periodMonth) non-null totalScore for supplier
      const latest = await tx.spmScorecard.findFirst({
        where: { tenantId, supplierId: sc.supplierId, totalScore: { not: null } },
        orderBy: [{ periodMonth: 'desc' }],
        select: { totalScore: true },
      });
      if (latest) {
        await tx.supplier.update({ where: { id: sc.supplierId }, data: { performanceScore: latest.totalScore } });
      }
    });

    const out = await prisma.spmScorecard.findFirst({ where: { tenantId, id }, select: { id: true, totalScore: true, status: true } });
    res.json({ data: out });
  } catch (e) { next(e); }
});

module.exports = router;

// ---- Supplier trend (recent months) ----
router.get('/suppliers/:supplierId/trend', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const supplierId = Number(req.params.supplierId);
    if (!Number.isFinite(supplierId)) return res.status(400).json({ error: 'Invalid supplierId' });
    const months = Number(req.query.months || 6);
    const limit = Number.isFinite(months) && months > 0 ? months : 6;

    const cards = await prisma.spmScorecard.findMany({
      where: { tenantId, supplierId, totalScore: { not: null } },
      select: { id: true, templateId: true, periodMonth: true, totalScore: true },
      orderBy: [{ periodMonth: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    const tIds = Array.from(new Set(cards.map((c) => c.templateId)));
    const templates = await prisma.spmTemplate.findMany({ where: { tenantId, id: { in: tIds } }, select: { id: true, name: true } });
    const tMap = new Map(templates.map((t) => [t.id, t.name]));

    // Group by periodMonth (desc), keep latest N distinct months
    const byMonth = new Map();
    for (const c of cards) {
      if (!byMonth.has(c.periodMonth)) byMonth.set(c.periodMonth, []);
      byMonth.get(c.periodMonth).push(c);
    }
    const monthsKeys = Array.from(byMonth.keys()).sort().reverse().slice(0, limit).reverse();
    const rows = monthsKeys.map((m) => {
      const list = byMonth.get(m) || [];
      const scores = list.map((x) => Number(x.totalScore));
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      const templatesArr = list.map((x) => ({ templateId: x.templateId, templateName: tMap.get(x.templateId) || null, scorecardId: x.id, totalScore: Number(x.totalScore) }));
      return { periodMonth: m, avgScore: avg, count: list.length, templates: templatesArr };
    });

    res.json({ supplierId, months: limit, rows });
  } catch (e) { next(e); }
});
