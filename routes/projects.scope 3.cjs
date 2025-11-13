const express = require('express');
const router = express.Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const runs = new Map();

function getTenantId(req) {
  return (
    req.user?.tenantId ||
    req.headers['x-tenant-id'] ||
    req.headers['X-Tenant-Id'] ||
    'demo'
  );
}

function normaliseId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getRun(runId) {
  return runs.get(runId);
}

function createRun({ runId, projectId, tenantId }) {
  const id = runId || normaliseId();
  const entry = {
    id,
    projectId: Number(projectId),
    tenantId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    items: [],
  };
  runs.set(id, entry);
  return entry;
}

router.post('/', (req, res) => {
  const tenantId = getTenantId(req);
  const { projectId } = req.params;
  const run = createRun({ projectId, tenantId });
  res.json(run);
});

router.post('/:runId/suggest', async (req, res) => {
  const tenantId = getTenantId(req);
  const { projectId, runId } = req.params;
  const numericProjectId = Number(projectId);
  const run = getRun(runId) || createRun({ runId, projectId, tenantId });

  try {
    const budgetLines = await prisma.budgetLineItem.findMany({
      where: { projectId: numericProjectId },
      select: {
        id: true,
        description: true,
        costCode: true,
      },
      orderBy: { id: 'asc' },
    });

    run.items = budgetLines.map((line) => {
      const suggestedCode = line.costCode ? String(line.costCode).toUpperCase() : 'UNASSIGNED';
      return {
        id: line.id,
        budgetId: line.id,
        description: line.description || '',
        suggestedCode,
        altCode: suggestedCode === 'UNASSIGNED' ? null : 'UNASSIGNED',
        confidence: suggestedCode === 'UNASSIGNED' ? 0.55 : 0.82,
        explain: line.costCode
          ? [{ type: 'costCode', prefix: line.costCode }]
          : [],
      };
    });
    run.status = 'complete';
    run.generatedAt = new Date().toISOString();
  } catch (err) {
    console.warn('[scope-runs] suggestion failed', err);
    run.items = [];
    run.status = 'complete';
    run.generatedAt = new Date().toISOString();
  }

  res.json({ status: run.status, generated: run.items.length });
});

router.get('/:runId', (req, res) => {
  const { projectId, runId } = req.params;
  const run = getRun(runId) || createRun({ runId, projectId, tenantId: getTenantId(req) });
  res.json({
    id: run.id,
    projectId: run.projectId,
    tenantId: run.tenantId,
    status: run.status,
    createdAt: run.createdAt,
    generatedAt: run.generatedAt || null,
    items: run.items || [],
  });
});

router.patch('/:runId/accept', (req, res) => {
  const { projectId, runId } = req.params;
  const run = getRun(runId) || createRun({ runId, projectId, tenantId: getTenantId(req) });
  const { mappings = [], createPackages = [] } = req.body || {};
  const acceptedAt = new Date().toISOString();

  run.accepted = {
    mappings: Array.isArray(mappings) ? mappings : [],
    createPackages: Array.isArray(createPackages) ? createPackages : [],
    acceptedAt,
  };

  res.json({
    status: 'accepted',
    acceptedAt,
    acceptedMappings: run.accepted.mappings.length,
    createPackages: run.accepted.createPackages.length,
  });
});

module.exports = router;
