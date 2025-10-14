const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');

// ---- Feature flag gate (tendering or ai_scope) ----
async function ensureFeature(req, res, next) {
  try {
    const ff = (req.user?.features || req.user?.tenantFeatures || []);
    if (Array.isArray(ff) && (ff.includes('tendering') || ff.includes('ai_scope'))) return next();
    if (String(req.user?.tenantId || '').toLowerCase() === 'demo') return next();
    return res.status(403).json({ error: 'FEATURE_DISABLED' });
  } catch { return res.status(403).json({ error: 'FEATURE_DISABLED' }); }
}

// ---- Utils ----
function tokenize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-\s]/g, ' ')
    .split(/\s+/).filter(Boolean);
}

// Optional: PDF heading signal (safe no-op if Document.textExtract absent)
async function extractPdfHeadings(prisma, tenantId, projectId) {
  try {
    const links = await prisma.documentLink.findMany({
      where: { tenantId, projectId },
      select: { document: { select: { filename: true, mimeType: true } } }
    }).catch(()=>[]);
    const headings = new Set();
    const tryAdd = (s)=> s && String(s).toUpperCase().split(/[^A-Z]/).filter(Boolean).forEach(t=> headings.add(t));
    for (const l of links) {
      const d = l.document; if (!d) continue;
      if (String(d.mimeType||'').includes('pdf')) { tryAdd(d.filename); }
    }
    return Array.from(headings);
  } catch { return []; }
}

// Optional: simple re-ranker (flagged)
const useRerank = String(process.env.AI_SCOPE_RERANK || 'off').toLowerCase() === 'on';
function simpleEmbedding(text) { const m=new Map(); tokenize(text).slice(0,128).forEach(t=>m.set(t,(m.get(t)||0)+1)); return m; }
function cosineSim(a,b){ let dot=0,a2=0,b2=0; for(const [k,v] of a){a2+=v*v; if(b.has(k)) dot+=v*b.get(k);} for(const v of b.values()) b2+=v*v; return (Math.sqrt(a2||1)*Math.sqrt(b2||1)) ? (dot/(Math.sqrt(a2||1)*Math.sqrt(b2||1))) : 0; }
function rerank(line, ranked){
  if(!useRerank || ranked.length<2) return ranked;
  const lv = simpleEmbedding(`${line.description||''} ${line.notes||''}`);
  const top = ranked.slice(0,3).map(r => {
    const blob = `${r.t.name} ${(r.t.keywords||[]).join(' ')} ${(r.t.costCodePrefixes||[]).join(' ')}`;
    const sim = cosineSim(lv, simpleEmbedding(blob));
    return { ...r, score: r.score + sim*2, _sim: sim };
  }).sort((a,b)=> b.score - a.score);
  return top.concat(ranked.slice(3));
}

