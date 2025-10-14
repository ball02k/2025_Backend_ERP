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
  targetAwardDate: true,
  requiredOnSite: true,
  leadTimeWeeks: true,
  contractForm: true,
  retentionPct: true,
  paymentTerms: true,
  currency: true,
  awardValue: true,
  awardSupplierId: true,
  createdAt: true,
  updatedAt: true,
  costCodeId: true,
  ownerUserId: true,
  buyerUserId: true,
  procurementType: true,
  selfDeliveringTeamId: true,
};

// GET /api/projects/:projectId/packages — list packages with linked budget items
router.get('/projects/:projectId/packages', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    let rows = [];
    try {
      rows = await prisma.package.findMany({
        where: { projectId, project: { tenantId } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { ...packageSelect, type: true, tradeCode: true, tenders: { select: { id: true, status: true, title: true, _count: { select: { responses: true, bids: true } } }, orderBy: { createdAt: 'desc' } } },
      });
    } catch (e) {
      // Fallback minimal selection if schema migrations not applied yet
      rows = await prisma.package.findMany({ where: { projectId, project: { tenantId } }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: packageSelect });
    }
    // Compute budget totals per package (sum BudgetLine.amount via PackageItem)
    let sums = [];
    try {
      const ids = rows.map(r => r.id);
      const items = await prisma.packageItem.findMany({ where: { packageId: { in: ids } }, select: { packageId: true, budgetLine: { select: { amount: true } } } });
      const map = new Map();
      for (const it of items) {
        map.set(it.packageId, (map.get(it.packageId) || 0) + Number(it.budgetLine?.amount || 0));
      }
      sums = map;
    } catch (_) {}

    const data = rows.map(r => {
      const row = safeJson(r);
      row.budgetTotal = (sums instanceof Map) ? (sums.get(r.id) || 0) : 0;
      // Attach linked tender + bids count
      const active = Array.isArray(row.tenders) ? row.tenders.filter(t => String(t.status||'').toLowerCase() !== 'cancelled') : [];
      if (active.length) {
        const t = active[0];
        row.linkedTender = { id: t.id, title: t.title || `Tender #${t.id}`, status: t.status };
        row.tenderId = t.id;
        row.bidsCount = Number((t._count?.bids ?? t._count?.responses) || 0);
      } else {
        row.linkedTender = null;
        row.tenderId = null;
        row.bidsCount = 0;
      }
      // expose trade / tradeCode directly
      row.trade = row.trade || null;
      row.tradeCode = row.tradeCode || null;
      row.links = buildLinks('package', { ...row, projectId });
      return row;
    });
    res.json({ items: data, total: data.length });
  } catch (e) { next(e); }
});

// POST /api/projects/:projectId/packages/:packageId/items:add-from-budgets
// Body: { budgetIds: number[] }
router.post('/projects/:projectId/packages/:packageId/items:add-from-budgets', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const projectId = Number(req.params.projectId);
    const packageId = Number(req.params.packageId);
    const ids = Array.isArray(req.body?.budgetIds) ? req.body.budgetIds.map(Number).filter(Number.isFinite) : [];
    if (!ids.length) return res.status(400).json({ error: 'budgetIds required' });
    // Validate package belongs to project
    const pkg = await prisma.package.findFirst({ where: { id: packageId, projectId, project: { tenantId } }, select: { id: true } });
    if (!pkg) return res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });

    // Check duplicates first to provide clear error
    const existing = await prisma.packageItem.findMany({ where: { budgetLineId: { in: ids } }, select: { budgetLineId: true, packageId: true } });
    if (existing.length) {
      return res.status(409).json({ error: 'LINES_ALREADY_COMMITTED', lines: existing.map(e => e.budgetLineId) });
    }

    await prisma.packageItem.createMany({ data: ids.map((id) => ({ tenantId, packageId, budgetLineId: id })) });

    // Audit
    await prisma.auditLog?.create?.({ data: { tenantId, userId: req.user?.id ?? null, entity: 'Package', entityId: String(packageId), action: 'ATTACH_BUDGETS', changes: { budgetIds: ids } } }).catch(()=>{});
    res.status(201).json({ added: ids.length });
  } catch (e) { next(e); }
});

