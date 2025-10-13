const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');

// In-memory fallbacks when Prisma models aren't generated/migrated yet
const mem = {
  runs: new Map(),          // key: runId -> { id, tenantId, projectId, status, createdById }
  suggestions: new Map(),   // key: runId -> [{ tenantId, scopeRunId, budgetId, suggestedCode, altCode, confidence, explain }]
};

function hasModel(name) {
  try { return !!(prisma && prisma[name] && typeof prisma[name].findFirst === 'function'); }
  catch { return false; }
}

const DEFAULT_TAXONOMY = [
  { code: 'PRELIM', name: 'Preliminaries', keywords: ['welfare','hoarding','scaffold'], costCodePrefixes: ['01-'] },
  { code: 'GROUND', name: 'Groundworks', keywords: ['excavate','trench','pile','blinding'], costCodePrefixes: ['02-'] },
  { code: 'RC', name: 'Reinforced Concrete', keywords: ['rebar','formwork','shutter','slab'], costCodePrefixes: ['04-','02-015'] },
  { code: 'STEEL', name: 'Structural Steel', keywords: ['steelwork','beams','columns','connections'], costCodePrefixes: ['03-'] },
  { code: 'ROOF', name: 'Roofing', keywords: ['roof','membrane','gutter','soffit'], costCodePrefixes: ['06-'] },
  { code: 'ENVELOPE', name: 'Envelope', keywords: ['cladding','curtain','glazing','facade'], costCodePrefixes: ['05-','07-'] },
  { code: 'MEP', name: 'M&E', keywords: ['ductwork','ahu','chiller','boiler','containment','cable','switchgear','sprinkler'], costCodePrefixes: ['08-'] },
  { code: 'FITOUT', name: 'Fit-Out', keywords: ['partition','plasterboard','joinery','doorset','carpet','vinyl','paint'], costCodePrefixes: ['09-','11-','12-'] },
];

// Feature flag gate (minimal)
async function ensureFeature(req, res, next) {
  try {
    const ff = (req.user?.features || req.user?.tenantFeatures || []);
    if (ff && Array.isArray(ff) && (ff.includes('tendering') || ff.includes('ai_scope'))) return next();
    if (String(req.user?.tenantId || '').toLowerCase() === 'demo') return next();
    return res.status(403).json({ error: 'FEATURE_DISABLED' });
  } catch (e) { return res.status(403).json({ error: 'FEATURE_DISABLED' }); }
}

// Naive PDF heading extractor using existing stored text or filenames
async function extractPdfHeadings(prisma, tenantId, projectId) {
  try {
    // Prefer project-linked documents via DocumentLink -> Document join
    const links = await prisma.documentLink.findMany({
      where: { tenantId, projectId },
      select: { document: { select: { id: true, filename: true, mimeType: true /*, textExtract: true (if present) */ } } },
    }).catch(() => []);
    const pdfs = (links || [])
      .map(l => l.document)
      .filter(d => d && String(d.mimeType || '').includes('pdf'));

    const headings = new Set();
    const tryAdd = (s) => s && String(s).toUpperCase()
      .split(/[^A-Z]/).filter(Boolean).forEach((t) => headings.add(t));

    for (const d of pdfs) {
      // If a textExtract or OCR text is ever added, parse first ~400 lines here
      // For now, rely on filename tokens as a weak signal
      tryAdd(d.filename);
    }
    return Array.from(headings);
  } catch (_) {
    return [];
  }
}

// Optional re-ranker toggle (simple bag-of-words cosine sim)
const useRerank = String(process.env.AI_SCOPE_RERANK || 'off').toLowerCase() === 'on';
function simpleEmbedding(text) {
  const m = new Map();
  tokenize(String(text || '')).slice(0, 128).forEach((t) => m.set(t, (m.get(t) || 0) + 1));
  return m;
}
function cosineSim(a, b) {
  let dot = 0, a2 = 0, b2 = 0;
  for (const [k, v] of a) { a2 += v * v; if (b.has(k)) dot += v * b.get(k); }
  for (const v of b.values()) b2 += v * v;
  const den = Math.sqrt(a2 || 1) * Math.sqrt(b2 || 1);
  return den ? (dot / den) : 0;
}
function rerank(line, ranked) {
  if (!useRerank || !Array.isArray(ranked) || ranked.length < 2) return ranked;
  const lv = simpleEmbedding(`${line.description || ''} ${(line.notes || '')}`);
  const top = ranked.slice(0, 3).map((r) => {
    const blob = `${r.t.name || ''} ${(r.t.keywords || []).join(' ')} ${(r.t.costCodePrefixes || []).join(' ')}`;
    const sim = cosineSim(lv, simpleEmbedding(blob));
    return { ...r, score: r.score + sim * 2, _sim: sim, hits: (r.hits || []) };
  }).sort((a, b) => b.score - a.score);
  return top.concat(ranked.slice(3));
}

