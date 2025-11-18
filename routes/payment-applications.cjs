// ==============================================================================
// PAYMENT APPLICATIONS API - UK Construction Act Compliant
// ==============================================================================

const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { safeJson } = require('../lib/serialize.cjs');

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

/**
 * Calculate payment application dates based on Contract payment terms
 */
function calculatePaymentDates(valuationDate, contract) {
  const dueDays = contract.paymentDueDays || 14;
  const finalDays = contract.paymentFinalDays || 21;

  const dueDate = new Date(valuationDate);
  dueDate.setDate(dueDate.getDate() + dueDays);

  const finalPaymentDate = new Date(dueDate);
  finalPaymentDate.setDate(finalPaymentDate.getDate() + finalDays);

  return { dueDate, finalPaymentDate };
}

/**
 * Get next application number for a contract (sequential per contract: 1, 2, 3...)
 */
async function getNextApplicationNumber(contractId, tenantId) {
  const lastApp = await prisma.applicationForPayment.findFirst({
    where: { contractId, tenantId },
    orderBy: { applicationNumber: 'desc' },
    select: { applicationNumber: true },
  });

  return (lastApp?.applicationNumber || 0) + 1;
}

/**
 * Generate globally unique applicationNo for tenant (e.g., PA-000001, PA-000002...)
 * This must be unique across ALL contracts in the tenant
 */
