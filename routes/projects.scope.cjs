const router = require('express').Router({ mergeParams: true });
const { randomUUID } = require('crypto');
const { prisma } = require('../lib/prisma.js');
const { generatePackageSuggestions } = require('../lib/packageSuggestor.cjs');

const scopeRuns = new Map();
const scopeRunResults = new Map();

function getTenantId(req) {
  return req.user?.tenantId || req.tenantId || 'demo';
}

function normaliseKeywords(input = []) {
  if (!Array.isArray(input)) return [];
  return input
    .map((k) => String(k || '').trim().toLowerCase())
    .filter((k) => k.length > 1)
    .slice(0, 50);
}

router.post('/projects/:projectId/scope/runs', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id' });
    const project = await prisma.project.findFirst({ where: { tenantId, id: projectId }, select: { id: true } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { keywords = [], summary = '' } = req.body || {};
    const keywordList = normaliseKeywords(keywords);
    if (summary && keywordList.length < 5) {
      const fromSummary = String(summary)
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .filter((w) => w.length > 3)
        .slice(0, 20);
      for (const w of fromSummary) if (!keywordList.includes(w)) keywordList.push(w);
    }

    const run = {
      id: randomUUID(),
      tenantId,
      projectId,
      keywords: keywordList,
      summary: summary || null,
      createdAt: new Date().toISOString(),
      createdBy: req.user?.id || null,
      status: 'pending',
    };
    scopeRuns.set(run.id, run);
    res.status(201).json(run);
  } catch (err) {
    next(err);
  }
});

router.get('/projects/:projectId/scope/runs/:runId', (req, res) => {
  const run = scopeRuns.get(req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  const tenantId = getTenantId(req);
  if (run.projectId !== Number(req.params.projectId) || run.tenantId !== tenantId) {
    return res.status(403).json({ error: 'Run does not belong to project' });
  }
  const detail = scopeRunResults.get(run.id);
  res.json({
    ...run,
    status: detail ? 'ready' : run.status || 'pending',
    generatedAt: detail?.generatedAt ?? null,
    suggestions: detail?.suggestions ?? [],
    groups: detail?.groups ?? [],
    packages: detail?.packages ?? {},
  });
});

router.post('/projects/:projectId/scope/runs/:runId/suggest', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = Number(req.params.projectId);
    const run = scopeRuns.get(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.projectId !== projectId || run.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Run does not belong to project' });
    }

    const result = await generatePackageSuggestions({ prisma, tenantId, projectId });
    scopeRunResults.set(run.id, result);
    scopeRuns.set(run.id, { ...run, status: 'ready', generatedAt: result.generatedAt });
    res.json({ runId: run.id, status: 'ready', suggestionCount: result.suggestions.length });
  } catch (err) {
    next(err);
  }
});

router.get('/projects/:projectId/scope/runs/:runId/suggestions', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = Number(req.params.projectId);
    const limit = Math.min(Number(req.query.limit || 10), 50);
    const run = scopeRuns.get(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.projectId !== projectId || run.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Run does not belong to project' });
    }

    let detail = scopeRunResults.get(run.id);
    if (!detail) {
      detail = await generatePackageSuggestions({ prisma, tenantId, projectId });
      scopeRunResults.set(run.id, detail);
      scopeRuns.set(run.id, { ...run, status: 'ready', generatedAt: detail.generatedAt });
    }

    res.json({
      runId: run.id,
      projectId,
      generatedAt: detail.generatedAt,
      count: detail.suggestions.length,
      suggestions: detail.suggestions.slice(0, limit),
      groups: detail.groups,
      packages: detail.packages,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/projects/:projectId/scope/runs/:runId/accept', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = Number(req.params.projectId);
    const run = scopeRuns.get(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.projectId !== projectId || run.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Run does not belong to project' });
    }

    const { mappings = [], createPackages = [] } = req.body || {};

    const createdPackages = new Map();

    // Create new packages if needed
    for (const pkg of createPackages) {
      if (!pkg.code || pkg.code === 'UNASSIGNED') continue;

      if (pkg.code.startsWith('pkg:')) {
        const existingId = Number(pkg.code.slice(4));
        if (Number.isFinite(existingId)) {
          createdPackages.set(pkg.code, existingId);
        }
        continue;
      }

      const fallbackName = pkg.name || pkg.code.replace(/^new:/, '');
      const existingByName = await prisma.package.findFirst({
        where: { projectId, project: { tenantId }, name: fallbackName },
      });
      if (existingByName) {
        createdPackages.set(pkg.code, existingByName.id);
        continue;
      }

      const created = await prisma.package.create({
        data: {
          projectId,
          name: fallbackName,
          status: pkg.status || 'Draft',
          trade: pkg.trade || null,
          scopeSummary: pkg.scope || null,
        },
      });
      createdPackages.set(pkg.code, created.id);
    }

    // Apply mappings to budget lines
    for (const mapping of mappings) {
      const budgetId = Number(mapping.budgetId);
      if (!Number.isFinite(budgetId)) continue;

      const explicitId = Number(mapping.packageId);
      let targetPackageId = Number.isFinite(explicitId) ? explicitId : null;
      const code = mapping.packageCode || null;

      if (!targetPackageId && code) {
        if (code === 'UNASSIGNED') {
          targetPackageId = null;
        } else if (code.startsWith('pkg:')) {
          const idFromCode = Number(code.slice(4));
          if (Number.isFinite(idFromCode)) targetPackageId = idFromCode;
        } else if (createdPackages.has(code)) {
          targetPackageId = createdPackages.get(code);
        }
      }

      await prisma.packageItem.deleteMany({
        where: { tenantId, budgetLineId: budgetId },
      });

      if (targetPackageId) {
        await prisma.packageItem.create({
          data: {
            tenantId,
            packageId: targetPackageId,
            budgetLineId: budgetId,
          },
        });
      }
    }

    res.json({ success: true, applied: mappings.length, packagesCreated: createPackages.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
