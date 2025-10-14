const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/trades?query= (case-insensitive contains on code or name)
router.get('/', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const q = String(req.query.query || req.query.q || '').trim();
    const where = { tenantId };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { group: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await prisma.trade.findMany({ where, orderBy: [{ group: 'asc' }, { name: 'asc' }] });
    // Group for convenience
    const groups = {};
    for (const t of rows) {
      const g = t.group || 'Other';
      if (!groups[g]) groups[g] = [];
      groups[g].push({ id: t.id, code: t.code, name: t.name, group: t.group });
    }
    res.json({ items: rows, groups });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load trades' });
  }
});

module.exports = router;