// DELETE /api/projects/:projectId/packages/:packageId with tender status guards
router.delete('/projects/:projectId/packages/:packageId', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const packageId = Number(req.params.packageId);
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const pkg = await prisma.package.findFirst({ where: { id: packageId, projectId, project: { tenantId } }, select: { id: true } });
    if (!pkg) return res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });

    // Block if any active tenders exist in statuses [draft, open, awarded]
    const blocking = await prisma.tender.count({ where: { packageId, status: { in: ['draft','open','awarded'] } } });
    if (blocking > 0) return res.status(409).json({ error: 'PACKAGE_HAS_ACTIVE_TENDER' });

    // Remove join rows then package
    await prisma.packageItem.deleteMany({ where: { packageId } }).catch(()=>{});
    await prisma.package.delete({ where: { id: packageId } });
    await prisma.auditLog?.create?.({ data: { tenantId, userId: req.user?.id ?? null, entity: 'Package', entityId: String(packageId), action: 'DELETE' } }).catch(()=>{});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/projects/:projectId/packages — create a package (optionally from selected budget lines)
router.post('/projects/:projectId/packages', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const { name, description, scope, tradeCategory, trade, costCodeId, attachments,
      targetAwardDate, requiredOnSite, leadTimeWeeks, contractForm, retentionPct, paymentTerms, currency,
      ownerUserId, buyerUserId, draftEntityId, procurementType, selfDeliveringTeamId } = req.body || {};
    // Accept both budgetIds and budgetLineIds for compatibility
    const budgetLineIds = Array.isArray(req.body?.budgetLineIds)
      ? req.body.budgetLineIds.map(Number).filter(Number.isFinite)
      : (Array.isArray(req.body?.budgetIds) ? req.body.budgetIds.map(Number).filter(Number.isFinite) : []);
    if (!name) return res.status(400).json({ error: 'Name is required' });

    // Guard: prevent mixing awarded/contracted links
    if (budgetLineIds.length) {
      try {
        const related = await prisma.package.findMany({
          where: {
            projectId,
            // fetch any packages already linked to these budget lines
            budgetItems: { some: { budgetLineId: { in: budgetLineIds } } },
          },
          select: { id: true, name: true, status: true },
        });
        const conflicting = related.filter((p) => ['awarded', 'contracted'].includes(String(p.status || '').toLowerCase()));
        if (conflicting.length) {
          return res.status(409).json({
            error: 'LINES_ALREADY_COMMITTED',
            message: 'Some budget lines are in awarded/contracted packages.',
            packages: conflicting,
          });
        }
      } catch (_) {
        // non-fatal: if the join table or relation isn't present yet, continue
      }
    }

    const created = await prisma.package.create({
      data: {
        projectId,
        name,
        // Map description to scope for compatibility
        scope: (scope ?? description) || null,
        trade: (trade || tradeCategory) ?? null,
        costCodeId: costCodeId ?? null,
        // Extra fields (optional)
        targetAwardDate: targetAwardDate ? new Date(targetAwardDate) : null,
        requiredOnSite: requiredOnSite ? new Date(requiredOnSite) : null,
        leadTimeWeeks: leadTimeWeeks == null || leadTimeWeeks === '' ? null : Number(leadTimeWeeks),
        contractForm: contractForm == null ? null : String(contractForm),
        retentionPct: retentionPct == null || retentionPct === '' ? null : Number(retentionPct),
        paymentTerms: paymentTerms == null ? null : String(paymentTerms),
        currency: currency == null ? null : String(currency),
        ownerUserId: ownerUserId == null || ownerUserId === '' ? null : Number(ownerUserId),
        buyerUserId: buyerUserId == null || buyerUserId === '' ? null : Number(buyerUserId),
        procurementType: (procurementType === 'internal' ? 'internal' : 'external'),
        selfDeliveringTeamId: selfDeliveringTeamId == null || selfDeliveringTeamId === '' ? null : Number(selfDeliveringTeamId),
      },
      select: packageSelect,
    });
    // If internal procurement, auto-create a contract using tenant self-supplier
    try {
      if ((procurementType || '').toLowerCase() === 'internal') {
        let selfId = null;
        try {
          const kv = await prisma.tenantSetting.findFirst({ where: { tenantId, k: 'selfSupplierId' } });
          if (kv && kv.v != null) selfId = Number(kv.v);
        } catch (_) {}
        if (!selfId) {
          const self = await prisma.supplier.findFirst({ where: { tenantId, isInternal: true } });
          if (self) selfId = self.id;
        }
        if (selfId) {
          let value = 0;
          if (Array.isArray(budgetLineIds) && budgetLineIds.length) {
            try {
              const agg = await prisma.budgetLine.aggregate({ _sum: { amount: true }, where: { id: { in: budgetLineIds } } });
              value = Number(agg?._sum?.amount || 0);
            } catch (_) { value = 0; }
          }
          await prisma.contract.create({ data: { projectId, packageId: created.id, supplierId: selfId, title: `Internal Works – ${name}`, value, status: 'Approved', startDate: new Date() } });
          try { await prisma.auditLog?.create?.({ data: { entity: 'Contract', entityId: String(created.id), action: 'CREATE', changes: { reason: 'Auto-created internal contract from package create' } } }); } catch (_) {}
        }
      }
    } catch (_) {}
    // Try to attach budget lines if table exists (ignore on failure)
    if (Array.isArray(budgetLineIds) && budgetLineIds.length > 0) {
      try {
        await prisma.packageItem.createMany({ data: budgetLineIds.map((id) => ({ tenantId, packageId: created.id, budgetLineId: Number(id) })) });
      } catch (e) {
        if (e?.code === 'P2002') {
          return res.status(409).json({ error: 'LINES_ALREADY_COMMITTED', message: 'One or more budget lines are already linked to another package.' });
        }
      }
    }
    // If a draft document entityId was provided, relink draft document links to this package id
    try {
      if (draftEntityId != null) {
        await prisma.documentLink.updateMany({
          where: {
            tenantId,
            entityType: 'package',
            entityId: Number(draftEntityId)
          },
          data: { entityId: created.id },
        });
      }
    } catch (_) {}

    // Audit (best-effort; ignore if AuditLog schema differs)
    try {
      await prisma.auditLog?.create?.({
        data: {
          tenantId, // optional; ignored if column not present
          userId: req.user?.id ? Number(req.user.id) : null,
          entity: 'Package',
          entityId: String(created.id),
          action: 'CREATE',
          changes: { budgetLineIds },
        },
      }).catch(() => {});
    } catch (_) {}
    const row = safeJson(created); row.links = buildLinks('package', { ...row, projectId });
    // Respond with at least the id for minimal FE flows; keep full row for compatibility
    res.status(201).json({ ...row, id: created.id });
  } catch (e) { next(e); }
});

