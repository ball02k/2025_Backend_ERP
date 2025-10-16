const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { safeJson } = require('../lib/serialize.cjs');

const packageSelectBase = {
  id: true,
  projectId: true,
  name: true,
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
};

const packageSelect = {
  ...packageSelectBase,
  scopeSummary: true,
  route: true,
};

function isScopeSummaryMissing(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (!msg.includes('scopesummary')) return false;
  return msg.includes('does not exist') || msg.includes('unknown column') || msg.includes('unknown field');
}

function dropScopeSummary(select) {
  if (!select || typeof select !== 'object') return select;
  if (!Object.prototype.hasOwnProperty.call(select, 'scopeSummary')) return select;
  const { scopeSummary, ...rest } = select;
  return rest;
}

function withSelect(obj, select) {
  return { ...obj, select };
}

function normalizeScopeSummary(row) {
  if (!row || typeof row !== 'object') return row;
  if (!Object.prototype.hasOwnProperty.call(row, 'scopeSummary')) {
    if (Object.prototype.hasOwnProperty.call(row, 'scope')) {
      row.scopeSummary = row.scope;
      delete row.scope;
    } else {
      row.scopeSummary = null;
    }
  }
  return row;
}

async function safePackageFindMany(opts) {
  try {
    const rows = await prisma.package.findMany(withSelect(opts, packageSelect));
    return rows.map((r) => normalizeScopeSummary(r));
  } catch (err) {
    if (isScopeSummaryMissing(err)) {
      console.warn('[package.select] fallback findMany', err.message);
      const rest = { ...opts };
      delete rest.select;
      const rows = await prisma.package.findMany(rest);
      return rows.map((r) => normalizeScopeSummary(r));
    }
    const rows = await prisma.package.findMany(withSelect(opts, packageSelectBase));
    return rows.map((r) => normalizeScopeSummary(r));
  }
}

async function safePackageFindFirst(opts) {
  try {
    const row = await prisma.package.findFirst(withSelect(opts, packageSelect));
    return normalizeScopeSummary(row);
  } catch (err) {
    if (isScopeSummaryMissing(err)) {
      console.warn('[package.select] fallback findFirst', err.message);
      const rest = { ...opts };
      delete rest.select;
      const row = await prisma.package.findFirst(rest);
      return normalizeScopeSummary(row);
    }
    const row = await prisma.package.findFirst(withSelect(opts, packageSelectBase));
    return normalizeScopeSummary(row);
  }
}

async function safePackageCreate(data, select = packageSelect) {
  try {
    const created = await prisma.package.create({ data, select });
    return normalizeScopeSummary(created);
  } catch (err) {
    if (isScopeSummaryMissing(err)) {
      console.warn('[package.select] fallback create', err.message);
      const { scopeSummary, ...rest } = data || {};
      if (scopeSummary !== undefined && !Object.prototype.hasOwnProperty.call(rest, 'scope')) {
        rest.scope = scopeSummary;
      }
      const fallbackSelect = select === packageSelect ? packageSelectBase : dropScopeSummary(select);
      const created = await prisma.package.create({ data: rest, select: fallbackSelect });
      return normalizeScopeSummary(created);
    }
    const fallbackSelect = select === packageSelect ? packageSelectBase : select;
    const created = await prisma.package.create({ data, select: fallbackSelect });
    return normalizeScopeSummary(created);
  }
}

async function safePackageUpdate(where, data, select = packageSelect) {
  try {
    const updated = await prisma.package.update({ where, data, select });
    return normalizeScopeSummary(updated);
  } catch (err) {
    if (isScopeSummaryMissing(err)) {
      console.warn('[package.select] fallback update', err.message);
      const { scopeSummary, ...rest } = data || {};
      if (scopeSummary !== undefined && !Object.prototype.hasOwnProperty.call(rest, 'scope')) {
        rest.scope = scopeSummary;
      }
      const fallbackSelect = select === packageSelect ? packageSelectBase : dropScopeSummary(select);
      const updated = await prisma.package.update({ where, data: rest, select: fallbackSelect });
      return normalizeScopeSummary(updated);
    }
    const fallbackSelect = select === packageSelect ? packageSelectBase : select;
    const updated = await prisma.package.update({ where, data, select: fallbackSelect });
    return normalizeScopeSummary(updated);
  }
}

