const router = require('express').Router({ mergeParams: true });
const { randomUUID } = require('crypto');
const { prisma } = require('../lib/prisma.js');

const scopeRuns = new Map();

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
  res.json(run);
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

    const packages = await prisma.package.findMany({
      where: { projectId, project: { tenantId } },
      include: {
        awardSupplier: { select: { id: true, name: true } },
        contracts: {
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { supplier: { select: { id: true, name: true } } },
        },
      },
    });

    const keywords = new Set(run.keywords || []);
    const scored = packages.map((pkg) => {
      const haystack = [pkg.name, pkg.scopeSummary, pkg.trade, pkg.status]
        .concat(pkg.contracts.map((c) => c.title))
        .join(' ') // combine
        .toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (kw && haystack.includes(kw)) score += 1;
      }
      return {
        package: {
          id: pkg.id,
          name: pkg.name,
          scopeSummary: pkg.scopeSummary,
          scope: pkg.scopeSummary,
          trade: pkg.trade,
          status: pkg.status,
          awardSupplier: pkg.awardSupplier ? { id: pkg.awardSupplier.id, name: pkg.awardSupplier.name } : null,
          contract: pkg.contracts[0]
            ? {
                id: pkg.contracts[0].id,
                title: pkg.contracts[0].title,
                status: pkg.contracts[0].status,
                supplier: pkg.contracts[0].supplier
                  ? { id: pkg.contracts[0].supplier.id, name: pkg.contracts[0].supplier.name }
                  : null,
              }
            : null,
        },
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score || a.package.name.localeCompare(b.package.name));
    res.json({ runId: run.id, projectId, count: scored.length, items: scored.slice(0, limit) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