// GET /api/projects/:projectId/packages/:packageId — package detail with budget lines
router.get('/projects/:projectId/packages/:packageId', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const packageId = Number(req.params.packageId);
    let pkg = null;
    try {
      pkg = await prisma.package.findFirst({ where: { id: packageId, projectId }, select: { ...packageSelect, tenders: { select: { id: true, status: true, title: true } } } });
    } catch (_e) {
      // Fallback for older schemas (before extra fields were added)
      pkg = await prisma.package.findFirst({
        where: { id: packageId, projectId },
        select: {
          id: true, projectId: true, name: true, scope: true, trade: true, status: true,
          budgetEstimate: true, deadline: true, awardValue: true, awardSupplierId: true,
          createdAt: true, updatedAt: true, costCodeId: true,
          tenders: { select: { id: true, status: true, title: true } }
        }
      });
    }
    if (!pkg) return res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });
    const row = safeJson(pkg);
    // Attach budget lines via join table (robust to schema variants)
    try {
      const items = await prisma.packageItem.findMany({
        where: { packageId },
        select: {
          budgetLine: {
            select: {
              id: true,
              description: true,
              quantity: true,
              unit: true,
              rate: true,
              amount: true,
              costCode: { select: { id: true, code: true, description: true } },
            },
          },
        },
        orderBy: { id: 'asc' },
      });
      row.budgetLines = items
        .map((it) => (it && it.budgetLine ? {
          id: it.budgetLine.id,
          description: it.budgetLine.description,
          amount: Number(it.budgetLine.amount || 0),
          quantity: it.budgetLine.quantity != null ? Number(it.budgetLine.quantity) : null,
          unit: it.budgetLine.unit || 'ea',
          rate: it.budgetLine.rate != null ? Number(it.budgetLine.rate) : null,
          costCode: it.budgetLine.costCode ? { id: it.budgetLine.costCode.id, code: it.budgetLine.costCode.code, description: it.budgetLine.costCode.description || '' } : null,
        } : null))
        .filter(Boolean);
    } catch (_) {
      row.budgetLines = [];
    }
    row.links = buildLinks('package', { ...row, projectId });
    res.json(row);
  } catch (e) { next(e); }
});

