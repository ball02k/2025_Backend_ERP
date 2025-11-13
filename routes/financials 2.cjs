const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { recomputeFinancials } = require('../services/projectSnapshot');
const { assertProjectMember } = require('../middleware/membership.cjs');

async function ensureMember(req, projectId) {
  const member = await assertProjectMember({
    userId: req.user.id,
    projectId: Number(projectId),
    tenantId: req.user.tenantId,
  });
  if (!member) throw Object.assign(new Error('Forbidden'), { status: 403 });
}

function num(x) { return x == null ? undefined : Number(x); }

router.get('/', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = num(req.query.projectId);
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    await ensureMember(req, projectId);
    const where = { tenantId, projectId };
    const [rows, total] = await Promise.all([
      prisma.actualCost.findMany({
        where,
        orderBy: { incurredAt: 'desc' },
        select: { id: true, description: true, amount: true, category: true, incurredAt: true },
      }),
      prisma.actualCost.count({ where }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      name: r.description,
      amount: r.amount,
      category: r.category,
      date: r.incurredAt,
    }));
    res.json({ total, items });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to list financials' });
  }
});

// POST /api/financials/:projectId/adjustments
router.post('/:projectId/adjustments', async (req, res) => {
  const tenantId = req.user?.tenantId;
  const roles = Array.isArray(req.user?.roles) ? req.user.roles : (req.user?.role ? [req.user.role] : []);
  if (!roles.some(r => ['admin','pm','qs'].includes(String(r)))) return res.status(403).json({ error: 'FORBIDDEN' });

  const projectId = Number(req.params.projectId);
  const { name, amount } = req.body || {};
  if (!Number.isFinite(projectId) || !name || typeof amount !== 'number') return res.status(400).json({ error: 'Invalid payload' });

  const proj = await prisma.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null } });
  if (!proj) return res.status(400).json({ error: 'Invalid projectId' });

  const item = await prisma.financialItem.create({ data: { tenantId, projectId, name, amount } });
  res.status(201).json(item);
});

// ---------- BudgetLine ----------
router.get('/budgets', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = num(req.query.projectId);
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    await ensureMember(req, projectId);

    const rows = await prisma.budgetLine.findMany({
      where: { tenantId, projectId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: rows });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to list budgets' });
  }
});

router.post('/budgets', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { projectId, code, category, description, amount } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    await ensureMember(req, projectId);

    const row = await prisma.budgetLine.create({
      data: { tenantId, projectId: Number(projectId), code, category, description, amount },
    });
    await recomputeFinancials(Number(projectId), tenantId);
    res.status(201).json({ data: row });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

router.get('/budgets/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const row = await prisma.budgetLine.findFirst({ where: { tenantId, id } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    await ensureMember(req, row.projectId);
    res.json({ data: row });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
});

router.put('/budgets/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.budgetLine.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await ensureMember(req, existing.projectId);

    const { code, category, description, amount } = req.body;
    const row = await prisma.budgetLine.update({
      where: { id },
      data: { code, category, description, amount },
    });
    await recomputeFinancials(existing.projectId, tenantId);
    res.json({ data: row });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

router.delete('/budgets/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.budgetLine.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await ensureMember(req, existing.projectId);

    await prisma.budgetLine.delete({ where: { id } });
    await recomputeFinancials(existing.projectId, tenantId);
    res.status(204).end();
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

// ---------- Commitment ----------
router.get('/commitments', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = num(req.query.projectId);
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    await ensureMember(req, projectId);
    const status = req.query.status ? String(req.query.status) : undefined;
    const rows = await prisma.commitment.findMany({
      where: { tenantId, projectId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: rows });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to list commitments' });
  }
});

router.post('/commitments', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { projectId, linkedPoId, ref, supplier, description, amount, status } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    await ensureMember(req, projectId);

    const row = await prisma.commitment.create({
      data: {
        tenantId,
        projectId: Number(projectId),
        linkedPoId: linkedPoId != null ? Number(linkedPoId) : null,
        ref: ref ?? null,
        supplier: supplier ?? null,
        description: description ?? null,
        amount,
        status: status ? String(status) : 'Open',
      },
    });
    await recomputeFinancials(Number(projectId), tenantId);
    res.status(201).json({ data: row });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to create commitment' });
  }
});

router.get('/commitments/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const row = await prisma.commitment.findFirst({ where: { tenantId, id } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    await ensureMember(req, row.projectId);
    res.json({ data: row });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to fetch commitment' });
  }
});