router.post('/projects/:projectId/scope-runs', requireAuth, ensureFeature, async (req, res) => {
  const tenantId = String(req.user.tenantId);
  const projectId = Number(req.params.projectId);
  if (hasModel('scopeRun')) {
    const run = await prisma.scopeRun.create({
      data: { tenantId, projectId, status: 'draft', createdById: req.user.id || null }
    });
    await prisma.auditLog?.create?.({ data: { tenantId, userId: req.user.id, entity: 'ScopeRun', entityId: String(run.id), action: 'CREATE', changes: { status: 'draft' }}}).catch(()=>{});
    return res.json(run);
  }
  // Fallback: ephemeral run
  const id = Date.now();
  const run = { id, tenantId, projectId, status: 'draft', createdById: req.user.id || null };
  mem.runs.set(id, run);
  return res.json(run);
});

// Simple tokenizer & scorer (no new deps)
function tokenize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function scoreLine(line, taxon) {
  let score = 0;
  const toks = tokenize(line.description);
  const keywords = Array.isArray(taxon.keywords) ? taxon.keywords : [];
  const prefixes = Array.isArray(taxon.costCodePrefixes) ? taxon.costCodePrefixes : [];

  // keyword hits
  const hits = [];
  for (const kw of keywords) {
    const k = String(kw).toLowerCase();
    if (toks.includes(k)) { score += 1; hits.push({ type: 'keyword', token: kw }); }
  }
  // cost code boosts
  const code = (line.costCode?.code || line.costCode || '').toString();
  for (const p of prefixes) {
    if (code.startsWith(p)) { score += 2; hits.push({ type: 'costCode', prefix: p }); }
  }
  // PDF heading boosts (if any)
  if (Array.isArray(line.__pdfHeadings)) {
    for (const h of line.__pdfHeadings) {
      const H = String(h).toUpperCase();
      if ((H.includes('MECHANICAL') || H.includes('ELECTRICAL')) && taxon.code === 'MEP') { score += 1; hits.push({ type: 'heading', value: h }); }
      if (H.includes('ROOF') && (taxon.code === 'ROOF' || String(taxon.name || '').toUpperCase().includes('ROOF'))) { score += 1; hits.push({ type: 'heading', value: h }); }
      if (H.includes('STRUCTURAL') && (taxon.code === 'STEEL' || taxon.code === 'RC')) { score += 1; hits.push({ type: 'heading', value: h }); }
      if (H.includes('CIVILS') && taxon.code === 'GROUND') { score += 1; hits.push({ type: 'heading', value: h }); }
    }
  }
  return { score, hits };
}

router.post('/projects/:projectId/scope-runs/:runId/suggest', requireAuth, ensureFeature, async (req, res) => {
  const tenantId = String(req.user.tenantId);
  const projectId = Number(req.params.projectId);
  const runId = Number(req.params.runId);

  let run;
  if (hasModel('scopeRun')) run = await prisma.scopeRun.findFirst({ where: { id: runId, tenantId, projectId } });
  else run = mem.runs.get(runId);
  if (!run) return res.status(404).json({ error: 'RUN_NOT_FOUND' });

  let tax = [];
  if (hasModel('packageTaxonomy')) {
    tax = await prisma.packageTaxonomy.findMany({ where: { tenantId, isActive: true } });
  }
  if (!tax.length) tax = DEFAULT_TAXONOMY;

  const lines = await prisma.budgetLine.findMany({
    where: { tenantId, projectId },
    include: { costCode: { select: { code: true } } }
  });

  // Extract PDF headings once and attach as a light hint
  const pdfHeadings = await extractPdfHeadings(prisma, tenantId, projectId);
  for (const ln of lines) ln.__pdfHeadings = pdfHeadings;

  const suggestions = [];
  for (const line of lines) {
    let ranked = tax.map(t => ({ t, ...scoreLine(line, t) }))
                    .filter(r => r.score > 0)
                    .sort((a,b)=> b.score - a.score);
    ranked = rerank(line, ranked);
    if (!ranked.length) continue; // skip lines with no signal
    const best = ranked[0];
    const alt = ranked[1];
    const total = Math.max(1, best.score + (alt?.score || 0));
    const conf = Math.min(1, best.score / total); // crude normalization

    const hitList = Array.isArray(best.hits) ? best.hits.slice() : [];
    if (best._sim) hitList.push({ type: 'rerank', value: Number(best._sim.toFixed(2)) });
    suggestions.push({
      tenantId,
      scopeRunId: run.id,
      budgetId: line.id,
      suggestedCode: best.t.code,
      altCode: alt?.t?.code || null,
      confidence: Number(conf.toFixed(4)),
      explain: hitList
    });
  }

  if (suggestions.length) {
    if (hasModel('scopeSuggestion')) {
      await prisma.scopeSuggestion.createMany({ data: suggestions });
    } else {
      mem.suggestions.set(run.id, suggestions);
    }
  }

  await prisma.auditLog?.create?.({ data: { tenantId, userId: req.user.id, entity: 'ScopeRun', entityId: String(run.id), action: 'SUGGEST', changes: { count: suggestions.length }}}).catch(()=>{});
  res.json({ runId: run.id, count: suggestions.length });
});

