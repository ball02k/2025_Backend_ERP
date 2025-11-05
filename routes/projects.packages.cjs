const router = require('express').Router({ mergeParams: true });
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { safeJson } = require('../lib/serialize.cjs');

const packageSelect = {
  id: true,
  projectId: true,
  name: true,
  scopeSummary: true,
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

function decimalToNumber(value) {
  if (value == null) return null;
  if (value instanceof Prisma.Decimal) {
    try { return Number(value); } catch (_) { return null; }
  }
  if (typeof value === 'bigint') {
    try { return Number(value); } catch (_) { return null; }
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function extractContracts(pkg) {
  const packageLineMap = new Map();
  if (Array.isArray(pkg?.lineItems)) {
    for (const li of pkg.lineItems) {
      if (!li || li.id == null) continue;
      packageLineMap.set(li.id, li.budgetLineItemId ?? null);
    }
  }
  const source = Array.isArray(pkg?.contracts) ? pkg.contracts : [];
  const summaries = source.map((contract) => {
    const supplier = contract?.supplier ? { id: contract.supplier.id, name: contract.supplier.name } : null;
    const lineItems = Array.isArray(contract?.lineItems)
      ? contract.lineItems.map((line) => {
          const budgetLineId =
            line?.budgetLineId != null
              ? line.budgetLineId
              : (line?.packageLineItemId != null ? packageLineMap.get(line.packageLineItemId) ?? null : null);
          return {
            id: line.id,
            budgetLineId,
            packageLineItemId: line.packageLineItemId ?? null,
            total: decimalToNumber(line.total),
          };
        })
      : [];
    return {
      id: contract.id,
      title: contract.title,
      contractRef: contract.contractRef,
      status: contract.status,
      value: decimalToNumber(contract.value),
      currency: contract.currency,
      supplier,
      lineItems,
    };
  });

  const assignmentMap = new Map();
  for (const summary of summaries) {
    const base = {
      contractId: summary.id,
      contractTitle: summary.title,
      contractRef: summary.contractRef,
      status: summary.status,
      supplier: summary.supplier,
      currency: summary.currency,
      awardValue: summary.value,
    };
    for (const line of summary.lineItems || []) {
      if (line?.budgetLineId == null) continue;
      if (!assignmentMap.has(line.budgetLineId)) {
        assignmentMap.set(line.budgetLineId, []);
      }
      assignmentMap.get(line.budgetLineId).push(base);
    }
  }

  return { summaries, assignmentMap };
}

function buildBudgetLines(pkg, assignmentMap) {
  const items = Array.isArray(pkg?.budgetItems) ? pkg.budgetItems : [];
  return items
    .map((item) => {
      const bl = item?.budgetLine;
      if (!bl) return null;
      const assignments = assignmentMap.get(bl.id) || [];
      const primary = assignments[0] || null;
      const qty = decimalToNumber(bl.qty);
      const rate = decimalToNumber(bl.rate);
      const explicitTotal = bl.total != null ? decimalToNumber(bl.total) : decimalToNumber(bl.amount);
      const computedTotal =
        explicitTotal != null
          ? explicitTotal
          : (qty != null && rate != null ? qty * rate : null);
      return {
        id: bl.id,
        description: bl.description,
        qty,
        unit: bl.unit || null,
        rate,
        total: computedTotal ?? 0,
        costCode: bl.costCode
          ? { id: bl.costCode.id, code: bl.costCode.code, description: bl.costCode.description || '' }
          : null,
        assignments,
        supplier: primary?.supplier || null,
        supplierName: primary?.supplier?.name || null,
        contract: primary
          ? {
              id: primary.contractId,
              title: primary.contractTitle,
              contractRef: primary.contractRef,
              status: primary.status,
            }
          : null,
        contractTitle: primary?.contractTitle || null,
      };
    })
    .filter(Boolean);
}

function normalizePackageRow(pkg, projectId) {
  const row = safeJson(pkg);
  row.scopeSummary = row.scopeSummary ?? row.scope ?? null;
  row.scope = row.scope ?? row.scopeSummary ?? null;
  if (pkg?.awardSupplier) {
    row.awardSupplier = { id: pkg.awardSupplier.id, name: pkg.awardSupplier.name };
  }
  const { summaries, assignmentMap } = extractContracts(pkg);
  row.contracts = summaries;
  row.contract = summaries.length
    ? {
        id: summaries[0].id,
        title: summaries[0].title,
        contractRef: summaries[0].contractRef,
        status: summaries[0].status,
        currency: summaries[0].currency,
        awardValue: summaries[0].value,
        supplier: summaries[0].supplier || null,
      }
    : null;
  row.budgetLines = buildBudgetLines(pkg, assignmentMap);
  row.budgetTotal = row.budgetLines.reduce((sum, line) => sum + Number(line.total || 0), 0);
  row.links = buildLinks('package', { ...row, projectId });
  return row;
}

// GET /api/projects/:projectId/packages — list packages with linked budget items
router.get('/projects/:projectId/packages', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    let rows = [];
    try {
      rows = await prisma.package.findMany({
        where: { projectId },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: {
          ...packageSelect,
          awardSupplier: {
            select: {
              id: true,
              name: true,
            },
          },
          contracts: {
            where: { status: { not: 'archived' } }, // Exclude archived contracts
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              title: true,
              contractRef: true,
              status: true,
              value: true,
              currency: true,
              supplier: { select: { id: true, name: true } },
              lineItems: {
                select: {
                  id: true,
                  budgetLineId: true,
                  packageLineItemId: true,
                  total: true,
                },
              },
            },
          },
          budgetItems: {
            include: { budgetLine: { include: { costCode: true } } },
          },
          lineItems: {
            select: { id: true, budgetLineItemId: true },
          },
        },
      });
    } catch (e) {
      // Fallback minimal selection if schema migrations not applied yet
      rows = await prisma.package.findMany({ where: { projectId }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: packageSelect });
    }

    // Check for existing RFx for each package
    const packageIds = rows.map(pkg => pkg.id);
    console.log('[projects.packages] Checking for tenders:', { tenantId, packageIds });
    const existingRfx = await prisma.request.findMany({
      where: { tenantId, packageId: { in: packageIds } },
      select: { id: true, packageId: true, status: true }
    }).catch((err) => {
      console.error('[projects.packages] Failed to query requests:', err.message);
      return [];
    });
    console.log('[projects.packages] Found tenders:', existingRfx);
    const rfxMap = new Map(existingRfx.map(r => [r.packageId, { id: r.id, status: r.status }]));

    const data = rows.map((pkg) => {
      const normalized = normalizePackageRow(pkg, projectId);

      // Determine sourcing status and related info
      let sourcingStatus = null;
      let tenderId = null;
      let contractId = null;

      // Check for active tender (Request table)
      const rfxInfo = rfxMap.get(pkg.id);
      if (rfxInfo && ['draft', 'open', 'issued', 'evaluating'].includes(rfxInfo.status)) {
        sourcingStatus = 'tender';
        tenderId = rfxInfo.id;
      }

      // Check for contract (takes precedence if exists)
      const primaryContract = normalized.contracts && normalized.contracts[0];
      if (primaryContract) {
        contractId = primaryContract.id;
        // If there's a contract without an active tender, it's likely a direct award
        if (!sourcingStatus) {
          sourcingStatus = 'direct_award';
        }
      }

      // Legacy fields for compatibility
      if (rfxInfo) {
        normalized.requestId = rfxInfo.id;
        normalized.hasRfx = true;
      }

      // Add sourcing fields
      normalized.sourcingStatus = sourcingStatus;
      normalized.tenderId = tenderId;
      normalized.contractId = contractId;

      // Debug log for first package
      if (pkg.id === packageIds[0]) {
        console.log('[projects.packages] First package sourcing:', {
          packageId: pkg.id,
          packageName: pkg.name,
          sourcingStatus,
          tenderId,
          contractId,
          hasContracts: normalized.contracts?.length,
        });
      }

      return normalized;
    });
    console.log('[projects.packages] Returning', data.length, 'packages');
    res.json({ items: data, total: data.length });
  } catch (e) { next(e); }
});