router.put('/commitments/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.commitment.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await ensureMember(req, existing.projectId);

    const { linkedPoId, ref, supplier, description, amount, status } = req.body;
    const row = await prisma.commitment.update({
      where: { id },
      data: {
        linkedPoId: linkedPoId === null ? null : linkedPoId != null ? Number(linkedPoId) : undefined,
        ref: ref != null ? ref : undefined,
        supplier: supplier != null ? supplier : undefined,
        description: description != null ? description : undefined,
        amount: amount != null ? amount : undefined,
        status: status != null ? String(status) : undefined,
      },
    });
    await recomputeFinancials(existing.projectId, tenantId);
    res.json({ data: row });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to update commitment' });
  }
});

router.delete('/commitments/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.commitment.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await ensureMember(req, existing.projectId);

    await prisma.commitment.delete({ where: { id } });
    await recomputeFinancials(existing.projectId, tenantId);
    res.status(204).end();
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to delete commitment' });
  }
});

// ---------- ActualCost ----------
router.get('/actuals', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = num(req.query.projectId);
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    await ensureMember(req, projectId);

    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const where = { tenantId, projectId };
    if (from || to) where.incurredAt = {};
    if (from) where.incurredAt.gte = from;
    if (to) where.incurredAt.lte = to;

    const rows = await prisma.actualCost.findMany({
      where,
      orderBy: { incurredAt: 'desc' },
    });
    res.json({ data: rows });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to list actuals' });
  }
});

router.post('/actuals', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { projectId, ref, supplier, description, amount, incurredAt } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    await ensureMember(req, projectId);

    const row = await prisma.actualCost.create({
      data: {
        tenantId,
        projectId: Number(projectId),
        ref: ref ?? null,
        supplier: supplier ?? null,
        description: description ?? null,
        amount,
        incurredAt: incurredAt ? new Date(incurredAt) : undefined,
      },
    });
    await recomputeFinancials(Number(projectId), tenantId);
    res.status(201).json({ data: row });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to create actual' });
  }
});

router.get('/actuals/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const row = await prisma.actualCost.findFirst({ where: { tenantId, id } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    await ensureMember(req, row.projectId);
    res.json({ data: row });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to fetch actual' });
  }
});

router.put('/actuals/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.actualCost.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await ensureMember(req, existing.projectId);

    const { ref, supplier, description, amount, incurredAt } = req.body;
    const row = await prisma.actualCost.update({
      where: { id },
      data: {
        ref: ref != null ? ref : undefined,
        supplier: supplier != null ? supplier : undefined,
        description: description != null ? description : undefined,
        amount: amount != null ? amount : undefined,
        incurredAt: incurredAt != null ? new Date(incurredAt) : undefined,
      },
    });
    await recomputeFinancials(existing.projectId, tenantId);
    res.json({ data: row });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to update actual' });
  }
});

router.delete('/actuals/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.actualCost.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await ensureMember(req, existing.projectId);

    await prisma.actualCost.delete({ where: { id } });
    await recomputeFinancials(existing.projectId, tenantId);
    res.status(204).end();
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to delete actual' });
  }
});

// ---------- Forecast ----------
router.get('/forecasts', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = num(req.query.projectId);
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    await ensureMember(req, projectId);

    const rows = await prisma.forecast.findMany({
      where: { tenantId, projectId },
      orderBy: [{ period: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({ data: rows });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to list forecasts' });
  }
});

router.post('/forecasts', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { projectId, period, description, amount } = req.body;
    if (!projectId || !period) return res.status(400).json({ error: 'projectId and period required' });
    await ensureMember(req, projectId);

    const row = await prisma.forecast.create({
      data: {
        tenantId,
        projectId: Number(projectId),
        period: String(period),
        description,
        amount,
      },
    });
    await recomputeFinancials(Number(projectId), tenantId);
    res.status(201).json({ data: row });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Duplicate period' });
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to create forecast' });
  }
});

router.get('/forecasts/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const row = await prisma.forecast.findFirst({ where: { tenantId, id } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    await ensureMember(req, row.projectId);
    res.json({ data: row });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to fetch forecast' });
  }
});

router.put('/forecasts/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.forecast.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await ensureMember(req, existing.projectId);

    const { period, description, amount } = req.body;
    const row = await prisma.forecast.update({
      where: { id },
      data: {
        period: period != null ? String(period) : undefined,
        description: description != null ? description : undefined,
        amount: amount != null ? amount : undefined,
      },
    });
    await recomputeFinancials(existing.projectId, tenantId);
    res.json({ data: row });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Duplicate period' });
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to update forecast' });
  }
});

router.delete('/forecasts/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.forecast.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await ensureMember(req, existing.projectId);

    await prisma.forecast.delete({ where: { id } });
    await recomputeFinancials(existing.projectId, tenantId);
    res.status(204).end();
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Failed to delete forecast' });
  }
});

