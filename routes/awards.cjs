const express = require('express');
const router = express.Router();
const { Prisma } = require('@prisma/client');
const { prisma } = require('../lib/prisma');
const requireAuth = require('../middleware/requireAuth.cjs');
const { requirePerm } = require('../middleware/checkPermission.cjs');
const { assertProjectMember } = require('../middleware/membership.cjs');
const { checkSupplierCompliance } = require('../services/compliance.service.cjs');
const { writeAudit } = require('../lib/audit.cjs');
const { createDraftContract } = require('../lib/contractWrites.cjs');
const {
  evaluatePackageLock,
  enforceDecision,
  sendCommercialLock,
} = require('../services/commercialLockService.cjs');

const ID_SELECT = { id: true };

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

router.post(
  '/packages/:id/award',
  requireAuth,
  requirePerm('procurement:award'),
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
      const awardValueDecimal = toDecimal(awardValue ?? req.body.value ?? req.body.awardAmount);
      if (Number(awardValueDecimal) <= 0) {
        return res.status(400).json({ code: 'AWARD_VALUE_REQUIRED', message: 'awardValue is required' });
      }

      const pkg = await prisma.package.findFirst({
        where: { id: packageId, project: { tenantId } },
        include: { project: true, contractType: true },
      });
      if (!pkg) return res.status(404).json({ code: 'NOT_FOUND', message: 'Package not found' });
      if (pkg.awardedToSupplierId)
        return res.status(409).json({ code: 'ALREADY_AWARDED', message: 'Package already awarded' });

      if (!hasAdminBypass(req.user)) {
        const membership = await assertProjectMember({ userId: Number(userId), projectId: pkg.projectId, tenantId });
        if (!membership) {
          return res.status(403).json({ code: 'NOT_A_PROJECT_MEMBER', message: 'Not a member of this project' });
        }
      }

      const supplier = await prisma.supplier.findFirst({ where: { id: supplierIdNum, tenantId }, select: { id: true, name: true } });
      if (!supplier) return res.status(404).json({ code: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found' });

      const comp = await checkSupplierCompliance(tenantId, supplierIdNum);
      const complianceOverrideReason = req.body.complianceOverrideReason || overrideReason || null;
      if (!comp.ok && !override && !complianceOverrideReason) {
        return res.status(409).json({
          code: 'COMPLIANCE_MISSING',
          error: 'COMPLIANCE_BLOCK',
          missing: comp.fails,
          details: comp,
          allowOverride: true,
        });
      }

      const packageDecision = await evaluatePackageLock({
        prisma,
        tenantId,
        projectId: pkg.projectId,
        packageId,
        action: 'package_award',
        proposedChanges: { status: 'awarded', awardValue: true },
      });
      await enforceDecision(req, 'Package', packageId, 'package.award', packageDecision);

      const awardDate = req.body.awardDate ? new Date(req.body.awardDate) : new Date();
      const projectCode = pkg.project?.code || `P${pkg.projectId}`;
      const contractRef = req.body.contractRef || req.body.awardRef || `${projectCode}-PKG${pkg.id}-AWD-${Date.now().toString().slice(-6)}`;
      const title = req.body.title || req.body.name || `${pkg.name || 'Package'} - Award Contract`;
      const retention = req.body.retentionPct != null && req.body.retentionPct !== ''
        ? toDecimal(req.body.retentionPct)
        : (pkg.retentionPct ?? pkg.contractType?.retentionRate ?? new Prisma.Decimal(5));
      const paymentTerms = req.body.paymentTerms || pkg.paymentTerms || pkg.contractType?.paymentTerms || null;

      const result = await prisma.$transaction(async (tx) => {
        const award = await tx.award.create({
          data: {
            tenantId,
            projectId: pkg.projectId,
            packageId,
            supplierId: supplierIdNum,
            awardValue: awardValueDecimal,
            awardDate,
            overrideUsed: Boolean(override || !comp.ok),
            overrideReason: complianceOverrideReason,
          },
          select: ID_SELECT,
        });
        const contract = await createDraftContract(tx, {
          tenantId,
          projectId: pkg.projectId,
          packageId,
          supplierId: supplierIdNum,
          title,
          contractRef,
          value: awardValueDecimal,
          currency: req.body.currency || pkg.currency || 'GBP',
          status: 'draft',
          startDate: req.body.startDate ? new Date(req.body.startDate) : awardDate,
          endDate: req.body.endDate ? new Date(req.body.endDate) : null,
          retentionPct: retention,
          retentionPercentage: retention,
          paymentTerms,
          contractTypeId: req.body.contractTypeId || pkg.contractTypeId || null,
          notes: req.body.notes || null,
          sourceMode: 'package_award',
          awardId: award.id,
          draftCreatedAt: new Date(),
        });

        await tx.contractLineItem.create({
          data: {
            tenantId,
            contractId: contract.id,
            description: `Package award - ${pkg.name || packageId}`,
            qty: new Prisma.Decimal(1),
            rate: awardValueDecimal,
            total: awardValueDecimal,
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
                { type: 'paragraph', content: [{ type: 'text', text: `Contract Reference: ${contractRef}` }] },
                { type: 'paragraph', content: [{ type: 'text', text: `Package: ${pkg.name || packageId}` }] },
                { type: 'paragraph', content: [{ type: 'text', text: `Value: ${contract.currency || 'GBP'} ${Number(awardValueDecimal).toLocaleString('en-GB')}` }] },
              ],
            },
            baseVersionId: null,
            redlinePatch: null,
            createdBy: Number(userId),
          },
          select: ID_SELECT,
        });

        await tx.package.update({
          where: { id: packageId },
          data: {
            status: 'awarded',
            awardSupplierId: supplierIdNum,
            awardedToSupplierId: supplierIdNum,
            awardValue: awardValueDecimal,
            awardedValue: awardValueDecimal,
            awardedAt: awardDate,
          },
          select: ID_SELECT,
        });
        return { award, contract };
      });

      await writeAudit(tenantId, userId, 'AwardCreated', 'Package', packageId, {
        awardId: result.award.id,
        contractId: result.contract.id,
      });

      res.status(201).json({ awardId: result.award.id, contractId: result.contract.id, contractRef: result.contract.contractRef });
    } catch (e) {
      if (sendCommercialLock(res, e)) return;
      console.error(e);
      res.status(500).json({ code: 'SERVER_ERROR', message: 'Unexpected error' });
    }
  }
);

module.exports = router;
