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
