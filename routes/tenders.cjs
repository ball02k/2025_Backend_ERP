const express = require('express');
const crypto = require('crypto');
const { Prisma } = require('@prisma/client');

const { requirePerm } = require('../middleware/checkPermission.cjs');
const { assertProjectMember } = require('../middleware/membership.cjs');
const { checkSupplierCompliance } = require('../services/compliance.service.cjs');
const { isPackageSourced } = require('../lib/sourcing.cjs');
const { createDraftContract } = require('../lib/contractWrites.cjs');

const ID_SELECT = { id: true };
const INACTIVE_STATUS_VALUES = ['cancelled', 'canceled', 'closed', 'terminated', 'withdrawn', 'void', 'archived', 'superseded', 'rejected', 'CANCELLED', 'CANCELED', 'CLOSED', 'TERMINATED', 'WITHDRAWN', 'VOID', 'ARCHIVED', 'SUPERSEDED', 'REJECTED'];

// ============================================================================
// LEGACY: This is the OLD Tender module
// ============================================================================
// For NEW work, prefer the RFx/Request module:
//   - Backend: routes/rfx*.cjs, routes/requests.cjs
//   - Frontend: RequestInvite, RfxDetails, etc.
// This legacy code is kept for backwards compatibility only.
// ============================================================================

