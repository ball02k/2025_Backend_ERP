/**
 * COMPREHENSIVE CONTRACT VARIATIONS API
 * UK Construction Standards (JCT/NEC compatible)
 */

const router = require('express').Router({ mergeParams: true });
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { recomputeEstimatesForProject, recomputeProjectFinancials } = require('./hooks.recompute.cjs');
const {
  sendVariationCreated,
  sendQuotationRequest,
  sendQuotationReceived,
  sendApprovalRequired,
  sendVariationApproved,
  sendVariationRejected,
} = require('../services/email.variations.cjs');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function toJson(row) {
  return JSON.parse(JSON.stringify(row, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

function withLinks(entity, row) {
  const x = toJson(row);
  x.links = buildLinks(entity, x);
  return x;
}

function getTenantId(req) {
  return req.user?.tenantId || req.tenantId;
}

function getUserId(req) {
  const raw = req.user?.id ?? req.userId ?? null;
  return raw != null ? Number(raw) : null;
}

function normalizeDecimal(value, field) {
  try {
    if (value instanceof Prisma.Decimal) return value;
    if (value === '' || value === null || value === undefined) {
      return new Prisma.Decimal(0);
    }
    return new Prisma.Decimal(value);
  } catch (err) {
    throw Object.assign(new Error(`${field} invalid`), { status: 400 });
  }
}

async function writeAudit({ userId, entityId, action, changes, req }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        entity: 'variation',
        entityId: String(entityId),
        action,
        changes: changes ? toJson(changes) : null,
        ipAddress: req?.ip || null,
      },
    });
  } catch (err) {
    console.warn('[variations] failed to write audit log', err);
  }
}

/**
 * Generate variation number (VO-001, VO-002, etc.)
 */
async function generateVariationNumber(contractId, tenantId) {
  const existing = await prisma.variation.findMany({
    where: {
      contractId,
      tenantId,
      variationNumber: { not: null },
    },
    select: { variationNumber: true },
    orderBy: { variationNumber: 'desc' },
  });

  let nextNum = 1;
  if (existing.length > 0) {
    const numbers = existing
      .map((v) => {
        const match = v.variationNumber?.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      })
      .filter((n) => n > 0);
    if (numbers.length > 0) {
      nextNum = Math.max(...numbers) + 1;
    }
  }

  return `VO-${String(nextNum).padStart(3, '0')}`;
}

/**
 * Determine approval workflow based on value and EOT
 */