// ---- Smarter scorer (keywords + stems + cost-code hierarchy + tiny unit nudges + pdf heading boosts) ----
function scoreLine(line, taxon) {
  let score = 0; const hits = [];
  const text = `${line.description || ''} ${line.notes || ''}`.toLowerCase();
  const toks = tokenize(text);
  const stems = toks.map(t => t.replace(/(ing|ed|es|s)$/,''));
  const keywords = Array.isArray(taxon.keywords) ? taxon.keywords : [];
  const prefixes = Array.isArray(taxon.costCodePrefixes) ? taxon.costCodePrefixes : [];

  // 1) keyword/stem/substring
  for (const kw of keywords) {
    const k = String(kw).toLowerCase();
    const ks = k.replace(/(ing|ed|es|s)$/,'');
    const hit = toks.includes(k) || stems.includes(ks) || toks.some(t => t.startsWith(ks));
    if (hit) { score += 1; hits.push({ type:'keyword', token: kw }); }
  }

  // 2) cost-code hierarchy
  const code = (line.costCode?.code || line.costCode || '').toString();
  for (const p of prefixes) {
    const pref = String(p);
    if (code.startsWith(pref)) { score += 2; hits.push({ type:'costCode', prefix: pref }); }
    else if (pref.endsWith('-') && code.startsWith(pref.slice(0,-1))) { score += 1; hits.push({ type:'costCodeGroup', prefix: pref.slice(0,-1) }); }
  }

  // 3) unit nudges
  const unit = String(line.unit||'').toLowerCase();
  if ((unit==='t' || unit==='m3') && /rebar|concrete|slab/.test(text) && taxon.code==='RC') { score += 0.5; hits.push({type:'unit', value:unit}); }
  if (unit==='hr' && /test|commission/.test(text) && (taxon.code==='MEP' || taxon.code==='FITOUT')) { score += 0.25; hits.push({type:'unit', value:unit}); }

  // 4) pdf heading boosts (if present on line)
  if (Array.isArray(line.__pdfHeadings)) {
    for (const h of line.__pdfHeadings) {
      const H = String(h).toUpperCase();
      if ((H.includes('MECHANICAL')||H.includes('ELECTRICAL')) && taxon.code==='MEP') { score+=1; hits.push({type:'heading', value:h}); }
      if (H.includes('ROOF') && (taxon.code==='ROOF' || taxon.name?.toUpperCase().includes('ROOF'))) { score+=1; hits.push({type:'heading', value:h}); }
      if (H.includes('STRUCTURAL') && (taxon.code==='STEEL' || taxon.code==='RC')) { score+=1; hits.push({type:'heading', value:h}); }
      if (H.includes('CIVILS') && taxon.code==='GROUND') { score+=1; hits.push({type:'heading', value:h}); }
    }
  }

  return { score, hits };
}

// ---- Routes ----
router.post('/projects/:projectId/scope-runs', requireAuth, ensureFeature, async (req, res) => {
  const tenantId = String(req.user.tenantId);
  const projectId = Number(req.params.projectId);
  const run = await prisma.scopeRun.create({ data: { tenantId, projectId, status: 'draft', createdById: req.user.id || null }});
  await prisma.auditLog?.create?.({ data: { tenantId, userId: req.user.id, entity:'ScopeRun', entityId: String(run.id), action:'CREATE', changes:{ status:'draft' }}}).catch(()=>{});
  res.json(run);
});

router.post('/projects/:projectId/scope-runs/:runId/suggest', requireAuth, ensureFeature, async (req, res) => {
  const tenantId = String(req.user.tenantId);
  const projectId = Number(req.params.projectId);
  const runId = Number(req.params.runId);

  const run = await prisma.scopeRun.findFirst({ where: { id: runId, tenantId, projectId } });
  if (!run) return res.status(404).json({ error:'RUN_NOT_FOUND' });

  const tax = await prisma.packageTaxonomy.findMany({ where: { tenantId, isActive:true } });
  if (!tax.length) return res.status(400).json({ error:'NO_TAXONOMY' });

  const lines = await prisma.budgetLine.findMany({
    where: { tenantId, projectId },
    include: { costCode: { select: { code: true } } }
  });

  // Optional PDF headings (lightweight)
  const pdfHeadings = await extractPdfHeadings(prisma, tenantId, projectId);
  for (const line of lines) line.__pdfHeadings = pdfHeadings;

  const suggestions = [];
  for (const line of lines) {
    let ranked = tax.map(t => ({ t, ...scoreLine(line, t) }))
                    .filter(r => r.score > 0)
                    .sort((a,b)=> b.score - a.score);
    // Optional re-rank
    ranked = rerank(line, ranked);

    // Always emit a suggestion; if no signal, set UNASSIGNED
    if (!ranked.length) {
      suggestions.push({
        tenantId, scopeRunId: run.id, budgetId: line.id,
        suggestedCode: 'UNASSIGNED', altCode: null,
        confidence: '0.0000', explain: []
      });
      continue;
    }

    const best = ranked[0];
    const alt  = ranked[1];
    const total = Math.max(1, best.score + (alt?.score || 0));
    const conf  = Math.min(1, best.score / total);

    const explain = (best.hits || []).slice();
    if (best._sim) explain.push({ type:'rerank', value: best._sim.toFixed(2) });

    suggestions.push({
      tenantId,
      scopeRunId: run.id,
      budgetId: line.id,
      suggestedCode: best.t.code,
      altCode: alt?.t?.code || null,
      confidence: conf.toFixed(4),
      explain
    });
  }

  if (suggestions.length) await prisma.scopeSuggestion.createMany({ data: suggestions });
  await prisma.auditLog?.create?.({ data: { tenantId, userId: req.user.id, entity:'ScopeRun', entityId: String(run.id), action:'SUGGEST', changes:{ count: suggestions.length }}}).catch(()=>{});
  res.json({ runId: run.id, count: suggestions.length });
});

