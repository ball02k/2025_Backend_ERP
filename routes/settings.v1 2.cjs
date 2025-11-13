const express = require('express');

const router = express.Router();

const taxonomyStore = new Map([
  [
    'contract_families',
    {
      key: 'contract_families',
      name: 'Contract Families',
      isHierarchical: false,
      isLocked: false,
      terms: [
        { id: 1, code: 'NEC', label: 'NEC Suite', sort: 1 },
        { id: 2, code: 'JCT', label: 'JCT', sort: 2 },
        { id: 3, code: 'FIDIC', label: 'FIDIC', sort: 3 },
      ],
    },
  ],
  [
    'rfx_scoring_sets',
    {
      key: 'rfx_scoring_sets',
      name: 'RFx Scoring Sets',
      isHierarchical: false,
      isLocked: false,
      terms: [
        { id: 11, code: 'standard', label: 'Standard 60/40', sort: 1 },
        { id: 12, code: 'quality70', label: 'Quality 70 / Cost 30', sort: 2 },
      ],
    },
  ],
]);

const tenantSettings = {
  default_rfx_scoring_set: '',
  default_contract_family: '',
  award_override_reason_required: false,
  selfSupplierId: null,
};

function serialiseTaxonomy(tax) {
  return {
    key: tax.key,
    name: tax.name,
    isHierarchical: !!tax.isHierarchical,
    isLocked: !!tax.isLocked,
    terms: tax.terms.map((term) => ({
      id: term.id,
      code: term.code,
      label: term.label,
      sort: term.sort ?? 0,
      parentId: term.parentId ?? null,
    })),
  };
}

router.get('/taxonomies', (req, res) => {
  const items = Array.from(taxonomyStore.values()).map((tax) => ({
    key: tax.key,
    name: tax.name,
    isHierarchical: !!tax.isHierarchical,
    isLocked: !!tax.isLocked,
    termCount: tax.terms.length,
  }));
  res.json({ items });
});

router.get('/taxonomies/:key', (req, res) => {
  const key = String(req.params.key || '').toLowerCase();
  const tax = taxonomyStore.get(key);
  if (!tax) return res.status(404).json({ error: 'Not found' });
  res.json(serialiseTaxonomy(tax));
});

router.post('/taxonomies', (req, res) => {
  const key = String(req.body?.key || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  if (!key || !name) return res.status(400).json({ error: 'Key and name are required' });
  if (taxonomyStore.has(key)) return res.status(409).json({ error: 'Taxonomy already exists' });
  const tax = { key, name, isHierarchical: false, isLocked: false, terms: [] };
  taxonomyStore.set(key, tax);
  res.status(201).json(serialiseTaxonomy(tax));
});

router.post('/taxonomies/:key/terms', (req, res) => {
  const key = String(req.params.key || '').toLowerCase();
  const tax = taxonomyStore.get(key);
  if (!tax) return res.status(404).json({ error: 'Not found' });
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Terms payload must be an array' });

  const terms = req.body.map((term, idx) => {
    const code = String(term?.code || term?.label || `item_${idx + 1}`).trim();
    const label = String(term?.label || term?.name || code).trim();
    return {
      id: Number(term?.id) || Date.now() + idx,
      code,
      label,
      sort: Number.isFinite(Number(term?.sort)) ? Number(term.sort) : idx,
      parentId: term?.parentId ?? null,
    };
  });

  tax.terms = terms;
  res.json(serialiseTaxonomy(tax));
});

router.patch('/taxonomies/:key', (req, res) => {
  const key = String(req.params.key || '').toLowerCase();
  const tax = taxonomyStore.get(key);
  if (!tax) return res.status(404).json({ error: 'Not found' });

  if (req.body?.name !== undefined) tax.name = String(req.body.name || '').trim() || tax.name;
  if (req.body?.isHierarchical !== undefined) tax.isHierarchical = !!req.body.isHierarchical;
  if (req.body?.isLocked !== undefined) tax.isLocked = !!req.body.isLocked;

  res.json(serialiseTaxonomy(tax));
});

router.post('/taxonomies/:key/import', (req, res) => {
  res.json({ ok: true, message: 'CSV import not available in demo environment.' });
});

router.get('/taxonomies/:key/export', (req, res) => {
  const key = String(req.params.key || '').toLowerCase();
  const tax = taxonomyStore.get(key);
  if (!tax) return res.status(404).json({ error: 'Not found' });
  const header = 'code,label,sort';
  const rows = tax.terms.map((term) => [term.code, term.label, term.sort ?? 0].join(','));
  const csv = [header, ...rows].join('\n');
  res.type('text/csv').send(csv);
});

router.get('/tenant', (req, res) => {
  res.json(tenantSettings);
});

router.patch('/tenant', (req, res) => {
  const body = req.body || {};
  if (body.default_rfx_scoring_set !== undefined) tenantSettings.default_rfx_scoring_set = String(body.default_rfx_scoring_set || '');
  if (body.default_contract_family !== undefined) tenantSettings.default_contract_family = String(body.default_contract_family || '');
  if (body.award_override_reason_required !== undefined) tenantSettings.award_override_reason_required = !!body.award_override_reason_required;
  res.json(tenantSettings);
});

router.patch('/tenant/self-supplier', (req, res) => {
  const supplierId = Number(req.body?.supplierId);
  tenantSettings.selfSupplierId = Number.isFinite(supplierId) ? supplierId : null;
  res.json({ selfSupplierId: tenantSettings.selfSupplierId });
});

module.exports = router;
