const express = require('express');
const router = express.Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

let customExtractPdfHeadings = null;
try {
  // Optional hook: consumers can provide richer PDF heading extraction without
  // breaking the default lightweight implementation below.
  // eslint-disable-next-line import/no-unresolved, global-require
  const maybe = require('../services/scope/pdfHeadings.cjs');
  if (maybe && typeof maybe.extractPdfHeadings === 'function') {
    customExtractPdfHeadings = maybe.extractPdfHeadings;
  }
} catch (_) {
  customExtractPdfHeadings = null;
}

const PDF_HEADING_RULES = {
  mechanical: {
    label: 'Mechanical',
    base: 1,
    lineBonus: 0.5,
    taxonKeywords: [
      'mechanical',
      'mep',
      'hvac',
      'ventilation',
      'ductwork',
      'pipework',
      'plumbing',
      'plant room',
      'sprinkler',
      'chiller',
    ],
    codePrefixes: ['M', 'ME', 'MP', '21', '22', '23'],
    lineKeywords: [
      'mechanical',
      'hvac',
      'ventilation',
      'duct',
      'pipe',
      'pump',
      'valve',
      'boiler',
      'chiller',
      'sprinkler',
    ],
  },
  electrical: {
    label: 'Electrical',
    base: 1,
    lineBonus: 0.5,
    taxonKeywords: [
      'electrical',
      'power',
      'lighting',
      'containment',
      'cabling',
      'switchboard',
      'distribution',
      'panelboard',
      'earthing',
    ],
    codePrefixes: ['E', 'EL', 'P', '26', '27', '41'],
    lineKeywords: [
      'electrical',
      'lighting',
      'cable',
      'containment',
      'tray',
      'conduit',
      'switch',
      'socket',
      'panel',
      'distribution',
    ],
  },
  roofing: {
    label: 'Roofing',
    base: 1,
    lineBonus: 0.5,
    taxonKeywords: [
      'roof',
      'roofing',
      'rooflight',
      'membrane',
      'cladding',
      'fascia',
      'soffit',
      'gutter',
      'flashing',
    ],
    codePrefixes: ['R', 'RF', '71', '72', '73'],
    lineKeywords: [
      'roof',
      'roofing',
      'membrane',
      'tile',
      'slate',
      'gutter',
      'fascia',
      'soffit',
      'flashing',
      'rooflight',
    ],
  },
};

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

function detectHeadingCategories(rawHeading) {
  if (!rawHeading) return [];
  const value = String(rawHeading).toUpperCase();
  const categories = new Set();
  if (/\bM&E\b/.test(value)) {
    categories.add('mechanical');
    categories.add('electrical');
  }
  if (/(MECH|HVAC|PLUMBING|SPRINKLER)/.test(value)) categories.add('mechanical');
  if (/(ELEC|LV\b|HV\b|POWER|LIGHTING)/.test(value)) categories.add('electrical');
  if (/ROOF/.test(value)) categories.add('roofing');
  return Array.from(categories);
}

function parseHeadingEntry(lineIdRaw, entry) {
  const numericId = Number(lineIdRaw);
  if (!Number.isFinite(numericId)) return null;
  if (entry == null) return null;
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    return { id: numericId, raw: trimmed, categories: detectHeadingCategories(trimmed) };
  }
  if (typeof entry === 'object') {
    const raw = [entry.heading, entry.raw, entry.title, entry.name, entry.label, entry.category, entry.value]
      .map((v) => (v == null ? '' : String(v).trim()))
      .find((v) => v);
    if (!raw) return null;
    const catSource = entry.category || entry.group || entry.type || raw;
    const categories = detectHeadingCategories(catSource);
    const lineId = Number(entry.budgetId ?? entry.lineId ?? entry.id ?? numericId);
    if (!Number.isFinite(lineId)) return null;
    return { id: lineId, raw, categories };
  }
  return null;
}

