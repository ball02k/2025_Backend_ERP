const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');

// List taxonomy items for current tenant
router.get('/taxonomy/packages', requireAuth, async (req, res) => {
  try {
    const tenantId = String(req.user.tenantId);
    const items = await prisma.packageTaxonomy.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: 'FAILED_LIST', details: String(e.message || e) });
  }
});

// Upsert taxonomy item by code
router.post('/taxonomy/packages', requireAuth, async (req, res) => {
  try {
    const tenantId = String(req.user.tenantId);
    const { code, name, keywords = [], costCodePrefixes = [], isActive = true } = req.body || {};
    if (!code || !name) return res.status(400).json({ error: 'MISSING_FIELDS', details: 'code and name are required' });
    const item = await prisma.packageTaxonomy.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: { name, keywords, costCodePrefixes, isActive },
      create: { tenantId, code, name, keywords, costCodePrefixes, isActive },
    });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: 'FAILED_UPSERT', details: String(e.message || e) });
  }
});

// Patch taxonomy item by code
router.patch('/taxonomy/packages/:code', requireAuth, async (req, res) => {
  try {
    const tenantId = String(req.user.tenantId);
    const code = String(req.params.code);
    const { name, keywords, costCodePrefixes, isActive } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = name;
    if (keywords !== undefined) data.keywords = keywords;
    if (costCodePrefixes !== undefined) data.costCodePrefixes = costCodePrefixes;
    if (isActive !== undefined) data.isActive = isActive;
    const item = await prisma.packageTaxonomy.update({
      where: { tenantId_code: { tenantId, code } },
      data,
    });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: 'FAILED_UPDATE', details: String(e.message || e) });
  }
});

// Delete taxonomy item by code
router.delete('/taxonomy/packages/:code', requireAuth, async (req, res) => {
  try {
    const tenantId = String(req.user.tenantId);
    const code = String(req.params.code);
    await prisma.packageTaxonomy.delete({ where: { tenantId_code: { tenantId, code } } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'FAILED_DELETE', details: String(e.message || e) });
  }
});

module.exports = router;

