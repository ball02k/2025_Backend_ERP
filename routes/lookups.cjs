const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');

// Helper to get tenant from the attached user
function getTenantId(req) {
  return req.user && req.user.tenantId;
}

// Prisma-based distinct helper on Project string columns
async function distinctFromProjects(column, tenantId) {
  const rows = await prisma.project.findMany({
    where: {
      tenantId,
      NOT: [{ [column]: null }, { [column]: '' }],
    },
    select: { [column]: true },
    distinct: [column],
    orderBy: { [column]: 'asc' },
  });
  return rows
    .map((r) => r[column])
    .filter((s) => typeof s === 'string' && s.trim().length)
    .map((s) => s.trim());
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

module.exports = router;