router.get('/projects/:projectId/scope-runs/:runId', requireAuth, ensureFeature, async (req, res) => {
  const tenantId = String(req.user.tenantId);
  const projectId = Number(req.params.projectId);
  const runId = Number(req.params.runId);

  let run;
  if (hasModel('scopeRun')) run = await prisma.scopeRun.findFirst({ where: { id: runId, tenantId, projectId } });
  else run = mem.runs.get(runId);
  if (!run) return res.status(404).json({ error: 'RUN_NOT_FOUND' });

  let items = [];
  if (hasModel('scopeSuggestion')) items = await prisma.scopeSuggestion.findMany({ where: { tenantId, scopeRunId: run.id } });
  else items = mem.suggestions.get(run.id) || [];
  res.json({ run, items });
});

router.patch('/projects/:projectId/scope-runs/:runId/accept', requireAuth, ensureFeature, async (req, res) => {
  const tenantId = String(req.user.tenantId);
  const projectId = Number(req.params.projectId);
  const runId = Number(req.params.runId);
  const { mappings = [], createPackages = [] } = req.body || {};

  let run;
  if (hasModel('scopeRun')) run = await prisma.scopeRun.findFirst({ where: { id: runId, tenantId, projectId } });
  else run = mem.runs.get(runId);
  if (!run) return res.status(404).json({ error: 'RUN_NOT_FOUND' });

  // Persist final choices to ScopeSuggestion or in-memory
  if (hasModel('scopeSuggestion')) {
    for (const m of mappings) {
      await prisma.scopeSuggestion.updateMany({
        where: { tenantId, scopeRunId: run.id, budgetId: Number(m.budgetId) },
        data: { acceptedCode: String(m.packageCode) }
      });
    }
  } else {
    const cur = mem.suggestions.get(run.id) || [];
    for (const m of mappings) {
      const idx = cur.findIndex(x => Number(x.budgetId) === Number(m.budgetId));
      if (idx >= 0) cur[idx] = { ...cur[idx], acceptedCode: String(m.packageCode) };
    }
    mem.suggestions.set(run.id, cur);
  }

  // Ensure Packages exist for all accepted codes
  let accepted = [];
  if (hasModel('scopeSuggestion')) {
    accepted = await prisma.scopeSuggestion.findMany({ where: { tenantId, scopeRunId: run.id, NOT: { acceptedCode: null } } });
  } else {
    const cur = mem.suggestions.get(run.id) || [];
    accepted = cur.filter(x => x.acceptedCode);
  }
  const codes = [...new Set(accepted.map(a => a.acceptedCode))];

  const codeToPackageId = new Map();
  for (const c of codes) {
    // Find by taxonomy code stored in tradeCategory
    let pkg = await prisma.package.findFirst({ where: { projectId, tradeCategory: c } }).catch(()=>null);
    if (!pkg) {
      const wanted = createPackages.find(p => p.code === c) || {};
      pkg = await prisma.package.create({ data: { projectId, name: wanted.name || c, tradeCategory: c, budgetEstimate: 0 } });
    }
    codeToPackageId.set(c, pkg.id);
  }

  // Link budget lines via PackageItem
  const toLink = [];
  for (const a of accepted) {
    const packageId = codeToPackageId.get(a.acceptedCode);
    if (!packageId) continue;
    toLink.push({ packageId, budgetLineId: a.budgetId });
  }
  if (toLink.length) await prisma.packageItem.createMany({ data: toLink, skipDuplicates: true }).catch(async()=>{
    // fallback to individual inserts for older Prisma/DBs
    for (const it of toLink) { try { await prisma.packageItem.create({ data: it }); } catch {} }
  });

  // Roll up budget totals per package (update budgetEstimate)
  for (const [code, packageId] of codeToPackageId.entries()) {
    const items = await prisma.packageItem.findMany({ where: { packageId }, include: { budgetLine: { select: { amount: true } } } });
    const total = items.reduce((s, li) => s + Number(li?.budgetLine?.amount || 0), 0);
    await prisma.package.update({ where: { id: packageId }, data: { budgetEstimate: total } });
  }

  if (hasModel('scopeRun')) await prisma.scopeRun.update({ where: { id: run.id }, data: { status: 'approved' } });
  else mem.runs.set(run.id, { ...run, status: 'approved' });
  await prisma.auditLog?.create?.({ data: { tenantId, userId: req.user.id, entity: 'ScopeRun', entityId: String(run.id), action: 'APPROVE', changes: { packages: codes.length }}}).catch(()=>{});

  res.json({ ok: true, packages: codes.length, linked: toLink.length });
});

module.exports = router;
