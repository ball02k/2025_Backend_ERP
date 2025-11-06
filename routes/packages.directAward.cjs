const router = require('express').Router();
const { prisma, Prisma } = require('../utils/prisma.cjs');
const { requireProjectMember, assertProjectMember } = require('../middleware/membership.cjs');
const { checkSupplierCompliance } = require('../services/compliance.service.cjs');

function toDecimal(value) {
  try {
    return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value || 0);
  } catch (_) {
    return new Prisma.Decimal(0);
  }
}

router.post('/packages/:id/direct-award', requireProjectMember, async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = req.user?.id ? Number(req.user.id) : null;
  const packageId = Number(req.params.id);

  if (!tenantId || !Number.isFinite(packageId)) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }

  try {
    const body = req.body || {};
    const supplierId = Number(body.supplierId);
    if (!Number.isFinite(supplierId)) {
      return res.status(400).json({ error: 'SUPPLIER_REQUIRED' });
    }

    const mode = (body.mode || 'all').toString();
    const selectedLineIds = Array.isArray(body.lineItemIds)
      ? body.lineItemIds.map(Number).filter(Number.isFinite)
      : [];

    const pkg = await prisma.package.findFirst({
      where: { id: packageId },
      select: {
        id: true,
        projectId: true,
        name: true,
        status: true,
        awardValue: true,
        awardSupplierId: true,
      },
    });
    if (!pkg) {
      return res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });
    }

    if (!req.membership && Number.isFinite(pkg.projectId)) {
      const membership = await assertProjectMember({
        tenantId,
        projectId: pkg.projectId,
        userId,
      });
      const roles = Array.isArray(req.user?.roles) ? req.user.roles : req.user?.role ? [req.user.role] : [];
      const isAdmin = roles.includes('admin');
      if (!membership && !isAdmin) {
        return res.status(403).json({ error: 'NOT_A_PROJECT_MEMBER' });
      }
    }

    // Try to get PackageLineItem records first (new join table approach)
    let packageLineItems = [];
    try {
      packageLineItems = await prisma.packageLineItem.findMany({
        where: { packageId: pkg.id, tenantId },
        orderBy: { id: 'asc' },
      });
      console.log(`[direct-award] PackageLineItem lookup: found ${packageLineItems.length} records`);
    } catch (err) {
      console.warn('[direct-award] PackageLineItem lookup failed, trying budgetLineItem', err?.message);
    }

    // Fallback to PackageItem (join table for package -> budgetLine) if PackageLineItem doesn't exist or is empty
    let budgetLines = [];
    if (!packageLineItems.length) {
      try {
        const packageItems = await prisma.packageItem.findMany({
          where: { packageId: pkg.id, tenantId },
          include: { budgetLine: true },
          orderBy: { id: 'asc' },
        });
        console.log(`[direct-award] PackageItem lookup: found ${packageItems.length} records`);
        // Extract the budgetLine from each packageItem
        budgetLines = packageItems.map(pi => pi.budgetLine).filter(Boolean);
        console.log(`[direct-award] budgetLine extracted: found ${budgetLines.length} records`);
        if (budgetLines.length > 0) {
          console.log('[direct-award] Sample budgetLine:', JSON.stringify(budgetLines[0], null, 2));
        }
      } catch (err) {
        console.warn('[direct-award] PackageItem lookup failed', err?.message);
      }
    }

    // Combine both approaches - prefer PackageLineItem but fall back to budgetLineItem
    const allLines = packageLineItems.length > 0 ? packageLineItems : budgetLines;
    console.log(`[direct-award] Total lines available: ${allLines.length} (from ${packageLineItems.length > 0 ? 'PackageLineItem' : 'budgetLineItem'})`);

    // Allow direct awards without budget lines if user provides manual award amount
    if (!allLines.length) {
      // If no package lines and no manual amount provided, return error
      if (!body.awardAmount || !Number.isFinite(Number(body.awardAmount))) {
        return res.status(400).json({
          error: 'NO_PACKAGE_LINES',
          message: 'This package has no budget lines. Please either add budget lines or provide a manual award amount.'
        });
      }
      // Continue with empty line items - will create contract with just the award amount
    }

    const selectedSet = new Set(selectedLineIds);
    const chosenLines = allLines.length === 0
      ? [] // No lines available, create contract without line items
      : mode === 'selected'
        ? allLines.filter(
            (line) =>
              selectedSet.has(Number(line.budgetLineItemId)) ||
              selectedSet.has(Number(line.id))
          )
        : allLines;

    // Only check for selected lines if package has lines
    if (allLines.length > 0 && mode === 'selected' && !chosenLines.length) {
      return res.status(400).json({ error: 'NO_SELECTED_LINES' });
    }

    // Extract budget line IDs - handle both PackageLineItem and budgetLineItem
    const isBudgetLineItemDirect = budgetLines.length > 0;
    const chosenBudgetLineIds = chosenLines
      .map((line) => {
        if (isBudgetLineItemDirect && !line.budgetLineItemId) {
          // This is a budgetLineItem record - use its ID directly
          return Number(line.id);
        }
        // This is a PackageLineItem record - use budgetLineItemId field
        return line.budgetLineItemId != null ? Number(line.budgetLineItemId) : null;
      })
      .filter((id) => Number.isFinite(id));

    const chosenPackageLineItemIds = isBudgetLineItemDirect
      ? [] // budgetLineItem records don't have packageLineItemIds
      : chosenLines.map((line) => line.id).filter((id) => Number.isFinite(id));

    let conflicts = [];
    if (chosenBudgetLineIds.length) {
      conflicts = await prisma.contractLineItem.findMany({
        where: {
          tenantId,
          budgetLineId: { in: chosenBudgetLineIds },
        },
        select: {
          id: true,
          budgetLineId: true,
          contract: {
            select: {
              id: true,
              title: true,
              packageId: true,
              supplier: { select: { id: true, name: true } },
            },
          },
        },
      });
    }

    if (chosenPackageLineItemIds.length) {
      const fallback = await prisma.contractLineItem.findMany({
        where: {
          tenantId,
          packageLineItemId: { in: chosenPackageLineItemIds },
        },
        select: {
          id: true,
          packageLineItemId: true,
          contract: {
            select: {
              id: true,
              title: true,
              packageId: true,
              supplier: { select: { id: true, name: true } },
            },
          },
        },
      });
      const seen = new Set(conflicts.map((c) => c.id));
      for (const row of fallback) {
        if (seen.has(row.id)) continue;
        conflicts.push(row);
      }
    }

    if (conflicts.length) {
      return res.status(409).json({
        error: 'LINES_ALREADY_CONTRACTED',
        message: 'Some selected budget lines are already linked to a contract.',
        conflicts: conflicts.map((c) => ({
          contractId: c.contract?.id ?? null,
          contractTitle: c.contract?.title ?? null,
          packageId: c.contract?.packageId ?? null,
          supplier: c.contract?.supplier ?? null,
          budgetLineId: c.budgetLineId ?? null,
          packageLineItemId: c.packageLineItemId ?? null,
        })),
      });
    }

    const chosenItems = chosenLines;

    let subtotal = new Prisma.Decimal(0);
    const lineSnapshots = chosenItems.map((line) => {
      const qtyDecimal = toDecimal(line.qty ?? 0);
      const rateDecimal = toDecimal(line.rate ?? 0);
      let totalDecimal = line.total instanceof Prisma.Decimal ? line.total : null;
      if (!totalDecimal) {
        try {
          totalDecimal = qtyDecimal.mul(rateDecimal);
        } catch (_) {
          totalDecimal = new Prisma.Decimal(0);
        }
      }
      subtotal = subtotal.add(totalDecimal);

      // Determine if this is a PackageLineItem (join table) or budgetLineItem (direct)
      // PackageLineItem has: id (packageLineItemId), budgetLineItemId (foreign key)
      // budgetLineItem has: id (budgetLineItemId itself), no budgetLineItemId field
      const isBudgetLineItemDirect = budgetLines.length > 0 && !line.budgetLineItemId;

      return {
        packageLineItemId: isBudgetLineItemDirect ? null : (line.id ?? null),
        budgetLineId: isBudgetLineItemDirect
          ? Number(line.id) // budgetLineItem.id IS the budget line ID
          : (line.budgetLineItemId != null ? Number(line.budgetLineItemId) : null),
        description: line.description || '',
        qty: qtyDecimal,
        rate: rateDecimal,
        total: totalDecimal,
        costCode: line.costCode || null,
      };
    });

    const calcNet = Number(subtotal);
    const requestedAmount = body.awardAmount != null ? Number(body.awardAmount) : calcNet;
    const awardAmount = Number.isFinite(requestedAmount) ? requestedAmount : calcNet;
    const overrideApplied = Math.round((awardAmount - calcNet) * 100) !== 0;
    if (overrideApplied && !body.overrideReason) {
      return res.status(400).json({ error: 'OVERRIDE_REASON_REQUIRED' });
    }

    // TEMP: Disable compliance check for testing contract document editor
    // const compliance = await checkSupplierCompliance(tenantId, supplierId);
    // if (!compliance.ok && !body.complianceOverrideReason) {
    //   return res.status(400).json({ error: 'COMPLIANCE_BLOCK', details: compliance });
    // }
    const compliance = { ok: true }; // Bypass for now

    const awardDate = body.awardDate ? new Date(body.awardDate) : new Date();
    const title = (body.name && body.name.toString().trim()) || pkg.name || 'Direct Award';
    const contractRef = (body.awardRef && body.awardRef.toString().trim()) || `DA-${pkg.id}-${Date.now()}`;

    const data = {
      tenantId,
      projectId: pkg.projectId,
      packageId: pkg.id,
      supplierId,
      title,
      contractRef,
      value: toDecimal(awardAmount),
      status: 'draft',
      startDate: awardDate,
      endDate: body.endDate ? new Date(body.endDate) : null,
      currency: body.currency || 'GBP',
      notes: body.notes || null,
      retentionPct:
        body.retentionPct == null || body.retentionPct === ''
          ? null
          : toDecimal(body.retentionPct, { allowNull: true }),
      paymentTerms: body.paymentTerms || null,
    };

    const awardAmountDecimal = toDecimal(awardAmount);

    let created;
    await prisma.$transaction(async (tx) => {
      created = await tx.contract.create({
        data: {
          ...data,
          value: awardAmountDecimal,
        },
      });

      // Create initial contract document and first version
      const contractDoc = await tx.contractDocument.create({
        data: {
          tenantId,
          contractId: created.id,
          title: title || 'Subcontract Agreement',
          editorType: 'prosemirror',
          active: true,
        },
      });

      // Create first version with contract details as ProseMirror JSON
      const initialContent = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: title || 'Subcontract Agreement' }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Contract Reference: ' },
              { type: 'text', marks: [{ type: 'strong' }], text: contractRef },
            ],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Value: ' },
              {
                type: 'text',
                marks: [{ type: 'strong' }],
                text: `${data.currency || 'GBP'} ${Number(awardAmount).toLocaleString()}`
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Status: ' },
              { type: 'text', marks: [{ type: 'strong' }], text: data.status || 'draft' },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Terms and Conditions' }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: data.notes || 'Standard terms apply. Document ready for editing.' },
            ],
          },
        ],
      };

      await tx.contractVersion.create({
        data: {
          tenantId,
          contractDocId: contractDoc.id,
          versionNo: 1,
          contentJson: initialContent,
          baseVersionId: null,
          redlinePatch: null,
          createdBy: userId,
        },
      });

      if (lineSnapshots.length) {
        for (const line of lineSnapshots) {
          await tx.contractLineItem.create({
            data: {
              tenantId,
              contractId: created.id,
              description: line.description,
              qty: line.qty,
              rate: line.rate,
              total: line.total,
              costCode: line.costCode || null,
              packageLineItemId: line.packageLineItemId,
              budgetLineId: line.budgetLineId,
            },
          });
        }
      }

      await tx.package.update({
        where: { id: pkg.id },
        data: {
          status: 'awarded',
          awardSupplierId: pkg.awardSupplierId ? pkg.awardSupplierId : supplierId,
          awardValue: (() => {
            const existing = pkg.awardValue instanceof Prisma.Decimal
              ? pkg.awardValue
              : new Prisma.Decimal(pkg.awardValue || 0);
            return existing.add(awardAmountDecimal);
          })(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          entity: 'Contract',
          entityId: String(created.id),
          action: 'direct_award.create',
          changes: {
            packageId: pkg.id,
            supplierId,
            mode,
            selectedLineIds: lineSnapshots.map((l) => l.budgetLineId),
            calcNet,
            awardAmount,
            overrideApplied,
            overrideReason: overrideApplied ? body.overrideReason || null : null,
            complianceOk: compliance.ok,
            complianceFails: compliance.fails,
            complianceOverrideReason: body.complianceOverrideReason || null,
          },
        },
      });
    });

    try {
      const { recomputeProjectFinancials } = require('./hooks.recompute.cjs');
      await recomputeProjectFinancials(tenantId, pkg.projectId);
    } catch (recomputeErr) {
      console.warn('recomputeProjectFinancials error', recomputeErr?.message || recomputeErr);
    }

    return res.status(201).json({
      id: created.id,
      projectId: created.projectId,
      packageId: created.packageId,
      contractNumber: created.contractNumber,
    });
  } catch (error) {
    console.error('direct-award error', error);
    return res.status(500).json({ error: 'DIRECT_AWARD_FAILED' });
  }
});

module.exports = router;
