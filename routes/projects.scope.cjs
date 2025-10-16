const express = require('express');
const router = express.Router({ mergeParams: true });
const { prisma } = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth.cjs');

const inMemoryRuns = new Map();
let memorySeq = 1;

function ensureTenantId(tenantId) {
  return tenantId || 'demo';
}

function memoryKey(tenantId, runId) {
  return `${ensureTenantId(tenantId)}:${runId}`;
}

function createMemoryRun(tenantId, projectId) {
  const id = memorySeq++;
  const safeTenant = ensureTenantId(tenantId);
  const run = {
    id,
    tenantId: safeTenant,
    projectId,
    status: 'created',
    meta: {},
    createdAt: new Date().toISOString(),
    suggestions: [],
  };
  inMemoryRuns.set(memoryKey(safeTenant, id), run);
  return run;
}

function getMemoryRun(tenantId, runId) {
  return inMemoryRuns.get(memoryKey(tenantId, runId)) || null;
}

function updateMemoryRun(tenantId, runId, updater) {
  const key = memoryKey(tenantId, runId);
  const existing = inMemoryRuns.get(key);
  if (!existing) return null;
  const updated = updater({ ...existing });
  inMemoryRuns.set(key, updated);
  return updated;
}

function isScopeRunTableMissing(err) {
  if (!err) return false;
  if (err.code === 'P2021') return true;
  const msg = String(err.meta?.cause || err.message || '').toLowerCase();
  return msg.includes('scope_run') || msg.includes('scoperun');
}

function isBudgetColumnMissing(err) {
  if (!err) return false;
  if (err.code === 'P2021') return true;
  const msg = String(err.meta?.cause || err.message || '').toLowerCase();
  return msg.includes('qty') || msg.includes('rate') || msg.includes('total');
}

async function fetchBudgetLines(tenantId, projectId) {
  try {
    return await prisma.budgetLine.findMany({
      where: { tenantId, projectId },
      select: {
        id: true,
        code: true,
        description: true,
        qty: true,
        rate: true,
        total: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  } catch (err) {
    if (!isBudgetColumnMissing(err)) throw err;
    const fallback = await prisma.budgetLine.findMany({
      where: { tenantId, projectId },
      select: {
        id: true,
        code: true,
        description: true,
        amount: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return fallback.map((line) => ({
      id: line.id,
      code: line.code,
      description: line.description,
      qty: null,
      rate: null,
      total: line.amount,
    }));
  }
}

// POST /api/projects/:projectId/scope-runs
router.post('/:projectId/scope-runs', requireAuth, async (req, res, next) => {
  const tenantIdRaw = req.tenantId || req.user?.tenantId || req.headers['x-tenant-id'] || req.headers['X-Tenant-Id'];
  const tenantId = ensureTenantId(tenantIdRaw);
  try {
    const projectId = Number(req.params.projectId);
    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    try {
      const run = await prisma.scopeRun.create({
        data: { tenantId, projectId, status: 'created', meta: {} },
      });
      res.status(201).json(run);
      return;
    } catch (err) {
      if (!isScopeRunTableMissing(err)) throw err;
      const run = createMemoryRun(tenantId, projectId);
      res.status(201).json({
        id: run.id,
        tenantId: run.tenantId,
        projectId: run.projectId,
        status: run.status,
        meta: run.meta,
        createdAt: run.createdAt,
      });
      return;
    }
  } catch (e) {
    next(e);
  }
});

// POST /api/projects/:projectId/scope-runs/:runId/suggest
router.post('/:projectId/scope-runs/:runId/suggest', requireAuth, async (req, res, next) => {
  try {
    const tenantIdRaw = req.tenantId || req.user?.tenantId || req.headers['x-tenant-id'] || req.headers['X-Tenant-Id'];
    const tenantId = ensureTenantId(tenantIdRaw);
    const projectId = Number(req.params.projectId);
    const runId = Number(req.params.runId);

    let run;
    let usingMemory = false;
    try {
      run = await prisma.scopeRun.findFirst({ where: { id: runId, tenantId, projectId } });
    } catch (err) {
      if (!isScopeRunTableMissing(err)) throw err;
    }

    if (!run) {
      const fallback = getMemoryRun(tenantId, runId);
      if (fallback) {
        run = fallback;
        usingMemory = true;
      }
    }

    if (!run) return res.status(404).json({ message: 'Scope run not found' });

    const lines = await fetchBudgetLines(tenantId, projectId);

    const suggestions = [];
    for (const line of lines) {
      const code = (line.code || '').toUpperCase();
      let pkgKey = 'GENERAL';
      if (code.startsWith('MECH') || /MECH|MECHANICAL/i.test(line.description || '')) pkgKey = 'MECHANICAL';
      else if (code.startsWith('ELEC') || /ELEC|ELECTRICAL/i.test(line.description || '')) pkgKey = 'ELECTRICAL';
      else if (/ROOF/i.test(line.description || '')) pkgKey = 'ROOFING';
      suggestions.push({
        budgetLineId: line.id,
        suggestedPackageCode: pkgKey,
        reason: `Code/desc rules matched (${pkgKey})`,
      });
    }

    if (usingMemory) {
      updateMemoryRun(tenantId, runId, (prev) => ({
        ...prev,
        status: 'suggested',
        meta: { count: suggestions.length, suggestions },
        suggestions,
      }));
      res.json({ runId, suggestions });
      return;
    }

    try {
      await prisma.scopeRun.update({
        where: { id: runId },
        data: { status: 'suggested', meta: { count: suggestions.length, suggestions } },
      });
    } catch (err) {
      if (!isScopeRunTableMissing(err)) throw err;
      updateMemoryRun(tenantId, runId, (prev) => ({
        ...prev,
        status: 'suggested',
        meta: { count: suggestions.length, suggestions },
        suggestions,
      }));
    }

    res.json({ runId, suggestions });
  } catch (e) { next(e); }
});

router.get('/:projectId/scope-runs/:runId', requireAuth, async (req, res, next) => {
  try {
    const tenantIdRaw = req.tenantId || req.user?.tenantId || req.headers['x-tenant-id'] || req.headers['X-Tenant-Id'];
    const tenantId = ensureTenantId(tenantIdRaw);
    const projectId = Number(req.params.projectId);
    const runId = Number(req.params.runId);

    let run;
    try {
      run = await prisma.scopeRun.findFirst({ where: { id: runId, tenantId, projectId } });
    } catch (err) {
      if (!isScopeRunTableMissing(err)) throw err;
    }

    if (run) {
      const suggestions = Array.isArray(run.meta?.suggestions) ? run.meta.suggestions : [];
      res.json({
        id: run.id,
        projectId: run.projectId,
        status: run.status,
        createdAt: run.createdAt,
        meta: run.meta,
        suggestions,
      });
      return;
    }

    const fallback = getMemoryRun(tenantId, runId);
    if (!fallback) return res.status(404).json({ message: 'Scope run not found' });

    res.json({
      id: fallback.id,
      projectId: fallback.projectId,
      status: fallback.status,
      createdAt: fallback.createdAt,
      meta: fallback.meta,
      suggestions: fallback.suggestions || [],
    });
  } catch (e) { next(e); }
});

module.exports = router;