async function generateUniqueApplicationNo(tenantId) {
  // Find the highest existing applicationNo for this tenant
  const lastApp = await prisma.applicationForPayment.findFirst({
    where: { tenantId },
    orderBy: { id: 'desc' },
    select: { applicationNo: true },
  });

  // Extract number from last applicationNo (e.g., "PA-000123" -> 123)
  let nextNumber = 1;
  if (lastApp?.applicationNo) {
    const match = lastApp.applicationNo.match(/PA-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  // Generate new applicationNo with zero padding
  return `PA-${String(nextNumber).padStart(6, '0')}`;
}

/**
 * Validate status transition
 */
function validateTransition(currentStatus, newStatus) {
  const validTransitions = {
    DRAFT: ['SUBMITTED', 'WITHDRAWN'],
    SUBMITTED: ['UNDER_REVIEW', 'WITHDRAWN'],
    UNDER_REVIEW: ['CERTIFIED', 'REJECTED'],
    CERTIFIED: ['PAYMENT_NOTICE_SENT', 'PAY_LESS_ISSUED'],
    PAYMENT_NOTICE_SENT: ['APPROVED', 'PAY_LESS_ISSUED'],
    PAY_LESS_ISSUED: ['APPROVED', 'DISPUTED'],
    APPROVED: ['PAID', 'PARTIALLY_PAID'],
    PARTIALLY_PAID: ['PAID'],
    DISPUTED: ['UNDER_REVIEW', 'REJECTED'],
  };

  const allowed = validTransitions[currentStatus] || [];
  return allowed.includes(newStatus);
}

/**
 * Update CVR (Cost Value Reconciliation) when payment is made
 */
async function updateCVRFromPayment(application, amountPaid) {
  try {
    if (!application.projectId || !application.paidDate) {
      return;
    }

    const paidDate = new Date(application.paidDate);
    const month = paidDate.toISOString().slice(0, 7); // YYYY-MM format

    // Check if CVRMonthly model exists - if not, skip silently
    const hasCVRMonthly = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'CVRMonthly'
      );
    `.catch(() => ({ exists: false }));

    if (!hasCVRMonthly?.exists) {
      console.log('[CVR] CVRMonthly table not found - skipping CVR update');
      return;
    }

    // Find or create CVR record for this month
    await prisma.cVRMonthly.upsert({
      where: {
        projectId_month: {
          projectId: application.projectId,
          month,
        },
      },
      update: {
        actualCost: {
          increment: Number(amountPaid),
        },
      },
      create: {
        projectId: application.projectId,
        month,
        actualCost: Number(amountPaid),
        committedCost: 0,
        forecastCost: 0,
        budgetCost: 0,
      },
    });

    console.log(`[CVR] Updated CVR for project ${application.projectId}, month ${month}, amount: £${amountPaid}`);
  } catch (error) {
    console.error('[CVR] Error updating CVR:', error.message);
    // Don't throw - CVR update failure shouldn't block payment recording
  }
}

/**
 * Update Package budget actuals when payment is made
 */
async function updateBudgetActuals(application, amountPaid) {
  try {
    if (!application.contractId) {
      return;
    }

    // Get contract with package info
    const contract = await prisma.contract.findUnique({
      where: { id: application.contractId },
      select: { packageId: true },
    });

    if (!contract?.packageId) {
      console.log('[Budget] No package linked to contract - skipping budget update');
      return;
    }

    // Update package actual cost
    await prisma.package.update({
      where: { id: contract.packageId },
      data: {
        actualCost: {
          increment: Number(amountPaid),
        },
      },
    });

    console.log(`[Budget] Updated package ${contract.packageId} actuals by £${amountPaid}`);
  } catch (error) {
    console.error('[Budget] Error updating budget actuals:', error.message);
    // Don't throw - budget update failure shouldn't block payment recording
  }
}

// ==============================================================================
// CORE CRUD OPERATIONS
// ==============================================================================

/**
 * GET /api/contracts/:contractId/applications
 * List all payment applications for a contract
 */
router.get('/contracts/:contractId/applications', async (req, res, next) => {
  try {
    const contractId = Number(req.params.contractId);
    const tenantId = req.user?.tenantId || 'demo';
    const { status, fromDate, toDate, limit = 100, offset = 0 } = req.query;

    const where = { contractId, tenantId };

    if (status) {
      where.status = status;
    }

    if (fromDate || toDate) {
      where.applicationDate = {};
      if (fromDate) where.applicationDate.gte = new Date(fromDate);
      if (toDate) where.applicationDate.lte = new Date(toDate);
    }

    const [items, total] = await Promise.all([
      prisma.applicationForPayment.findMany({
        where,
        orderBy: [{ applicationNumber: 'desc' }],
        take: Number(limit),
        skip: Number(offset),
        include: {
          supplier: { select: { id: true, name: true } },
          contract: { select: { id: true, title: true, contractRef: true } },
          lineItemDetails: {
            select: {
              id: true,
              description: true,
              valueCumulative: true,
              qsCertifiedValue: true,
            },
          },
        },
      }),
      prisma.applicationForPayment.count({ where }),
    ]);

    const data = items.map(item => {
      try {
        const x = safeJson(item);
        x.links = buildLinks('applicationForPayment', x);
        return x;
      } catch (err) {
        console.error('[payment-applications] safeJson error:', err?.message);
        return item;
      }
    });

    res.json({ items: data, total, limit: Number(limit), offset: Number(offset) });
  } catch (e) {
    console.error('[payment-applications] List error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/contracts/:contractId/applications
 * Create new payment application
 */
router.post('/contracts/:contractId/applications', async (req, res, next) => {
  try {
    const contractId = Number(req.params.contractId);
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id;

    // Get contract details
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { project: true, supplier: true },
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Generate application numbers
    // applicationNumber: Sequential per contract (1, 2, 3...)
    // applicationNo: Globally unique per tenant (PA-000001, PA-000002...)
    const applicationNumber = await getNextApplicationNumber(contractId, tenantId);
    const applicationNo = await generateUniqueApplicationNo(tenantId);

    // Calculate dates
    const valuationDate = req.body.valuationDate
      ? new Date(req.body.valuationDate)
      : new Date();

    const { dueDate, finalPaymentDate } = calculatePaymentDates(valuationDate, contract);

    // Create application
    const application = await prisma.applicationForPayment.create({
      data: {
        tenantId,
        projectId: contract.projectId,
        supplierId: contract.supplierId,
        contractId,

        // Numbers and reference
        applicationNumber,
        applicationNo,
        title: req.body.title || `Payment Application #${applicationNumber}`,
        reference: req.body.reference,

        // Dates
        applicationDate: new Date(),
        valuationDate,
        dueDate,
        finalPaymentDate,
        periodStart: req.body.periodStart ? new Date(req.body.periodStart) : null,
        periodEnd: req.body.periodEnd ? new Date(req.body.periodEnd) : null,

        // Status
        status: 'DRAFT',
        currency: req.body.currency || contract.currency || 'GBP',

        // Claimed values
        claimedGrossValue: req.body.claimedGrossValue || 0,
        claimedRetention: req.body.claimedRetention || 0,
        claimedNetValue: req.body.claimedNetValue || 0,
        claimedPreviouslyPaid: req.body.claimedPreviouslyPaid || 0,
        claimedThisPeriod: req.body.claimedThisPeriod || 0,

        // Legacy fields
        grossToDate: req.body.grossToDate || 0,
        variationsValue: req.body.variationsValue || 0,
        prelimsValue: req.body.prelimsValue || 0,
        retentionValue: req.body.retentionValue || 0,
        mosValue: req.body.mosValue || 0,
        offsiteValue: req.body.offsiteValue || 0,
        deductionsValue: req.body.deductionsValue || 0,
        netClaimed: req.body.netClaimed || 0,

        // Retention
        retentionPercentage: contract.retentionPercentage || 5.0,

        // Notes
        contractorNotes: req.body.contractorNotes,
        internalNotes: req.body.internalNotes,

        // Compliance
        isActCompliant: true,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    const result = safeJson(application);
    result.links = buildLinks('applicationForPayment', result);

    res.status(201).json(result);
  } catch (e) {
    console.error('[payment-applications] Create error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * GET /api/applications/:id
 * Get single payment application
 */
router.get('/applications/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: {
          select: {
            id: true,
            title: true,
            contractRef: true,
            paymentDueDays: true,
            paymentFinalDays: true,
            retentionPercentage: true,
          }
        },
        project: { select: { id: true, name: true } },
        lineItemDetails: {
          orderBy: { createdAt: 'asc' },
        },
        attachments: {
          select: { id: true, documentId: true, label: true, createdAt: true },
        },
      },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    const result = safeJson(application);
    result.links = buildLinks('applicationForPayment', result);

    res.json(result);
  } catch (e) {
    console.error('[payment-applications] Get error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * PATCH /api/applications/:id
 * Update payment application (only in DRAFT status)
 */
router.patch('/applications/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const existing = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    // Only allow updates in DRAFT status
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Can only update applications in DRAFT status',
        currentStatus: existing.status,
      });
    }

    const updateData = {};

    // Allowed fields for update
    const allowedFields = [
      'title', 'reference', 'valuationDate', 'periodStart', 'periodEnd',
      'claimedGrossValue', 'claimedRetention', 'claimedNetValue',
      'claimedPreviouslyPaid', 'claimedThisPeriod',
      'grossToDate', 'variationsValue', 'prelimsValue', 'retentionValue',
      'mosValue', 'offsiteValue', 'deductionsValue', 'netClaimed',
      'contractorNotes', 'internalNotes',
      'lineItems', 'variations', 'materialsOnSite', 'previouslyValued',
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Recalculate dates if valuationDate changed
    if (req.body.valuationDate && existing.contractId) {
      const contract = await prisma.contract.findUnique({
        where: { id: existing.contractId },
      });

      if (contract) {
        const { dueDate, finalPaymentDate } = calculatePaymentDates(
          new Date(req.body.valuationDate),
          contract
        );
        updateData.dueDate = dueDate;
        updateData.finalPaymentDate = finalPaymentDate;
      }
    }

    const application = await prisma.applicationForPayment.update({
      where: { id },
      data: updateData,
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    const result = safeJson(application);
    result.links = buildLinks('applicationForPayment', result);

    res.json(result);
  } catch (e) {
    console.error('[payment-applications] Update error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * DELETE /api/applications/:id
 * Delete payment application (only in DRAFT status)
 */
router.delete('/applications/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const existing = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    // Only allow deletion in DRAFT status
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Can only delete applications in DRAFT status',
        currentStatus: existing.status,
      });
    }

    await prisma.applicationForPayment.delete({ where: { id } });

    res.json({ success: true, message: 'Payment application deleted' });
  } catch (e) {
    console.error('[payment-applications] Delete error:', e?.message, e?.stack);
    next(e);
  }
});

// ==============================================================================
// WORKFLOW ACTION ENDPOINTS
// ==============================================================================

/**
 * POST /api/applications/:id/submit
 * Submit application for review (DRAFT -> SUBMITTED)
 */
router.post('/applications/:id/submit', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id;

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    if (application.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Can only submit applications in DRAFT status',
        currentStatus: application.status,
      });
    }

    // Validate required fields
    if (!application.valuationDate) {
      return res.status(400).json({
        error: 'Valuation date is required before submission',
      });
    }

    const updated = await prisma.applicationForPayment.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        submittedBy: userId,
        submittedAt: new Date(),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    const result = safeJson(updated);
    result.links = buildLinks('applicationForPayment', result);

    res.json(result);
  } catch (e) {
    console.error('[payment-applications] Submit error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/applications/:id/review
 * QS starts review (SUBMITTED -> UNDER_REVIEW)
 */
router.post('/applications/:id/review', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id;

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    if (application.status !== 'SUBMITTED') {
      return res.status(400).json({
        error: 'Can only review applications in SUBMITTED status',
        currentStatus: application.status,
      });
    }

    const updated = await prisma.applicationForPayment.update({
      where: { id },
      data: {
        status: 'UNDER_REVIEW',
        reviewedBy: userId,
        reviewedAt: new Date(),
        qsNotes: req.body.qsNotes,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    const result = safeJson(updated);
    result.links = buildLinks('applicationForPayment', result);

    res.json(result);
  } catch (e) {
    console.error('[payment-applications] Review error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * GET /api/applications/:id/line-items
 * Get line items for a payment application
 */
router.get('/applications/:id/line-items', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    const lineItems = await prisma.paymentApplicationLineItem.findMany({
      where: {
        applicationId: id,
        tenantId,
      },
      orderBy: [
        { id: 'asc' },
      ],
    });

    res.json({ items: lineItems.map(item => safeJson(item)) });
  } catch (e) {
    console.error('[payment-applications] Get line items error:', e?.message);
    next(e);
  }
});

/**
 * POST /api/applications/:id/save-certification-draft
 * Save certification draft without changing status
 */
router.post('/applications/:id/save-certification-draft', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id;

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    // Update line items if provided
    if (req.body.lineItems && Array.isArray(req.body.lineItems)) {
      for (const lineItem of req.body.lineItems) {
        await prisma.paymentApplicationLineItem.update({
          where: { id: lineItem.id },
          data: {
            qsCertifiedValue: lineItem.qsCertifiedValue,
            qsCertifiedQuantity: lineItem.qsCertifiedQuantity,
            qsNotes: lineItem.qsNotes,
          },
        });
      }
    }

    // Update certification data without changing status
    const updated = await prisma.applicationForPayment.update({
      where: { id },
      data: {
        certifiedGrossValue: req.body.certification?.certifiedGrossValue,
        certifiedRetention: req.body.certification?.certifiedRetention,
        certifiedThisPeriod: req.body.certification?.certifiedThisPeriod,
        certifiedNetValue: req.body.certification?.certifiedNetValue,
        certifiedPreviouslyPaid: req.body.certification?.certifiedPreviouslyPaid,
        certificationNotes: req.body.certification?.certificationNotes,
        // Don't change status or certifiedDate - this is just a draft
      },
    });

    res.json({ success: true, message: 'Draft saved successfully' });
  } catch (e) {
    console.error('[payment-applications] Save certification draft error:', e?.message);
    next(e);
  }
});

/**
 * POST /api/applications/:id/certify
 * QS certifies the application (UNDER_REVIEW -> CERTIFIED)
 */
router.post('/applications/:id/certify', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id;

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    // Allow certification from SUBMITTED or UNDER_REVIEW status
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(application.status)) {
      return res.status(400).json({
        error: 'Can only certify applications in SUBMITTED or UNDER_REVIEW status',
        currentStatus: application.status,
      });
    }

    // Validate certified amounts are provided
    if (req.body.certifiedGrossValue === undefined) {
      return res.status(400).json({
        error: 'Certified gross value is required',
      });
    }

    // Update line items if provided
    if (req.body.lineItems && Array.isArray(req.body.lineItems)) {
      for (const lineItem of req.body.lineItems) {
        await prisma.paymentApplicationLineItem.update({
          where: { id: lineItem.id },
          data: {
            qsCertifiedValue: lineItem.qsCertifiedValue,
            qsCertifiedQuantity: lineItem.qsCertifiedQuantity,
            qsNotes: lineItem.qsNotes,
          },
        });
      }
    }

    // TASK 6: Auto-populate QS name from logged-in user (SECURITY: Don't trust frontend)
    const qsName = req.user?.name || req.user?.email || 'Unknown QS';
    const qsRole = req.user?.role || 'Quantity Surveyor';

    // Build certification notes with QS name/title
    let fullNotes = req.body.certificationNotes || '';
    const qsInfo = `${qsRole}: ${qsName}`;
    fullNotes = qsInfo ? `${qsInfo}\n\n${fullNotes}` : fullNotes;

    const updated = await prisma.applicationForPayment.update({
      where: { id },
      data: {
        status: 'CERTIFIED',
        certifiedGrossValue: req.body.certifiedGrossValue,
        certifiedRetention: req.body.certifiedRetention,
        certifiedThisPeriod: req.body.certifiedThisPeriod,
        certifiedNetValue: req.body.certifiedNetValue,
        certifiedPreviouslyPaid: req.body.certifiedPreviouslyPaid,
        certifiedAmount: req.body.certifiedAmount, // Legacy field
        certifiedDate: new Date(),
        certifiedByUserId: userId,
        reviewedBy: userId,
        reviewedAt: new Date(),
        certificationNotes: fullNotes,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    // Calculate variance for logging
    const variance = Number(req.body.certifiedGrossValue) - Number(application.claimedGrossValue || 0);
    const variancePercentage = application.claimedGrossValue
      ? (variance / application.claimedGrossValue) * 100
      : 0;

    console.log(`✅ [Certification] Payment application certified:`, {
      applicationNo: application.applicationNo,
      claimedGrossValue: application.claimedGrossValue,
      certifiedGrossValue: req.body.certifiedGrossValue,
      variance: variance.toFixed(2),
      variancePercentage: variancePercentage.toFixed(2) + '%',
      netPayable: req.body.certifiedThisPeriod,
      qsName: req.body.qsName,
      lineItemsUpdated: req.body.lineItems?.length || 0
    });

    // Update contract totalCertifiedToDate
    if (application.contractId && req.body.certifiedThisPeriod) {
      await prisma.contract.update({
        where: { id: application.contractId },
        data: {
          totalCertifiedToDate: {
            increment: Number(req.body.certifiedThisPeriod),
          },
        },
      });
      console.log(`[Certification] Updated contract ${application.contractId} totalCertifiedToDate by £${req.body.certifiedThisPeriod}`);
    }

    // TASK 7: Auto-issue payment notice after certification (UK Construction Act compliance)
    const certifiedAmount = Number(req.body.certifiedGrossValue || 0);
    const claimedAmount = Number(application.claimedGrossValue || 0);
    const now = new Date();

    // Determine notice type: Payment Notice (standard) or Pay-Less Notice (if reduced)
    const isPayLessNotice = certifiedAmount < claimedAmount && variance < 0;
    const noticeStatus = isPayLessNotice ? 'PAY_LESS_ISSUED' : 'PAYMENT_NOTICE_SENT';
    const noticeType = isPayLessNotice ? 'Pay-Less Notice' : 'Payment Notice';

    // Helper function to format currency
    const fmt = (val) => `£${Number(val || 0).toFixed(2)}`;

    // Auto-issue payment notice
    const finalUpdated = await prisma.applicationForPayment.update({
      where: { id },
      data: {
        status: noticeStatus,
        paymentNoticeSent: true,
        paymentNoticeSentAt: now,
        paymentNoticeAmount: Number(req.body.certifiedThisPeriod || 0),
        paymentNoticeIssuedAt: now,
        isActCompliant: true, // Issued immediately after certification
        ...(isPayLessNotice && {
          payLessNoticeSent: true,
          payLessNoticeIssuedAt: now,
          payLessNoticeAmount: Number(req.body.certifiedThisPeriod || 0),
          payLessNoticeReason: `Certified amount (${fmt(certifiedAmount)}) differs from claimed amount (${fmt(claimedAmount)}). Variance: ${fmt(variance)} (${variancePercentage.toFixed(2)}%)`,
        }),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    console.log(`✅ [Auto-Issued ${noticeType}] ${application.applicationNo}:`, {
      certifiedAmount: fmt(certifiedAmount),
      claimedAmount: fmt(claimedAmount),
      variance: fmt(variance),
      variancePercentage: variancePercentage.toFixed(2) + '%',
      noticeType,
      status: noticeStatus,
    });

    const result = safeJson(finalUpdated);
    result.links = buildLinks('applicationForPayment', result);

    res.json(result);
  } catch (e) {
    console.error('[payment-applications] Certify error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/applications/:id/payment-notice
 * Issue payment notice (CERTIFIED -> PAYMENT_NOTICE_SENT)
 */
router.post('/applications/:id/payment-notice', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
      include: { contract: true },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    if (application.status !== 'CERTIFIED') {
      return res.status(400).json({
        error: 'Can only issue payment notice for CERTIFIED applications',
        currentStatus: application.status,
      });
    }

    // UK Construction Act compliance: Must issue payment notice within 5 days of due date
    const now = new Date();
    const dueDate = application.dueDate ? new Date(application.dueDate) : null;

    if (dueDate) {
      const daysSinceDue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceDue > 5) {
        // Warning but allow (compliance flag will be set)
        console.warn(`[payment-applications] Payment notice issued ${daysSinceDue} days after due date`);
      }
    }

    const paymentAmount = req.body.paymentNoticeAmount || application.certifiedThisPeriod || 0;

    const updated = await prisma.applicationForPayment.update({
      where: { id },
      data: {
        status: 'PAYMENT_NOTICE_SENT',
        paymentNoticeSent: true,
        paymentNoticeSentAt: now,
        paymentNoticeAmount: paymentAmount,
        paymentNoticeIssuedAt: now, // Legacy field
        isActCompliant: dueDate ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)) <= 5 : true,
        complianceNotes: req.body.complianceNotes,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    const result = safeJson(updated);
    result.links = buildLinks('applicationForPayment', result);

    res.json(result);
  } catch (e) {
    console.error('[payment-applications] Payment notice error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/applications/:id/pay-less
 * Issue pay-less notice (CERTIFIED or PAYMENT_NOTICE_SENT -> PAY_LESS_ISSUED)
 */
router.post('/applications/:id/pay-less', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    if (!['CERTIFIED', 'PAYMENT_NOTICE_SENT'].includes(application.status)) {
      return res.status(400).json({
        error: 'Can only issue pay-less notice for CERTIFIED or PAYMENT_NOTICE_SENT applications',
        currentStatus: application.status,
      });
    }

    // Validate pay-less amount and reason
    if (!req.body.payLessNoticeAmount || !req.body.payLessNoticeReason) {
      return res.status(400).json({
        error: 'Pay-less amount and reason are required',
      });
    }

    const updated = await prisma.applicationForPayment.update({
      where: { id },
      data: {
        status: 'PAY_LESS_ISSUED',
        payLessNoticeSent: true,
        payLessNoticeSentAt: new Date(),
        payLessNoticeAmount: req.body.payLessNoticeAmount,
        payLessNoticeReason: req.body.payLessNoticeReason,
        payLessReason: req.body.payLessNoticeReason, // Legacy field
        payLessNoticeIssuedAt: new Date(), // Legacy field
      },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    const result = safeJson(updated);
    result.links = buildLinks('applicationForPayment', result);

    res.json(result);
  } catch (e) {
    console.error('[payment-applications] Pay-less error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/applications/:id/approve
 * Final approval for payment (PAYMENT_NOTICE_SENT or PAY_LESS_ISSUED -> APPROVED)
 */
router.post('/applications/:id/approve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id;

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    if (!['PAYMENT_NOTICE_SENT', 'PAY_LESS_ISSUED'].includes(application.status)) {
      return res.status(400).json({
        error: 'Can only approve applications with payment notice or pay-less notice issued',
        currentStatus: application.status,
      });
    }

    const updated = await prisma.applicationForPayment.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    const result = safeJson(updated);
    result.links = buildLinks('applicationForPayment', result);

    res.json(result);
  } catch (e) {
    console.error('[payment-applications] Approve error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/applications/:id/record-payment
 * Record actual payment (APPROVED -> PAID or PARTIALLY_PAID)
 */
router.post('/applications/:id/record-payment', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
      include: { contract: true },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    if (!['APPROVED', 'PARTIALLY_PAID'].includes(application.status)) {
      return res.status(400).json({
        error: 'Can only record payment for APPROVED or PARTIALLY_PAID applications',
        currentStatus: application.status,
      });
    }

    if (!req.body.amountPaid) {
      return res.status(400).json({ error: 'Payment amount is required' });
    }

    const amountPaid = Number(req.body.amountPaid);
    const totalPaid = Number(application.amountPaid || 0) + amountPaid;
    const amountDue = Number(application.payLessNoticeAmount || application.paymentNoticeAmount || application.certifiedThisPeriod || 0);

    // Determine status based on payment completeness
    const newStatus = totalPaid >= amountDue ? 'PAID' : 'PARTIALLY_PAID';

    const updated = await prisma.applicationForPayment.update({
      where: { id },
      data: {
        status: newStatus,
        amountPaid: totalPaid,
        paidDate: newStatus === 'PAID' ? new Date() : application.paidDate,
        paymentReference: req.body.paymentReference,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    // Update contract cumulative totals
    if (application.contractId) {
      await prisma.contract.update({
        where: { id: application.contractId },
        data: {
          totalPaidToDate: {
            increment: amountPaid,
          },
        },
      });
      console.log(`[Payment] Updated contract ${application.contractId} totalPaidToDate by £${amountPaid}`);
    }

    // Update CVR (Cost Value Reconciliation)
    await updateCVRFromPayment(updated, amountPaid);

    // Update Package budget actuals
    await updateBudgetActuals(updated, amountPaid);

    const result = safeJson(updated);
    result.links = buildLinks('applicationForPayment', result);

    res.json(result);
  } catch (e) {
    console.error('[payment-applications] Record payment error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/applications/:id/reject
 * Reject application (UNDER_REVIEW or DISPUTED -> REJECTED)
 */
router.post('/applications/:id/reject', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id;

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    if (!['UNDER_REVIEW', 'DISPUTED'].includes(application.status)) {
      return res.status(400).json({
        error: 'Can only reject applications in UNDER_REVIEW or DISPUTED status',
        currentStatus: application.status,
      });
    }

    if (!req.body.rejectionReason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const updated = await prisma.applicationForPayment.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: req.body.rejectionReason,
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    const result = safeJson(updated);
    result.links = buildLinks('applicationForPayment', result);

    res.json(result);
  } catch (e) {
    console.error('[payment-applications] Reject error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/applications/:id/withdraw
 * Contractor withdraws application (DRAFT or SUBMITTED -> WITHDRAWN)
 */
router.post('/applications/:id/withdraw', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    if (!['DRAFT', 'SUBMITTED'].includes(application.status)) {
      return res.status(400).json({
        error: 'Can only withdraw applications in DRAFT or SUBMITTED status',
        currentStatus: application.status,
      });
    }

    const updated = await prisma.applicationForPayment.update({
      where: { id },
      data: {
        status: 'WITHDRAWN',
        internalNotes: req.body.notes || application.internalNotes,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    const result = safeJson(updated);
    result.links = buildLinks('applicationForPayment', result);

    res.json(result);
  } catch (e) {
    console.error('[payment-applications] Withdraw error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/applications/:id/raise-dispute
 * Raise dispute on pay-less notice (PAY_LESS_ISSUED -> DISPUTED)
 */
router.post('/applications/:id/raise-dispute', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    if (application.status !== 'PAY_LESS_ISSUED') {
      return res.status(400).json({
        error: 'Can only raise dispute on applications with pay-less notice',
        currentStatus: application.status,
      });
    }

    if (!req.body.disputeDetails) {
      return res.status(400).json({ error: 'Dispute details are required' });
    }

    const updated = await prisma.applicationForPayment.update({
      where: { id },
      data: {
        status: 'DISPUTED',
        disputeRaised: true,
        disputeDetails: req.body.disputeDetails,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    const result = safeJson(updated);
    result.links = buildLinks('applicationForPayment', result);

    res.json(result);
  } catch (e) {
    console.error('[payment-applications] Raise dispute error:', e?.message, e?.stack);
    next(e);
  }
});

// ==============================================================================
// FINANCIAL INTEGRATION ENDPOINTS
// ==============================================================================

/**
 * GET /api/projects/:projectId/payment-summary
 * Get payment application summary for entire project
 */
router.get('/projects/:projectId/payment-summary', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId || 'demo';

    // Get all contracts for the project
    const contracts = await prisma.contract.findMany({
      where: { projectId, tenantId },
      include: {
        applications: {
          where: { tenantId },
        },
      },
    });

    let totalContractValue = 0;
    let totalClaimed = 0;
    let totalCertified = 0;
    let totalPaid = 0;
    let totalRetentionHeld = 0;
    let totalApplications = 0;
    let pendingApplications = 0;

    contracts.forEach(contract => {
      totalContractValue += Number(contract.value || 0);

      contract.applications.forEach(app => {
        totalApplications++;
        totalClaimed += Number(app.claimedThisPeriod || 0);
        totalCertified += Number(app.certifiedThisPeriod || 0);
        totalPaid += Number(app.amountPaid || 0);
        totalRetentionHeld += Number(app.retentionHeldToDate || 0);

        if (['SUBMITTED', 'UNDER_REVIEW', 'CERTIFIED', 'PAYMENT_NOTICE_SENT', 'APPROVED'].includes(app.status)) {
          pendingApplications++;
        }
      });
    });

    const summary = {
      projectId,
      totalContracts: contracts.length,
      totalContractValue,
      totalApplications,
      pendingApplications,
      financial: {
        totalClaimed,
        totalCertified,
        totalPaid,
        totalRetentionHeld,
        percentagePaid: totalCertified > 0 ? (totalPaid / totalCertified) * 100 : 0,
        outstandingPayments: totalCertified - totalPaid,
      },
      byStatus: {},
    };

    // Count by status
    contracts.forEach(contract => {
      contract.applications.forEach(app => {
        if (!summary.byStatus[app.status]) {
          summary.byStatus[app.status] = { count: 0, value: 0 };
        }
        summary.byStatus[app.status].count++;
        summary.byStatus[app.status].value += Number(app.certifiedThisPeriod || app.claimedThisPeriod || 0);
      });
    });

    res.json(summary);
  } catch (e) {
    console.error('[payment-applications] Project summary error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * GET /api/contracts/:contractId/financial-summary
 * Get comprehensive financial summary for a contract including payments
 */
router.get('/contracts/:contractId/financial-summary', async (req, res, next) => {
  try {
    const contractId = Number(req.params.contractId);
    const tenantId = req.user?.tenantId || 'demo';

    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: {
        applications: {
          where: { tenantId },
          orderBy: { applicationNumber: 'asc' },
        },
      },
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const originalValue = Number(contract.value || 0);
    const totalPaidToDate = Number(contract.totalPaidToDate || 0);
    const retentionHeld = Number(contract.retentionHeld || 0);
    const retentionReleased = Number(contract.retentionReleased || 0);

    // Calculate application totals
    const applications = contract.applications;
    const totalClaimed = applications.reduce((sum, app) => sum + Number(app.claimedThisPeriod || 0), 0);
    const totalCertified = applications.reduce((sum, app) => sum + Number(app.certifiedThisPeriod || 0), 0);
    const totalPaid = applications.reduce((sum, app) => sum + Number(app.amountPaid || 0), 0);

    // Get latest application
    const latestApp = applications[applications.length - 1];

    // Calculate forecast
    const percentageComplete = originalValue > 0 ? (totalCertified / originalValue) * 100 : 0;
    const forecastFinalValue = percentageComplete > 0 ? originalValue : 0;

    const summary = {
      contractId,
      contractValue: {
        original: originalValue,
        current: originalValue, // Could add variations here
        forecast: forecastFinalValue,
      },
      payments: {
        totalApplications: applications.length,
        totalClaimed,
        totalCertified,
        totalPaid,
        outstandingPayments: totalCertified - totalPaid,
        percentageCertified: originalValue > 0 ? (totalCertified / originalValue) * 100 : 0,
        percentagePaid: totalCertified > 0 ? (totalPaid / totalCertified) * 100 : 0,
      },
      retention: {
        percentage: Number(contract.retentionPercentage || 5),
        held: retentionHeld,
        released: retentionReleased,
        balance: retentionHeld - retentionReleased,
      },
      cashFlow: {
        nextPaymentDue: latestApp?.dueDate || null,
        nextPaymentAmount: latestApp?.certifiedThisPeriod || null,
        averagePaymentPeriod: applications.length > 0
          ? applications.filter(a => a.paidDate && a.applicationDate)
              .reduce((sum, a) => {
                const days = Math.floor((new Date(a.paidDate).getTime() - new Date(a.applicationDate).getTime()) / (1000 * 60 * 60 * 24));
                return sum + days;
              }, 0) / applications.filter(a => a.paidDate && a.applicationDate).length || 0
          : 0,
      },
      compliance: {
        actCompliantApplications: applications.filter(a => a.isActCompliant).length,
        nonCompliantApplications: applications.filter(a => !a.isActCompliant).length,
        disputedApplications: applications.filter(a => a.disputeRaised).length,
      },
    };

    res.json(summary);
  } catch (e) {
    console.error('[payment-applications] Contract financial summary error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * GET /api/applications/:id/cost-breakdown
 * Get detailed cost breakdown for payment application
 */
router.get('/applications/:id/cost-breakdown', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
      include: {
        lineItemDetails: true,
        contract: {
          include: {
            lineItems: {
              include: {
                budgetLine: true,
              },
            },
          },
        },
      },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    // Group line items by budget category
    const byBudgetCategory = {};
    const lineItems = application.lineItemDetails || [];

    lineItems.forEach(item => {
      const category = 'General'; // Could map to budget line category
      if (!byBudgetCategory[category]) {
        byBudgetCategory[category] = {
          claimed: 0,
          certified: 0,
          items: [],
        };
      }
      byBudgetCategory[category].claimed += Number(item.valueCumulative || 0);
      byBudgetCategory[category].certified += Number(item.qsCertifiedValue || item.valueCumulative || 0);
      byBudgetCategory[category].items.push(item);
    });

    const breakdown = {
      applicationId: id,
      summary: {
        totalClaimed: Number(application.claimedGrossValue || 0),
        totalCertified: Number(application.certifiedGrossValue || 0),
        retention: Number(application.certifiedRetention || application.claimedRetention || 0),
        netPayable: Number(application.certifiedThisPeriod || application.claimedThisPeriod || 0),
      },
      categories: byBudgetCategory,
      lineItems: lineItems.map(item => ({
        id: item.id,
        description: item.description,
        reference: item.reference,
        quantityCumulative: item.quantityCumulative,
        valueCumulative: item.valueCumulative,
        valueThisPeriod: item.valueThisPeriod,
        qsCertified: item.qsCertifiedValue,
        variance: Number(item.qsCertifiedValue || 0) - Number(item.valueCumulative || 0),
      })),
    };

    res.json(breakdown);
  } catch (e) {
    console.error('[payment-applications] Cost breakdown error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * GET /api/payment-forecasting/:projectId
 * Get cash flow forecasting based on payment applications
 */
router.get('/payment-forecasting/:projectId', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId || 'demo';

    const contracts = await prisma.contract.findMany({
      where: { projectId, tenantId },
      include: {
        applications: {
          where: { tenantId },
          orderBy: { applicationDate: 'desc' },
        },
      },
    });

    const forecast = {
      projectId,
      currentMonth: [],
      next30Days: [],
      next60Days: [],
      next90Days: [],
    };

    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    contracts.forEach(contract => {
      contract.applications.forEach(app => {
        if (!app.finalPaymentDate || app.status === 'PAID') return;

        const paymentDate = new Date(app.finalPaymentDate);
        const amount = Number(app.certifiedThisPeriod || app.paymentNoticeAmount || app.claimedThisPeriod || 0);

        const item = {
          contractId: contract.id,
          contractTitle: contract.title,
          applicationId: app.id,
          applicationNo: app.applicationNo,
          amount,
          dueDate: app.dueDate,
          finalPaymentDate: app.finalPaymentDate,
          status: app.status,
        };

        if (paymentDate <= now) {
          forecast.currentMonth.push(item);
        } else if (paymentDate <= thirtyDays) {
          forecast.next30Days.push(item);
        } else if (paymentDate <= sixtyDays) {
          forecast.next60Days.push(item);
        } else if (paymentDate <= ninetyDays) {
          forecast.next90Days.push(item);
        }
      });
    });

    // Calculate totals
    forecast.totals = {
      currentMonth: forecast.currentMonth.reduce((sum, item) => sum + item.amount, 0),
      next30Days: forecast.next30Days.reduce((sum, item) => sum + item.amount, 0),
      next60Days: forecast.next60Days.reduce((sum, item) => sum + item.amount, 0),
      next90Days: forecast.next90Days.reduce((sum, item) => sum + item.amount, 0),
    };

    res.json(forecast);
  } catch (e) {
    console.error('[payment-applications] Forecasting error:', e?.message, e?.stack);
    next(e);
  }
});

module.exports = router;
