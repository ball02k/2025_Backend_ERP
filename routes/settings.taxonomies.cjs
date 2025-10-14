const express = require('express');
const router = express.Router({ mergeParams: true });
const { prisma } = require('../utils/prisma.cjs');
const { requireAuth } = require('../middleware/auth.cjs');
const { parse, stringify } = require('../src/lib/csv.cjs');

function ensureAdmin(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'admin') {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
}

async function audit(req, entity, entityId, action, changes) {
  try {
    await prisma.auditLog.create({ data: { entity, entityId: String(entityId), action, userId: req.user?.id ?? null, changes: changes || {} } });
  } catch (_) {}
}

// Helpers for multipart text (CSV)
async function readRawBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readMultipartText(req) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  const raw = await readRawBuffer(req);
  if (!ct.startsWith('multipart/form-data')) return raw.toString('utf8');
  const m = /boundary=([^;]+)\b/.exec(ct);
  if (!m) return raw.toString('utf8');
  const boundary = '--' + m[1];
  const text = raw.toString('utf8');
  const parts = text.split(boundary).filter((p) => p.trim() && p.indexOf('\r\n\r\n') !== -1);
  if (!parts.length) return '';
  const seg = parts[0];
  const splitAt = seg.indexOf('\r\n\r\n');
  if (splitAt === -1) return '';
  let body = seg.slice(splitAt + 4);
  body = body.replace(/\r?\n--$/, '').replace(/\r?\n$/, '');
  return body;
}

// GET   /api/v1/settings/taxonomies
router.get('/api/v1/settings/taxonomies', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const q = String(req.query.q || '').trim();
    const where = { tenantId, ...(q ? { OR: [{ key: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}) };
    const rows = await prisma.taxonomy.findMany({ where, orderBy: [{ name: 'asc' }], take: Math.min(Number(req.query.limit) || 200, 500), skip: Math.max(Number(req.query.offset) || 0, 0) });
    res.json({ items: rows, total: rows.length });
  } catch (e) { next(e); }
});

// POST  /api/v1/settings/taxonomies
router.post('/api/v1/settings/taxonomies', requireAuth, async (req, res, next) => {
  try {
    ensureAdmin(req);
    const tenantId = req.user.tenantId;
    const { key, name, description, isHierarchical = false, isLocked = false } = req.body || {};
    if (!key || !name) return res.status(400).json({ error: 'key and name are required' });
    const created = await prisma.taxonomy.create({ data: { tenantId, key, name, description: description || null, isHierarchical: !!isHierarchical, isLocked: !!isLocked } });
    await audit(req, 'Taxonomy', created.id, 'create', { create: { key, name } });
    res.json(created);
  } catch (e) { next(e); }
});

async function getTaxonomyOr404(tenantId, key, res) {
  const t = await prisma.taxonomy.findFirst({ where: { tenantId, key } });
  if (!t) { res.status(400).json({ error: 'Unknown taxonomy key' }); return null; }
  return t;
}

// GET   /api/v1/settings/taxonomies/:key
router.get('/api/v1/settings/taxonomies/:key', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const key = String(req.params.key);
    const limit = Math.min(Number(req.query.limit) || 2000, 5000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const tx = await getTaxonomyOr404(tenantId, key, res);
    if (!tx) return;
    const terms = await prisma.taxonomyTerm.findMany({ where: { tenantId, taxonomyId: tx.id }, orderBy: [{ parentId: 'asc' }, { sort: 'asc' }, { label: 'asc' }], take: limit, skip: offset });
    res.json({ ...tx, terms });
  } catch (e) { next(e); }
});

// PATCH /api/v1/settings/taxonomies/:key
router.patch('/api/v1/settings/taxonomies/:key', requireAuth, async (req, res, next) => {
  try {
    ensureAdmin(req);
    const tenantId = req.user.tenantId;
    const key = String(req.params.key);
    const tx = await getTaxonomyOr404(tenantId, key, res);
    if (!tx) return;
    const data = {};
    const allowed = ['name', 'description', 'isHierarchical', 'isLocked'];
    for (const k of allowed) if (k in req.body) data[k] = req.body[k];
    const updated = await prisma.taxonomy.update({ where: { id: tx.id }, data });
    await audit(req, 'Taxonomy', tx.id, 'update', { set: data });
    res.json(updated);
  } catch (e) { next(e); }
});