function getApprovalWorkflow(variation) {
  const value = variation.estimatedValue || variation.amount || 0;
  const hasEOT = (variation.extensionClaimed || 0) > 0;

  const rules = [];

  // Always require Project Manager
  rules.push({ role: 'Project Manager', sequence: 1 });

  // Medium value or any EOT
  if (value >= 5000 || hasEOT) {
    rules.push({ role: 'Cost Manager', sequence: 2 });
  }

  // High value or significant EOT
  if (value >= 25000 || (variation.extensionClaimed || 0) > 5) {
    rules.push({ role: 'Client Representative', sequence: 3 });
  }

  // Any EOT requires Planning Manager
  if (hasEOT) {
    rules.push({ role: 'Planning Manager', sequence: 2 });
  }

  return rules;
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/contracts/:contractId/variations
 * List all variations for a contract
 */
router.get('/contracts/:contractId/variations', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const contractId = Number(req.params.contractId);
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

    const variations = await prisma.variation.findMany({
      where: {
        tenantId,
        contractId,
        is_deleted: false,
      },
      include: {
        documents: {
          select: { id: true, type: true, title: true, fileName: true },
        },
        comments: {
          where: { internal: false },
          select: { id: true },
        },
        approvalRecords: {
          select: { id: true, status: true, approverRole: true },
        },
      },
      orderBy: { variationNumber: 'desc' },
    });

    // Calculate contract summary
    const summary = {
      originalSum: 0,
      approvedVariations: 0,
      pendingVariations: 0,
      revisedSum: 0,
      totalVariations: variations.length,
    };

    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      select: { value: true, originalValue: true },
    });

    if (contract) {
      summary.originalSum = contract.originalValue || contract.value || 0;

      variations.forEach((v) => {
        const value = v.approvedValue || v.estimatedValue || v.amount || 0;
        if (v.status === 'approved') {
          summary.approvedVariations += Number(value);
        } else if (['draft', 'quotation_requested', 'quotation_received', 'under_review', 'client_approval_required'].includes(v.status)) {
          summary.pendingVariations += Number(value);
        }
      });

      summary.revisedSum = Number(summary.originalSum) + summary.approvedVariations;
    }

    res.json({
      summary,
      variations: variations.map((v) => withLinks('variation', v)),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/variations/:id
 * Get single variation with full details
 */
router.get('/variations/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

    const variation = await prisma.variation.findFirst({
      where: { tenantId, id, is_deleted: false },
      include: {
        lines: true,
        documents: true,
        comments: {
          orderBy: { createdAt: 'desc' },
        },
        approvalRecords: {
          orderBy: { sequenceOrder: 'asc' },
        },
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          take: 20,
        },
        project: {
          select: { id: true, name: true },
        },
      },
    });

    if (!variation) {
      return res.status(404).json({ error: 'Variation not found' });
    }

    res.json(withLinks('variation', variation));
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/contracts/:contractId/variations
 * Create new variation (multi-step form submission)
 */
router.post('/contracts/:contractId/variations', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const contractId = Number(req.params.contractId);
    const userId = getUserId(req);

    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

    // Get contract to find projectId
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      select: { projectId: true, packageId: true },
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const {
      // Step 1: Basic details
      title,
      description,
      reason,
      category,
      instructedBy,
      instructionDate,
      siteInstructionRef,
      originatedFrom,
      urgency = 'standard',

      // Step 2: Financial
      estimatedValue,
      breakdown,

      // Step 3: Time impact
      extensionClaimed,
      timeJustification,
      affectedActivities,

      // Workflow
      requestQuotation = false,
    } = req.body;

    if (!title) return res.status(400).json({ error: 'title required' });
    if (!category) return res.status(400).json({ error: 'category required' });

    // Generate variation number
    const variationNumber = await generateVariationNumber(contractId, tenantId);

    // Determine cost impact type
    const costImpactType = category === 'Omission' ? 'omission' : 'addition';
    const amountValue = normalizeDecimal(estimatedValue || 0, 'estimatedValue');

    // Determine initial status
    const initialStatus = requestQuotation ? 'quotation_requested' : 'draft';

    const created = await prisma.variation.create({
      data: {
        tenantId,
        projectId: contract.projectId,
        packageId: contract.packageId || null,
        contractId,
        variationNumber,
        title,
        description: description || null,
        reason: reason || null,
        category,
        instructedBy: instructedBy ? Number(instructedBy) : userId,
        instructionDate: instructionDate ? new Date(instructionDate) : new Date(),
        siteInstructionRef: siteInstructionRef || null,
        originatedFrom: originatedFrom || 'Main Contractor',
        urgency,
        type: 'CONTRACT_VARIATION',
        contractType: 'general',
        status: initialStatus,
        amount: amountValue,
        value: amountValue,
        costImpact: amountValue,
        estimatedValue: amountValue,
        breakdown: breakdown || null,
        extensionClaimed: extensionClaimed ? Number(extensionClaimed) : null,
        timeJustification: timeJustification || null,
        affectedActivities: affectedActivities || null,
        createdBy: userId,
      },
    });

    // Create approval workflow
    const approvalRules = getApprovalWorkflow(created);
    if (approvalRules.length > 0) {
      await prisma.variationApproval.createMany({
        data: approvalRules.map((rule) => ({
          tenantId,
          variationId: created.id,
          approverRole: rule.role,
          sequenceOrder: rule.sequence,
          status: 'pending',
        })),
      });
    }

    // Create status history
    await prisma.variationStatusHistory.create({
      data: {
        tenantId,
        variationId: created.id,
        fromStatus: null,
        toStatus: initialStatus,
        changedBy: userId,
      },
    });

    await writeAudit({
      userId,
      entityId: created.id,
      action: 'VARIATION_CREATE',
      changes: { after: toJson(created) },
      req,
    });

    // Send email notifications
    try {
      // Fetch full details for email
      const fullContract = await prisma.contract.findFirst({
        where: { id: contractId, tenantId },
        include: {
          project: true,
          package: { include: { supplier: true } },
        },
      });

      const creator = await prisma.user.findFirst({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true },
      });

      // Notify Project Manager
      await sendVariationCreated({
        variation: created,
        contract: fullContract,
        project: fullContract?.project,
        creator: creator || { firstName: 'System', lastName: 'User', email: 'system@example.com' },
      });

      // If quotation requested, notify contractor
      if (requestQuotation && fullContract?.package?.supplier?.email) {
        await sendQuotationRequest({
          variation: created,
          contract: fullContract,
          project: fullContract?.project,
          contractorEmail: fullContract.package.supplier.email,
          contractorName: fullContract.package.supplier.name || 'Contractor',
        });
      }
    } catch (emailError) {
      console.warn('[variations] Failed to send email notification:', emailError);
      // Don't fail the request if email fails
    }

    res.json(withLinks('variation', created));
  } catch (e) {
    console.error('[variations] create error:', e);
    next(e);
  }
});

