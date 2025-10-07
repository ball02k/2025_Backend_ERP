const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { safeJson } = require('../lib/serialize.cjs');

const packageSelect = {
  id: true,
  projectId: true,
  name: true,
  scope: true,
  trade: true,
  status: true,
  budgetEstimate: true,
  deadline: true,
  awardValue: true,
  awardSupplierId: true,
  createdAt: true,
  updatedAt: true,
  costCodeId: true,
};

// GET /api/projects/:projectId/packages — list packages with linked budget items
router.get('/projects/:projectId/packages', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    let rows = [];
    try {
      rows = await prisma.package.findMany({
        where: { projectId },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: packageSelect,
      });
    } catch (e) {
      // Fallback minimal selection if schema migrations not applied yet
      rows = await prisma.package.findMany({ where: { projectId }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: packageSelect });
    }
    const data = rows.map(r => {
      const row = safeJson(r);
      row.budgetTotal = 0;
      row.links = buildLinks('package', { ...row, projectId });
      return row;
    });
    res.json({ items: data, total: data.length });
  } catch (e) { next(e); }
});

// POST /api/projects/:projectId/packages — create a package (optionally from selected budget lines)
router.post('/projects/:projectId/packages', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const { name, description, scope, tradeCategory, trade, costCodeId, attachments, budgetIds } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const created = await prisma.package.create({
      data: {
        projectId,
        name,
        // Map description to scope for compatibility
        scope: (scope ?? description) || null,
        trade: (trade || tradeCategory) ?? null,
        costCodeId: costCodeId ?? null,
      },
      select: packageSelect,
    });
    // Try to attach budget lines if table exists (ignore on failure)
    if (Array.isArray(budgetIds) && budgetIds.length > 0) {
      try {
        await prisma.packageItem.createMany({ data: budgetIds.map((id) => ({ packageId: created.id, budgetLineId: Number(id) })) });
      } catch (_) {}
    }
    const row = safeJson(created); row.links = buildLinks('package', { ...row, projectId });
    res.json(row);
  } catch (e) { next(e); }
});

// GET /api/projects/:projectId/packages/:packageId — package detail with budget lines
router.get('/projects/:projectId/packages/:packageId', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const packageId = Number(req.params.packageId);
    const pkg = await prisma.package.findFirst({ where: { id: packageId, projectId }, select: { ...packageSelect, tenders: { select: { id: true, status: true, title: true } } } });
    if (!pkg) return res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });
    const row = safeJson(pkg); row.links = buildLinks('package', { ...row, projectId });
    res.json(row);
  } catch (e) { next(e); }
});

// POST /api/projects/:projectId/packages/:packageId/create-tender — one-click RFx draft
router.post('/projects/:projectId/packages/:packageId/create-tender', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const packageId = Number(req.params.packageId);
    const pkg = await prisma.package.findFirst({ where: { id: packageId, projectId }, select: { id: true, name: true } });
    if (!pkg) return res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });

    // Create a lightweight RFx draft (Request) aligned with existing flow
    const now = new Date();
    const defaultDeadline = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const title = (req.body && req.body.title) || `RFx for ${pkg.name}`;
    const deadline = (req.body && req.body.dueDate) ? new Date(req.body.dueDate) : defaultDeadline;

    const rfx = await prisma.request.create({
      data: {
        tenantId: (req.user && req.user.tenantId) || 'demo',
        packageId: pkg.id,
        title,
        type: 'RFP',
        status: 'draft',
        deadline,
      },
    });
    // Also create a lightweight Tender record to enable responses/scoring flows
    let tender = null;
    try {
      tender = await prisma.tender.create({
        data: {
          tenantId: (req.user && req.user.tenantId) || 'demo',
          projectId,
          packageId: pkg.id,
          title,
          description: null,
          status: 'draft',
        },
      });
      // Optionally seed questions if provided
      const qs = Array.isArray(req.body?.questions) ? req.body.questions : [];
      if (tender && qs.length) {
        await prisma.tenderQuestion.createMany({
          data: qs.map((q) => ({
            tenantId: (req.user && req.user.tenantId) || 'demo',
            tenderId: tender.id,
            text: String(q.text || ''),
            type: String(q.type || 'text'),
            weight: Number(q.weight || 0),
            options: q.options ?? null,
          })),
          skipDuplicates: true,
        }).catch(()=>{});
      }
    } catch (_) {}
    await prisma.package.update({ where: { id: pkg.id }, data: { status: 'Tender' } }).catch(() => {});
    res.status(201).json({ requestId: rfx.id, title: rfx.title, tenderId: tender?.id || null });
  } catch (e) { next(e); }
});

module.exports = router;
// Compatibility: expose top-level package endpoints expected by older FE variants
// Mounted by index.cjs under /api
router.get('/packages/:packageId', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const packageId = Number(req.params.packageId);
    if (!Number.isFinite(packageId)) return res.status(400).json({ error: 'Invalid packageId' });
    const pkg = await prisma.package.findFirst({
      where: { id: packageId, project: { tenantId } },
      select: { id: true, projectId: true, name: true, scope: true, trade: true, status: true, budgetEstimate: true, deadline: true, awardValue: true, awardSupplierId: true, createdAt: true, updatedAt: true, costCodeId: true },
    });
    if (!pkg) return res.status(404).json({ error: 'Not found' });
    const row = safeJson(pkg); row.links = buildLinks('package', row);
    res.json(row);
  } catch (e) { next(e); }
});

router.get('/packages/:packageId/invites', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const packageId = Number(req.params.packageId);
    if (!Number.isFinite(packageId)) return res.status(400).json({ error: 'Invalid packageId' });
    // Legacy invites tied to Package
    const rows = await prisma.tenderInvite.findMany({
      where: { packageId, supplier: { tenantId } },
      select: { id: true, supplierId: true, status: true, invitedAt: true, respondedAt: true, supplier: { select: { id: true, name: true, email: true } } },
    });
    res.json({ items: rows, total: rows.length });
  } catch (e) { next(e); }
});

router.get('/packages/:packageId/submissions', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const packageId = Number(req.params.packageId);
    if (!Number.isFinite(packageId)) return res.status(400).json({ error: 'Invalid packageId' });
    const rows = await prisma.submission.findMany({
      where: { packageId, supplier: { tenantId } },
      orderBy: [{ submittedAt: 'desc' }],
      select: { id: true, supplierId: true, price: true, durationWeeks: true, technicalScore: true, priceScore: true, overallScore: true, status: true, submittedAt: true, supplier: { select: { id: true, name: true } } },
    });
    res.json({ items: rows, total: rows.length });
  } catch (e) { next(e); }
});
