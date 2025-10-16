const express = require('express');
const router = express.Router({ mergeParams: true });
const { prisma } = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth.cjs');

// POST /api/projects/:projectId/scope-runs
router.post('/:projectId/scope-runs', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId || req.headers['x-tenant-id'] || req.headers['X-Tenant-Id'];
    const projectId = Number(req.params.projectId);
    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const run = await prisma.scopeRun.create({
      data: { tenantId, projectId, status: 'created', meta: {} },
    });
    res.status(201).json(run);
  } catch (e) { next(e); }
});

// POST /api/projects/:projectId/scope-runs/:runId/suggest
router.post('/:projectId/scope-runs/:runId/suggest', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId || req.headers['x-tenant-id'] || req.headers['X-Tenant-Id'];
    const projectId = Number(req.params.projectId);
    const runId = Number(req.params.runId);

    const run = await prisma.scopeRun.findFirst({ where: { id: runId, tenantId, projectId } });
    if (!run) return res.status(404).json({ message: 'Scope run not found' });

    // Pull latest budget groups + lines with qty/rate persisted
    const groups = await prisma.budgetGroup.findMany({
      where: { tenantId, projectId },
      include: {
        budgetLines: {
          where: { tenantId },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            code: true,
            description: true,
            qty: true,
            rate: true,
            total: true,
            groupId: true,
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Simple rule-based suggestions by cost code prefix/trade keywords (keep deterministic)
    const suggestions = [];
    for (const g of groups) {
      for (const line of g.budgetLines) {
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
    }

    await prisma.scopeRun.update({
      where: { id: runId },
      data: { status: 'suggested', meta: { count: suggestions.length, suggestions } },
    });

    res.json({ runId, suggestions });
  } catch (e) { next(e); }
});

router.get('/:projectId/scope-runs/:runId', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId || req.headers['x-tenant-id'] || req.headers['X-Tenant-Id'];
    const projectId = Number(req.params.projectId);
    const runId = Number(req.params.runId);

    const run = await prisma.scopeRun.findFirst({ where: { id: runId, tenantId, projectId } });
    if (!run) return res.status(404).json({ message: 'Scope run not found' });

    const suggestions = Array.isArray(run.meta?.suggestions) ? run.meta.suggestions : [];
    res.json({
      id: run.id,
      projectId: run.projectId,
      status: run.status,
      createdAt: run.createdAt,
      meta: run.meta,
      suggestions,
    });
  } catch (e) { next(e); }
});

module.exports = router;
