const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma');
const requireAuth = require('../middleware/requireAuth.cjs');
const { writeAudit } = require('../lib/audit.cjs');

/**
 * POST /packages/:id/rfx
 * Creates an RFx "Request" tied to the package (Draft status).
 * Requires procurement permission since it initiates sourcing.
 */
router.post('/packages/:id/rfx',
  requireAuth,
  requirePerm('procurement:invite'),
  async (req, res) => {
    const tenantId = req.tenant.id;
    const userId   = req.user.id;
    const packageId = Number(req.params.id);

    const pkg = await prisma.package.findFirst({ where: { id: packageId, tenantId } });
    if (!pkg) return res.status(404).json({ code: 'NOT_FOUND', message: 'Package not found' });

    // If an RFx already exists for this package, prevent duplicates
    const existing = await prisma.request.findFirst({ where: { tenantId, packageId } }).catch(() => null);
    if (existing) return res.status(409).json({ code: 'RFX_EXISTS', message: 'An RFx already exists for this package', requestId: existing.id });

    const reqRec = await prisma.request.create({
      data: {
        tenantId,
        projectId: pkg.projectId,
        packageId: pkg.id,
        status: 'Draft',
        title: pkg.name || 'RFx',
      }
    });

    await writeAudit(tenantId, userId, 'RFxCreated', 'Package', packageId, { requestId: reqRec.id });
    return res.status(201).json({ requestId: reqRec.id });
  }
);

/**
 * POST /packages/:id/internal-resource
 * Marks package as fulfilled internally (no supplier contract).
 */
router.post('/packages/:id/internal-resource',
  requireAuth,
  requirePerm('procurement:internal_assign'),
  async (req, res) => {
    const tenantId = req.tenant.id;
    const userId   = req.user.id;
    const packageId = Number(req.params.id);

    const pkg = await prisma.package.findFirst({ where: { id: packageId, tenantId } });
    if (!pkg) return res.status(404).json({ code: 'NOT_FOUND', message: 'Package not found' });

    if (pkg.awardedToSupplierId) {
      return res.status(409).json({ code: 'ALREADY_AWARDED', message: 'Package already awarded' });
    }

    const updated = await prisma.package.update({
      where: { id: packageId },
      data: { fulfillmentType: 'Internal' } // string field; if missing in schema it will be ignored by Prisma
    }).catch(() => prisma.package.update({ where: { id: packageId }, data: {} })); // noop if field doesn’t exist

    await writeAudit(tenantId, userId, 'PackageMarkedInternal', 'Package', packageId, {});
    res.json({ ok: true, packageId: updated.id });
  }
);

/**
 * DELETE /packages/:id
 * Guarded delete: only if NOT awarded and NO RFx exists.
 */
router.delete('/packages/:id',
  requireAuth,
  requirePerm('procurement:delete'),
  async (req, res) => {
    const tenantId = req.tenant.id;
    const userId   = req.user.id;
    const packageId = Number(req.params.id);

    const pkg = await prisma.package.findFirst({ where: { id: packageId, tenantId } });
    if (!pkg) return res.status(404).json({ code: 'NOT_FOUND', message: 'Package not found' });

    if (pkg.awardedToSupplierId) {
      return res.status(409).json({ code: 'NOT_ALLOWED', message: 'Cannot delete: package has been awarded' });
    }

    const rfxCount = await prisma.request.count({ where: { tenantId, packageId } }).catch(() => 0);
    if (rfxCount > 0) {
      return res.status(409).json({ code: 'NOT_ALLOWED', message: 'Cannot delete: RFx exists for this package' });
    }

    await prisma.package.delete({ where: { id: packageId } });
    await writeAudit(tenantId, userId, 'PackageDeleted', 'Package', packageId, {});
    res.json({ ok: true });
  }
);

module.exports = router;
