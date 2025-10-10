const express = require('express');
const router = express.Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function getTenantId(req) {
  return req.user?.tenantId || req.tenantId;
}

function normaliseText(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s\/.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenise(value) {
  const normalised = normaliseText(value);
  if (!normalised) return [];
  return normalised.split(' ').filter(Boolean);
}

function overlapScore(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let matches = 0;
  for (const token of setA) {
    if (setB.has(token)) matches++;
  }
  const coverage = matches / Math.min(setA.size, setB.size);
  return coverage;
}

function sharedPrefixLength(codeA, codeB) {
  if (!codeA || !codeB) return 0;
  const aParts = String(codeA).split(/[-\s/.]/).filter(Boolean);
  const bParts = String(codeB).split(/[-\s/.]/).filter(Boolean);
  const max = Math.min(aParts.length, bParts.length);
  let shared = 0;
  for (let i = 0; i < max; i++) {
    if (aParts[i] !== bParts[i]) break;
    shared++;
  }
  return shared;
}

function scoreLine(line, tax) {
  let score = 0;
  const explain = [];
  const lineTokens = tokenise(`${line.code || ''} ${line.category || ''} ${line.description || ''}`);
  const taxTokens = tokenise(`${tax.code || ''} ${tax.description || ''}`);

  const prefix = sharedPrefixLength(line.code, tax.code);
  if (prefix > 0) {
    const boost = prefix * 18;
    score += boost;
    explain.push(`Shared code prefix x${prefix} (+${boost.toFixed(1)})`);
  }

  const categoryTokens = tokenise(line.category || '');
  if (categoryTokens.length) {
    const overlap = overlapScore(categoryTokens, taxTokens);
    if (overlap > 0) {
      const boost = overlap * 20;
      score += boost;
      explain.push(`Category overlap ${(overlap * 100).toFixed(0)}% (+${boost.toFixed(1)})`);
    }
  }

  const descriptionOverlap = overlapScore(lineTokens, taxTokens);
  if (descriptionOverlap > 0) {
    const boost = descriptionOverlap * 30;
    score += boost;
    explain.push(`Description overlap ${(descriptionOverlap * 100).toFixed(0)}% (+${boost.toFixed(1)})`);
  }

  if (tax.parent?.code && sharedPrefixLength(line.code, tax.parent.code) > 0) {
    score += 8;
    explain.push('Parent code prefix match (+8.0)');
  }

  const aiSource = line.aiSource || line.source || (line.description && /\bpdf heading\b/i.test(line.description) ? 'pdf-heading' : null);
  if (aiSource === 'pdf-heading' && descriptionOverlap > 0.25) {
    score += 10;
    explain.push('PDF heading boost (+10.0)');
  }

  const capped = Math.min(score, 100);
  const confidence = capped / 100;

  return {
    score: capped,
    confidence,
    explain,
    altCode: tax.parent?.code || null,
  };
}

async function rerankIfEnabled(line, ranked) {
  if (process.env.AI_SCOPE_RERANK === 'on' && Array.isArray(ranked) && ranked.length > 1) {
    return ranked
      .map((entry) => {
        const tokens = tokenise(`${line.description || ''}`);
        const taxTokens = tokenise(`${entry.t.code || ''} ${entry.t.description || ''}`);
        const density = overlapScore(tokens, taxTokens);
        const adjusted = entry.score + density * 5;
        const explain = density > 0.25
          ? [...entry.explain, `AI rerank density ${(density * 100).toFixed(0)}% (+${(density * 5).toFixed(1)})`]
          : entry.explain;
        return { ...entry, score: adjusted, explain };
      })
      .sort((a, b) => b.score - a.score);
  }
  return ranked;
}

router.post('/scope/assist/projects/:projectId/suggest', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
    const projectId = Number(req.params.projectId);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: 'invalid projectId' });

    const [lines, tax] = await Promise.all([
      prisma.budgetLine.findMany({
        where: { tenantId, projectId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          tenantId: true,
          projectId: true,
          code: true,
          category: true,
          description: true,
          amount: true,
        },
      }),
      prisma.costCode.findMany({
        where: { tenantId },
        select: {
          id: true,
          tenantId: true,
          code: true,
          description: true,
          parent: { select: { code: true, description: true } },
        },
      }),
    ]);

    const run = {
      id: Date.now(),
      projectId,
      tenantId,
      generatedAt: new Date().toISOString(),
      lineCount: lines.length,
    };

    const suggestions = [];

    for (const line of lines) {
      const rankedBase = tax
        .map((t) => ({ t, ...scoreLine(line, t) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score);

      const ranked = await rerankIfEnabled(line, rankedBase);

      if (!ranked.length) {
        suggestions.push({
          tenantId,
          scopeRunId: run.id,
          budgetId: line.id,
          suggestedCode: 'UNASSIGNED',
          altCode: null,
          confidence: '0.0000',
          explain: [],
        });
        continue;
      }

      const top = ranked[0];
      const alt = ranked[1] || null;
      const confidence = Math.min(1, Math.max(top.confidence ?? 0, top.score / 100));
      suggestions.push({
        tenantId,
        scopeRunId: run.id,
        budgetId: line.id,
        suggestedCode: top.t.code,
        altCode: alt ? alt.t.code : top.altCode ?? null,
        confidence: confidence.toFixed(4),
        explain: top.explain,
      });
    }

    res.json({ run, suggestions });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