module.exports = router;
// ---------- Snapshot ----------
router.get('/snapshot', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = req.query.projectId != null ? Number(req.query.projectId) : undefined;

    const where = projectId ? { tenantId, projectId } : { tenantId };
    const [budget, committed, actual, forecast] = await Promise.all([
      prisma.budgetLine.aggregate({ _sum: { amount: true }, where }),
      prisma.commitment.aggregate({ _sum: { amount: true }, where: { ...where, status: 'Open' } }),
      prisma.actualCost.aggregate({ _sum: { amount: true }, where }),
      prisma.forecast.aggregate({ _sum: { amount: true }, where }),
    ]);

    const sums = {
      budget: Number(budget._sum.amount || 0),
      committed: Number(committed._sum.amount || 0),
      actual: Number(actual._sum.amount || 0),
      forecast: Number(forecast._sum.amount || 0),
    };
    const value = sums.budget; // simplified "value" proxy
    const cost = sums.actual + sums.committed;
    const margin = value - cost;
    const marginPct = value > 0 ? (margin / value) * 100 : 0;

    res.json({ ...sums, value, cost, margin, marginPct });
  } catch (e) {
    res.status(500).json({ error: 'Failed to compute financial snapshot' });
  }
});
// ---------- Periods & CVR ----------
function safePct(n, d) { if (!d || Number(d) === 0) return null; return Number(((Number(n) / Number(d)) * 100).toFixed(2)); }
function sum(arr, f) { return (arr || []).reduce((t, x) => t + Number(f ? f(x) : x), 0); }
function toYYYYMM(d) {
  const dt = d instanceof Date ? d : (d ? new Date(d) : null);
  if (!dt || isNaN(dt)) return null;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function toCsvRow(values) {
  return values
    .map((v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    })
    .join(',') + '\n';
}

router.get('/:projectId/periods', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'projectId required' });
    // Optional membership on read by policy; enforce if needed
    // await ensureMember(req, projectId);

    const [bl, cm, ac, fc] = await Promise.all([
      prisma.budgetLine.findMany({ where: { tenantId, projectId }, select: { periodMonth: true } }),
      prisma.commitment.findMany({ where: { tenantId, projectId }, select: { periodMonth: true } }),
      prisma.actualCost.findMany({ where: { tenantId, projectId }, select: { periodMonth: true, incurredAt: true } }),
      prisma.forecast.findMany({ where: { tenantId, projectId }, select: { periodMonth: true, period: true } }),
    ]);
    const set = new Set();
    for (const r of bl) if (r.periodMonth) set.add(r.periodMonth);
    for (const r of cm) if (r.periodMonth) set.add(r.periodMonth);
    for (const r of ac) set.add(r.periodMonth || toYYYYMM(r.incurredAt));
    for (const r of fc) set.add(r.periodMonth || r.period);
    const periods = Array.from(set).filter(Boolean).sort();
    res.json({ data: { periods, latest: periods[periods.length - 1] || null } });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list periods' });
  }
});