function normaliseHeadingResult(result) {
  const map = new Map();
  if (!result) return map;
  if (result instanceof Map) {
    for (const [lineId, entry] of result.entries()) {
      const parsed = parseHeadingEntry(lineId, entry);
      if (parsed) map.set(parsed.id, { raw: parsed.raw, categories: parsed.categories });
    }
    return map;
  }
  if (Array.isArray(result)) {
    for (const entry of result) {
      if (!entry) continue;
      const parsed = parseHeadingEntry(entry.lineId ?? entry.budgetId ?? entry.id, entry);
      if (parsed) map.set(parsed.id, { raw: parsed.raw, categories: parsed.categories });
    }
    return map;
  }
  if (typeof result === 'object') {
    for (const [lineId, entry] of Object.entries(result)) {
      const parsed = parseHeadingEntry(lineId, entry);
      if (parsed) map.set(parsed.id, { raw: parsed.raw, categories: parsed.categories });
    }
    return map;
  }
  return map;
}

function defaultExtractPdfHeadings(lines) {
  const map = new Map();
  for (const line of lines) {
    if (!line || line.id == null) continue;
    const heading = line.category || line.groupName || line.section || line.pdfHeading;
    if (!heading) continue;
    const raw = String(heading).trim();
    if (!raw) continue;
    const categories = detectHeadingCategories(raw);
    if (!categories.length) continue;
    map.set(line.id, { raw, categories });
  }
  return map;
}

async function extractPdfHeadings(lines, context) {
  if (typeof customExtractPdfHeadings === 'function') {
    try {
      const result = await customExtractPdfHeadings(lines, context);
      const normalised = normaliseHeadingResult(result);
      if (normalised.size) return normalised;
    } catch (error) {
      console.warn('scope.assist pdf heading hook failed', error?.message || error);
    }
  }
  return defaultExtractPdfHeadings(lines);
}

function computeHeadingRuleBoost(rule, heading, line, taxon, tokens) {
  if (!rule) return null;
  const taxonText = normaliseText(`${taxon.code || ''} ${taxon.description || ''}`);
  const matchesTaxonKeyword = rule.taxonKeywords.some((kw) => taxonText.includes(kw));
  const code = String(taxon.code || '').toUpperCase();
  const matchesCode = rule.codePrefixes.some((pref) => code.startsWith(pref));
  if (!matchesTaxonKeyword && !matchesCode) return null;
  const matchesLineKeyword = tokens.some((token) => rule.lineKeywords.some((kw) => token.includes(kw)));
  const bonus = rule.base + (matchesLineKeyword ? rule.lineBonus : 0);
  if (!bonus) return null;
  const detail = [];
  if (matchesCode) detail.push('code match');
  if (matchesTaxonKeyword && !matchesCode) detail.push('taxon keyword');
  if (matchesLineKeyword) detail.push('line keyword');
  return { heading, bonus, detail: detail.join(' + '), label: rule.label };
}

function pdfHeadingBoosts(headingInfo, line, taxon, tokens) {
  if (!headingInfo || !Array.isArray(headingInfo.categories)) return [];
  const boosts = [];
  for (const category of headingInfo.categories) {
    const rule = PDF_HEADING_RULES[category];
    if (!rule) continue;
    const boost = computeHeadingRuleBoost(rule, headingInfo.raw, line, taxon, tokens);
    if (boost) {
      boosts.push({
        type: category,
        heading: headingInfo.raw,
        bonus: boost.bonus,
        detail: boost.detail,
        label: boost.label,
      });
    }
  }
  return boosts;
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

function scoreLine(line, taxon, opts = {}) {
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

  if (opts.headingInfo) {
    const boosts = pdfHeadingBoosts(opts.headingInfo, line, taxon, toks);
    for (const boost of boosts) {
      score += boost.bonus;
      hits.push({
        type: 'pdfHeading',
        heading: boost.heading,
        category: boost.type,
        bonus: boost.bonus,
        detail: boost.detail,
        label: boost.label,
      });
    }
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
    case 'pdfHeading': {
      const parts = [];
      if (hit.label) parts.push(`${hit.label} heading`);
      else parts.push('PDF heading');
      if (hit.heading) parts.push(`"${hit.heading}"`);
      if (hit.detail) parts.push(`(${hit.detail})`);
      if (typeof hit.bonus === 'number') parts.push(`+${hit.bonus.toFixed(2)}`);
      return parts.filter(Boolean).join(' ');
    }
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

    const pdfHeadings = await extractPdfHeadings(lines, { tenantId, projectId, prisma });

    for (const line of lines) {
      const headingInfo = pdfHeadings.get(line.id);
      const rankedBase = tax
        .map((t) => {
          const { score, hits } = scoreLine(line, t, { headingInfo });
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