router.get('/projects/:projectId/scope-runs/:runId', requireAuth, ensureFeature, async (req, res) => {
  const tenantId = String(req.user.tenantId);
  const projectId = Number(req.params.projectId);
  const runId = Number(req.params.runId);
  const run = await prisma.scopeRun.findFirst({ where: { id: runId, tenantId, projectId } });
  if (!run) return res.status(404).json({ error:'RUN_NOT_FOUND' });
  const items = await prisma.scopeSuggestion.findMany({ where: { tenantId, scopeRunId: run.id } });
  res.json({ run, items });
});

router.patch('/projects/:projectId/scope-runs/:runId/accept', requireAuth, ensureFeature, async (req, res) => {
  const tenantId = String(req.user.tenantId);
  const projectId = Number(req.params.projectId);
  const runId = Number(req.params.runId);
  const { mappings = [], createPackages = [] } = req.body || {};

  const run = await prisma.scopeRun.findFirst({ where: { id: runId, tenantId, projectId } });
  if (!run) return res.status(404).json({ error:'RUN_NOT_FOUND' });

  for (const m of mappings) {
    await prisma.scopeSuggestion.updateMany({
      where: { tenantId, scopeRunId: run.id, budgetId: Number(m.budgetId) },
      data: { acceptedCode: String(m.packageCode) }
    });
  }

  const accepted = await prisma.scopeSuggestion.findMany({
    where: { tenantId, scopeRunId: run.id, NOT: { acceptedCode: null } }
  });
  const codes = [...new Set(accepted.map(a => a.acceptedCode))];

  const idByCode = new Map();
  for (const c of codes) {
    if (c === 'UNASSIGNED') continue; // don't create a package for UNASSIGNED
    // In this schema, store taxonomy code in tradeCategory; use name as fallback
    let pkg = await prisma.package.findFirst({ where: { projectId, tradeCategory: c } });
    if (!pkg) {
      const wanted = createPackages.find(p => p.code === c);
      pkg = await prisma.package.create({ data: { projectId, name: wanted?.name || c, tradeCategory: c, budgetEstimate: 0 } });
    }
    idByCode.set(c, pkg.id);
  }

  const toLink = [];
  for (const a of accepted) {
    const packageId = idByCode.get(a.acceptedCode);
    if (!packageId) continue; // stays unlinked if UNASSIGNED
    toLink.push({ packageId, budgetLineId: a.budgetId });
  }
  if (toLink.length) await prisma.packageItem.createMany({ data: toLink, skipDuplicates: true });

  for (const [code, packageId] of idByCode.entries()) {
    const lines = await prisma.packageItem.findMany({ where: { packageId }, include: { budgetLine: true } });
    const total = lines.reduce((s, li) => s + Number(li?.budgetLine?.amount || 0), 0);
    await prisma.package.update({ where: { id: packageId }, data: { budgetEstimate: total } });
  }

  await prisma.scopeRun.update({ where: { id: run.id }, data: { status: 'approved' } });
  await prisma.auditLog?.create?.({ data: { tenantId, userId: req.user.id, entity:'ScopeRun', entityId: String(run.id), action:'APPROVE', changes:{ packages: idByCode.size }}}).catch(()=>{});
  res.json({ ok: true, packages: idByCode.size, linked: toLink.length });
});

module.exports = router;

