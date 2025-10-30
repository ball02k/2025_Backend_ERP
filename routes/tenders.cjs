const express = require('express');
const crypto = require('crypto');

const { requirePerm } = require('../middleware/checkPermission.cjs');
const { isPackageSourced } = require('../lib/sourcing.cjs');

module.exports = (prisma, { requireAuth }) => {
  const router = express.Router();

  function getTenantId(req) { return req.user && req.user.tenantId; }

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
      const rows = await prisma.tenderResponse.findMany({
        where: { tenderId, tenantId },
        include: { supplier: true, tender: true },
        orderBy: [{ submittedAt: 'desc' }],
      });
      res.json(rows);
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
      // Ensure response belongs to tender+tenant
      const r = await prisma.tenderResponse.findFirst({ where: { id, tenderId, tenantId } });
      if (!r) return res.status(404).json({ error: 'Not found' });
      const updated = await prisma.tenderResponse.update({ where: { id }, data: { manualScore: Number(manualScore || 0), notes: notes ?? null } });
      res.json(updated);
    } catch (err) {
      console.error('score response error', err);
      res.status(500).json({ error: 'Failed to update score' });
    }
  });

  // POST /api/tenders/:tenderId/award
  router.post('/:tenderId/award', requireAuth, requirePerm('procurement:award'), async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tenderId = Number(req.params.tenderId);
      const { responseId, contractRef, startDate, endDate } = req.body || {};
      const tender = await prisma.tender.findFirst({ where: { id: tenderId, tenantId } });
      if (!tender) return res.status(404).json({ error: 'Tender not found' });
      const resp = await prisma.tenderResponse.findFirst({ where: { id: Number(responseId), tenantId, tenderId } });
      if (!resp) return res.status(400).json({ error: 'Invalid response' });

      // Create Contract using existing model
      const contract = await prisma.contract.create({
        data: {
          projectId: tender.projectId,
          packageId: tender.packageId ?? null,
          supplierId: resp.supplierId,
          title: tender.title,
          contractNumber: contractRef || `CT-${tender.id}-${resp.supplierId}`,
          value: resp.priceTotal,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
        },
      });

      // Update CVR: upsert current period header + line committed amount
      const now = new Date();
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      let header = await prisma.costValueReconciliation.findFirst({ where: { tenantId, projectId: tender.projectId, period } });
      if (!header) header = await prisma.costValueReconciliation.create({ data: { tenantId, projectId: tender.projectId, period } });
      const existingLine = await prisma.cVRLine.findFirst({ where: { tenantId, cvrId: header.id, packageId: tender.packageId ?? null, costCode: null } });
      if (existingLine) {
        await prisma.cVRLine.update({ where: { id: existingLine.id }, data: { committed: Number(existingLine.committed || 0) + Number(resp.priceTotal || 0) } });
      } else {
        await prisma.cVRLine.create({ data: { tenantId, cvrId: header.id, packageId: tender.packageId ?? null, costCode: null, budget: 0, committed: Number(resp.priceTotal || 0), actual: 0, earnedValue: 0, variance: 0, adjustment: 0 } });
      }

      await prisma.tender.update({ where: { id: tender.id }, data: { status: 'awarded' } });
      res.status(201).json({ contractId: contract.id });
    } catch (err) {
      console.error('award error', err);
      res.status(500).json({ error: 'Failed to award tender' });
    }
  });

  return router;
};