/**
 * PUT /api/variations/:id
 * Update variation (before approval)
 */
router.put('/variations/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const userId = getUserId(req);

    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

    const existing = await prisma.variation.findFirst({
      where: { tenantId, id, is_deleted: false },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Variation not found' });
    }

    // Only allow updates if not approved
    if (existing.status === 'approved') {
      return res.status(400).json({ error: 'Cannot update approved variation' });
    }

    const {
      title,
      description,
      reason,
      category,
      estimatedValue,
      quotedValue,
      negotiatedValue,
      breakdown,
      extensionClaimed,
      timeJustification,
      affectedActivities,
    } = req.body;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (reason !== undefined) updateData.reason = reason;
    if (category !== undefined) updateData.category = category;
    if (estimatedValue !== undefined) {
      const value = normalizeDecimal(estimatedValue, 'estimatedValue');
      updateData.estimatedValue = value;
      updateData.amount = value;
      updateData.value = value;
      updateData.costImpact = value;
    }
    if (quotedValue !== undefined) updateData.quotedValue = normalizeDecimal(quotedValue, 'quotedValue');
    if (negotiatedValue !== undefined) updateData.negotiatedValue = normalizeDecimal(negotiatedValue, 'negotiatedValue');
    if (breakdown !== undefined) updateData.breakdown = breakdown;
    if (extensionClaimed !== undefined) updateData.extensionClaimed = Number(extensionClaimed);
    if (timeJustification !== undefined) updateData.timeJustification = timeJustification;
    if (affectedActivities !== undefined) updateData.affectedActivities = affectedActivities;

    const updated = await prisma.variation.update({
      where: { id },
      data: updateData,
    });

    await writeAudit({
      userId,
      entityId: id,
      action: 'VARIATION_UPDATE',
      changes: { before: toJson(existing), after: toJson(updated) },
      req,
    });

    res.json(withLinks('variation', updated));
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/variations/:id/quotation/request
 * Request quotation from contractor
 */
router.post('/variations/:id/quotation/request', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const userId = getUserId(req);

    const { requiredByDate, instructions } = req.body;

    const existing = await prisma.variation.findFirst({
      where: { tenantId, id, is_deleted: false },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Variation not found' });
    }

    const updated = await prisma.variation.update({
      where: { id },
      data: {
        status: 'quotation_requested',
      },
    });

    await prisma.variationStatusHistory.create({
      data: {
        tenantId,
        variationId: id,
        fromStatus: existing.status,
        toStatus: 'quotation_requested',
        changedBy: userId,
      },
    });

    // Send email to contractor
    try {
      const contract = await prisma.contract.findFirst({
        where: { id: existing.contractId, tenantId },
        include: {
          project: true,
          package: { include: { supplier: true } },
        },
      });

      if (contract?.package?.supplier?.email) {
        await sendQuotationRequest({
          variation: updated,
          contract,
          project: contract.project,
          contractorEmail: contract.package.supplier.email,
          contractorName: contract.package.supplier.name || 'Contractor',
          requiredByDate,
          instructions,
        });
      }
    } catch (emailError) {
      console.warn('[variations] Failed to send quotation request email:', emailError);
    }

    res.json(withLinks('variation', updated));
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/variations/:id/quotation/submit
 * Submit contractor quotation
 */
router.post('/variations/:id/quotation/submit', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const userId = getUserId(req);

    const { quotedValue, breakdown, notes } = req.body;

    if (!quotedValue) {
      return res.status(400).json({ error: 'quotedValue required' });
    }

    const existing = await prisma.variation.findFirst({
      where: { tenantId, id, is_deleted: false },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Variation not found' });
    }

    const quotedDecimal = normalizeDecimal(quotedValue, 'quotedValue');

    const updated = await prisma.variation.update({
      where: { id },
      data: {
        status: 'quotation_received',
        quotedValue: quotedDecimal,
        breakdown: breakdown || existing.breakdown,
        notes: notes || existing.notes,
      },
    });

    await prisma.variationStatusHistory.create({
      data: {
        tenantId,
        variationId: id,
        fromStatus: existing.status,
        toStatus: 'quotation_received',
        changedBy: userId,
      },
    });

    // Notify Project Manager & Cost Manager
    try {
      const contract = await prisma.contract.findFirst({
        where: { id: existing.contractId, tenantId },
        include: {
          project: true,
        },
      });

      if (contract) {
        await sendQuotationReceived({
          variation: updated,
          contract,
          project: contract.project,
          quotedValue: Number(quotedDecimal),
        });
      }
    } catch (emailError) {
      console.warn('[variations] Failed to send quotation received email:', emailError);
    }

    res.json(withLinks('variation', updated));
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/variations/:id/approve
 * Approve variation (with multi-level workflow)
 */
router.post('/variations/:id/approve', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const userId = getUserId(req);

    const { role, comments, approvedValue, extensionGranted } = req.body;

    const existing = await prisma.variation.findFirst({
      where: { tenantId, id, is_deleted: false },
      include: {
        approvalRecords: {
          orderBy: { sequenceOrder: 'asc' },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Variation not found' });
    }

    if (existing.status === 'approved') {
      return res.json(withLinks('variation', existing));
    }

    // Find the approval record for this user/role
    const approvalRecord = existing.approvalRecords.find(
      (a) => a.approverRole === role && a.status === 'pending'
    );

    if (!approvalRecord) {
      return res.status(400).json({ error: 'No pending approval for this role' });
    }

    // Update approval record
    await prisma.variationApproval.update({
      where: { id: approvalRecord.id },
      data: {
        status: 'approved',
        decision: 'approved',
        comments: comments || null,
        approverUserId: userId,
        respondedAt: new Date(),
      },
    });

    // Check if all approvals are complete
    const allApprovals = await prisma.variationApproval.findMany({
      where: { variationId: id, tenantId },
    });

    const allApproved = allApprovals.every((a) => a.status === 'approved');

    let updated;
    if (allApproved) {
      // Fully approved - update contract value
      const finalValue = approvedValue
        ? normalizeDecimal(approvedValue, 'approvedValue')
        : existing.negotiatedValue || existing.quotedValue || existing.estimatedValue || existing.amount;

      await prisma.$transaction(async (tx) => {
        // Update variation
        updated = await tx.variation.update({
          where: { id },
          data: {
            status: 'approved',
            approvedValue: finalValue,
            extensionGranted: extensionGranted ? Number(extensionGranted) : existing.extensionClaimed,
            approvedAt: new Date(),
            approvedBy: userId,
          },
        });

        // Update contract value
        const contract = await tx.contract.findFirst({
          where: { id: existing.contractId, tenantId },
        });

        if (contract) {
          await tx.contract.update({
            where: { id: contract.id },
            data: {
              originalValue: contract.originalValue || contract.value,
              value: { increment: finalValue },
            },
          });
        }
      });

      await prisma.variationStatusHistory.create({
        data: {
          tenantId,
          variationId: id,
          fromStatus: existing.status,
          toStatus: 'approved',
          changedBy: userId,
        },
      });

      // Recompute project financials
      await recomputeProjectFinancials(tenantId, existing.projectId);

      // Send approval notification
      try {
        const contract = await prisma.contract.findFirst({
          where: { id: existing.contractId, tenantId },
          include: {
            project: true,
            package: { include: { supplier: true } },
          },
        });

        if (contract) {
          await sendVariationApproved({
            variation: updated,
            contract,
            project: contract.project,
            approvedValue: Number(finalValue),
          });
        }
      } catch (emailError) {
        console.warn('[variations] Failed to send approval email:', emailError);
      }
    } else {
      // Partially approved - update status
      updated = await prisma.variation.update({
        where: { id },
        data: {
          status: 'under_review',
        },
      });

      // Notify next approver
      try {
        const nextApproval = allApprovals.find(
          (a) => a.status === 'pending' && a.sequenceOrder === approvalRecord.sequenceOrder + 1
        );

        if (nextApproval) {
          const contract = await prisma.contract.findFirst({
            where: { id: existing.contractId, tenantId },
            include: { project: true },
          });

          // In a real system, you'd look up the user email by role
          // For now, use a placeholder or environment variable
          const approverEmail = process.env[`${nextApproval.approverRole.toUpperCase().replace(/ /g, '_')}_EMAIL`] || 'approver@example.com';

          if (contract) {
            await sendApprovalRequired({
              variation: updated,
              contract,
              project: contract.project,
              approverEmail,
              approverRole: nextApproval.approverRole,
            });
          }
        }
      } catch (emailError) {
        console.warn('[variations] Failed to send next approval email:', emailError);
      }
    }

    await writeAudit({
      userId,
      entityId: id,
      action: 'VARIATION_APPROVE',
      changes: {
        before: toJson(existing),
        after: toJson(updated),
        approver: role,
        comments,
      },
      req,
    });

    res.json(withLinks('variation', updated));
  } catch (e) {
    console.error('[variations] approve error:', e);
    next(e);
  }
});

/**
 * POST /api/variations/:id/reject
 * Reject variation
 */
router.post('/variations/:id/reject', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const userId = getUserId(req);

    const { role, reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'reason required' });
    }

    const existing = await prisma.variation.findFirst({
      where: { tenantId, id, is_deleted: false },
      include: {
        approvalRecords: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Variation not found' });
    }

    // Find the approval record
    const approvalRecord = existing.approvalRecords.find(
      (a) => a.approverRole === role && a.status === 'pending'
    );

    if (approvalRecord) {
      await prisma.variationApproval.update({
        where: { id: approvalRecord.id },
        data: {
          status: 'rejected',
          decision: 'rejected',
          comments: reason,
          approverUserId: userId,
          respondedAt: new Date(),
        },
      });
    }

    const updated = await prisma.variation.update({
      where: { id },
      data: {
        status: 'rejected',
        justification: reason,
      },
    });

    await prisma.variationStatusHistory.create({
      data: {
        tenantId,
        variationId: id,
        fromStatus: existing.status,
        toStatus: 'rejected',
        changedBy: userId,
      },
    });

    await writeAudit({
      userId,
      entityId: id,
      action: 'VARIATION_REJECT',
      changes: { before: toJson(existing), after: toJson(updated), reason },
      req,
    });

    // Notify originator
    try {
      const contract = await prisma.contract.findFirst({
        where: { id: existing.contractId, tenantId },
        include: { project: true },
      });

      const originator = await prisma.user.findFirst({
        where: { id: existing.createdBy || existing.instructedBy },
        select: { email: true, firstName: true, lastName: true },
      });

      if (contract && originator?.email) {
        await sendVariationRejected({
          variation: updated,
          contract,
          project: contract.project,
          rejectedBy: role || 'Approver',
          rejectionReason: reason,
          originatorEmail: originator.email,
        });
      }
    } catch (emailError) {
      console.warn('[variations] Failed to send rejection email:', emailError);
    }

    res.json(withLinks('variation', updated));
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/variations/:id/documents
 * Upload document to variation
 */
router.post('/variations/:id/documents', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const userId = getUserId(req);

    const { type, title, fileId, fileName, fileSize, mimeType } = req.body;

    if (!type || !title || !fileId || !fileName) {
      return res.status(400).json({ error: 'type, title, fileId, fileName required' });
    }

    const variation = await prisma.variation.findFirst({
      where: { tenantId, id, is_deleted: false },
    });

    if (!variation) {
      return res.status(404).json({ error: 'Variation not found' });
    }

    const document = await prisma.variationDocument.create({
      data: {
        tenantId,
        variationId: id,
        type,
        title,
        fileId,
        fileName,
        fileSize: fileSize || 0,
        mimeType: mimeType || 'application/octet-stream',
        uploadedBy: userId,
      },
    });

    res.json(document);
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/variations/:id/documents
 * List variation documents
 */
router.get('/variations/:id/documents', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);

    const documents = await prisma.variationDocument.findMany({
      where: { tenantId, variationId: id },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json(documents);
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/variations/:id/comments
 * Add comment to variation
 */
router.post('/variations/:id/comments', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const userId = getUserId(req);

    const { content, internal = true } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content required' });
    }

    const comment = await prisma.variationComment.create({
      data: {
        tenantId,
        variationId: id,
        content,
        internal,
        createdBy: userId,
      },
    });

    // TODO: Send notifications if not internal

    res.json(comment);
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/variations/:id/comments
 * List variation comments
 */
router.get('/variations/:id/comments', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);

    const comments = await prisma.variationComment.findMany({
      where: { tenantId, variationId: id },
      orderBy: { createdAt: 'desc' },
    });

    res.json(comments);
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /api/variations/:id
 * Soft delete variation
 */
router.delete('/variations/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const userId = getUserId(req);

    const existing = await prisma.variation.findFirst({
      where: { tenantId, id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Variation not found' });
    }

    if (existing.status === 'approved') {
      return res.status(400).json({ error: 'Cannot delete approved variation' });
    }

    await prisma.variation.update({
      where: { id },
      data: {
        is_deleted: true,
      },
    });

    await writeAudit({
      userId,
      entityId: id,
      action: 'VARIATION_DELETE',
      changes: { before: toJson(existing) },
      req,
    });

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
