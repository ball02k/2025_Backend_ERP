const express = require('express');
const { requireProjectMember } = require('../middleware/membership.cjs');
const { linkOf } = require('../lib/links.cjs');
const { prisma: prismaUtil } = require('../utils/prisma.cjs');

module.exports = (prisma) => {
  const router = express.Router();

  function getTenantId(req) { return req.user && req.user.tenantId; }

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
          await prisma.requestInvite.createMany({
            data: supplierIds.map((sid) => ({ tenantId, requestId: rfx.id, supplierId: sid, email: '' })),
            skipDuplicates: true,
          }).catch(() => {});
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

  return router;
};
