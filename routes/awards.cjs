const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma');
const { requireAuth, requirePermission } = require('../lib/auth.cjs');
const { checkSupplierCompliance } = require('../lib/compliance.cjs');
const { writeAudit } = require('../lib/audit');

router.post(
  '/packages/:id/award',
  requireAuth,
  requirePermission('procurement:award'),
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.id;
      const packageId = Number(req.params.id);
      if (!Number.isFinite(packageId)) {
        return res.status(400).json({ code: 'INVALID_PACKAGE', message: 'Invalid package id' });
      }
      const { supplierId, awardValue, override, overrideReason } = req.body;
      const supplierIdNum = Number(supplierId);
      if (!Number.isFinite(supplierIdNum)) {
        return res.status(400).json({ code: 'INVALID_SUPPLIER', message: 'supplierId must be a number' });
      }

      const pkg = await prisma.package.findFirst({
        where: { id: packageId, project: { tenantId } },
        include: { project: true },
      });
      if (!pkg) return res.status(404).json({ code: 'NOT_FOUND', message: 'Package not found' });
      if (pkg.awardedToSupplierId)
        return res.status(409).json({ code: 'ALREADY_AWARDED', message: 'Package already awarded' });

      const comp = await checkSupplierCompliance({ tenantId, supplierId: supplierIdNum });
      if (!comp.ok && !override)
        return res.status(409).json({ code: 'COMPLIANCE_MISSING', missing: comp.missing, allowOverride: true });

      const result = await prisma.$transaction(async (tx) => {
        const award = await tx.award.create({
          data: {
            tenantId,
            projectId: pkg.projectId,
            packageId,
            supplierId: supplierIdNum,
            awardValue,
            overrideUsed: !!override,
            overrideReason,
          },
        });
        const contract = await tx.contract.create({
          data: {
            tenantId,
            projectId: pkg.projectId,
            packageId,
            supplierId: supplierIdNum,
            value: awardValue,
            awardId: award.id,
          },
        });
        await tx.package.update({
          where: { id: packageId },
          data: { awardedToSupplierId: supplierIdNum, awardedValue: awardValue, awardedAt: new Date() }
        });
        return { award, contract };
      });

      await writeAudit(tenantId, userId, 'AwardCreated', 'Package', packageId, {
        awardId: result.award.id,
        contractId: result.contract.id,
      });

      res.status(201).json({ awardId: result.award.id, contractId: result.contract.id });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: 'SERVER_ERROR', message: 'Unexpected error' });
    }
  }
);

module.exports = router;
