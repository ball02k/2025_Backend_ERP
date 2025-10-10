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

function tokenize(value) {
  return tokenise(value);
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

function scoreLine(line, taxon) {
  let score = 0;
  const hits = [];

  const text = `${line.description || ''} ${line.notes || ''}`.toLowerCase();
  const toks = tokenize(text);
  const stems = toks.map(t => t.replace(/(ing|ed|es|s)$/,''));
  const keywords = Array.isArray(taxon.keywords) ? taxon.keywords : [];
  const prefixes = Array.isArray(taxon.costCodePrefixes) ? taxon.costCodePrefixes : [];

  // 2.1 keyword / stem / substring
  for (const kw of keywords) {
    const k = String(kw).toLowerCase();
    const ks = k.replace(/(ing|ed|es|s)$/,'');
    const hit = toks.includes(k) || stems.includes(ks) || toks.some(t => t.startsWith(ks));
    if (hit) { score += 1; hits.push({ type: 'keyword', token: kw }); }
  }

  // 2.2 cost-code hierarchy (e.g., '08-' strong, '08' weak)
  const code = (line.costCode?.code || line.costCode || '').toString();
  for (const p of prefixes) {
    const pref = String(p);
    if (code.startsWith(pref)) { score += 2; hits.push({ type:'costCode', prefix: pref }); }
    else if (pref.endsWith('-') && code.startsWith(pref.slice(0,-1))) {
      score += 1; hits.push({ type:'costCodeGroup', prefix: pref.slice(0,-1) });
    }
  }

  // 2.3 unit/context nudges
  const unit = String(line.unit||'').toLowerCase();
  if ((unit==='t' || unit==='m3') && /rebar|concrete|slab/.test(text) && (taxon.code==='RC')) {
    score += 0.5; hits.push({ type:'unit', value:unit });
  }
  if (unit==='hr' && /test|commission/.test(text) && (taxon.code==='MEP' || taxon.code==='FITOUT')) {
    score += 0.25; hits.push({ type:'unit', value:unit });
  }

  return { score, hits };
}

function formatHit(hit) {
  switch (hit.type) {
    case 'keyword':
      return `Matched keyword "${hit.token}"`;
    case 'costCode':
      return `Cost code starts with ${hit.prefix}`;
    case 'costCodeGroup':
      return `Cost code group ${hit.prefix}`;
    case 'unit':
      return `Unit hint (${hit.value})`;
    default:
      return 'Heuristic match';
  }
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
        .map((t) => {
          const { score, hits } = scoreLine(line, t);
          const explain = hits.map(formatHit);
          const confidence = Math.min(1, score / 5);
          return { t, score, hits, explain, confidence, altCode: null };
        })
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

      const best = ranked[0];
      const alt = ranked[1] || null;
      const total = Math.max(1, best.score + (alt?.score || 0));
      const fallbackConfidence = best.confidence ?? Math.min(1, best.score / 5);
      const confidence = Math.min(fallbackConfidence, Math.min(1, best.score / total));
      suggestions.push({
        tenantId,
        scopeRunId: run.id,
        budgetId: line.id,
        suggestedCode: best.t.code,
        altCode: alt ? alt.t.code : best.altCode ?? null,
        confidence: confidence.toFixed(4),
        explain: best.explain,
      });
    }

    res.json({ run, suggestions });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
