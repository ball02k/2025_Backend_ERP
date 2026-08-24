// CANONICAL: Core RFx/Tender API
// This is the primary backend API used by the canonical Tender UI (RfxDetails.jsx).
// Provides RFx builder, structure management, invites, Q&A, responses, scoring, and awarding.
// User-facing route: /api/rfx/* (internal detail - UI shows "Tenders")
// CANONICAL: /api/rfx/:id/invites used by Tender Invites tab

const express = require('express');
const crypto = require('crypto');
const { requireProjectMember } = require('../middleware/membership.cjs');
const { linkOf } = require('../lib/links.cjs');
const { prisma: prismaUtil } = require('../utils/prisma.cjs');

module.exports = (prisma) => {
  const router = express.Router();

  function getTenantId(req) { return req.user && req.user.tenantId; }
  const requestInviteSummarySelect = {
    id: true,
    tenantId: true,
    requestId: true,
    supplierId: true,
    email: true,
    supplierName: true,
    contactFirstName: true,
    contactLastName: true,
    status: true,
    respondedAt: true,
    responseToken: true,
    lastSentAt: true,
  };

  // Generate a unique response token for supplier invite portal access
  async function generateUniqueResponseToken(tenantId, maxAttempts = 5) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Generate 32 random bytes and encode as hex (64 characters)
      const token = crypto.randomBytes(32).toString('hex');

      // Check if token already exists for this tenant
      const existing = await prisma.requestInvite.findFirst({
        where: { tenantId, responseToken: token },
        select: { id: true }
      });

      if (!existing) {
        return token;
      }

      // Collision detected, retry
      console.warn(`[generateUniqueResponseToken] Collision detected for tenant ${tenantId}, retrying...`);
    }

    throw new Error('Failed to generate unique response token after multiple attempts');
  }

  function readMoney(value) {
    if (value == null || value === '') return null;
    const parsed = Number(String(value).replace(/[£,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function responseTotalPrice(answers = {}) {
    const candidates = [
      answers.totalPrice,
      answers.priceTotal,
      answers.awardValue,
      answers.price,
      answers.total,
      answers.tenderSum,
    ];
    for (const value of candidates) {
      const parsed = readMoney(value);
      if (parsed != null) return parsed;
    }
    return null;
  }

  // GET /api/projects/:projectId/rfx — list RFx (Requests) for a project
  router.get('/:projectId/rfx', requireProjectMember, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = Number(req.params.projectId);
      if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
      const rows = await prisma.request.findMany({
        where: { tenantId, package: { projectId } },
        orderBy: { updatedAt: 'desc' },
      });
      const items = rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        links: [linkOf('rfx', r.id, r.title)],
      }));
      res.json({ items, total: items.length });
    } catch (err) {
      console.error('list rfx error', err);
      res.status(500).json({ error: 'Failed to list RFx' });
    }
  });

  // POST /api/projects/:projectId/packages/:packageId/push-to-rfx
  router.post(
    '/:projectId/packages/:packageId/push-to-rfx',
    requireProjectMember,
    async (req, res) => {
      try {
        const tenantId = req.user && req.user.tenantId;
        const projectId = Number(req.params.projectId);
        const packageId = Number(req.params.packageId);
        if (!Number.isFinite(projectId) || !Number.isFinite(packageId)) {
          return res.status(400).json({ error: 'Invalid projectId or packageId' });
        }

        const pkg = await prisma.package.findFirst({
          where: { id: packageId, projectId, project: { tenantId } },
          include: { invites: { include: { supplier: true } } },
        });
        if (!pkg) return res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });

        // Enforce: a package cannot be assigned to another RFx unless previous RFx closed with no award
        // Block if any non-closed request exists for this package, or any awarded request exists
        const existing = await prisma.request.findMany({ where: { tenantId, packageId } });
        const hasOpen = existing.some((r) => (r.status || '').toLowerCase() !== 'closed');
        const hasAwarded = existing.some((r) => (r.status || '').toLowerCase() === 'awarded');
        if (hasOpen || hasAwarded) {
          return res.status(400).json({ error: 'PACKAGE_ALREADY_ASSIGNED' });
        }

        const now = new Date();
        const deadline = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

        // Create a Request (RFx) record as a draft
        const rfx = await prisma.request.create({
          data: {
            tenantId,
            packageId,
            title: `RFx for ${pkg.name}`,
            type: 'RFP',
            status: 'draft',
            deadline,
          },
        });

        // Pre-seed invites into the request when supplier relations exist
        const supplierIds = (pkg.invites || [])
          .map((i) => Number(i.supplierId))
          .filter((v) => Number.isFinite(v));
        if (supplierIds.length) {
          // Create invites with unique response tokens
          for (const sid of supplierIds) {
            try {
              const responseToken = await generateUniqueResponseToken(tenantId);
              await prisma.requestInvite.create({
                data: {
                  tenantId,
                  requestId: rfx.id,
                  supplierId: sid,
                  email: '',
                  responseToken,
                },
              });
            } catch (e) {
              // Skip duplicates or errors (non-fatal for pre-seeding)
              console.warn(`[push-to-rfx] Failed to pre-seed invite for supplier ${sid}:`, e.message);
            }
          }
        }

        // Optional: flip package status to indicate tendering in progress
        await prisma.package.update({ where: { id: pkg.id }, data: { status: 'Tender' } }).catch(() => {});

        // Audit
        const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
        try {
          await prisma.auditLog.create({
            data: {
              entity: 'Request',
              entityId: String(rfx.id),
              action: 'create_rfx_from_package',
              userId: req.user?.id ? Number(req.user.id) : null,
              changes: { set: { packageId, projectId, reason } },
            },
          });
        } catch (_) {}

        return res.json({ rfxId: rfx.id, link: linkOf('rfx', rfx.id, rfx.title) });
      } catch (err) {
        console.error('push-to-rfx error', err);
        res.status(500).json({ error: 'Failed to create RFx draft' });
      }
    }
  );

  // POST /api/projects/:projectId/packages/:packageId/rfx — alias used by some FE variants
  router.post('/:projectId/packages/:packageId/rfx', requireProjectMember, async (req, res) => {
    req.params = { ...req.params }; // shallow copy safety
    return router.handle({ ...req, url: `/${req.params.projectId}/packages/${req.params.packageId}/push-to-rfx`, method: 'POST' }, res);
  });

  // POST /api/packages/:packageId/rfx — compatibility without explicit projectId
  router.post('/packages/:packageId/rfx', requireProjectMember, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const packageId = Number(req.params.packageId);
      if (!Number.isFinite(packageId)) return res.status(400).json({ error: 'Invalid packageId' });
      const pkg = await prisma.package.findFirst({ where: { id: packageId, project: { tenantId } }, select: { id: true, projectId: true } });
      if (!pkg) return res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });
      // Delegate to primary handler
      const mockReq = {
        ...req,
        params: { projectId: String(pkg.projectId), packageId: String(packageId) },
        method: 'POST',
        url: `/${pkg.projectId}/packages/${packageId}/push-to-rfx`,
      };
      return router.handle(mockReq, res);
    } catch (err) {
      console.error('create rfx (package) error', err);
      res.status(500).json({ error: 'Failed to create RFx' });
    }
  });

  // GET /api/rfx/:rfxId/invites — list invites for an RFx
  router.get('/rfx/:rfxId/invites', async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const rfxId = Number(req.params.rfxId);
      if (!Number.isFinite(rfxId)) return res.status(400).json({ error: 'Invalid rfxId' });

      // Verify RFx exists and belongs to tenant
      const rfx = await prisma.request.findFirst({
        where: { id: rfxId, tenantId },
        select: { id: true, packageId: true },
      });
      if (!rfx) return res.status(404).json({ error: 'RFx not found' });

      // Get invites with supplier details
      const invites = await prisma.requestInvite.findMany({
        where: { tenantId, requestId: rfxId },
        orderBy: { id: 'desc' },
        select: requestInviteSummarySelect,
      });

      // Fetch supplier details for each invite
      const supplierIds = invites.map((inv) => inv.supplierId).filter((id) => Number.isFinite(id));
      const suppliers = await prisma.supplier.findMany({
        where: { id: { in: supplierIds }, tenantId },
        select: { id: true, name: true, email: true, status: true },
      });

      const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
      const items = invites.map((inv) => ({
        ...inv,
        supplier: supplierMap.get(inv.supplierId) || null,
      }));

      res.json({ items, total: items.length });
    } catch (err) {
      console.error('GET rfx invites error', err);
      res.status(500).json({ error: 'Failed to list invites' });
    }
  });

  // GET /api/rfx/:rfxId/responses — list all supplier responses for buyer review/scoring
  router.get('/rfx/:rfxId/responses', requireProjectMember, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const rfxId = Number(req.params.rfxId);
      if (!Number.isFinite(rfxId)) return res.status(400).json({ error: 'Invalid rfxId' });

      // Verify RFx exists and belongs to tenant
      const rfx = await prisma.request.findFirst({
        where: { id: rfxId, tenantId },
        select: { id: true, title: true, status: true },
      });
      if (!rfx) return res.status(404).json({ error: 'RFx not found' });

      // Get all responses for this RFx
      const responses = await prisma.requestResponse.findMany({
        where: { tenantId, requestId: rfxId },
        orderBy: { submittedAt: 'desc' },
      });

      // Get all invites to match with responses
      const invites = await prisma.requestInvite.findMany({
        where: { tenantId, requestId: rfxId },
        select: requestInviteSummarySelect,
      });

      // Get supplier details
      const supplierIds = [
        ...new Set([
          ...responses.map((r) => r.supplierId).filter((id) => id && id !== -1),
          ...invites.map((inv) => inv.supplierId).filter((id) => id && id !== -1),
        ]),
      ];

      const suppliers = await prisma.supplier.findMany({
        where: { id: { in: supplierIds }, tenantId },
        select: { id: true, name: true, email: true, status: true },
      });

      const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
      const inviteMap = new Map(invites.map((inv) => [inv.supplierId || -1, inv]));

      // Build response summary
      const items = responses.map((resp) => {
        const supplier = supplierMap.get(resp.supplierId);
        const invite = inviteMap.get(resp.supplierId);
        const answers = resp.answers || {};
        const totalPrice = responseTotalPrice(answers);

        return {
          id: resp.id,
          requestId: resp.requestId,
          supplierId: resp.supplierId === -1 ? null : resp.supplierId,
          supplierName: answers.supplierName || supplier?.name || 'Unknown',
          contactName: [answers.contactFirstName, answers.contactLastName]
            .filter(Boolean)
            .join(' ') || null,
          email: invite?.email || supplier?.email || null,
          status: resp.status,
          submittedAt: resp.submittedAt,
          totalPrice,
          priceTotal: totalPrice,
          score: resp.score,
          answers,
          files: resp.files || [],
          stage: resp.stage,
          // Summary fields for quick view
          programmeStart: answers.programmeStart || null,
          programmeEnd: answers.programmeEnd || null,
          hasMethodStatement: Boolean(answers.methodStatement),
          hasHsqNotes: Boolean(answers.hsqNotes),
          hasClarifications: Boolean(answers.clarifications),
        };
      });

      res.json({
        rfx: {
          id: rfx.id,
          title: rfx.title,
          status: rfx.status,
        },
        items,
        total: items.length,
        submitted: items.filter((r) => r.status === 'submitted').length,
        inProgress: items.filter((r) => r.status === 'in_progress').length,
      });
    } catch (err) {
      console.error('GET rfx responses error', err);
      res.status(500).json({ error: 'Failed to list responses' });
    }
  });

  // GET /api/rfx/:rfxId/responses/:responseId — get full response details for scoring
  router.get('/rfx/:rfxId/responses/:responseId', requireProjectMember, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const rfxId = Number(req.params.rfxId);
      const responseId = Number(req.params.responseId);

      if (!Number.isFinite(rfxId) || !Number.isFinite(responseId)) {
        return res.status(400).json({ error: 'Invalid rfxId or responseId' });
      }

      // Verify RFx exists and belongs to tenant
      const rfx = await prisma.request.findFirst({
        where: { id: rfxId, tenantId },
        select: { id: true, title: true, status: true },
      });
      if (!rfx) return res.status(404).json({ error: 'RFx not found' });

      // Get response
      const response = await prisma.requestResponse.findFirst({
        where: { id: responseId, requestId: rfxId, tenantId },
      });
      if (!response) return res.status(404).json({ error: 'Response not found' });

      // Get supplier details
      let supplier = null;
      if (response.supplierId && response.supplierId !== -1) {
        supplier = await prisma.supplier.findFirst({
          where: { id: response.supplierId, tenantId },
          select: { id: true, name: true, email: true, status: true },
        });
      }

      // Get invite
      const invite = await prisma.requestInvite.findFirst({
        where: {
          tenantId,
          requestId: rfxId,
          supplierId: response.supplierId === -1 ? null : response.supplierId,
        },
      });

      const answers = response.answers || {};

      res.json({
        id: response.id,
        requestId: response.requestId,
        supplierId: response.supplierId === -1 ? null : response.supplierId,
        supplier,
        invite: invite ? {
          id: invite.id,
          email: invite.email,
          supplierName: invite.supplierName,
          contactFirstName: invite.contactFirstName,
          contactLastName: invite.contactLastName,
          status: invite.status,
          respondedAt: invite.respondedAt,
          submittedAt: invite.submittedAt,
          lastOpenedAt: invite.lastOpenedAt,
          lastSavedAt: invite.lastSavedAt,
        } : null,
        status: response.status,
        stage: response.stage,
        submittedAt: response.submittedAt,
        score: response.score,
        // Full answer details
        supplierName: answers.supplierName,
        contactFirstName: answers.contactFirstName,
        contactLastName: answers.contactLastName,
        totalPrice: answers.totalPrice,
        programmeStart: answers.programmeStart,
        programmeEnd: answers.programmeEnd,
        methodStatement: answers.methodStatement,
        hsqNotes: answers.hsqNotes,
        clarifications: answers.clarifications,
        // Include full answers object for any custom fields
        answers,
        files: response.files || [],
      });
    } catch (err) {
      console.error('GET rfx response detail error', err);
      res.status(500).json({ error: 'Failed to get response' });
    }
  });

  // POST /api/rfx/:rfxId/invites — invite existing suppliers to an RFx
  router.post('/rfx/:rfxId/invites', requireProjectMember, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const rfxId = Number(req.params.rfxId);
      if (!Number.isFinite(rfxId)) return res.status(400).json({ error: 'Invalid rfxId' });

      // Verify RFx exists and belongs to tenant, get packageId for project verification
      const rfx = await prisma.request.findFirst({
        where: { id: rfxId, tenantId },
        include: { package: { select: { id: true, projectId: true } } },
      });
      if (!rfx) return res.status(404).json({ error: 'RFx not found' });

      // Extract supplier IDs from request body
      const { supplierIds } = req.body;
      const inviteStatus = req.body?.status === 'draft' ? 'draft' : 'invited';
      if (!Array.isArray(supplierIds) || supplierIds.length === 0) {
        return res.status(400).json({ error: 'supplierIds array required' });
      }

      const validIds = supplierIds.filter((id) => Number.isFinite(Number(id))).map((id) => Number(id));
      if (validIds.length === 0) {
        return res.status(400).json({ error: 'No valid supplier IDs provided' });
      }

      // Verify all suppliers exist and belong to tenant
      const suppliers = await prisma.supplier.findMany({
        where: { id: { in: validIds }, tenantId },
        select: { id: true, email: true },
      });

      if (suppliers.length !== validIds.length) {
        return res.status(400).json({ error: 'Some suppliers not found or do not belong to tenant' });
      }

      // Create invites (upsert to handle duplicates)
      const created = [];
      for (const supplier of suppliers) {
        // Generate unique response token for new invites
        const responseToken = await generateUniqueResponseToken(tenantId);

        const existing = await prisma.requestInvite.findFirst({
          where: {
            tenantId,
            requestId: rfxId,
            supplierId: supplier.id,
          },
          select: requestInviteSummarySelect,
        });

        let invite;
        if (existing) {
          const updateData = {
            email: supplier.email || existing.email || '',
          };

          if (!existing.responseToken) {
            updateData.responseToken = responseToken;
          }
          if (inviteStatus === 'invited' && existing.status === 'draft') {
            updateData.status = 'invited';
          }

          invite = Object.keys(updateData).length
            ? await prisma.requestInvite.update({ where: { id: existing.id }, data: updateData, select: requestInviteSummarySelect })
            : existing;
        } else {
          invite = await prisma.requestInvite.create({
            data: {
              tenantId,
              requestId: rfxId,
              supplierId: supplier.id,
              email: supplier.email || '',
              status: inviteStatus,
              responseToken,
            },
            select: requestInviteSummarySelect,
          });
        }

        created.push(invite);
      }

      // Audit log
      const { writeAudit } = require('../lib/audit.cjs');
      await writeAudit(
        tenantId,
        req.user?.id,
        'invite_suppliers_to_rfx',
        'Request',
        rfxId,
        { supplierIds: validIds, count: created.length, status: inviteStatus }
      );

      res.json({ created, count: created.length });
    } catch (err) {
      console.error('POST rfx invites error', err);
      res.status(500).json({ error: 'Failed to create invites' });
    }
  });

  // POST /api/rfx/:rfxId/quick-invite — quick invite by email (create supplier if needed)
  router.post('/rfx/:rfxId/quick-invite', requireProjectMember, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const rfxId = Number(req.params.rfxId);
      if (!Number.isFinite(rfxId)) return res.status(400).json({ error: 'Invalid rfxId' });

      // Verify RFx exists and belongs to tenant
      const rfx = await prisma.request.findFirst({
        where: { id: rfxId, tenantId },
        include: { package: { select: { id: true, projectId: true } } },
      });
      if (!rfx) return res.status(404).json({ error: 'RFx not found' });

      // Extract supplier details from request body
      const { name, email, phone, trade } = req.body || {};
      const inviteStatus = req.body?.status === 'draft' ? 'draft' : 'invited';
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Email is required' });
      }
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Look up or create supplier
      let supplier = await prisma.supplier.findFirst({
        where: { tenantId, email: normalizedEmail },
      });

      let supplierCreated = false;
      if (!supplier) {
        supplier = await prisma.supplier.create({
          data: {
            tenantId,
            name: name.trim(),
            email: normalizedEmail,
            phone: phone?.trim() || null,
            status: 'pending',
          },
        });
        supplierCreated = true;
      } else if (phone?.trim() && !supplier.phone) {
        supplier = await prisma.supplier.update({
          where: { id: supplier.id },
          data: { phone: phone.trim() },
        });
      }

      if (trade?.trim()) {
        await prisma.supplierCapability.create({
          data: {
            tenantId,
            supplierId: supplier.id,
            tag: `category:${trade.trim()}`,
          },
        }).catch(() => {
          // Capability tagging should not block an invite.
        });
      }

      // Generate unique response token
      const responseToken = await generateUniqueResponseToken(tenantId);

      // Create or update invite
      const existingInvite = await prisma.requestInvite.findFirst({
        where: { tenantId, requestId: rfxId, supplierId: supplier.id },
        select: requestInviteSummarySelect,
      });

      let invite;
      if (existingInvite) {
        const updateData = {
          email: normalizedEmail,
          supplierName: name.trim(),
        };
        if (!existingInvite.responseToken) {
          updateData.responseToken = responseToken;
        }
        if (inviteStatus === 'invited' && existingInvite.status === 'draft') {
          updateData.status = 'invited';
        }

        invite = await prisma.requestInvite.update({
          where: { id: existingInvite.id },
          data: updateData,
          select: requestInviteSummarySelect,
        });
      } else {
        invite = await prisma.requestInvite.create({
          data: {
            tenantId,
            requestId: rfxId,
            supplierId: supplier.id,
            email: normalizedEmail,
            supplierName: name.trim(),
            status: inviteStatus,
            responseToken,
          },
          select: requestInviteSummarySelect,
        });
      }

      // Audit log
      const { writeAudit } = require('../lib/audit.cjs');
      await writeAudit(
        tenantId,
        req.user?.id,
        'quick_invite_to_rfx',
        'Request',
        rfxId,
        { supplierId: supplier.id, email: normalizedEmail, name: name.trim(), status: inviteStatus, supplierCreated }
      );

      res.json({ invite, supplier });
    } catch (err) {
      console.error('POST rfx quick-invite error', err);
      res.status(500).json({ error: 'Failed to quick-invite supplier' });
    }
  });

  return router;
};
