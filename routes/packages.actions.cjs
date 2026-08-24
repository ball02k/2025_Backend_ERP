const express = require('express');
const router = express.Router();
const { Prisma } = require('@prisma/client');
const { prisma } = require('../lib/prisma');
const requireAuth = require('../middleware/requireAuth.cjs');
const { requirePerm } = require('../middleware/checkPermission.cjs');
const { assertProjectMember } = require('../middleware/membership.cjs');
const { writeAudit } = require('../lib/audit.cjs');
const { createDraftContract } = require('../lib/contractWrites.cjs');
const {
  evaluatePackageLock,
  enforceDecision,
  sendCommercialLock,
} = require('../services/commercialLockService.cjs');

function hasAdminBypass(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : user?.role ? [user.role] : [];
  return roles.includes('dev') || roles.includes('admin');
}

async function ensureProjectMember(req, pkg) {
  if (hasAdminBypass(req.user)) return true;
  const membership = await assertProjectMember({
    userId: Number(req.user?.id),
    projectId: pkg.projectId,
    tenantId: req.user?.tenantId,
  });
  return Boolean(membership);
}

function toDecimal(value) {
  try {
    return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value || 0);
  } catch (_) {
    return new Prisma.Decimal(0);
  }
}

const ID_SELECT = { id: true };
const SUPPLIER_MIN_SELECT = { id: true, name: true, status: true, complianceStatus: true };
const AWARD_MIN_SELECT = { id: true };