// POST  /api/v1/settings/taxonomies/:key/terms  (bulk upsert)
router.post('/api/v1/settings/taxonomies/:key/terms', requireAuth, async (req, res, next) => {
  try {
    ensureAdmin(req);
    const tenantId = req.user.tenantId;
    const key = String(req.params.key);
    const tx = await getTaxonomyOr404(tenantId, key, res);
    if (!tx) return;
    const items = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.items) ? req.body.items : [];
    if (!Array.isArray(items) || items.length === 0) return res.json({ ok: true, count: 0 });
    if (items.length > 5000) return res.status(413).json({ error: 'Too many rows (max 5000)' });

    // Build map of existing terms by code (and by label for rows without code)
    const existing = await prisma.taxonomyTerm.findMany({ where: { tenantId, taxonomyId: tx.id } });
    const byCode = new Map(); const byLabel = new Map();
    existing.forEach((t) => { if (t.code) byCode.set(t.code, t); byLabel.set((t.label || '').toLowerCase(), t); });

    // First pass to resolve parentCode -> id; create missing parents with placeholder if needed
    const ensureParent = async (parentCode) => {
      if (!parentCode) return null;
      const known = byCode.get(parentCode);
      if (known) return known.id;
      // Create placeholder parent if not exists
      const created = await prisma.taxonomyTerm.create({ data: { tenantId, taxonomyId: tx.id, code: parentCode, label: parentCode, sort: 0 } });
      byCode.set(parentCode, created);
      return created.id;
    };

    const results = [];
    for (const row of items) {
      const code = row.code != null && String(row.code).trim() !== '' ? String(row.code).trim() : null;
      const label = String(row.label || '').trim();
      const sort = Number(row.sort || 0) || 0;
      const parentCode = row.parentCode ? String(row.parentCode).trim() : null;
      const parentId = await ensureParent(parentCode);
      let existingTerm = null;
      if (code && byCode.has(code)) existingTerm = byCode.get(code);
      else if (!code && label) existingTerm = byLabel.get(label.toLowerCase());

      if (existingTerm) {
        const updated = await prisma.taxonomyTerm.update({ where: { id: existingTerm.id }, data: { label, sort, parentId } });
        results.push(updated);
      } else {
        const created = await prisma.taxonomyTerm.create({ data: { tenantId, taxonomyId: tx.id, code, label, sort, parentId } });
        results.push(created);
        if (code) byCode.set(code, created);
        byLabel.set(label.toLowerCase(), created);
      }
    }

    await audit(req, 'TaxonomyTerm', tx.id, 'bulk_upsert', { count: results.length });
    res.json({ ok: true, count: results.length });
  } catch (e) { next(e); }
});

// CSV Import: POST /api/v1/settings/taxonomies/:key/import (multipart CSV)
router.post('/api/v1/settings/taxonomies/:key/import', requireAuth, async (req, res, next) => {
  try {
    ensureAdmin(req);
    const tenantId = req.user.tenantId;
    const key = String(req.params.key);
    const tx = await getTaxonomyOr404(tenantId, key, res);
    if (!tx) return;
    const csvText = await readMultipartText(req);
    const { headers, rows } = parse(csvText);
    const h = headers.map((x) => String(x).toLowerCase());
    // Expect headers: code,label,parentCode,sort (case-insensitive)
    const pick = (r, k) => r[k] ?? r[k.toLowerCase()] ?? r[k.toUpperCase()];
    const items = rows.map((r) => ({
      code: pick(r, 'code') || '',
      label: pick(r, 'label') || '',
      parentCode: pick(r, 'parentCode') || '',
      sort: Number(pick(r, 'sort') || 0) || 0,
    }));
    req.body = items; // reuse bulk upsert handler
    return router.handle({ ...req, method: 'POST', url: `/api/v1/settings/taxonomies/${key}/terms` }, res, next);
  } catch (e) { next(e); }
});