// POST /api/projects/:projectId/packages — create a package (optionally from selected budget lines)
router.post('/projects/:projectId/packages', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const { name, description, scope, tradeCategory, trade, costCodeId, attachments,
      targetAwardDate, requiredOnSite, leadTimeWeeks, contractForm, retentionPct, paymentTerms, currency,
      ownerUserId, buyerUserId, draftEntityId } = req.body || {};
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
        scopeSummary: (scope ?? description) || null,
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
      },
      select: packageSelect,
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
    row.scopeSummary = row.scopeSummary ?? row.scope ?? null;
    row.scope = row.scope ?? row.scopeSummary ?? null;
    row.links = buildLinks('package', { ...row, projectId });
    // Respond with at least the id for minimal FE flows; keep full row for compatibility
    res.json({ ...row, id: created.id });
  } catch (e) { next(e); }
});

// GET /api/projects/:projectId/packages/:packageId — package detail with budget lines
router.get('/projects/:projectId/packages/:packageId', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const packageId = Number(req.params.packageId);
    let pkg = null;
    let minimalMode = false;
    try {
      pkg = await prisma.package.findFirst({
        where: { id: packageId, projectId },
        select: {
          ...packageSelect,
          awardSupplier: { select: { id: true, name: true } },
          contracts: {
            where: { status: { not: 'archived' } }, // Exclude archived contracts
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              title: true,
              contractRef: true,
              status: true,
              value: true,
              currency: true,
              supplier: { select: { id: true, name: true } },
              lineItems: {
                select: {
                  id: true,
                  budgetLineId: true,
                  packageLineItemId: true,
                  total: true,
                },
              },
            },
          },
          budgetItems: {
            include: { budgetLine: { include: { costCode: true } } },
          },
          lineItems: { select: { id: true, budgetLineItemId: true } },
          tenders: { select: { id: true, status: true, title: true } },
        },
      });
    } catch (_e) {
      // Fallback for older schemas (before extra fields were added)
      minimalMode = true;
      pkg = await prisma.package.findFirst({
        where: { id: packageId, projectId },
        select: {
          id: true, projectId: true, name: true, scopeSummary: true, trade: true, status: true,
          budgetEstimate: true, deadline: true, awardValue: true, awardSupplierId: true,
          createdAt: true, updatedAt: true, costCodeId: true,
          tenders: { select: { id: true, status: true, title: true } }
        }
      });
    }
    if (!pkg) return res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });
    let row;
    if (!minimalMode && Array.isArray(pkg?.budgetItems)) {
      row = normalizePackageRow(pkg, projectId);
    } else {
      row = safeJson(pkg);
      row.scopeSummary = row.scopeSummary ?? row.scope ?? null;
      row.scope = row.scope ?? row.scopeSummary ?? null;
      // Attach budget lines via join table (legacy path)
      try {
        const items = await prisma.packageItem.findMany({
          where: { packageId },
          select: {
            budgetLine: {
              select: {
                id: true,
                description: true,
                amount: true,
                total: true,
                qty: true,
                rate: true,
                unit: true,
                costCode: { select: { id: true, code: true, description: true } },
              },
            },
          },
          orderBy: { id: 'asc' },
        });
        row.budgetLines = items
          .map((it) => {
            if (!it || !it.budgetLine) return null;
            const bl = it.budgetLine;
            const qty = bl.qty ?? null;
            const rate = bl.rate ?? null;
            const total = bl.total ?? bl.amount ?? (qty && rate ? Number(qty) * Number(rate) : null);
            return {
              id: bl.id,
              description: bl.description,
              amount: Number(total || bl.amount || 0),
              total: total != null ? Number(total) : null,
              qty: qty != null ? Number(qty) : null,
              quantity: qty != null ? Number(qty) : null,
              unit: bl.unit || 'ea',
              rate: rate != null ? Number(rate) : null,
              costCode: bl.costCode ? { id: bl.costCode.id, code: bl.costCode.code, description: bl.costCode.description || '' } : null,
            };
          })
          .filter(Boolean);
      } catch (e) {
        console.error('[projects/:projectId/packages/:packageId] budgetLines error:', e.message);
        row.budgetLines = [];
      }
      row.links = buildLinks('package', { ...row, projectId });
    }
    if (!Array.isArray(row.tenders) && Array.isArray(pkg?.tenders)) {
      row.tenders = pkg.tenders.map((t) => safeJson(t));
    }
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

    const row = safeJson(updated);
    row.scopeSummary = row.scopeSummary ?? row.scope ?? null;
    row.scope = row.scope ?? row.scopeSummary ?? null;
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
    let pkg;
    let minimalMode = false;
    try {
      pkg = await prisma.package.findFirst({
        where: { id: packageId, project: { tenantId } },
        select: {
          ...packageSelect,
          awardSupplier: { select: { id: true, name: true } },
          contracts: {
            where: { status: { not: 'archived' } }, // Exclude archived contracts
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              title: true,
              contractRef: true,
              status: true,
              value: true,
              currency: true,
              supplier: { select: { id: true, name: true } },
              lineItems: {
                select: {
                  id: true,
                  budgetLineId: true,
                  packageLineItemId: true,
                  total: true,
                },
              },
            },
          },
          budgetItems: {
            include: { budgetLine: { include: { costCode: true } } },
          },
          lineItems: { select: { id: true, budgetLineItemId: true } },
          project: { select: { id: true, name: true } },
        },
      });
    } catch (err) {
      minimalMode = true;
      pkg = await prisma.package.findFirst({
        where: { id: packageId, project: { tenantId } },
        select: {
          id: true, projectId: true, name: true, scopeSummary: true, trade: true, status: true,
          budgetEstimate: true, deadline: true, awardValue: true, awardSupplierId: true,
          createdAt: true, updatedAt: true, costCodeId: true,
          project: { select: { id: true, name: true } },
        },
      });
    }
    if (!pkg) return res.status(404).json({ error: 'Not found' });
    let row;
    if (!minimalMode && Array.isArray(pkg?.budgetItems)) {
      row = normalizePackageRow(pkg, pkg.projectId);
      if (pkg.project) row.project = safeJson(pkg.project);
    } else {
      row = safeJson(pkg);
      row.scopeSummary = row.scopeSummary ?? row.scope ?? null;
      row.scope = row.scope ?? row.scopeSummary ?? null;
      try {
        const items = await prisma.packageItem.findMany({
          where: { packageId },
          select: {
            budgetLine: {
              select: {
                id: true,
                description: true,
                amount: true,
                total: true,
                qty: true,
                rate: true,
                unit: true,
                costCode: { select: { id: true, code: true, description: true } },
              },
            },
          },
          orderBy: { id: 'asc' },
        });
        row.budgetLines = items
          .map((it) => {
            if (!it || !it.budgetLine) return null;
            const bl = it.budgetLine;
            const qty = bl.qty ?? null;
            const rate = bl.rate ?? null;
            const total = bl.total ?? bl.amount ?? (qty && rate ? Number(qty) * Number(rate) : null);
            return {
              id: bl.id,
              description: bl.description,
              amount: Number(total || bl.amount || 0),
              total: total != null ? Number(total) : null,
              qty: qty != null ? Number(qty) : null,
              quantity: qty != null ? Number(qty) : null,
              unit: bl.unit || 'ea',
              rate: rate != null ? Number(rate) : null,
              costCode: bl.costCode ? { id: bl.costCode.id, code: bl.costCode.code, description: bl.costCode.description || '' } : null,
            };
          })
          .filter(Boolean);
      } catch (e) {
        console.error('[packages/:packageId] budgetLines error:', e.message);
        row.budgetLines = [];
      }
      row.links = buildLinks('package', row);
    }

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