// GET /api/projects/:projectId/packages — list packages with linked budget items
router.get('/projects/:projectId/packages', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const rows = await safePackageFindMany({
      where: { projectId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const data = rows.map(r => {
      const row = safeJson(r);
      if (!('route' in row)) row.route = null;
      if (!('scopeSummary' in row)) row.scopeSummary = null;
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
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const {
      name,
      description,
      scope,
      scopeSummary,
      tradeCategory,
      trade,
      costCodeId,
      attachments,
      targetAwardDate,
      requiredOnSite,
      leadTimeWeeks,
      contractForm,
      retentionPct,
      paymentTerms,
      currency,
      ownerUserId,
      buyerUserId,
      draftEntityId,
    } = req.body || {};
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

    const created = await safePackageCreate({
      projectId,
      name,
      // Map legacy scope/description fields into scopeSummary
      scopeSummary: (scopeSummary ?? scope ?? description) || null,
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
    });
    // Try to attach budget lines if table exists (ignore on failure)
    if (Array.isArray(budgetLineIds) && budgetLineIds.length > 0) {
      try {
        await prisma.packageItem.createMany({ data: budgetLineIds.map((id) => ({ tenantId, packageId: created.id, budgetLineId: Number(id) })) });
      } catch (_) {}
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
    const row = safeJson(created);
    if (!('route' in row)) row.route = null;
    if (!('scopeSummary' in row)) row.scopeSummary = null;
    row.links = buildLinks('package', { ...row, projectId });
    // Respond with at least the id for minimal FE flows; keep full row for compatibility
    res.json({ ...row, id: created.id });
  } catch (e) { next(e); }
});

// Helper: ensure a package is editable (status draft/ready, no issued/submitted/awarded tender, and no contract exists)
async function assertPackageEditable({ tenantId, projectId, packageId }) {
  const pkg = await prisma.package.findFirst({
    where: { id: packageId, projectId },
    select: {
      id: true,
      status: true,
      // relations for guard checks
      contracts: { select: { id: true } },
      tenders: { select: { id: true, status: true } },
      requests: { select: { id: true, status: true } },
      submissions: { select: { id: true, status: true } },
      project: { select: { tenantId: true } },
    },
  });
  if (!pkg || (pkg.project?.tenantId && pkg.project.tenantId !== tenantId)) {
    const err = new Error('PACKAGE_NOT_FOUND'); err.status = 404; throw err;
  }
  const status = String(pkg.status || '').toLowerCase();
  if (!['draft', 'ready'].includes(status)) {
    const err = new Error('Package not editable in current status'); err.status = 400; throw err;
  }
  // Normalize tender-like statuses; treat 'published' as 'issued'
  const badStatuses = new Set(['issued', 'submitted', 'awarded']);
  const normalize = (s) => {
    const v = String(s || '').toLowerCase();
    return v === 'published' ? 'issued' : v;
  };
  const tenderStatuses = [
    ...(pkg.tenders || []).map(t => normalize(t.status)),
    ...(pkg.requests || []).map(r => normalize(r.status)),
  ];
  const hasSubmissions = Array.isArray(pkg.submissions) && pkg.submissions.some(s => normalize(s.status) === 'submitted');
  const lockedByTender = tenderStatuses.some(s => badStatuses.has(s)) || hasSubmissions;
  if (lockedByTender) { const err = new Error('Package locked by tender status'); err.status = 400; throw err; }
  const hasContract = Array.isArray(pkg.contracts) && pkg.contracts.length > 0;
  if (hasContract) { const err = new Error('Package locked by existing contract'); err.status = 400; throw err; }
  return pkg;
}

// GET /api/projects/:projectId/packages/:packageId — package detail with budget lines
router.get('/projects/:projectId/packages/:packageId', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const packageId = Number(req.params.packageId);
    const selects = [
      {
        ...packageSelect,
        tenders: { select: { id: true, status: true, title: true } },
        contracts: { select: { id: true, status: true, type: true } },
      },
      {
        ...packageSelectBase,
        tenders: { select: { id: true, status: true, title: true } },
        contracts: { select: { id: true, status: true, type: true } },
      },
      {
        ...packageSelectBase,
        tenders: { select: { id: true, status: true, title: true } },
        contract: { select: { id: true, status: true } },
      },
      {
        ...packageSelectBase,
        tenders: { select: { id: true, status: true, title: true } },
      },
    ];
    let pkg = null;
    let lastError = null;
    for (const select of selects) {
      try {
        pkg = await prisma.package.findFirst({ where: { id: packageId, projectId }, select });
        if (pkg) break;
      } catch (err) {
        lastError = err;
        const msg = String(err?.message || '');
        if (!/Unknown field/.test(msg) && !isScopeSummaryMissing(err)) throw err;
      }
    }
    if (!pkg && lastError) throw lastError;
    if (!pkg) return res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });
    const row = safeJson(pkg);
    if (!row.contracts && row.contract) {
      row.contracts = row.contract ? [row.contract] : [];
    }
    if (!row.contracts) row.contracts = [];
    if (!('scopeSummary' in row)) row.scopeSummary = null;
    if (!('route' in row)) row.route = null;
    // Attach budget lines via join table (robust to schema variants)
    try {
      const items = await prisma.packageItem.findMany({
        where: { packageId },
        select: {
          budgetLine: {
            select: {
              id: true,
              description: true,
              amount: true,
              // quantity/rate/unit may not exist in schema; omit for safety
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
          quantity: null,
          unit: 'ea',
          rate: null,
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

// POST /api/projects/:projectId/packages/:packageId/items:add-from-budgets — assign unassigned budget lines to a package
router.post('/projects/:projectId/packages/:packageId/items:add-from-budgets', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const packageId = Number(req.params.packageId);
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const rawIds = Array.isArray(req.body?.budgetLineIds) ? req.body.budgetLineIds : req.body?.budgetIds;
    const budgetLineIds = Array.isArray(rawIds) ? rawIds.map(Number).filter(Number.isFinite) : [];
    if (!budgetLineIds.length) return res.status(400).json({ error: 'budgetLineIds required' });

    await assertPackageEditable({ tenantId, projectId, packageId });

    // Verify all lines belong to this project+tenant and are unassigned (no PackageItem at all)
    const lines = await prisma.budgetLine.findMany({
      where: { tenantId, projectId, id: { in: budgetLineIds } },
      select: { id: true },
    });
    if (lines.length !== budgetLineIds.length) return res.status(400).json({ error: 'Some lines not visible in project' });
    const existingLinks = await prisma.packageItem.findMany({ where: { budgetLineId: { in: budgetLineIds } }, select: { budgetLineId: true } });
    if (existingLinks.length) {
      const linked = Array.from(new Set(existingLinks.map(x => x.budgetLineId)));
      return res.status(400).json({ error: 'One or more items already assigned', linked });
    }

    await prisma.packageItem.createMany({ data: budgetLineIds.map((id) => ({ tenantId, packageId, budgetLineId: Number(id) })) });

    // Audit
    await prisma.auditLog?.create?.({
      data: { tenantId, userId: req.user?.id ? Number(req.user.id) : null, entity: 'Package', entityId: String(packageId), action: 'ADD_LINES', changes: { addedIds: budgetLineIds } }
    }).catch(()=>{});

    res.json({ ok: true, added: budgetLineIds.length });
  } catch (e) { next(e); }
});

// POST /api/projects/:projectId/packages/:packageId/items:remove — remove a single budget line link from the package
router.post('/projects/:projectId/packages/:packageId/items:remove', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const packageId = Number(req.params.packageId);
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const budgetLineId = Number(req.body?.budgetLineId);
    if (!Number.isFinite(budgetLineId)) return res.status(400).json({ error: 'budgetLineId required' });

    await assertPackageEditable({ tenantId, projectId, packageId });

    // Verify link exists for this package and tenant/project scope
    const link = await prisma.packageItem.findFirst({
      where: { packageId, budgetLineId },
      select: { id: true },
    });
    if (!link) return res.status(404).json({ error: 'Line not found on this package' });

    await prisma.packageItem.delete({ where: { id: link.id } });

    await prisma.auditLog?.create?.({
      data: { tenantId, userId: req.user?.id ? Number(req.user.id) : null, entity: 'Package', entityId: String(packageId), action: 'REMOVE_LINE', changes: { removedId: budgetLineId } }
    }).catch(()=>{});

    res.json({ ok: true, removed: budgetLineId });
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
  if (body.description !== undefined) data.scopeSummary = body.description == null ? null : String(body.description);
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
    if (body.ownerUserId !== undefined) data.ownerUserId = body.ownerUserId == null || body.ownerUserId === '' ? null : Number(body.ownerUserId);
    if (body.buyerUserId !== undefined) data.buyerUserId = body.buyerUserId == null || body.buyerUserId === '' ? null : Number(body.buyerUserId);
    // costCodeId passthrough when provided (optional)
    if (body.costCodeId !== undefined) data.costCodeId = body.costCodeId == null ? null : Number(body.costCodeId);

    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'NO_FIELDS_TO_UPDATE' });

    const updated = await safePackageUpdate({ id: packageId }, data);

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

    const row = safeJson(updated);
    if (!('route' in row)) row.route = null;
    if (!('scopeSummary' in row)) row.scopeSummary = null;
    row.links = buildLinks('package', { ...row, projectId });
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
      select: { id: true, projectId: true, name: true, scopeSummary: true, trade: true, status: true, budgetEstimate: true, deadline: true, awardValue: true, awardSupplierId: true, createdAt: true, updatedAt: true, costCodeId: true },
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
