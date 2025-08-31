const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');

// Read-only Suppliers API (tenant-scoped)

// GET /api/suppliers?q=&status=&limit=&offset=
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { q, status, limit = 20, offset = 0, approved, capability } = req.query;
    const where = { tenantId };

    if (status) where.status = String(status);
    if (approved === 'true') where.status = 'approved';

    if (capability) {
      const tags = String(capability)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (tags.length) {
        where.AND = where.AND || [];
        for (const tag of tags) {
          where.AND.push({ capabilities: { some: { tag } } });
        }
      }
    }

    if (q) {
      const term = String(q);
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { companyRegNo: { contains: term, mode: 'insensitive' } },
        { vatNo: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({
        where,
        take: Number(limit),
        skip: Number(offset),
        orderBy: [{ name: 'asc' }],
        include: { capabilities: true },
      }),
    ]);

    res.json({ total, rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/suppliers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const row = await prisma.supplier.findFirst({ where: { tenantId, id } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