router.get('/:projectId/cvr', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const roles = Array.isArray(req.user.roles) ? req.user.roles : [];
    if (!roles.includes('finance') && !roles.includes('admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'projectId required' });
    await ensureMember(req, projectId);

    const [budgets, commitments, actuals, forecasts] = await Promise.all([
      prisma.budgetLine.findMany({ where: { tenantId, projectId } }),
      prisma.commitment.findMany({ where: { tenantId, projectId } }),
      prisma.actualCost.findMany({ where: { tenantId, projectId } }),
      prisma.forecast.findMany({ where: { tenantId, projectId } }),
    ]);

    const map = {};
    const add = (code, field, amount) => {
      const key = code || 'Uncoded';
      if (!map[key]) map[key] = { code: key, budget: 0, committed: 0, actual: 0, forecast: 0 };
      map[key][field] += Number(amount || 0);
    };
    budgets.forEach((b) => add(b.code, 'budget', b.amount));
    commitments.forEach((c) => add(c.category, 'committed', c.amount));
    actuals.forEach((a) => add(a.category, 'actual', a.amount));
    forecasts.forEach((f) => add(f.description, 'forecast', f.amount));

    const byCostCode = Object.values(map).map((r) => {
      const value = Number(r.budget) + Number(r.forecast);
      const cost = Number(r.committed) + Number(r.actual);
      return { ...r, margin: value - cost, marginPct: safePct(value - cost, value) };
    });

    const totals = {
      budget: sum(byCostCode, (r) => r.budget),
      committed: sum(byCostCode, (r) => r.committed),
      actual: sum(byCostCode, (r) => r.actual),
      forecast: sum(byCostCode, (r) => r.forecast),
    };
    totals.value = totals.budget + totals.forecast;
    totals.cost = totals.committed + totals.actual;
    totals.margin = totals.value - totals.cost;
    totals.marginPct = safePct(totals.margin, totals.value);

    const periodsSet = new Set();
    budgets.forEach((b) => b.periodMonth && periodsSet.add(b.periodMonth));
    commitments.forEach((c) => c.periodMonth && periodsSet.add(c.periodMonth));
    actuals.forEach((a) => periodsSet.add(a.periodMonth || toYYYYMM(a.incurredAt)));
    forecasts.forEach((f) => periodsSet.add(f.periodMonth || f.period));
    const periods = Array.from(periodsSet).filter(Boolean).sort();
    const trend = periods.map((p) => {
      const b = sum(budgets.filter((r) => r.periodMonth === p), (r) => r.amount || 0);
      const c = sum(commitments.filter((r) => r.periodMonth === p), (r) => r.amount || 0);
      const a = sum(actuals.filter((r) => (r.periodMonth || toYYYYMM(r.incurredAt)) === p), (r) => r.amount || 0);
      const f = sum(forecasts.filter((r) => (r.periodMonth || r.period) === p), (r) => r.amount || 0);
      const v = b + f;
      const costP = c + a;
      return { period: p, budgets: b, commitments: c, actuals: a, forecasts: f, value: v, cost: costP, marginPct: safePct(v - costP, v) };
    });

    if ((req.query.format || '').toLowerCase() === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="cvr-${projectId}.csv"`);
      res.write(toCsvRow(['code', 'budget', 'committed', 'actual', 'forecast', 'margin', 'marginPct']));
      for (const row of byCostCode) {
        res.write(
          toCsvRow([row.code, row.budget, row.committed, row.actual, row.forecast, row.margin, row.marginPct])
        );
      }
      return res.end();
    }

    res.json({ data: { byCostCode, totals, trend } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to compute CVR report' });
  }
});

router.get('/:projectId/cvr/:period', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.projectId);
    const period = String(req.params.period);
    const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 12;
    if (!Number.isFinite(projectId) || !period) return res.status(400).json({ error: 'projectId and period required' });
    // Optional membership on read by policy; enforce if needed
    // await ensureMember(req, projectId);

    const wherePeriod = { tenantId, projectId, periodMonth: period };
    const includeVarInValue = String(req.query.includeVarInValue ?? 'true').toLowerCase() !== 'false';
    // Variation impact window
    const [year, month] = period.split('-').map((x) => Number(x));
    const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    const statusesApproved = ['approved', 'implemented'];

    const [budgets, commitments, actuals, forecasts, varAgg] = await Promise.all([
      prisma.budgetLine.findMany({ where: wherePeriod, select: { id: true, category: true, amount: true } }),
      prisma.commitment.findMany({ where: wherePeriod, select: { id: true, category: true, amount: true, status: true } }),
      prisma.actualCost.findMany({ where: wherePeriod, select: { id: true, category: true, amount: true } }),
      prisma.forecast.findMany({ where: wherePeriod, select: { id: true, description: true, amount: true } }),
      prisma.variation.aggregate({
        _sum: { value: true },
        where: {
          tenantId,
          projectId,
          status: { in: statusesApproved },
          OR: [
            { approvedDate: { gte: periodStart, lt: periodEnd } },
            { decisionDate: { gte: periodStart, lt: periodEnd } },
          ],
        },
      }),
    ]);

    const budgetsTotal = sum(budgets, (r) => r.amount || 0);
    const commitmentsTotal = sum(commitments, (r) => r.amount || 0);
    const actualsTotal = sum(actuals, (r) => r.amount || 0);
    const forecastsTotal = sum(forecasts, (r) => r.amount || 0);

    const variationsImpactTotal = Number(varAgg._sum.value || 0);
    const value = budgetsTotal + (includeVarInValue ? variationsImpactTotal : 0);
    const cost = commitmentsTotal + actualsTotal; // committed + spent
    const marginPct = value > 0 ? Number((((value - cost) / value) * 100).toFixed(2)) : null;
    const erosionPct = budgetsTotal > 0 ? Number(((((commitmentsTotal + actualsTotal) - budgetsTotal) / budgetsTotal) * 100).toFixed(2)) : null;

    // PM/QS specific views (placeholders where data not modeled yet)
    const prelims = budgets.filter((r) => (r.category || '').toLowerCase().includes('prelim'));
    const prelimsTotal = sum(prelims, (r) => r.amount || 0);
    const retentions = null; // not modeled yet
    const variationsImpact = { total: variationsImpactTotal };

    const pmView = {
      prelims: { total: prelimsTotal },
      programmeSpend: { total: actualsTotal },
      retentions,
      variationsImpact,
    };
    const qsView = {
      budgets: { total: budgetsTotal },
      commitments: { total: commitmentsTotal },
      actuals: { total: actualsTotal },
      forecasts: { total: forecastsTotal },
      variationsImpact,
    };

    // Trend: build over all known periods for this project
    const [allPeriodsRes] = await Promise.all([
      prisma.$queryRaw`SELECT DISTINCT period FROM (
        SELECT COALESCE("periodMonth", to_char("createdAt", 'YYYY-MM')) AS period FROM "public"."BudgetLine" WHERE "tenantId" = ${tenantId} AND "projectId" = ${projectId}
        UNION
        SELECT COALESCE("periodMonth", to_char("createdAt", 'YYYY-MM')) AS period FROM "public"."Commitment" WHERE "tenantId" = ${tenantId} AND "projectId" = ${projectId}
        UNION
        SELECT COALESCE("periodMonth", to_char("incurredAt", 'YYYY-MM')) AS period FROM "public"."ActualCost" WHERE "tenantId" = ${tenantId} AND "projectId" = ${projectId}
        UNION
        SELECT COALESCE("periodMonth", "period") AS period FROM "public"."Forecast" WHERE "tenantId" = ${tenantId} AND "projectId" = ${projectId}
      ) t WHERE period IS NOT NULL ORDER BY period ASC;`
    ]);
    const allPeriods = (allPeriodsRes || []).map((r) => r.period);
    const periodsLimited = (Number.isFinite(limit) && limit > 0) ? allPeriods.slice(-limit) : allPeriods;

    // Aggregate per period
    const trend = [];
    for (const p of periodsLimited) {
      const ps = new Date(p + '-01T00:00:00Z');
      const pe = new Date(Date.UTC(ps.getUTCFullYear(), ps.getUTCMonth() + 1, 1));
      const [bt, ct, at, ft, vt] = await Promise.all([
        prisma.budgetLine.aggregate({ _sum: { amount: true }, where: { tenantId, projectId, periodMonth: p } }),
        prisma.commitment.aggregate({ _sum: { amount: true }, where: { tenantId, projectId, periodMonth: p } }),
        prisma.actualCost.aggregate({ _sum: { amount: true }, where: { tenantId, projectId, periodMonth: p } }),
        prisma.forecast.aggregate({ _sum: { amount: true }, where: { tenantId, projectId, periodMonth: p } }),
        prisma.variation.aggregate({
          _sum: { value: true },
          where: {
            tenantId,
            projectId,
            status: { in: statusesApproved },
            OR: [
              { approvedDate: { gte: ps, lt: pe } },
              { decisionDate: { gte: ps, lt: pe } },
            ],
          },
        }),
      ]);
      const b = Number(bt._sum.amount || 0);
      const c = Number(ct._sum.amount || 0);
      const a = Number(at._sum.amount || 0);
      const f = Number(ft._sum.amount || 0);
      const vImp = Number(vt._sum.value || 0);
      const v = b + (includeVarInValue ? vImp : 0);
      const costP = c + a;
      trend.push({ period: p, budgets: b, commitments: c, actuals: a, forecasts: f, variationsImpact: vImp, value: v, cost: costP, marginPct: safePct(v - costP, v) });
    }

    // updatedAt from latest among sources for this period
    const [u1, u2, u3, u4] = await Promise.all([
      prisma.budgetLine.findFirst({ where: wherePeriod, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      prisma.commitment.findFirst({ where: wherePeriod, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      prisma.actualCost.findFirst({ where: wherePeriod, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      prisma.forecast.findFirst({ where: wherePeriod, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    ]);
    const updatedAt = [u1?.updatedAt, u2?.updatedAt, u3?.updatedAt, u4?.updatedAt].filter(Boolean).sort().pop() || null;

    res.json({
      data: {
        value,
        cost,
        marginPct,
        erosionPct,
        breakdown: {
          budgets: { total: budgetsTotal, items: budgets },
          commitments: { total: commitmentsTotal, items: commitments },
          actuals: { total: actualsTotal, items: actuals },
          forecasts: { total: forecastsTotal, items: forecasts },
          prelims: { total: prelimsTotal },
          retentions,
          variationsImpact,
        },
        pmView,
        qsView,
        trend,
        updatedAt,
      },
      meta: { includeVarInValue, limit },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to compute CVR' });
  }
});
