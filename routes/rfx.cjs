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

        const data = {
          tenantId,
          requestId: rfxId,
          supplierId: supplier.id,
          email: supplier.email || '',
          status: 'invited',
          responseToken,
        };

        const invite = await prisma.requestInvite.upsert({
          where: {
            // Composite unique constraint if exists, otherwise use findFirst + create pattern
            requestId_supplierId: { requestId: data.requestId, supplierId: data.supplierId },
          },
          update: { status: 'invited' },
          create: data,
        }).catch(async () => {
          // Fallback if unique constraint doesn't exist
          const existing = await prisma.requestInvite.findFirst({
            where: {
              tenantId: data.tenantId,
              requestId: data.requestId,
              supplierId: data.supplierId,
            },
          });
          if (existing) {
            // Update existing invite with new token if it doesn't have one
            if (!existing.responseToken) {
              return prisma.requestInvite.update({
                where: { id: existing.id },
                data: { status: 'invited', responseToken },
              });
            }
            return existing;
          }
          return prisma.requestInvite.create({ data });
        });
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
        { supplierIds: validIds, count: created.length }
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
      const { name, email } = req.body;
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

      if (!supplier) {
        supplier = await prisma.supplier.create({
          data: {
            tenantId,
            name: name.trim(),
            email: normalizedEmail,
            status: 'pending',
          },
        });
      }

      // Generate unique response token
      const responseToken = await generateUniqueResponseToken(tenantId);

      // Create or update invite
      const invite = await prisma.requestInvite.upsert({
        where: {
          requestId_supplierId: { requestId: rfxId, supplierId: supplier.id },
        },
        update: { status: 'invited', email: normalizedEmail },
        create: {
          tenantId,
          requestId: rfxId,
          supplierId: supplier.id,
          email: normalizedEmail,
          status: 'invited',
          responseToken,
        },
      }).catch(async () => {
        // Fallback if unique constraint doesn't exist
        const existing = await prisma.requestInvite.findFirst({
          where: { tenantId, requestId: rfxId, supplierId: supplier.id },
        });
        if (existing) {
          // Update existing invite, add token if missing
          const updateData = { status: 'invited', email: normalizedEmail };
          if (!existing.responseToken) {
            updateData.responseToken = responseToken;
          }
          return prisma.requestInvite.update({
            where: { id: existing.id },
            data: updateData,
          });
        }
        return prisma.requestInvite.create({
          data: {
            tenantId,
            requestId: rfxId,
            supplierId: supplier.id,
            email: normalizedEmail,
            status: 'invited',
            responseToken,
          },
        });
      });

      // Audit log
      const { writeAudit } = require('../lib/audit.cjs');
      await writeAudit(
        tenantId,
        req.user?.id,
        'quick_invite_to_rfx',
        'Request',
        rfxId,
        { supplierId: supplier.id, email: normalizedEmail, name: name.trim(), supplierCreated: !supplier }
      );

      res.json({ invite, supplier });
    } catch (err) {
      console.error('POST rfx quick-invite error', err);
      res.status(500).json({ error: 'Failed to quick-invite supplier' });
    }
  });

  return router;
};