async function loadPackageLineSnapshots(tx, tenantId, packageId) {
  const snapshots = [];

  const packageLineItems = await tx.packageLineItem.findMany({
    where: { tenantId, packageId },
    select: {
      id: true,
      budgetLineItemId: true,
      description: true,
      qty: true,
      rate: true,
      total: true,
      costCode: true,
    },
    orderBy: { id: 'asc' },
  }).catch(() => []);

  if (packageLineItems.length) {
    for (const line of packageLineItems) {
      snapshots.push({
        packageLineItemId: line.id,
        budgetLineId: line.budgetLineItemId ?? null,
        description: line.description || 'Package line',
        qty: toDecimal(line.qty ?? 1),
        rate: toDecimal(line.rate ?? 0),
        total: toDecimal(line.total ?? 0),
        costCode: line.costCode || null,
      });
    }
    return snapshots;
  }

  const packageItems = await tx.packageItem.findMany({
    where: { tenantId, packageId },
    select: {
      budgetLine: {
        select: {
          id: true,
          code: true,
          description: true,
          qty: true,
          rate: true,
          total: true,
          amount: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  }).catch(() => []);

  for (const item of packageItems) {
    const line = item.budgetLine;
    if (!line) continue;
    const qty = toDecimal(line.qty ?? 1);
    const rate = toDecimal(line.rate ?? line.amount ?? 0);
    const total = toDecimal(line.total ?? line.amount ?? Number(qty) * Number(rate));
    snapshots.push({
      packageLineItemId: null,
      budgetLineId: line.id,
      description: line.description || 'Budget line',
      qty,
      rate,
      total,
      costCode: line.code || line.costCode || null,
    });
  }

  return snapshots;
}

async function findOrCreateInternalSupplier(tx, tenantId, internalTeam) {
  const name = String(internalTeam || 'Internal Delivery Team').trim() || 'Internal Delivery Team';
  const existing = await tx.supplier.findFirst({ where: { tenantId, name }, select: SUPPLIER_MIN_SELECT });
  if (existing) return existing;
  const rows = await tx.$queryRaw`
    INSERT INTO "Supplier" ("tenantId", "name", "status", "complianceStatus", "createdAt", "updatedAt")
    VALUES (${tenantId}, ${name}, 'internal', 'approved', NOW(), NOW())
    RETURNING "id", "name", "status", "complianceStatus"
  `;
  return Array.isArray(rows) ? rows[0] : rows;
}

/**
 * POST /packages/:id/rfx
 * Creates an RFx "Request" tied to the package (Draft status).
 */
router.post('/packages/:id/rfx',
  requireAuth,
  requirePerm('procurement:issue'),
  async (req, res) => {
    const tenantId = req.user.tenantId;
    const userId   = req.user.id;
    const packageId = Number(req.params.id);

    const pkg = await prisma.package.findFirst({
      where: { id: packageId, project: { tenantId } },
      include: { project: { select: { id: true, tenantId: true } } }
    });

    if (!pkg) return res.status(404).json({ code: 'NOT_FOUND', message: 'Package not found' });

    if (!(await ensureProjectMember(req, pkg))) {
      return res.status(403).json({ code: 'NOT_A_PROJECT_MEMBER', message: 'Not a member of this project' });
    }

    // If an RFx already exists for this package, prevent duplicates
    const existing = await prisma.request.findFirst({ where: { tenantId, packageId } }).catch(() => null);
    if (existing) return res.status(409).json({ code: 'RFX_EXISTS', message: 'An RFx already exists for this package', requestId: existing.id });

    try {
      const lockDecision = await evaluatePackageLock({
        prisma,
        tenantId,
        projectId: pkg.projectId,
        packageId,
        action: 'start_sourcing',
        proposedChanges: { status: 'draft' },
      });
      await enforceDecision(req, 'Package', packageId, 'CREATE_RFX', lockDecision);
    } catch (err) {
      if (sendCommercialLock(res, err)) return;
      return res.status(err.status || 500).json({ code: err.code || 'RFX_CREATE_FAILED', message: err.message || 'Failed to create RFx' });
    }

    // Note: Request model doesn't have projectId - only packageId
    const reqRec = await prisma.request.create({
      data: {
        tenantId,
        packageId: pkg.id,
        status: 'draft', // lowercase to match schema default
        title: pkg.name || 'RFx',
        type: 'RFP', // default type
      }
    });

    await writeAudit(tenantId, userId, 'RFxCreated', 'Package', packageId, { requestId: reqRec.id });
    return res.status(201).json({ requestId: reqRec.id });
  }
);

/**
 * POST /packages/:id/internal-resource
 * Creates a draft internal delivery contract tied to the package.
 */
router.post('/packages/:id/internal-resource',
  requireAuth,
  requirePerm('procurement:award'),
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId   = req.user.id;
      const packageId = Number(req.params.id);
      const body = { ...(req.query || {}), ...(req.body || {}) };

      const pkg = await prisma.package.findFirst({
        where: { id: packageId, project: { tenantId } },
        include: {
          project: { select: { id: true, tenantId: true, code: true, name: true } },
          contractType: true,
        }
      });

      if (!pkg) return res.status(404).json({ code: 'NOT_FOUND', message: 'Package not found' });

      if (!(await ensureProjectMember(req, pkg))) {
        return res.status(403).json({ code: 'NOT_A_PROJECT_MEMBER', message: 'Not a member of this project' });
      }

      if (pkg.awardedToSupplierId) {
        return res.status(409).json({ code: 'ALREADY_AWARDED', message: 'Package already awarded' });
      }

      const lockDecision = await evaluatePackageLock({
        prisma,
        tenantId,
        projectId: pkg.projectId,
        packageId,
        action: 'internal_award',
        proposedChanges: { status: 'awarded', awardValue: body.awardAmount ?? true },
      });
      await enforceDecision(req, 'Package', packageId, 'INTERNAL_AWARD', lockDecision);

      let result;
      await prisma.$transaction(async (tx) => {
        const supplier = await findOrCreateInternalSupplier(tx, tenantId, body.internalTeam);
        const lineSnapshots = await loadPackageLineSnapshots(tx, tenantId, packageId);
        const lineTotal = lineSnapshots.reduce((sum, line) => sum.add(line.total), new Prisma.Decimal(0));
        const awardValue = body.awardAmount != null && body.awardAmount !== ''
          ? toDecimal(body.awardAmount)
          : lineTotal;
        const awardDate = body.awardDate ? new Date(body.awardDate) : new Date();
        const projectCode = pkg.project?.code || `P${pkg.projectId}`;
        const contractRef = body.contractRef || body.awardRef || `${projectCode}-PKG${pkg.id}-INT-${Date.now().toString().slice(-6)}`;
        const title = body.name || body.title || `${pkg.name || 'Package'} - Internal Delivery`;
        const retention = body.retentionPct != null && body.retentionPct !== ''
          ? toDecimal(body.retentionPct)
          : (pkg.retentionPct ?? pkg.contractType?.retentionRate ?? new Prisma.Decimal(0));
        const paymentTerms = body.paymentTerms || pkg.paymentTerms || pkg.contractType?.paymentTerms || null;

        const award = await tx.award.create({
          data: {
            tenantId,
            projectId: pkg.projectId,
            packageId: pkg.id,
            supplierId: supplier.id,
            awardValue,
            awardDate,
            overrideUsed: false,
            overrideReason: body.reason || null,
          },
          select: AWARD_MIN_SELECT,
        });

        const contract = await createDraftContract(tx, {
          tenantId,
          projectId: pkg.projectId,
          packageId: pkg.id,
          supplierId: supplier.id,
          title,
          contractRef,
          value: awardValue,
          currency: body.currency || pkg.currency || 'GBP',
          status: 'draft',
          startDate: body.startDate ? new Date(body.startDate) : awardDate,
          endDate: body.endDate ? new Date(body.endDate) : null,
          retentionPct: retention,
          retentionPercentage: retention,
          paymentTerms,
          contractTypeId: body.contractTypeId || pkg.contractTypeId || null,
          internalTeam: supplier.name,
          notes: body.notes || null,
          sourceMode: 'internal_award',
          awardId: award.id,
          draftCreatedAt: new Date(),
        });

        for (const line of lineSnapshots) {
          await tx.contractLineItem.create({
            data: {
              tenantId,
              contractId: contract.id,
              description: line.description,
              qty: line.qty,
              rate: line.rate,
              total: line.total,
              costCode: line.costCode,
              packageLineItemId: line.packageLineItemId,
              budgetLineId: line.budgetLineId,
            },
            select: ID_SELECT,
          });
        }

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
                {
                  type: 'heading',
                  attrs: { level: 1 },
                  content: [{ type: 'text', text: title }],
                },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: `Contract Reference: ${contractRef}` }],
                },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: `Internal Team: ${supplier.name}` }],
                },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: `Value: ${body.currency || pkg.currency || 'GBP'} ${Number(awardValue).toLocaleString('en-GB')}` }],
                },
              ],
            },
            baseVersionId: null,
            redlinePatch: null,
            createdBy: userId ? Number(userId) : null,
          },
          select: ID_SELECT,
        });

        await tx.package.update({
          where: { id: pkg.id },
          data: {
            status: 'internal_awarded',
            awardSupplierId: supplier.id,
            awardedToSupplierId: supplier.id,
            awardValue,
            awardedValue: awardValue,
            awardedAt: awardDate,
          },
          select: ID_SELECT,
        });

        result = { award, contract, supplier };
      });

      await writeAudit(tenantId, userId, 'PackageInternalAwardCreated', 'Package', packageId, {
        awardId: result.award.id,
        contractId: result.contract.id,
        supplierId: result.supplier.id,
      });

      return res.status(201).json({
        ok: true,
        packageId,
        awardId: result.award.id,
        contractId: result.contract.id,
        contractRef: result.contract.contractRef,
        internalTeam: result.supplier.name,
      });
    } catch (error) {
      if (sendCommercialLock(res, error)) return;
      console.error('internal-resource error', error);
      return res.status(500).json({
        code: 'INTERNAL_AWARD_FAILED',
        message: 'Failed to create internal contract',
      });
    }
  }
);

