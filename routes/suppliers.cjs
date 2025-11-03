const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { checkSupplierCompliance } = require('../services/compliance.service.cjs');
const jwt = require('jsonwebtoken');
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
      take: Math.min(Number(req.query.limit) || 200, 500),
      skip: Math.max(Number(req.query.offset) || 0, 0),
    });

    const data = rows.map((s) => {
      const capabilityTags = s.capabilities.map((c) => c.tag);
      const category = capabilityTags.find((t) => t.toLowerCase().startsWith('category:'))?.split(':', 2)?.[1] || null;
      const row = {
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
      // Standardise links field
      row.links = [];
      return row;
    });

    res.json({ data, items: data, total: data.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/suppliers/qualified - Filter suppliers for tender invitations
// IMPORTANT: This must be BEFORE /:id route to avoid "qualified" being treated as an ID
router.get('/qualified', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const {
      trade,
      latitude,
      longitude,
      radiusMiles,
      minTurnover,
      accreditation,
      performanceMin,
      availableCapacity
    } = req.query;

    // Build base query
    const where = { tenantId, status: 'approved' };

    // Filter by trade/capability
    if (trade) {
      where.capabilities = {
        some: {
          tag: {
            contains: String(trade),
            mode: 'insensitive'
          }
        }
      };
    }

    // Get suppliers with prequalification data
    const suppliers = await prisma.supplier.findMany({
      where,
      include: {
        capabilities: true,
        prequalification: true
      },
      orderBy: { name: 'asc' }
    });

    // Apply filters
    let filtered = suppliers;

    // Filter by turnover
    if (minTurnover) {
      const minTurnoverNum = Number(minTurnover);
      filtered = filtered.filter(s =>
        s.prequalification?.annualTurnover && s.prequalification.annualTurnover >= minTurnoverNum
      );
    }

    // Filter by accreditation
    if (accreditation) {
      const acc = String(accreditation).toLowerCase();
      filtered = filtered.filter(s => {
        if (!s.prequalification) return false;

        const accMap = {
          'iso9001': s.prequalification.iso9001,
          'iso14001': s.prequalification.iso14001,
          'iso45001': s.prequalification.iso45001,
          'safecontractor': s.prequalification.safeContractor,
          'chas': s.prequalification.chas,
          'constructionline': s.prequalification.constructionLine
        };

        return accMap[acc] === true;
      });
    }

    // Filter by performance score
    if (performanceMin) {
      const minScore = Number(performanceMin);
      filtered = filtered.filter(s =>
        s.prequalification?.averagePerformanceScore &&
        s.prequalification.averagePerformanceScore >= minScore
      );
    }

    // Filter by available capacity
    if (availableCapacity === 'true') {
      filtered = filtered.filter(s =>
        s.prequalification?.availableCapacity &&
        s.prequalification.availableCapacity > 0
      );
    }

    // Calculate distance if location provided
    if (latitude && longitude && radiusMiles) {
      const lat = Number(latitude);
      const lng = Number(longitude);
      const radius = Number(radiusMiles);

      filtered = filtered.map(s => {
        // For now, return mock distance - in production would calculate from supplier address
        const distance = Math.random() * radius * 2;
        return { ...s, distance };
      }).filter(s => s.distance <= radius);
    }

    // Format response
    const data = filtered.map(s => {
      const capabilityTags = s.capabilities?.map(c => c.tag) || [];
      const preq = s.prequalification;

      return {
        id: s.id,
        name: s.name,
        status: s.status,
        capabilityTags,
        distance: s.distance || null,
        prequalification: preq ? {
          companySize: preq.companySize,
          annualTurnover: Number(preq.annualTurnover || 0),
          employeeCount: preq.employeeCount,
          iso9001: preq.iso9001,
          iso9001Expiry: preq.iso9001Expiry,
          iso14001: preq.iso14001,
          iso14001Expiry: preq.iso14001Expiry,
          iso45001: preq.iso45001,
          iso45001Expiry: preq.iso45001Expiry,
          safeContractor: preq.safeContractor,
          safeContractorExpiry: preq.safeContractorExpiry,
          chas: preq.chas,
          chasExpiry: preq.chasExpiry,
          constructionLine: preq.constructionLine,
          constructionLineExpiry: preq.constructionLineExpiry,
          averagePerformanceScore: Number(preq.averagePerformanceScore || 0),
          onTimeDeliveryRate: Number(preq.onTimeDeliveryRate || 0),
          currentWorkload: Number(preq.currentWorkload || 0),
          availableCapacity: Number(preq.availableCapacity || 0)
        } : null
      };
    });

    res.json({ items: data, total: data.length });
  } catch (err) {
    console.error('Error fetching qualified suppliers:', err);
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

router.get('/:id/compliance', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const supplierId = Number(req.params.id);
    if (!tenantId || !Number.isFinite(supplierId)) {
      return res.status(400).json({ ok: false, summary: 'Bad request' });
    }
    const result = await checkSupplierCompliance(tenantId, supplierId);
    res.json(result);
  } catch (err) {
    console.error('supplier compliance error', err);
    res.status(500).json({ ok: false, summary: 'Compliance check error' });
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
      include: {
        project: { select: { id: true, name: true } },
        package: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
    });
    const data = rows.map((r) => ({
      id: Number(r.id),
      projectId: r.projectId,
      projectName: r.project?.name || `Project #${r.projectId}`,
      packageId: r.packageId,
      packageName: r.package?.name || (r.packageId ? `Package #${r.packageId}` : null),
      title: r.title,
      contractNumber: r.contractNumber,
      value: Number(r.value || 0),
      status: r.status,
      updatedAt: r.updatedAt,
    }));
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/suppliers/:id/onboarding-link — generate a signed public onboarding URL
router.post('/:id/onboarding-link', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const supplierId = Number(req.params.id);
    if (!Number.isFinite(supplierId)) return res.status(400).json({ error: 'Invalid id' });

    // ensure supplier belongs to tenant
    const sup = await prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
      select: { id: true, name: true },
    });
    if (!sup) return res.status(404).json({ error: 'Supplier not found' });

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14); // 14 days
    const payload = { tid: tenantId, sid: supplierId, exp: Math.floor(expiresAt.getTime() / 1000) };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256' });

    await prisma.supplierOnboardingToken.create({
      data: { token, supplierId, tenantId, expiresAt },
    });

    const base = process.env.APP_BASE_URL || process.env.VITE_APP_BASE_URL || '';
    const url = `${base}/onboard/${token}`;

    return res.json({ url, expiresAt: expiresAt.toISOString() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to generate onboarding link' });
  }
});

// GET /api/suppliers/:id/overview — supplier with related POs, contracts, tenders (tenant-scoped)
router.get('/:id/overview', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const supplierId = Number(req.params.id);
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) return res.status(404).json({ error: 'Not found' });
    const [purchaseOrders, contracts, tenderBids] = await Promise.all([
      prisma.purchaseOrder.findMany({ where: { tenantId, supplierId }, select: { id: true, code: true, poNumber: true, total: true, projectId: true } }),
      prisma.contract.findMany({ where: { supplierId, project: { tenantId } }, select: { id: true, title: true, contractNumber: true, value: true, projectId: true } }),
      prisma.tenderBid.findMany({ where: { tenantId, supplierId }, include: { tender: { select: { id: true, title: true, projectId: true } } } }).catch(() => []),
    ]);
    res.json({
      id: supplier.id,
      name: supplier.name,
      purchaseOrders,
      contracts,
      tenders: (tenderBids || []).map((b) => ({ id: b.tender?.id, title: b.tender?.title, projectId: b.tender?.projectId, bidId: b.id, price: b.price })),
    });
  } catch (e) { next(e); }
});

module.exports = router;
