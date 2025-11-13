const express = require('express');
const { requireProjectMember } = require('../middleware/membership.cjs');
const { linkOf } = require('../lib/links.cjs');

module.exports = (prisma) => {
  const router = express.Router();

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

        const now = new Date();
        const deadline = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

        // Create a Request (RFx) record as a draft
        const rfx = await prisma.request.create({
          data: {
            tenantId,
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

  return router;
};