/**
 * DELETE /packages/:id
 * Guarded delete: only if NOT awarded and NO RFx exists.
 */
router.delete('/packages/:id',
  requireAuth,
  requirePerm('project:edit'),
  async (req, res) => {
    const tenantId = req.user.tenantId;
    const userId   = req.user.id;
    const packageId = Number(req.params.id);

    const pkg = await prisma.package.findFirst({
      where: { id: packageId, project: { tenantId } },
      include: { project: { select: { id: true, tenantId: true } } }
    });

    if (!pkg) return res.status(404).json({ code: 'NOT_FOUND', message: 'Package not found' });

    if (!(await ensureProjectMember(req, pkg))) {
      return res.status(403).json({ code: 'NOT_A_PROJECT_MEMBER', message: 'Not a member of this project' });
    }

    if (pkg.awardedToSupplierId) {
      return res.status(409).json({ code: 'NOT_ALLOWED', message: 'Cannot delete: package has been awarded' });
    }

    try {
      const lockDecision = await evaluatePackageLock({
        prisma,
        tenantId,
        projectId: pkg.projectId,
        packageId,
        action: 'delete',
      });
      await enforceDecision(req, 'Package', packageId, 'DELETE', lockDecision);
    } catch (err) {
      if (sendCommercialLock(res, err)) return;
      return res.status(err.status || 500).json({ code: err.code || 'PACKAGE_DELETE_FAILED', message: err.message || 'Failed to delete package' });
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
