const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { requireAuth } = require('../middleware/auth.cjs') || { requireAuth: (_req,_res,next)=>next() };

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

    const data = rows.map((s) => {
      const capabilityTags = s.capabilities.map((c) => c.tag);
      const category = capabilityTags.find((t) => t.toLowerCase().startsWith('category:'))?.split(':', 2)?.[1] || null;
      return {
        id: s.id,
        name: s.name,
        status: s.status,
        category,
        rating: s.performanceScore ?? null,
        capabilityTags,
        insuranceValid: s.insuranceExpiry ? new Date(s.insuranceExpiry) > new Date() : false,
        accreditations: s.hsAccreditations
          ? String(s.hsAccreditations)
              .split(',')
              .map((a) => a.trim())
              .filter(Boolean)
          : [],
      };
    });

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
    const row = await prisma.supplier.findFirst({ where: { tenantId, id }, include: { capabilities: true } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    const capabilityTags = row.capabilities.map((c) => c.tag);
    const category = capabilityTags.find((t) => t.toLowerCase().startsWith('category:'))?.split(':', 2)?.[1] || null;
    // Basic computed fields for UI sections
    const insuranceValid = row.insuranceExpiry ? new Date(row.insuranceExpiry) > new Date() : false;
    const accreditations = row.hsAccreditations
      ? String(row.hsAccreditations)
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean)
      : [];
    // Exposure via POs
    const [poOpenCount, poOpenTotal] = await Promise.all([
      prisma.purchaseOrder.count({ where: { tenantId, supplierId: id, status: { in: ['Open', 'Pending'] } } }),
      prisma.purchaseOrder.aggregate({ _sum: { total: true }, where: { tenantId, supplierId: id, status: { in: ['Open', 'Pending'] } } }),
    ]);
    const data = {
      id: row.id,
      name: row.name,
      status: row.status,
      category,
      rating: row.performanceScore ?? null,
      capabilityTags,
      companyRegNo: row.companyRegNo,
      vatNo: row.vatNo,
      compliance: {
        insuranceValid,
        certifications: accreditations,
        hsPolicy: accreditations.length > 0, // heuristic
      },
      performance: {
        avgRating: row.performanceScore ?? 0,
        reviews: 0,
      },
      exposure: {
        openPOs: poOpenCount,
        outstandingInvoices: 0,
        total: Number(poOpenTotal._sum.total || 0),
      },
    };
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/suppliers
// Body: { name, status?, category?, rating? }
router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { name, status, category, rating } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const created = await prisma.supplier.create({
      data: {
        tenantId,
        name: name.trim(),
        status: status ? String(status) : undefined,
        performanceScore: Number.isFinite(Number(rating)) ? Number(rating) : undefined,
      },
    });
    // Store a simple category tag if provided
    if (category && String(category).trim()) {
      await prisma.supplierCapability.create({
        data: { tenantId, supplierId: created.id, tag: `category:${String(category).trim()}` },
      });
    }
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// PUT /api/suppliers/:id
// Body: { name?, status?, category?, rating? }
router.put('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { name, status, category, rating } = req.body || {};
    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name) } : {}),
        ...(status !== undefined ? { status: String(status) } : {}),
        ...(rating !== undefined ? { performanceScore: Number.isFinite(Number(rating)) ? Number(rating) : null } : {}),
      },
    });
    // Upsert a category tag if provided
    if (category !== undefined) {
      const tag = `category:${String(category).trim()}`;
      // Remove any existing category:* tags then add the new one (if non-empty)
      await prisma.supplierCapability.deleteMany({ where: { tenantId, supplierId: id, tag: { startsWith: 'category:' } } });
      if (String(category).trim()) {
        await prisma.supplierCapability.create({ data: { tenantId, supplierId: id, tag } });
      }
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/suppliers/:id (hard delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await prisma.supplierCapability.deleteMany({ where: { tenantId, supplierId: id } });
    await prisma.supplier.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /api/suppliers/onboarding-links — minimal stub for FE
router.post('/onboarding-links', async (req, res, next) => {
  try {
    const origin = (req.headers.origin && String(req.headers.origin)) || 'http://localhost:5173';
    // If a supplierId and projectId are provided, create an onboarding invite and return a tokened URL
    const tenantId = req.user.tenantId;
    const { supplierId, projectId, email } = req.body || {};
    if (supplierId && projectId) {
      const token = require('crypto').randomBytes(16).toString('hex');
      await prisma.onboardingInvite.create({
        data: {
          tenantId,
          projectId: Number(projectId),
          supplierId: Number(supplierId),
          email: String(email || 'supplier@example.com'),
          token,
          status: 'invited',
        },
      });
      const url = `${origin}/onboarding?token=${encodeURIComponent(token)}`;
      return res.json({ url });
    }
    // Fallback: return a generic onboarding page link
    const url = `${origin}/onboarding`;
    res.json({ url });
  } catch (err) { next(err); }
});

// GET /api/suppliers/:id/contracts — simple listing of linked contracts
router.get('/:id/contracts', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const supplierId = Number(req.params.id);
    const rows = await prisma.contract.findMany({
      // Contract has no tenantId column; filter via related project
      where: { supplierId, project: { tenantId } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const data = rows.map((r) => ({
      id: Number(r.id),
      projectId: r.projectId,
      projectName: r.project?.name || `Project #${r.projectId}`,
      title: r.title,
      contractNumber: r.contractNumber,
      value: Number(r.value || 0),
      status: r.status,
    }));
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