// CSV Export: GET /api/v1/settings/taxonomies/:key/export
router.get('/api/v1/settings/taxonomies/:key/export', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const key = String(req.params.key);
    const tx = await getTaxonomyOr404(tenantId, key, res);
    if (!tx) return;
    const terms = await prisma.taxonomyTerm.findMany({ where: { tenantId, taxonomyId: tx.id }, orderBy: [{ parentId: 'asc' }, { sort: 'asc' }, { label: 'asc' }] });
    const headers = ['code', 'label', 'parentCode', 'sort'];
    const parentById = new Map(terms.map((t) => [t.id, t]));
    const rows = terms.map((t) => ({
      code: t.code || '',
      label: t.label || '',
      parentCode: t.parentId ? (parentById.get(t.parentId)?.code || '') : '',
      sort: String(t.sort || 0),
    }));
    const csv = stringify(headers, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${key}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
});

// Tenant settings: GET /api/v1/settings/tenant
router.get('/api/v1/settings/tenant', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const rows = await prisma.tenantSetting.findMany({ where: { tenantId } });
    const map = {}; rows.forEach((r) => { map[r.k] = r.v; });
    res.json({
      default_rfx_scoring_set: map.default_rfx_scoring_set ?? null,
      default_contract_family: map.default_contract_family ?? null,
      award_override_reason_required: map.award_override_reason_required ?? false,
      selfSupplierId: map.selfSupplierId ?? null,
    });
  } catch (e) { next(e); }
});

// Tenant settings: PATCH /api/v1/settings/tenant
router.patch('/api/v1/settings/tenant', requireAuth, async (req, res, next) => {
  try {
    ensureAdmin(req);
    const tenantId = req.user.tenantId;
    const body = req.body || {};
    const allowed = ['default_rfx_scoring_set', 'default_contract_family', 'award_override_reason_required'];
    const results = {};
    for (const k of allowed) {
      if (!(k in body)) continue;
      const v = body[k];
      const row = await prisma.tenantSetting.upsert({
        where: { tenantId_k: { tenantId, k } },
        update: { v },
        create: { tenantId, k, v },
      });
      results[k] = row.v;
      await audit(req, 'TenantSetting', row.id, 'upsert', { k, v });
    }
    res.json(results);
  } catch (e) { next(e); }
});

// Modules flags (read-only)
router.get('/api/v1/tenants/modules', requireAuth, async (req, res) => {
  const flags = {
    rfx: true,
    procurement: true,
    afp: !!(process.env.ENABLE_AFP || process.env.ENABLE_FINANCE),
    finance: !!(process.env.ENABLE_FINANCE),
    carbon: true,
    qa: true,
    hs: true,
  };
  res.json(flags);
});

module.exports = router;

// Admin-only: set tenant self-supplier (KV store key 'selfSupplierId')
async function setSelfSupplier(req, res) {
  const tenantId = req.user.tenantId;
  const supplierId = Number(req.body?.supplierId);
  if (!Number.isFinite(supplierId)) return res.status(400).json({ error: 'Invalid supplierId' });
  const sup = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
  if (!sup) return res.status(404).json({ error: 'Supplier not found in tenant' });
  const row = await prisma.tenantSetting.upsert({
    where: { tenantId_k: { tenantId, k: 'selfSupplierId' } },
    update: { v: supplierId },
    create: { tenantId, k: 'selfSupplierId', v: supplierId },
  });
  await audit(req, 'TenantSetting', row.id, 'upsert', { k: 'selfSupplierId', v: supplierId });
  res.json(row);
}
router.patch('/api/v1/settings/tenant/self-supplier', requireAuth, async (req, res, next) => {
  try { ensureAdmin(req); await setSelfSupplier(req, res); } catch (e) { next(e); }
});
// Alias: /api/settings/tenant/self-supplier
router.patch('/api/settings/tenant/self-supplier', requireAuth, async (req, res, next) => {
  try { ensureAdmin(req); await setSelfSupplier(req, res); } catch (e) { next(e); }
});
