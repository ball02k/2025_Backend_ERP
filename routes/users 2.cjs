const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth.cjs');

const prisma = new PrismaClient();
const router = express.Router();

// GET /api/users
// Return shape aligned with other list endpoints: { items, total, data: { items, total } }
router.get('/', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const q = String(req.query.q || req.query.search || '').trim();
    const take = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = Math.max(Number(req.query.offset) || 0, 0);

    const where = {
      tenantId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          createdAt: true,
        },
      }),
    ]);

    res.json({ users: rows, items: rows, total, data: { items: rows, total } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

module.exports = router;
