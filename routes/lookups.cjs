const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');

// Helper to get tenant from the attached user
function getTenantId(req) {
  return req.user && req.user.tenantId;
}

// Safe distinct helper using findMany + JS de-duplication (avoids engine-specific quirks)
async function distinctFromProjects(column, tenantId) {
  const rows = await prisma.project.findMany({
    where: { tenantId },
    select: { [column]: true },
  });
  const set = new Set();
  for (const r of rows) {
    const v = r[column];
    if (typeof v === 'string') {
      const s = v.trim();
      if (s) set.add(s);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// GET /api/lookups/project-statuses -> { items: string[] }
router.get('/lookups/project-statuses', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const items = await distinctFromProjects('status', tenantId);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load statuses' });
  }
});

// GET /api/lookups/project-types -> { items: string[] }
router.get('/lookups/project-types', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const items = await distinctFromProjects('type', tenantId);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load types' });
  }
});

// GET /api/lookups/projects -> { statuses: string[], types: string[] }
router.get('/lookups/projects', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const [statuses, types] = await Promise.all([
      distinctFromProjects('status', tenantId),
      distinctFromProjects('type', tenantId),
    ]);
    res.json({ statuses, types });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load project lookups' });
  }
});

// GET /api/contract-types -> list of all contract types
router.get('/contract-types', async (req, res) => {
  try {
    const types = await prisma.contractType.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(types);
  } catch (e) {
    console.error('[lookups] Failed to load contract types:', e);
    res.status(500).json({ error: 'Failed to load contract types' });
  }
});

module.exports = router;