// PATCH /api/projects/:projectId/packages/:packageId — update basic package fields
router.patch('/projects/:projectId/packages/:packageId', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const packageId = Number(req.params.packageId);
    const body = req.body || {};

    const data = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    // Map description -> scope for compatibility
    if (body.description !== undefined) data.scope = body.description == null ? null : String(body.description);
    if (body.trade !== undefined) data.trade = body.trade == null ? null : String(body.trade);
    if (body.tradeCategory !== undefined) data.tradeCategory = body.tradeCategory == null ? null : String(body.tradeCategory);
    // Dates
    if (body.targetAwardDate !== undefined) data.targetAwardDate = body.targetAwardDate ? new Date(body.targetAwardDate) : null;
    if (body.requiredOnSite !== undefined) data.requiredOnSite = body.requiredOnSite ? new Date(body.requiredOnSite) : null;
    // Numbers
    if (body.leadTimeWeeks !== undefined) data.leadTimeWeeks = body.leadTimeWeeks == null || body.leadTimeWeeks === '' ? null : Number(body.leadTimeWeeks);
    if (body.retentionPct !== undefined) data.retentionPct = body.retentionPct == null || body.retentionPct === '' ? null : Number(body.retentionPct);
    // Strings
    if (body.contractForm !== undefined) data.contractForm = body.contractForm == null ? null : String(body.contractForm);
    if (body.paymentTerms !== undefined) data.paymentTerms = body.paymentTerms == null ? null : String(body.paymentTerms);
    if (body.currency !== undefined) data.currency = body.currency == null ? null : String(body.currency);
    if (body.procurementType !== undefined) data.procurementType = (String(body.procurementType).toLowerCase() === 'internal') ? 'internal' : 'external';
    if (body.selfDeliveringTeamId !== undefined) data.selfDeliveringTeamId = body.selfDeliveringTeamId == null || body.selfDeliveringTeamId === '' ? null : Number(body.selfDeliveringTeamId);
    if (body.ownerUserId !== undefined) data.ownerUserId = body.ownerUserId == null || body.ownerUserId === '' ? null : Number(body.ownerUserId);
    if (body.buyerUserId !== undefined) data.buyerUserId = body.buyerUserId == null || body.buyerUserId === '' ? null : Number(body.buyerUserId);
    // costCodeId passthrough when provided (optional)
    if (body.costCodeId !== undefined) data.costCodeId = body.costCodeId == null ? null : Number(body.costCodeId);

    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'NO_FIELDS_TO_UPDATE' });

    const updated = await prisma.package.update({
      where: { id: packageId },
      data,
      select: packageSelect,
    });

    // Best-effort audit
    try {
      await prisma.auditLog?.create?.({
        data: {
          tenantId: req.user?.tenantId || req.tenantId || 'demo',
          userId: req.user?.id ? Number(req.user.id) : null,
          entity: 'Package',
          entityId: String(packageId),
          action: 'UPDATE',
          changes: data,
        }
      }).catch(()=>{});
    } catch (_) {}

    const row = safeJson(updated); row.links = buildLinks('package', { ...row, projectId });
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