module.exports = (prisma, { requireAuth }) => {
  const router = express.Router();

  function getTenantId(req) { return req.user && req.user.tenantId; }

  function hasAdminBypass(user) {
    const roles = Array.isArray(user?.roles) ? user.roles : user?.role ? [user.role] : [];
    return roles.includes('dev') || roles.includes('admin');
  }

  function toDecimal(value) {
    try {
      return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value || 0);
    } catch (_) {
      return new Prisma.Decimal(0);
    }
  }

  function getTraceId(req) {
    return (
      req._rid ||
      req.headers['x-request-id'] ||
      req.headers['x-trace-id'] ||
      req.headers['traceparent'] ||
      req.headers['x-correlation-id'] ||
      null
    );
  }

  async function findPackageAwardBlockers(tenantId, packageId) {
    const [awards, contracts, pos, invoices] = await Promise.all([
      prisma.award.findMany({
        where: { tenantId, packageId },
        select: { id: true, awardValue: true },
      }),
      prisma.contract.findMany({
        where: { tenantId, packageId, status: { notIn: INACTIVE_STATUS_VALUES } },
        select: { id: true, title: true, contractRef: true, status: true },
      }),
      prisma.purchaseOrder.findMany({
        where: { tenantId, packageId, status: { notIn: INACTIVE_STATUS_VALUES } },
        select: { id: true, code: true, status: true },
      }),
      prisma.invoice.findMany({
        where: { tenantId, packageId, status: { notIn: INACTIVE_STATUS_VALUES } },
        select: { id: true, number: true, status: true },
      }),
    ]);

    return [
      ...awards.map((row) => ({ type: 'Award', id: row.id, label: `Award ${row.id}`, stage: 'award' })),
      ...contracts.map((row) => ({ type: 'Contract', id: row.id, label: row.title || row.contractRef || `Contract ${row.id}`, status: row.status, stage: 'contract' })),
      ...pos.map((row) => ({ type: 'PurchaseOrder', id: row.id, label: row.code || `PO ${row.id}`, status: row.status, stage: 'finance' })),
      ...invoices.map((row) => ({ type: 'Invoice', id: row.id, label: row.number || `Invoice ${row.id}`, status: row.status, stage: 'finance' })),
    ];
  }

  function parseLimit(raw) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return 50;
    if (numeric <= 0) return 50;
    return Math.min(200, Math.max(1, Math.floor(numeric)));
  }

  function parseCursor(raw) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return Math.floor(numeric);
  }

  function buildCursorOptions(cursor) {
    if (!cursor) return {};
    return { skip: 1, cursor: { id: cursor } };
  }

  function convertResponseToCSV(response) {
    const rows = [];
    rows.push(['Field', 'Value']);
    rows.push(['Response ID', response.id]);
    rows.push(['Supplier ID', response.supplierId || '']);
    rows.push(['Price Total', response.priceTotal || 0]);
    rows.push(['Lead Time Days', response.leadTimeDays || '']);
    rows.push(['Submitted At', response.submittedAt || '']);
    rows.push(['Status', response.status || '']);
    rows.push(['']);
    rows.push(['Question', 'Answer']);

    const answers = JSON.parse(response.answers || '[]');
    for (const answer of answers) {
      const questionText = answer.questionText || `Question ${answer.questionId}`;
      const answerValue = typeof answer.value === 'string' && answer.value.startsWith('/uploads/')
        ? `[File: ${answer.value}]`
        : (answer.value || '');
      rows.push([questionText, answerValue]);
    }

    return rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  function isUnknownFieldError(err) {
    const message = String(err?.message || '').toLowerCase();
    if (!message) return false;
    if (message.includes('unknown') && (message.includes('field') || message.includes('argument'))) {
      return true;
    }
    return message.includes('relation') && message.includes('not found');
  }

  async function loadPackageForTenant(trx, tenantId, packageId) {
    try {
      const pkg = await trx.package.findFirst({
        where: { id: packageId, project: { tenantId } },
        select: { id: true, projectId: true, name: true },
      });
      if (pkg) return pkg;
    } catch (err) {
      if (!isUnknownFieldError(err)) throw err;
    }

    try {
      const pkg = await trx.package.findFirst({
        where: { id: packageId },
        select: {
          id: true,
          projectId: true,
          name: true,
          project: { select: { tenantId: true } },
        },
      });
      if (!pkg) return null;
      if (pkg.project?.tenantId != null && String(pkg.project.tenantId) !== String(tenantId)) {
        return null;
      }
      return {
        id: pkg.id,
        projectId: pkg.projectId,
        name: pkg.name,
      };
    } catch (err) {
      if (isUnknownFieldError(err)) {
        return null;
      }
      throw err;
    }
  }

  async function listTendersPage(tenantId, { take, cursor }) {
    const includeAttempts = [
      {
        package: {
          select: {
            id: true,
            name: true,
            awardSupplier: { select: { id: true, name: true } },
            awardedToSupplier: { select: { id: true, name: true } },
          },
        },
      },
      {
        package: {
          select: {
            id: true,
            name: true,
            awardSupplier: { select: { id: true, name: true } },
          },
        },
      },
      {
        package: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    ];

    for (const include of includeAttempts) {
      try {
        return await prisma.tender.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take,
          ...buildCursorOptions(cursor),
          include,
        });
      } catch (err) {
        if (!isUnknownFieldError(err)) throw err;
      }
    }

    return prisma.tender.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take,
      ...buildCursorOptions(cursor),
    });
  }

  function serializeTender(row) {
    if (!row) return null;
    const pkg = row.package || null;
    const awardedSupplier = pkg?.awardedToSupplier || pkg?.awardSupplier || null;
    return {
      id: row.id,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      package: pkg
        ? {
            id: pkg.id,
            name: pkg.name || null,
          }
        : null,
      awardedTo: awardedSupplier
        ? {
            id: awardedSupplier.id,
            name: awardedSupplier.name || null,
          }
        : null,
    };
  }

  // POST /api/tenders/create — create draft tender when package unsourced.
  router.post('/create', requireAuth, async (req, res) => {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ error: 'UNAUTHENTICATED' });

    const packageId = Number(req.body?.packageId);
    if (!Number.isFinite(packageId)) return res.status(400).json({ error: 'INVALID_PACKAGE_ID' });

    const traceId = getTraceId(req);

    try {
      const alreadySourced = await isPackageSourced(prisma, tenantId, packageId);
      if (alreadySourced) {
        console.warn(`[REQ ${traceId}] tender.create package already sourced`, { tenantId, packageId });
        return res.status(409).json({ error: 'PACKAGE_ALREADY_HAS_SOURCING' });
      }

      const created = await prisma.$transaction(async (trx) => {
        const pkg = await loadPackageForTenant(trx, tenantId, packageId);
        if (!pkg) {
          const err = new Error('Package not found');
          err.status = 404;
          throw err;
        }

        const label = pkg.name ? String(pkg.name) : `Package ${pkg.id}`;
        return trx.tender.create({
          data: {
            tenantId,
            projectId: pkg.projectId,
            packageId: pkg.id,
            status: 'draft',
            title: `Tender - ${label}`,
          },
          select: { id: true },
        });
      });

      console.info(`[REQ ${traceId}] tender.create success`, { tenantId, packageId, tenderId: created.id });
      return res.status(201).json({ id: created.id });
    } catch (err) {
      if (err?.status === 404) {
        console.warn(`[REQ ${traceId}] tender.create package not found`, { tenantId, packageId });
        return res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });
      }
      console.error(`[REQ ${traceId}] tender.create unexpected error`, err);
      return res.status(500).json({ error: 'FAILED_TO_CREATE_TENDER' });
    }
  });

  // GET /api/tenders/list — paginated tenders overview for list view.
  router.get('/list', requireAuth, async (req, res) => {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ error: 'UNAUTHENTICATED' });

    const limit = parseLimit(req.query?.limit);
    const cursor = parseCursor(req.query?.cursor);
    const take = limit + 1;
    const traceId = getTraceId(req);

    try {
      const rows = await listTendersPage(tenantId, { take, cursor });
      const hasMore = rows.length > limit;
      const sliced = hasMore ? rows.slice(0, limit) : rows;
      const items = sliced.map(serializeTender).filter(Boolean);
      const nextCursor = hasMore ? String(sliced[sliced.length - 1].id) : null;

      console.info(`[REQ ${traceId}] tenders.list`, {
        tenantId,
        limit,
        cursor,
        returned: items.length,
        nextCursor,
      });

      return res.json({ items, nextCursor });
    } catch (err) {
      console.error(`[REQ ${traceId}] tenders.list error`, err);
      return res.status(500).json({ error: 'FAILED_TO_LIST_TENDERS' });
    }
  });

  // GET /api/tenders?projectId=&packageId=&status=
  // List tenders for current tenant with optional filters. Useful when project-scoped route is unavailable.
  router.get('/', requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const where = { tenantId };
      if (req.query.projectId) where.projectId = Number(req.query.projectId);
      if (req.query.packageId) where.packageId = Number(req.query.packageId);
      if (req.query.status) where.status = String(req.query.status);
      const rows = await prisma.tender.findMany({ where, orderBy: [{ updatedAt: 'desc' }], include: { package: true } });
      res.json(rows);
    } catch (err) {
      console.error('list tenders error', err);
      res.status(500).json({ error: 'Failed to list tenders' });
    }
  });

  // POST /api/tenders/:tenderId/invites
  router.post('/:tenderId/invites', requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tenderId = Number(req.params.tenderId);
      const supplierIds = Array.isArray(req.body?.supplierIds) ? req.body.supplierIds : [];
      if (!Number.isFinite(tenderId) || !supplierIds.length) return res.status(400).json({ error: 'Invalid payload' });
      // Validate tender belongs to tenant
      const t = await prisma.tender.findFirst({ where: { id: tenderId, tenantId } });
      if (!t) return res.status(404).json({ error: 'Tender not found' });
      const invites = await prisma.$transaction(
        supplierIds.map((sid) =>
          prisma.tenderSupplierInvite.create({
            data: {
              tenantId,
              tenderId,
              supplierId: Number(sid),
              inviteToken: crypto.randomUUID(),
            },
          })
        )
      );
      res.status(201).json(invites);
    } catch (err) {
      console.error('invite suppliers error', err);
      res.status(500).json({ error: 'Failed to invite suppliers' });
    }
  });

  // GET /api/tenders/:tenderId/invites — list existing invites with tokens
  router.get('/:tenderId/invites', requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tenderId = Number(req.params.tenderId);
      if (!Number.isFinite(tenderId)) return res.status(400).json({ error: 'Invalid tenderId' });
      const t = await prisma.tender.findFirst({ where: { id: tenderId, tenantId } });
      if (!t) return res.status(404).json({ error: 'Tender not found' });
      const invites = await prisma.tenderSupplierInvite.findMany({
        where: { tenantId, tenderId },
        orderBy: [{ id: 'desc' }],
      });
      res.json(invites);
    } catch (err) {
      console.error('list invites error', err);
      res.status(500).json({ error: 'Failed to list invites' });
    }
  });

  // PUBLIC: GET /public/rfx/:token → tender + questions
  router.get('/public/rfx/:token', async (req, res) => {
    try {
      const token = String(req.params.token || '');
      const invite = await prisma.tenderSupplierInvite.findFirst({ where: { inviteToken: token } });
      if (!invite) return res.status(404).json({ error: 'Invalid or expired' });
      const tender = await prisma.tender.findUnique({
        where: { id: invite.tenderId },
        include: { package: true, questions: true },
      });
      if (!tender || tender.tenantId !== invite.tenantId) return res.status(404).json({ error: 'Invalid' });
      res.json({ tender, invite });
    } catch (err) {
      console.error('public rfx fetch error', err);
      res.status(500).json({ error: 'Failed to load RFx' });
    }
  });

  // PUBLIC: POST /public/rfx/:token/submit
  router.post('/public/rfx/:token/submit', express.json({ limit: '5mb' }), async (req, res) => {
    try {
      const token = String(req.params.token || '');
      const invite = await prisma.tenderSupplierInvite.findFirst({ where: { inviteToken: token } });
      if (!invite) return res.status(404).json({ error: 'Invalid' });
      const tenantId = invite.tenantId;
      const tenderId = invite.tenderId;
      const { priceTotal, leadTimeDays, answers } = req.body || {};
      // simple auto-scoring
      const qs = await prisma.tenderQuestion.findMany({ where: { tenderId, tenantId } });
      const byId = new Map(qs.map((q) => [q.id, q]));
      let autoScore = 0;
      for (const a of Array.isArray(answers) ? answers : []) {
        const q = byId.get(Number(a.questionId));
        if (!q) continue;
        const v = Number(a.value);
        const s = q.type === 'number' ? Math.min(1, Math.max(0, isFinite(v) ? v : 0)) : 0;
        autoScore += s * Number(q.weight || 0);
      }
      const resp = await prisma.tenderResponse.create({
        data: {
          tenantId,
          tenderId,
          supplierId: invite.supplierId,
          priceTotal: Number(priceTotal || 0),
          leadTimeDays: leadTimeDays != null ? Number(leadTimeDays) : null,
          answers: Array.isArray(answers) ? answers : [],
          autoScore,
          source: 'supplier',
          attachments: req.body?.attachments || null,
        },
      });
      await prisma.tenderSupplierInvite.update({ where: { id: invite.id }, data: { status: 'responded' } });
      res.status(201).json(resp);
    } catch (err) {
      console.error('public rfx submit error', err);
      res.status(500).json({ error: 'Failed to submit response' });
    }
  });

  // POST /api/tenders/:tenderId/manual-response — buyer-entered response
  router.post('/:tenderId/manual-response', requireAuth, express.json({ limit: '5mb' }), async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tenderId = Number(req.params.tenderId);
      const { supplierId, supplierName, priceTotal, manualScore, notes, attachments } = req.body || {};
      if (!Number.isFinite(tenderId)) return res.status(400).json({ error: 'Invalid tenderId' });
      const tender = await prisma.tender.findFirst({ where: { id: tenderId, tenantId } });
      if (!tender) return res.status(404).json({ error: 'Tender not found' });

      let sid = Number(supplierId || 0);
      if (!sid && supplierName) {
        const s = await prisma.supplier.create({ data: { tenantId, name: String(supplierName) } });
        sid = s.id;
      }
      if (!sid) return res.status(400).json({ error: 'supplierId or supplierName required' });

      const created = await prisma.tenderResponse.create({
        data: {
          tenantId,
          tenderId,
          supplierId: sid,
          priceTotal: Number(priceTotal || 0),
          answers: [],
          autoScore: 0,
          manualScore: Number(manualScore || 0),
          notes: notes || null,
          source: 'buyer',
          attachments: Array.isArray(attachments) ? attachments : attachments ? [attachments] : null,
        },
      });
      res.status(201).json(created);
    } catch (err) {
      console.error('manual response error', err);
      res.status(500).json({ error: 'Failed to add manual response' });
    }
  });

  // PATCH /api/tenders/:tenderId/responses/:responseId/reject — mark as rejected
  router.patch('/:tenderId/responses/:responseId/reject', requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tenderId = Number(req.params.tenderId);
      const id = Number(req.params.responseId);
      const r = await prisma.tenderResponse.findFirst({ where: { id, tenderId, tenantId } });
      if (!r) return res.status(404).json({ error: 'Not found' });
      const updated = await prisma.tenderResponse.update({ where: { id }, data: { notes: r.notes ? `${r.notes} | REJECTED` : 'REJECTED' } });
      res.json(updated);
    } catch (err) {
      console.error('reject response error', err);
      res.status(500).json({ error: 'Failed to reject response' });
    }
  });

  // POST /api/tenders/:tenderId/invites — return public share URL
  // (already implemented above). Also compute share URL for convenience.
  const origInvitesPost = router.stack.find(l => l.route && l.route.path === '/:tenderId/invites' && l.route.methods.post);
  // No-op: route exists. Add a lightweight GET that includes share URLs as well.
  router.get('/:tenderId/invites/with-links', requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tenderId = Number(req.params.tenderId);
      if (!Number.isFinite(tenderId)) return res.status(400).json({ error: 'Invalid tenderId' });
      const list = await prisma.tenderSupplierInvite.findMany({ where: { tenantId, tenderId }, orderBy: [{ id: 'desc' }] });
      const base = process.env.PUBLIC_BASE_URL || 'http://localhost:5173';
      const rows = list.map(i => ({ ...i, publicUrl: `${base}/rfx-public/${i.inviteToken}` }));
      res.json(rows);
    } catch (err) {
      console.error('invites with-links error', err);
      res.status(500).json({ error: 'Failed to list invites' });
    }
  });

  // GET /api/tenders/:tenderId/responses
  router.get('/:tenderId/responses', requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tenderId = Number(req.params.tenderId);

      // Query both response stores. Older/public RFx submissions write TenderResponse,
      // while newer builder flows write RequestResponse.
      const rows = await prisma.requestResponse.findMany({
        where: { requestId: tenderId, tenantId },
        orderBy: [{ submittedAt: 'desc' }],
      });

      // Fetch supplier information and transform answers for each response
      const enrichedRows = await Promise.all(rows.map(async (row) => {
        const supplier = await prisma.supplier.findUnique({
          where: { id: row.supplierId },
        });

        // Transform answers from object format to array format expected by frontend
        // RequestResponse stores answers as: { "q_19": "value", "q_20": "value", "totalPrice": 123, ... }
        // Frontend expects: [{ questionId: 19, value: "value" }, { questionId: 20, value: "value" }]
        const answersObj = row.answers || {};

        // Extract question answers (fields starting with q_)
        const answersArray = Object.entries(answersObj)
          .filter(([key]) => key.startsWith('q_'))
          .map(([key, value]) => ({
            questionId: Number(key.replace('q_', '')),
            value: value,
          }));

        // Extract other fields from answers object and put them at top level
        const {
          totalPrice,
          programmeStart,
          programmeEnd,
          methodStatement,
          hsqNotes,
          clarifications,
          supplierName,
          contactFirstName,
          contactLastName,
          email,
          ...otherAnswers
        } = answersObj;

        return {
          ...row,
          answers: answersArray,
          supplier,
          supplierName: supplierName || supplier?.name || 'Unknown',
          totalPrice: totalPrice || null,
          programmeStart: programmeStart || null,
          programmeEnd: programmeEnd || null,
          methodStatement: methodStatement || null,
          hsqNotes: hsqNotes || null,
          clarifications: clarifications || null,
          contactFirstName: contactFirstName || null,
          contactLastName: contactLastName || null,
          email: email || null,
        };
      }));

      const tenderRows = await prisma.tenderResponse.findMany({
        where: { tenderId, tenantId },
        include: { supplier: true },
        orderBy: [{ submittedAt: 'desc' }],
      });

      const legacyRows = tenderRows.map((row) => ({
        ...row,
        supplierName: row.supplier?.name || 'Unknown',
        totalPrice: row.priceTotal != null ? Number(row.priceTotal) : null,
        manualScore: row.manualScore != null ? Number(row.manualScore) : null,
        autoScore: row.autoScore != null ? Number(row.autoScore) : null,
        source: row.source || 'supplier',
      }));

      res.json([...enrichedRows, ...legacyRows]);
    } catch (err) {
      console.error('list responses error', err);
      res.status(500).json({ error: 'Failed to load responses' });
    }
  });

  // PATCH /api/tenders/:tenderId/responses/:responseId/score
  router.patch('/:tenderId/responses/:responseId/score', requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tenderId = Number(req.params.tenderId);
      const id = Number(req.params.responseId);
      const { manualScore, notes } = req.body || {};

      // Ensure response belongs to tender+tenant. New builder flows use
      // RequestResponse; public RFx submissions use TenderResponse.
      const r = await prisma.requestResponse.findFirst({
        where: { id, requestId: tenderId, tenantId }
      });
      if (r) {
        const updated = await prisma.requestResponse.update({
          where: { id },
          data: { score: manualScore ? Number(manualScore) : null }
        });
        return res.json(updated);
      }

      const legacy = await prisma.tenderResponse.findFirst({
        where: { id, tenderId, tenantId }
      });
      if (!legacy) return res.status(404).json({ error: 'Not found' });

      const updated = await prisma.tenderResponse.update({
        where: { id },
        data: {
          manualScore: manualScore ? Number(manualScore) : null,
          notes: notes !== undefined ? notes : legacy.notes,
        }
      });

      res.json(updated);
    } catch (err) {
      console.error('score response error', err);
      res.status(500).json({ error: 'Failed to update score' });
    }
  });

  // GET /api/tenders/:tenderId/responses/:responseId/download
  router.get('/:tenderId/responses/:responseId/download', requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tenderId = Number(req.params.tenderId);
      const responseId = Number(req.params.responseId);
      const includeAttachments = req.query.include === 'attachments';

      // Get the response
      const response = await prisma.requestResponse.findFirst({
        where: { id: responseId, requestId: tenderId, tenantId }
      });

      if (!response) return res.status(404).json({ error: 'Response not found' });

      if (includeAttachments) {
        // Create a zip with CSV + attachments
        const archiver = require('archiver');
        const archive = archiver('zip', { zlib: { level: 9 } });

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="response-${responseId}-full.zip"`);

        archive.pipe(res);

        // Add CSV
        const csv = convertResponseToCSV(response);
        archive.append(csv, { name: 'response.csv' });

        // Add attachments
        const answers = JSON.parse(response.answers || '[]');
        for (const answer of answers) {
          if (answer.value && typeof answer.value === 'string' && answer.value.startsWith('/uploads/')) {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, '..', answer.value);
            if (fs.existsSync(filePath)) {
              archive.file(filePath, { name: path.basename(answer.value) });
            }
          }
        }

        archive.finalize();
      } else {
        // Just return CSV
        const csv = convertResponseToCSV(response);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="response-${responseId}.csv"`);
        res.send(csv);
      }
    } catch (err) {
      console.error('download response error', err);
      res.status(500).json({ error: 'Failed to download response' });
    }
  });

  // GET /api/tenders/:tenderId/responses/:responseId/attachments/download
  router.get('/:tenderId/responses/:responseId/attachments/download', requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tenderId = Number(req.params.tenderId);
      const responseId = Number(req.params.responseId);

      // Get the response
      const response = await prisma.requestResponse.findFirst({
        where: { id: responseId, requestId: tenderId, tenantId }
      });

      if (!response) return res.status(404).json({ error: 'Response not found' });

      const archiver = require('archiver');
      const archive = archiver('zip', { zlib: { level: 9 } });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="attachments-${responseId}.zip"`);

      archive.pipe(res);

      // Add all attachments
      const answers = JSON.parse(response.answers || '[]');
      let fileCount = 0;
      for (const answer of answers) {
        if (answer.value && typeof answer.value === 'string' && answer.value.startsWith('/uploads/')) {
          const fs = require('fs');
          const path = require('path');
          const filePath = path.join(__dirname, '..', answer.value);
          if (fs.existsSync(filePath)) {
            archive.file(filePath, { name: path.basename(answer.value) });
            fileCount++;
          }
        }
      }

      if (fileCount === 0) {
        return res.status(404).json({ error: 'No attachments found' });
      }

      archive.finalize();
    } catch (err) {
      console.error('download attachments error', err);
      res.status(500).json({ error: 'Failed to download attachments' });
    }
  });

  // GET /api/tenders/:tenderId/compare/excel
  router.get('/:tenderId/compare/excel', requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tenderId = Number(req.params.tenderId);
      const responseIds = req.query.ids ? req.query.ids.split(',').map(Number) : [];

      // Get tender and responses
      const tender = await prisma.tender.findFirst({
        where: { id: tenderId, tenantId }
      });

      if (!tender) return res.status(404).json({ error: 'Tender not found' });

      // Get responses
      const responses = await prisma.tenderResponse.findMany({
        where: {
          tenderId,
          tenantId,
          ...(responseIds.length > 0 ? { id: { in: responseIds } } : {})
        },
        include: {
          supplier: true
        }
      });

      if (responses.length === 0) {
        return res.status(400).json({ error: 'No responses found' });
      }

      // Create Excel workbook
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Supplier Comparison');

      // Set up headers
      const headers = ['Criterion', ...responses.map(r => r.supplier?.name || `Supplier #${r.supplierId}`)];
      worksheet.addRow(headers);

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, size: 12 };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' }
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      // Add data rows
      const fields = [
        { key: 'priceTotal', label: 'Total Price', format: v => v || 0 },
        { key: 'leadTimeDays', label: 'Lead Time (days)', format: v => v || '—' },
        { key: 'weightedScore', label: 'Overall Score', format: v => v?.toFixed(1) || '—' },
        { key: 'technicalScore', label: 'Technical Score', format: v => v?.toFixed(1) || '—' },
        { key: 'commercialScore', label: 'Commercial Score', format: v => v?.toFixed(1) || '—' },
      ];

      for (const field of fields) {
        const rowData = [field.label, ...responses.map(r => field.format(r[field.key]))];
        worksheet.addRow(rowData);
      }

      // Add rank row
      worksheet.addRow(['Rank', ...responses.map(r => r.rank ? `#${r.rank}` : '—')]);

      // Add submitted date row
      worksheet.addRow(['Submitted', ...responses.map(r => {
        if (!r.submittedAt) return '—';
        return new Date(r.submittedAt).toLocaleDateString('en-GB');
      })]);

      // Auto-size columns
      worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, cell => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = maxLength < 10 ? 10 : maxLength + 2;
      });

      // Stream the workbook to response
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="tender-${tenderId}-comparison.xlsx"`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('excel export error', err);
      res.status(500).json({ error: 'Failed to export to Excel' });
    }
  });

  // GET /api/tenders/:tenderId/compare/report
  router.get('/:tenderId/compare/report', requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tenderId = Number(req.params.tenderId);
      const responseIds = req.query.ids ? req.query.ids.split(',').map(Number) : [];

      // Get tender and responses
      const tender = await prisma.tender.findFirst({
        where: { id: tenderId, tenantId },
        include: { project: true }
      });

      if (!tender) return res.status(404).json({ error: 'Tender not found' });

      // Get responses
      const responses = await prisma.tenderResponse.findMany({
        where: {
          tenderId,
          tenantId,
          ...(responseIds.length > 0 ? { id: { in: responseIds } } : {})
        },
        include: {
          supplier: true
        }
      });

      if (responses.length === 0) {
        return res.status(400).json({ error: 'No responses found' });
      }

      // Create PDF document
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 50, size: 'A4' });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="tender-${tenderId}-comparison-report.pdf"`);

      doc.pipe(res);

      // Title
      doc.fontSize(20).font('Helvetica-Bold').text('Tender Comparison Report', { align: 'center' });
      doc.moveDown();

      // Tender info
      doc.fontSize(12).font('Helvetica');
      doc.text(`Tender: ${tender.title}`, { continued: false });
      if (tender.project) {
        doc.text(`Project: ${tender.project.name}`, { continued: false });
      }
      doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, { continued: false });
      doc.moveDown(2);

      // Summary table
      doc.fontSize(14).font('Helvetica-Bold').text('Supplier Comparison Summary');
      doc.moveDown(0.5);

      const tableTop = doc.y;
      const colWidth = 140;
      const rowHeight = 25;

      // Table headers
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Criterion', 50, tableTop, { width: colWidth });

      responses.forEach((response, i) => {
        const x = 50 + colWidth + (i * colWidth);
        const supplierName = response.supplier?.name || `Supplier #${response.supplierId}`;
        doc.text(supplierName.substring(0, 18), x, tableTop, { width: colWidth, align: 'center' });
      });

      // Table rows
      const fields = [
        { key: 'priceTotal', label: 'Total Price', format: v => `£${(v || 0).toLocaleString()}` },
        { key: 'leadTimeDays', label: 'Lead Time', format: v => v ? `${v} days` : '—' },
        { key: 'weightedScore', label: 'Overall Score', format: v => v?.toFixed(1) || '—' },
        { key: 'technicalScore', label: 'Technical', format: v => v?.toFixed(1) || '—' },
        { key: 'commercialScore', label: 'Commercial', format: v => v?.toFixed(1) || '—' },
        { key: 'rank', label: 'Rank', format: v => v ? `#${v}` : '—' },
      ];

      doc.font('Helvetica');
      fields.forEach((field, rowIndex) => {
        const y = tableTop + rowHeight + (rowIndex * rowHeight);

        // Criterion name
        doc.text(field.label, 50, y, { width: colWidth });

        // Values for each response
        responses.forEach((response, i) => {
          const x = 50 + colWidth + (i * colWidth);
          const value = field.format(response[field.key]);
          doc.text(value, x, y, { width: colWidth, align: 'center' });
        });
      });

      // Recommendation section
      doc.moveDown(fields.length + 3);
      doc.fontSize(14).font('Helvetica-Bold').text('Recommendation');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');

      // Find top-ranked response
      const topResponse = responses.sort((a, b) => (a.rank || 999) - (b.rank || 999))[0];
      if (topResponse) {
        const topSupplierName = topResponse.supplier?.name || `Supplier #${topResponse.supplierId}`;
        doc.text(`Based on the evaluation criteria, ${topSupplierName} is ranked #${topResponse.rank || 1} with an overall score of ${topResponse.weightedScore?.toFixed(1) || 'N/A'}.`);
        doc.moveDown(0.5);
        doc.text(`Total price: £${(topResponse.priceTotal || 0).toLocaleString()}`);
        if (topResponse.leadTimeDays) {
          doc.text(`Lead time: ${topResponse.leadTimeDays} days`);
        }
      }

      // Footer
      doc.fontSize(8).text(
        `Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );

      doc.end();
    } catch (err) {
      console.error('report generation error', err);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  // POST /api/tenders/:tenderId/award
  router.post('/:tenderId/award', requireAuth, requirePerm('procurement:award'), async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const userId = req.user?.id ? Number(req.user.id) : null;
      const tenderId = Number(req.params.tenderId);
      const { responseId, contractRef, startDate, endDate, complianceOverrideReason } = req.body || {};
      const tender = await prisma.tender.findFirst({
        where: { id: tenderId, tenantId },
        include: {
          project: { select: { id: true, code: true, name: true } },
          package: { include: { contractType: true } },
        },
      });
      if (!tender) return res.status(404).json({ error: 'Tender not found' });
      if (!tender.packageId) {
        return res.status(400).json({ error: 'PACKAGE_REQUIRED_FOR_AWARD' });
      }

      if (!hasAdminBypass(req.user)) {
        const membership = await assertProjectMember({ userId, projectId: tender.projectId, tenantId });
        if (!membership) {
          return res.status(403).json({ error: 'NOT_A_PROJECT_MEMBER' });
        }
      }

      const resp = await prisma.tenderResponse.findFirst({ where: { id: Number(responseId), tenantId, tenderId } });
      if (!resp) return res.status(400).json({ error: 'Invalid response' });

      const compliance = await checkSupplierCompliance(tenantId, resp.supplierId);
      if (!compliance.ok && !complianceOverrideReason) {
        return res.status(409).json({
          error: 'COMPLIANCE_BLOCK',
          message: compliance.summary || 'Supplier compliance is incomplete',
          details: compliance,
        });
      }

      const pkg = tender.package || null;
      if (pkg?.awardedToSupplierId) {
        return res.status(409).json({ error: 'ALREADY_AWARDED', message: 'Package already awarded' });
      }
      const blockers = await findPackageAwardBlockers(tenantId, tender.packageId);
      if (blockers.length) {
        return res.status(409).json({
          error: 'PACKAGE_AWARD_BLOCKED',
          message: 'This package already has award, contract or finance activity. Cancel/reverse that stage before awarding it again.',
          blockers,
        });
      }
      const awardValue = toDecimal(resp.totalBidValue ?? resp.priceTotal);
      const awardDate = req.body?.awardDate ? new Date(req.body.awardDate) : new Date();
      const projectCode = tender.project?.code || `P${tender.projectId}`;
      const generatedRef = `${projectCode}-${pkg ? `PKG${pkg.id}` : `T${tender.id}`}-CTR-${Date.now().toString().slice(-6)}`;
      const title = req.body?.title || (pkg ? `${pkg.name} - Tender Award` : tender.title);
      const retention = req.body?.retentionPct != null && req.body.retentionPct !== ''
        ? toDecimal(req.body.retentionPct)
        : (pkg?.retentionPct ?? pkg?.contractType?.retentionRate ?? new Prisma.Decimal(5));
      const paymentTerms = req.body?.paymentTerms || pkg?.paymentTerms || pkg?.contractType?.paymentTerms || null;

      const result = await prisma.$transaction(async (tx) => {
        const award = await tx.award.create({
          data: {
            tenantId,
            projectId: tender.projectId,
            packageId: tender.packageId,
            supplierId: resp.supplierId,
            awardValue,
            awardDate,
            overrideUsed: Boolean(!compliance.ok),
            overrideReason: complianceOverrideReason || null,
          },
          select: ID_SELECT,
        });

        const contract = await createDraftContract(tx, {
          tenantId,
          projectId: tender.projectId,
          packageId: tender.packageId ?? null,
          supplierId: resp.supplierId,
          title,
          contractRef: contractRef || generatedRef,
          value: awardValue,
          currency: req.body?.currency || pkg?.currency || 'GBP',
          status: 'draft',
          startDate: startDate ? new Date(startDate) : awardDate,
          endDate: endDate ? new Date(endDate) : null,
          retentionPct: retention,
          retentionPercentage: retention,
          paymentTerms,
          contractTypeId: req.body?.contractTypeId || pkg?.contractTypeId || null,
          notes: req.body?.notes || null,
          sourceMode: 'tender_award',
          awardId: award.id,
          draftCreatedAt: new Date(),
        });

        await tx.contractLineItem.create({
          data: {
            tenantId,
            contractId: contract.id,
            description: `Tender award - ${tender.title}`,
            qty: new Prisma.Decimal(1),
            rate: awardValue,
            total: awardValue,
            costCode: null,
            packageLineItemId: null,
            budgetLineId: null,
          },
          select: ID_SELECT,
        });

        const contractDoc = await tx.contractDocument.create({
          data: {
            tenantId,
            contractId: contract.id,
            title,
            editorType: 'prosemirror',
            active: true,
          },
          select: ID_SELECT,
        });

        await tx.contractVersion.create({
          data: {
            tenantId,
            contractDocId: contractDoc.id,
            versionNo: 1,
            contentJson: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
                { type: 'paragraph', content: [{ type: 'text', text: `Contract Reference: ${contract.contractRef}` }] },
                { type: 'paragraph', content: [{ type: 'text', text: `Tender: ${tender.title}` }] },
                { type: 'paragraph', content: [{ type: 'text', text: `Value: ${contract.currency || 'GBP'} ${Number(awardValue).toLocaleString('en-GB')}` }] },
              ],
            },
            baseVersionId: null,
            redlinePatch: null,
            createdBy: userId,
          },
          select: ID_SELECT,
        });

        if (tender.packageId) {
          await tx.package.update({
            where: { id: tender.packageId },
            data: {
              status: 'awarded',
              awardSupplierId: resp.supplierId,
              awardedToSupplierId: resp.supplierId,
              awardValue,
              awardedValue: awardValue,
              awardedAt: awardDate,
            },
            select: ID_SELECT,
          });
        }

        await tx.tender.update({ where: { id: tender.id }, data: { status: 'awarded' }, select: ID_SELECT });

        return { award, contract };
      });

      res.status(201).json({ awardId: result.award.id, contractId: result.contract.id, contractRef: result.contract.contractRef });
    } catch (err) {
      console.error('award error', err);
      res.status(500).json({ error: 'Failed to award tender' });
    }
  });

  return router;
};
