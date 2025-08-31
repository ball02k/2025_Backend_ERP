const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');

// Read-only Suppliers API (tenant-scoped)

// GET /api/suppliers?q=&status=&limit=&offset=
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { q, status, approved, capability } = req.query;
    const where = { tenantId };

    if (status) where.status = String(status);
    if (approved === 'true') where.status = 'approved';

    if (capability) {
      const tags = String(capability)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (tags.length) {
        where.capabilities = { some: { tag: { in: tags } } };
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

    const rows = await prisma.supplier.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      include: { capabilities: true },
    });

    const data = rows.map((s) => ({
      id: s.id,
      name: s.name,
      capabilityTags: s.capabilities.map((c) => c.tag),
      insuranceValid: s.insuranceExpiry ? new Date(s.insuranceExpiry) > new Date() : false,
      accreditations: s.hsAccreditations
        ? String(s.hsAccreditations)
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean)
        : [],
    }));

    res.json({ data });
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

