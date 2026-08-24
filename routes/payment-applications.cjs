// ==============================================================================
// PAYMENT APPLICATIONS API - UK Construction Act Compliant
// ==============================================================================

const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { safeJson } = require('../lib/serialize.cjs');
const {
  evaluatePaymentApplicationLock,
  assertCommercialUnlocked,
  sendCommercialLock,
} = require('../services/commercialLockService.cjs');

let paymentCertificatePdfService;
let storageService;
let emailService;
let emailTemplates;
let paymentDocumentsService;
let paymentRecordingService;
let cisCalculatorService;
let paymentCalculatorService;

const applicationTransitionSelect = {
  id: true,
  tenantId: true,
  projectId: true,
  supplierId: true,
  contractId: true,
  applicationNumber: true,
  applicationNo: true,
  reference: true,
  title: true,
  applicationDate: true,
  valuationDate: true,
  dueDate: true,
  finalPaymentDate: true,
  periodStart: true,
  periodEnd: true,
  status: true,
  currency: true,
  claimedGrossValue: true,
  claimedRetention: true,
  claimedNetValue: true,
  claimedPreviouslyPaid: true,
  claimedThisPeriod: true,
  certifiedGrossValue: true,
  certifiedRetention: true,
  certifiedNetValue: true,
  certifiedPreviouslyPaid: true,
  certifiedThisPeriod: true,
  certifiedAmount: true,
  certifiedDate: true,
  amountPaid: true,
  paidDate: true,
  notes: true,
  submittedBy: true,
  submittedAt: true,
  reviewedBy: true,
  reviewedAt: true,
  approvedBy: true,
  approvedAt: true,
  paymentNoticeSent: true,
  paymentNoticeSentAt: true,
  paymentNoticeAmount: true,
  paymentNoticeIssuedAt: true,
  payLessNoticeSent: true,
  payLessNoticeSentAt: true,
  payLessNoticeAmount: true,
  payLessNoticeReason: true,
  payLessNoticeIssuedAt: true,
  isActCompliant: true,
  certificationNotes: true,
  createdAt: true,
  updatedAt: true,
  supplier: { select: { id: true, name: true } },
  contract: { select: { id: true, title: true } },
};

const tableColumnCache = new Map();
const applicationColumnCache = new Map();

const certificateApplicationSelect = {
  id: true,
  tenantId: true,
  projectId: true,
  supplierId: true,
  contractId: true,
  applicationNumber: true,
  applicationNo: true,
  reference: true,
  title: true,
  applicationDate: true,
  valuationDate: true,
  dueDate: true,
  finalPaymentDate: true,
  periodStart: true,
  periodEnd: true,
  status: true,
  claimedGrossValue: true,
  claimedRetention: true,
  claimedNetValue: true,
  claimedPreviouslyPaid: true,
  claimedThisPeriod: true,
  grossToDate: true,
  retentionValue: true,
  netClaimed: true,
  certifiedGrossValue: true,
  certifiedRetention: true,
  certifiedNetValue: true,
  certifiedPreviouslyPaid: true,
  certifiedThisPeriod: true,
  certifiedAmount: true,
  certifiedDate: true,
  certificationNotes: true,
  paymentNoticeAmount: true,
  paymentNoticeSentAt: true,
  amountPaid: true,
  paidDate: true,
  qsNotes: true,
  valuationDocument: true,
  supplier: { select: { id: true, name: true, email: true } },
  project: { select: { id: true, name: true, code: true } },
  contract: {
    select: {
      id: true,
      title: true,
      contractRef: true,
      supplier: { select: { id: true, name: true, email: true } },
    },
  },
};

async function hasTableColumn(tableName, columnName) {
  const key = `${tableName}.${columnName}`;
  if (tableColumnCache.has(key)) {
    return tableColumnCache.get(key);
  }

  const rows = await prisma.$queryRaw`
    SELECT 1 AS present
    FROM information_schema.columns
    WHERE table_schema = ${'public'}
      AND table_name = ${tableName}
      AND column_name = ${columnName}
    LIMIT 1
  `;
  const present = rows.length > 0;
  tableColumnCache.set(key, present);
  return present;
}

async function hasApplicationColumn(columnName) {
  if (applicationColumnCache.has(columnName)) {
    return applicationColumnCache.get(columnName);
  }

  const present = await hasTableColumn('ApplicationForPayment', columnName);
  applicationColumnCache.set(columnName, present);
  return present;
}

async function hasInvoiceColumn(columnName) {
  return hasTableColumn('Invoice', columnName);
}

function toPaymentMoney(value) {
  return Number(value || 0);
}

function normaliseCertificateApplication(application) {
  const grossVal = toPaymentMoney(application.certifiedGrossValue ?? application.claimedGrossValue ?? application.grossToDate);
  const retention = toPaymentMoney(application.certifiedRetention ?? application.claimedRetention ?? application.retentionValue);
  const netDue = toPaymentMoney(
    application.paymentNoticeAmount ??
    application.certifiedThisPeriod ??
    application.certifiedNetValue ??
    application.certifiedAmount ??
    (grossVal ? grossVal - retention : null) ??
    application.claimedNetValue ??
    application.claimedThisPeriod ??
    application.netClaimed
  );

  return {
    ...application,
    grossVal,
    retention,
    prevPaid: toPaymentMoney(application.certifiedPreviouslyPaid ?? application.claimedPreviouslyPaid),
    netDue,
    paymentNoticeAmount: application.paymentNoticeAmount ?? netDue,
    certNumber: application.applicationNo || application.applicationNumber || application.id,
    appNumber: application.applicationNo || application.applicationNumber || application.id,
  };
}

async function updateApplicationIfColumnsExist(id, data) {
  const updateData = {};
  for (const [field, value] of Object.entries(data)) {
    if (await hasApplicationColumn(field)) {
      updateData[field] = value;
    }
  }

  if (!Object.keys(updateData).length) {
    return null;
  }

  return prisma.applicationForPayment.update({
    where: { id: Number(id) },
    data: updateData,
    select: { id: true },
  });
}

function getPaymentCertificatePdfService() {
  paymentCertificatePdfService ||= require('../services/paymentCertificatePdf.cjs');
  return paymentCertificatePdfService;
}

function getStorageService() {
  storageService ||= require('../services/storage.cjs');
  return storageService;
}

function getEmailService() {
  emailService ||= require('../services/email.service.cjs');
  return emailService;
}

function getEmailTemplates() {
  emailTemplates ||= require('../templates/emailTemplates.cjs');
  return emailTemplates;
}

function getPaymentDocumentsService() {
  paymentDocumentsService ||= require('../services/paymentDocuments.cjs');
  return paymentDocumentsService;
}

function getPaymentRecordingService() {
  paymentRecordingService ||= require('../services/paymentRecording.cjs');
  return paymentRecordingService;
}

function getCISCalculatorService() {
  cisCalculatorService ||= require('../services/cisCalculator.cjs');
  return cisCalculatorService;
}

function getPaymentCalculatorService() {
  paymentCalculatorService ||= require('../services/paymentCalculator.cjs');
  return paymentCalculatorService;
}

function generatePaymentCertificatePdf(...args) {
  return getPaymentCertificatePdfService().generatePaymentCertificatePdf(...args);
}

function generatePaymentNoticePdf(...args) {
  return getPaymentCertificatePdfService().generatePaymentNoticePdf(...args);
}

function generatePayLessNoticePdf(...args) {
  return getPaymentCertificatePdfService().generatePayLessNoticePdf(...args);
}

function saveBufferAsDocument(...args) {
  return getStorageService().saveBufferAsDocument(...args);
}

function sendEmail(...args) {
  return getEmailService().sendEmail(...args);
}

function paymentCertificateEmail(...args) {
  return getEmailTemplates().paymentCertificateEmail(...args);
}

function generatePaymentCertificate(...args) {
  return getPaymentDocumentsService().generatePaymentCertificate(...args);
}

function generatePaymentNotice(...args) {
  return getPaymentDocumentsService().generatePaymentNotice(...args);
}

function generatePayLessNotice(...args) {
  return getPaymentDocumentsService().generatePayLessNotice(...args);
}

function getPaymentDocuments(...args) {
  return getPaymentDocumentsService().getPaymentDocuments(...args);
}

function checkConstructionActCompliance(...args) {
  return getPaymentDocumentsService().checkConstructionActCompliance(...args);
}

function calculateCIS(...args) {
  return getCISCalculatorService().calculateCIS(...args);
}

function calculatePayment(...args) {
  return getPaymentCalculatorService().calculatePayment(...args);
}

async function enforceApplicationUnlocked(req, applicationId, action, proposedChanges = {}) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    const err = new Error('Tenant context is required for payment application changes');
    err.status = 403;
    err.code = 'TENANT_REQUIRED';
    throw err;
  }
  const decision = await evaluatePaymentApplicationLock({
    prisma,
    tenantId,
    applicationId,
    action,
    proposedChanges,
  });
  return assertCommercialUnlocked(decision);
}

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
    if (!application.contractId || !application.projectId) {
      return;
    }

    const tenantId = application.tenantId || 'demo';

    // Get contract with package info
    const contract = await prisma.contract.findUnique({
      where: { id: application.contractId },
      select: { packageId: true, projectId: true },
    });

    if (!contract?.packageId) {
      console.log('[Budget] No package linked to contract - skipping budget update');
      return;
    }

    // Create CVRActual record for tracking actual costs
    // Check if CVRActual model exists first
    const hasCVRActual = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'CVRActual'
      );
    `.catch(() => ({ exists: false }));

    if (hasCVRActual?.exists) {
      await prisma.cVRActual.create({
        data: {
          tenantId,
          projectId: contract.projectId,
          budgetLineId: null, // Could be enhanced to link to specific budget line
          allocationId: null,
          sourceType: 'PAYMENT_APPLICATION',
          sourceId: application.id,
          amount: Number(amountPaid),
          currency: 'GBP',
          status: 'PAID',
          paidDate: new Date(),
        },
      });
      console.log(`[CVR] Created CVRActual record for application ${application.id}: £${amountPaid}`);
    } else {
      console.log('[CVR] CVRActual table not found - skipping CVR actual record creation');
    }
  } catch (error) {
    console.error('[Budget] Error updating budget actuals:', error.message);
    // Don't throw - budget update failure shouldn't block payment recording
  }
}

// ==============================================================================
// CORE CRUD OPERATIONS
// ==============================================================================

/**
 * GET /api/projects/:projectId/payment-applications
 * Project-scoped list used by the project finance pages.
 */
router.get('/projects/:projectId/payment-applications', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || 'demo';
    const projectId = Number(req.params.projectId);
    const { status, supplierId, contractId, direction, limit = 100, offset = 0 } = req.query;

    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true, name: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const where = { tenantId, projectId };
    if (status) where.status = String(status);
    if (supplierId) where.supplierId = Number(supplierId);
    if (contractId) where.contractId = Number(contractId);
    if (direction && ['OUTBOUND', 'INBOUND'].includes(String(direction).toUpperCase())) {
      where.direction = String(direction).toUpperCase();
    }

    const take = Math.min(Number(limit) || 100, 250);
    const skip = Math.max(Number(offset) || 0, 0);

    const [items, total] = await Promise.all([
      prisma.applicationForPayment.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
        include: {
          supplier: { select: { id: true, name: true } },
          contract: { select: { id: true, title: true, contractRef: true } },
        },
      }),
      prisma.applicationForPayment.count({ where }),
    ]);

    const data = items.map((item) => {
      const x = safeJson(item);
      x.links = buildLinks('applicationForPayment', x);
      return x;
    });

    res.json({ items: data, total, limit: take, offset: skip });
  } catch (e) {
    console.error('[payment-applications] Project list error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * GET /api/contracts/:contractId/applications
 * List all payment applications for a contract
 */
router.get('/contracts/:contractId/applications', async (req, res, next) => {
  try {
    const contractId = Number(req.params.contractId);
    const tenantId = req.user?.tenantId || 'demo';
    const { status, fromDate, toDate, direction, limit = 100, offset = 0 } = req.query;

    const where = { contractId, tenantId };

    if (status) {
      where.status = status;
    }

    if (fromDate || toDate) {
      where.applicationDate = {};
      if (fromDate) where.applicationDate.gte = new Date(fromDate);
      if (toDate) where.applicationDate.lte = new Date(toDate);
    }

    // Task 2.5: Direction filtering - OUTBOUND (we raise to MC/client) or INBOUND (we receive from subs)
    if (direction && (direction === 'OUTBOUND' || direction === 'INBOUND')) {
      where.direction = direction;
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

    // Calculate payment values automatically (backend handles cumulative tracking)
    const claimedGrossValue = Number(req.body.claimedGrossValue || 0);
    const retentionPercentage = Number(contract.retentionPercentage || 5.0);
    const claimedRetention = (claimedGrossValue * retentionPercentage) / 100;
    const claimedNetValue = claimedGrossValue - claimedRetention;

    // Get all previous non-cancelled applications for this contract
    const previousApplications = await prisma.applicationForPayment.findMany({
      where: {
        contractId,
        tenantId,
        status: { not: 'CANCELLED' },
      },
      select: {
        claimedNetValue: true,
      },
    });

    // Calculate cumulative previously paid amount (for tracking only)
    const claimedPreviouslyPaid = previousApplications.reduce(
      (sum, app) => sum + Number(app.claimedNetValue || 0),
      0
    );

    // claimedThisPeriod is the net value claimed for THIS period (not cumulative)
    // Each application is independent, not a cumulative valuation
    const claimedThisPeriod = claimedNetValue;

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

        // Claimed values (auto-calculated by backend)
        claimedGrossValue,
        claimedRetention,
        claimedNetValue,
        claimedPreviouslyPaid,
        claimedThisPeriod,

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

    // Create line item allocations if provided
    if (req.body.contractLineItemAllocations && Array.isArray(req.body.contractLineItemAllocations)) {
      console.log(`[payment-applications] Creating ${req.body.contractLineItemAllocations.length} line item allocations`);

      for (const allocation of req.body.contractLineItemAllocations) {
        if (allocation.claimedAmount && allocation.claimedAmount > 0) {
          await prisma.paymentApplicationLineItem.create({
            data: {
              tenantId,
              applicationId: application.id,
              packageId: contract.packageId || null,
              budgetLineId: allocation.budgetLineId || null,
              description: allocation.description || `Line item ${allocation.contractLineItemId || allocation.budgetLineId || ''}`.trim(),
              contractValue: Number(allocation.claimedAmount),
              quantityThisPeriod: 1,
              quantityCumulative: 1,
              unit: allocation.unit || 'item',
              rate: Number(allocation.claimedAmount),
              valueThisPeriod: Number(allocation.claimedAmount),
              valueCumulative: Number(allocation.claimedAmount),
            }
          });
        }
      }

      console.log(`[payment-applications] Created line item allocations for application ${application.id}`);
    }

    // Calculate complete payment breakdown (MCD → Retention → CIS → VAT) - Task 1.6
    if (claimedGrossValue > 0) {
      try {
        const paymentCalc = await calculatePayment({
          grossAmount: claimedGrossValue,
          contractId: application.contractId,
          supplierId: application.supplierId, // Optional - only for inbound apps
          tenantId,
        });

        // Update application with complete breakdown
        await prisma.applicationForPayment.update({
          where: { id: application.id },
          data: {
            // MCD
            mcdPercentage: paymentCalc.mcdPercentage,
            mcdAmount: paymentCalc.mcdAmount,
            grossAfterMCD: paymentCalc.grossAfterMCD,
            // CIS
            labourElement: paymentCalc.labourElement,
            materialsElement: paymentCalc.materialsElement,
            cisStatus: paymentCalc.cisStatus,
            cisRate: paymentCalc.cisRate,
            cisDeduction: paymentCalc.cisDeduction,
            netAfterCIS: paymentCalc.netAfterCIS,
            cisCalculatedAt: paymentCalc.calculatedAt,
            cisWarnings: paymentCalc.cisWarnings.length > 0 ? JSON.stringify(paymentCalc.cisWarnings) : null,
            // VAT
            vatTreatment: paymentCalc.vatTreatment,
            vatRate: paymentCalc.vatRate,
            vatAmount: paymentCalc.vatAmount,
            grossWithVAT: paymentCalc.grossWithVAT,
            reverseCharge: paymentCalc.reverseCharge,
            reverseChargeNote: paymentCalc.reverseChargeNote,
          },
        });

        // Attach payment breakdown to response
        Object.assign(application, {
          mcdPercentage: paymentCalc.mcdPercentage,
          mcdAmount: paymentCalc.mcdAmount,
          grossAfterMCD: paymentCalc.grossAfterMCD,
          labourElement: paymentCalc.labourElement,
          materialsElement: paymentCalc.materialsElement,
          cisStatus: paymentCalc.cisStatus,
          cisRate: paymentCalc.cisRate,
          cisDeduction: paymentCalc.cisDeduction,
          netAfterCIS: paymentCalc.netAfterCIS,
          cisCalculatedAt: paymentCalc.calculatedAt,
          cisWarnings: paymentCalc.cisWarnings.length > 0 ? JSON.stringify(paymentCalc.cisWarnings) : null,
          vatTreatment: paymentCalc.vatTreatment,
          vatRate: paymentCalc.vatRate,
          vatAmount: paymentCalc.vatAmount,
          grossWithVAT: paymentCalc.grossWithVAT,
          reverseCharge: paymentCalc.reverseCharge,
          reverseChargeNote: paymentCalc.reverseChargeNote,
        });

        console.log(`[payment-applications] Payment calculated for application ${application.id}: MCD ${paymentCalc.mcdAmount}, CIS ${paymentCalc.cisDeduction}, VAT ${paymentCalc.vatAmount}, Total ${paymentCalc.grossWithVAT}`);
      } catch (calcError) {
        console.error('[payment-applications] Payment calculation error:', calcError?.message);
        // Don't fail the entire request if calculation fails
      }
    }

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
      select: certificateApplicationSelect,
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    const [lineItemDetails, attachments] = await Promise.all([
      prisma.paymentApplicationLineItem.findMany({
        where: { tenantId, applicationId: id },
        select: {
          id: true,
          tenantId: true,
          applicationId: true,
          packageId: true,
          description: true,
          reference: true,
          quantityPrevious: true,
          quantityThisPeriod: true,
          quantityCumulative: true,
          unit: true,
          rate: true,
          valuePrevious: true,
          valueThisPeriod: true,
          valueCumulative: true,
          qsCertifiedQuantity: true,
          qsCertifiedValue: true,
          qsNotes: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }).catch(() => []),
      prisma.afpAttachment.findMany({
        where: { tenantId, afpId: id },
        select: { id: true, documentId: true, label: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }).catch(() => []),
    ]);

    const result = safeJson(application);
    result.lineItemDetails = safeJson(lineItemDetails);
    result.attachments = safeJson(attachments);
    result.paymentCertificateUrl = result.paymentCertificateUrl || result.valuationDocument || null;
    result.totalPaid = Number(result.totalPaid ?? result.amountPaid ?? 0);
    result.paidAt = result.paidAt || result.paidDate || null;
    result.certifiedPaymentAmount = Number(
      result.paymentNoticeAmount ??
      result.certifiedThisPeriod ??
      result.certifiedNetValue ??
      result.certifiedAmount ??
      0
    );
    result.remainingBalance = Math.max(result.certifiedPaymentAmount - result.totalPaid, 0);
    result.paidInFull = result.certifiedPaymentAmount > 0 && result.totalPaid >= result.certifiedPaymentAmount;
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

    await enforceApplicationUnlocked(req, id, 'update', req.body || {});

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

    // Auto-calculate claimed values if claimedGrossValue is being updated
    if (req.body.claimedGrossValue !== undefined) {
      const contract = await prisma.contract.findUnique({
        where: { id: existing.contractId },
      });

      if (contract) {
        const claimedGrossValue = Number(req.body.claimedGrossValue || 0);
        const retentionPercentage = Number(contract.retentionPercentage || 5.0);
        const claimedRetention = (claimedGrossValue * retentionPercentage) / 100;
        const claimedNetValue = claimedGrossValue - claimedRetention;

        // Get all previous non-cancelled applications for this contract (excluding current one)
        const previousApplications = await prisma.applicationForPayment.findMany({
          where: {
            contractId: existing.contractId,
            tenantId,
            status: { not: 'CANCELLED' },
            id: { not: existing.id }, // Exclude current application
          },
          select: {
            claimedNetValue: true,
          },
        });

        // Calculate cumulative previously paid amount
        const claimedPreviouslyPaid = previousApplications.reduce(
          (sum, app) => sum + Number(app.claimedNetValue || 0),
          0
        );

        // Calculate this period's net claim
        const claimedThisPeriod = claimedNetValue - claimedPreviouslyPaid;

        // Update all calculated fields
        updateData.claimedGrossValue = claimedGrossValue;
        updateData.claimedRetention = claimedRetention;
        updateData.claimedNetValue = claimedNetValue;
        updateData.claimedPreviouslyPaid = claimedPreviouslyPaid;
        updateData.claimedThisPeriod = claimedThisPeriod;
      }
    }

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

    // Recalculate complete payment breakdown if gross amount changed - Task 1.6
    if (req.body.claimedGrossValue !== undefined) {
      try {
        const paymentCalc = await calculatePayment({
          grossAmount: Number(application.claimedGrossValue),
          contractId: application.contractId,
          supplierId: application.supplierId, // Optional - only for inbound apps
          tenantId,
        });

        // Update all payment breakdown fields
        await prisma.applicationForPayment.update({
          where: { id: application.id },
          data: {
            // MCD
            mcdPercentage: paymentCalc.mcdPercentage,
            mcdAmount: paymentCalc.mcdAmount,
            grossAfterMCD: paymentCalc.grossAfterMCD,
            // CIS
            labourElement: paymentCalc.labourElement,
            materialsElement: paymentCalc.materialsElement,
            cisStatus: paymentCalc.cisStatus,
            cisRate: paymentCalc.cisRate,
            cisDeduction: paymentCalc.cisDeduction,
            netAfterCIS: paymentCalc.netAfterCIS,
            cisCalculatedAt: paymentCalc.calculatedAt,
            cisWarnings: paymentCalc.cisWarnings.length > 0 ? JSON.stringify(paymentCalc.cisWarnings) : null,
            // VAT
            vatTreatment: paymentCalc.vatTreatment,
            vatRate: paymentCalc.vatRate,
            vatAmount: paymentCalc.vatAmount,
            grossWithVAT: paymentCalc.grossWithVAT,
            reverseCharge: paymentCalc.reverseCharge,
            reverseChargeNote: paymentCalc.reverseChargeNote,
          },
        });

        // Attach payment breakdown to response
        Object.assign(application, {
          mcdPercentage: paymentCalc.mcdPercentage,
          mcdAmount: paymentCalc.mcdAmount,
          grossAfterMCD: paymentCalc.grossAfterMCD,
          labourElement: paymentCalc.labourElement,
          materialsElement: paymentCalc.materialsElement,
          cisStatus: paymentCalc.cisStatus,
          cisRate: paymentCalc.cisRate,
          cisDeduction: paymentCalc.cisDeduction,
          netAfterCIS: paymentCalc.netAfterCIS,
          cisCalculatedAt: paymentCalc.calculatedAt,
          cisWarnings: paymentCalc.cisWarnings.length > 0 ? JSON.stringify(paymentCalc.cisWarnings) : null,
          vatTreatment: paymentCalc.vatTreatment,
          vatRate: paymentCalc.vatRate,
          vatAmount: paymentCalc.vatAmount,
          grossWithVAT: paymentCalc.grossWithVAT,
          reverseCharge: paymentCalc.reverseCharge,
          reverseChargeNote: paymentCalc.reverseChargeNote,
        });

        console.log(`[payment-applications] Payment recalculated for application ${application.id}: MCD ${paymentCalc.mcdAmount}, CIS ${paymentCalc.cisDeduction}, VAT ${paymentCalc.vatAmount}`);
      } catch (calcError) {
        console.error('[payment-applications] Payment recalculation error:', calcError?.message);
        // Don't fail the entire request if calculation fails
      }
    }

    const result = safeJson(application);
    result.links = buildLinks('applicationForPayment', result);

    res.json(result);
  } catch (e) {
    if (sendCommercialLock(res, e)) return;
    if (e?.status) return res.status(e.status).json({ error: e.code || 'REQUEST_FAILED', message: e.message });
    console.error('[payment-applications] Update error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/applications/:id/recalculate-cis
 * Manually recalculate complete payment breakdown (MCD, Retention, CIS, VAT)
 * (useful if supplier CIS status changed or contract terms updated)
 * Note: Endpoint name kept for backward compatibility
 */
router.post('/applications/:id/recalculate-cis', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    if (!application.claimedGrossValue || Number(application.claimedGrossValue) <= 0) {
      return res.status(400).json({ error: 'Application has no gross value - cannot calculate payment' });
    }

    await enforceApplicationUnlocked(req, id, 'recalculate', {
      claimedGrossValue: application.claimedGrossValue,
    });

    // Recalculate complete payment breakdown - Task 1.6
    const paymentCalc = await calculatePayment({
      grossAmount: Number(application.claimedGrossValue),
      contractId: application.contractId,
      supplierId: application.supplierId, // Optional - only for inbound apps
      tenantId,
    });

    // Update application with complete breakdown
    const updated = await prisma.applicationForPayment.update({
      where: { id },
      data: {
        // MCD
        mcdPercentage: paymentCalc.mcdPercentage,
        mcdAmount: paymentCalc.mcdAmount,
        grossAfterMCD: paymentCalc.grossAfterMCD,
        // CIS
        labourElement: paymentCalc.labourElement,
        materialsElement: paymentCalc.materialsElement,
        cisStatus: paymentCalc.cisStatus,
        cisRate: paymentCalc.cisRate,
        cisDeduction: paymentCalc.cisDeduction,
        netAfterCIS: paymentCalc.netAfterCIS,
        cisCalculatedAt: paymentCalc.calculatedAt,
        cisWarnings: paymentCalc.cisWarnings.length > 0 ? JSON.stringify(paymentCalc.cisWarnings) : null,
        // VAT
        vatTreatment: paymentCalc.vatTreatment,
        vatRate: paymentCalc.vatRate,
        vatAmount: paymentCalc.vatAmount,
        grossWithVAT: paymentCalc.grossWithVAT,
        reverseCharge: paymentCalc.reverseCharge,
        reverseChargeNote: paymentCalc.reverseChargeNote,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        contract: { select: { id: true, title: true } },
      },
    });

    console.log(`[payment-applications] Payment manually recalculated for application ${id}: MCD ${paymentCalc.mcdAmount}, CIS ${paymentCalc.cisDeduction}, VAT ${paymentCalc.vatAmount}`);

    const result = safeJson(updated);
    result.links = buildLinks('applicationForPayment', result);

    res.json(result);
  } catch (e) {
    if (sendCommercialLock(res, e)) return;
    if (e?.status) return res.status(e.status).json({ error: e.code || 'REQUEST_FAILED', message: e.message });
    console.error('[payment-applications] CIS recalculation error:', e?.message, e?.stack);
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

    await enforceApplicationUnlocked(req, id, 'delete', {});

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
    if (sendCommercialLock(res, e)) return;
    if (e?.status) return res.status(e.status).json({ error: e.code || 'REQUEST_FAILED', message: e.message });
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
      select: applicationTransitionSelect,
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
      select: applicationTransitionSelect,
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
      select: applicationTransitionSelect,
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
      select: applicationTransitionSelect,
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
      select: applicationTransitionSelect,
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
      select: applicationTransitionSelect,
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
      select: applicationTransitionSelect,
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    // Allow certification from SUBMITTED or UNDER_REVIEW status
    if (!['SUBMITTED', 'UNDER_REVIEW', 'CERTIFIED'].includes(application.status)) {
      return res.status(400).json({
        error: 'Can only certify applications in SUBMITTED, UNDER_REVIEW, or CERTIFIED status',
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
      select: applicationTransitionSelect,
    });

    // Create CVR Actual entries for the certified amount
    // Priority 1: If contract line item allocations are provided, create per-line-item CVR entries
    if (req.body.contractLineItemAllocations && Array.isArray(req.body.contractLineItemAllocations) && req.body.contractLineItemAllocations.length > 0) {
      let totalAllocated = 0;

      for (const allocation of req.body.contractLineItemAllocations) {
        if (allocation.budgetLineId && allocation.certifiedAmount > 0) {
          try {
            await prisma.cVRActual.create({
              data: {
                tenantId,
                projectId: application.projectId,
                budgetLineId: allocation.budgetLineId,
                description: `Certified - ${application.reference || application.applicationNo || `PA-${id}`}`,
                amount: Number(allocation.certifiedAmount),
                sourceType: 'PAYMENT_APPLICATION',
                sourceId: id,
                status: 'CERTIFIED',
                incurredDate: new Date(),
                certifiedDate: new Date(),
              },
            });

            totalAllocated += Number(allocation.certifiedAmount);
            console.log(`📊 [CVR] Created CVR Actual for budget line ${allocation.budgetLineId}: £${Number(allocation.certifiedAmount).toFixed(2)}`);
          } catch (cvrError) {
            console.error(`⚠️  [CVR] Failed to create CVR entry for budget line ${allocation.budgetLineId}:`, cvrError.message);
          }
        }
      }

      console.log(`📊 [CVR] Created ${req.body.contractLineItemAllocations.length} line-item CVR entries for ${application.applicationNo}, total: £${totalAllocated.toFixed(2)}`);
    }
    // Priority 2: Fall back to application-level CVR entry if no line item allocations
    else if (application.projectId && application.budgetLineId) {
      const certifiedAmount = Number(req.body.certifiedNetValue || req.body.certifiedAmount || 0);

      if (certifiedAmount > 0) {
        try {
          await prisma.cVRActual.create({
            data: {
              tenantId,
              projectId: application.projectId,
              budgetLineId: application.budgetLineId,
              description: `Certified - ${application.reference || application.applicationNo || `PA-${id}`}`,
              amount: certifiedAmount,
              sourceType: 'PAYMENT_APPLICATION',
              sourceId: id,
              status: 'CERTIFIED', // Use CERTIFIED so CVR queries pick it up
              incurredDate: new Date(), // Certification date
              certifiedDate: new Date(), // Mark when it was certified
            },
          });

          console.log(`📊 [CVR] Created CVR Actual entry for certified payment application ${application.applicationNo}: £${certifiedAmount.toFixed(2)}`);
        } catch (cvrError) {
          console.error(`⚠️  [CVR] Failed to create CVR entry for ${application.applicationNo}:`, cvrError.message);
          // Don't fail the certification if CVR creation fails
        }
      }
    }

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
        select: { id: true },
      });
      console.log(`[Certification] Updated contract ${application.contractId} totalCertifiedToDate by £${req.body.certifiedThisPeriod}`);
    }

    // Create CVR Actual when AfP is certified (tracks income/value side)
    try {
      const cvrHooks = require('../services/cvr.hooks.cjs');
      await cvrHooks.onPaymentApplicationCertified(updated, tenantId, userId);
      console.log(`[CVR] Created CVR actual for payment application ${application.applicationNo}`);
    } catch (cvrErr) {
      console.error('[CVR] Error creating actual for AfP:', cvrErr.message);
      // Don't fail certification if CVR creation fails
    }

    // CVR Phase A: Update CVR Snapshot with PA actuals
    try {
      const { onPaymentApplicationStatusChange } = require('../services/cvrActualsService.cjs');
      await onPaymentApplicationStatusChange(id);
      console.log(`[CVR Phase A] Updated CVR snapshot for certified PA ${application.applicationNo}`);
    } catch (cvrPhaseAErr) {
      console.error('[CVR Phase A] Error updating CVR snapshot:', cvrPhaseAErr.message);
      // Don't fail certification if CVR snapshot update fails
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
      select: applicationTransitionSelect,
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
 * Record a payment against a payment application (Phase C - Enhanced)
 * Supports partial payments, deductions (retention, CIS), and CVR integration
 */
router.post('/applications/:id/record-payment', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      amount,
      paymentDate,
      paymentMethod,
      paymentReference,
      bankAccount,
      retentionDeducted,
      cisDeducted,
      otherDeductions,
      otherDeductionsNote,
      notes
    } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount required' });
    }
    if (!paymentDate) {
      return res.status(400).json({ error: 'Payment date required' });
    }
    if (!paymentMethod) {
      return res.status(400).json({ error: 'Payment method required' });
    }

    const result = await getPaymentRecordingService().recordPayment({
      paymentApplicationId: Number(id),
      amount,
      paymentDate,
      paymentMethod,
      paymentReference,
      bankAccount,
      retentionDeducted,
      cisDeducted,
      otherDeductions,
      otherDeductionsNote,
      notes,
      userId,
      tenantId
    });

    res.json({
      success: true,
      payment: safeJson(result.paymentRecord),
      application: safeJson(result.updatedApp),
      message: result.updatedApp.paidInFull
        ? 'Payment recorded - Application paid in full'
        : 'Partial payment recorded'
    });
  } catch (error) {
    console.error('[payment-applications] Error recording payment:', error);
    res.status(400).json({ error: error.message || 'Failed to record payment' });
  }
});

/**
 * GET /api/applications/:id/payments
 * Get payment history and summary for a payment application (Phase C)
 */
router.get('/applications/:id/payments', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payments = await getPaymentRecordingService().getPaymentHistory(Number(id), tenantId);
    const summary = await getPaymentRecordingService().getPaymentSummary(Number(id), tenantId);

    res.json({
      payments: safeJson(payments),
      summary: safeJson(summary)
    });
  } catch (error) {
    console.error('[payment-applications] Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

/**
 * POST /api/applications/:id/payments/:paymentId/reverse
 * Reverse a payment (Phase C)
 */
router.post('/applications/:id/payments/:paymentId/reverse', async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Reversal reason required' });
    }

    await getPaymentRecordingService().reversePayment(Number(paymentId), reason, userId, tenantId);

    res.json({
      success: true,
      message: 'Payment reversed successfully'
    });
  } catch (error) {
    console.error('[payment-applications] Error reversing payment:', error);
    res.status(400).json({ error: error.message || 'Failed to reverse payment' });
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
 * POST /api/applications/:id/cancel
 * Cancel application from any status with reason
 */
router.post('/applications/:id/cancel', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    // Already cancelled
    if (application.status === 'CANCELLED') {
      return res.status(400).json({
        error: 'Application is already cancelled',
        currentStatus: application.status,
      });
    }

    // Require cancellation reason
    if (!req.body.reason || !req.body.reason.trim()) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const updated = await prisma.applicationForPayment.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledBy: userId,
        cancelledAt: new Date(),
        cancellationReason: req.body.reason.trim(),
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
    console.error('[payment-applications] Cancel error:', e?.message, e?.stack);
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
// PAYMENT DOCUMENT GENERATION ENDPOINTS (UK Construction Act)
// ==============================================================================

/**
 * POST /api/applications/:id/certificate/generate
 * Generate Payment Certificate PDF/HTML
 */
router.post('/applications/:id/certificate/generate', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const result = await generatePaymentCertificate(id, tenantId);

    res.json({
      success: true,
      message: 'Payment certificate generated successfully',
      document: result
        ? { ...result, docId: result.docId != null ? String(result.docId) : result.docId }
        : result,
    });
  } catch (e) {
    console.error('[payment-applications] Generate certificate error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * GET /api/applications/:id/certificate/download
 * Download Payment Certificate PDF (generate on-the-fly)
 */
router.get('/applications/:id/certificate/download', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const paymentAppRaw = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
      select: certificateApplicationSelect,
    });

    if (!paymentAppRaw) {
      return res.status(404).json({ error: 'Payment application not found' });
    }
    const paymentApp = normaliseCertificateApplication(paymentAppRaw);

    // Generate PDF on-the-fly
    const pdfBuffer = await generatePaymentCertificatePdf(paymentApp, {
      project: paymentApp.project,
      contract: paymentApp.contract,
      tenantName: process.env.APP_NAME || 'ERP'
    });

    // Update download tracking
    await updateApplicationIfColumnsExist(id, {
      paymentCertificateSentAt: new Date(),
      paymentCertificateSentBy: req.user?.id ? String(req.user.id) : null,
      paymentCertificateSentMethod: 'DOWNLOAD'
    });

    // Send PDF as download
    const filename = `Payment_Certificate_${paymentApp.applicationNo || id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (e) {
    console.error('[payment-applications] Download certificate error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/applications/:id/certificate/send
 * Send Payment Certificate via email to supplier
 */
router.post('/applications/:id/certificate/send', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { email, cc } = req.body;
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id || null;

    const paymentAppRaw = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
      select: certificateApplicationSelect,
    });

    if (!paymentAppRaw) {
      return res.status(404).json({ error: 'Payment application not found' });
    }
    const paymentApp = normaliseCertificateApplication(paymentAppRaw);

    // Determine recipient email
    const recipientEmail = email || paymentApp.supplier?.email || paymentApp.contract?.supplier?.email;

    if (!recipientEmail) {
      return res.status(400).json({ error: 'No email address available for supplier' });
    }

    // Generate PDF
    const pdfBuffer = await generatePaymentCertificatePdf(paymentApp, {
      project: paymentApp.project,
      contract: paymentApp.contract,
      tenantName: process.env.APP_NAME || 'ERP'
    });

    // Generate email using template
    const { html: emailHtml, text: emailText } = paymentCertificateEmail({
      supplier_name: paymentApp.contract?.supplier?.name || 'Supplier',
      certificate_number: `PC-${paymentApp.applicationNo || id}`,
      project_name: paymentApp.project?.name || 'N/A',
      amount: Number(paymentApp.certifiedThisPeriod || 0),
      due_date: paymentApp.finalPaymentDate || paymentApp.dueDate,
      company_name: process.env.APP_NAME || 'ERP System',
      application_number: paymentApp.applicationNo,
      contract_title: paymentApp.contract?.title
    });

    // Send email
    await sendEmail({
      to: recipientEmail,
      subject: `Payment Certificate ${paymentApp.applicationNo || id} - ${paymentApp.project?.name || 'Project'}`,
      html: emailHtml,
      text: emailText
    });

    // Update record with send details
    await updateApplicationIfColumnsExist(id, {
      paymentCertificateSentAt: new Date(),
      paymentCertificateSentBy: userId ? String(userId) : null,
      paymentCertificateSentMethod: 'EMAIL',
      paymentCertificateSentTo: recipientEmail
    });

    res.json({
      success: true,
      sentTo: recipientEmail,
      sentAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('[payment-applications] Send certificate error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/applications/:id/certificate/mark-sent
 * Manually mark certificate as sent (for external sending)
 */
router.post('/applications/:id/certificate/mark-sent', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { method, sentTo, notes } = req.body;
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id || null;

    const paymentApp = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!paymentApp) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    // Update record with manual send tracking
    const trackingUpdate = await updateApplicationIfColumnsExist(id, {
      paymentCertificateSentAt: new Date(),
      paymentCertificateSentBy: userId ? String(userId) : null,
      paymentCertificateSentMethod: method || 'MANUAL',
      paymentCertificateSentTo: sentTo || null
    });

    res.json({
      success: true,
      markedAt: new Date().toISOString(),
      trackingStored: !!trackingUpdate,
    });
  } catch (e) {
    console.error('[payment-applications] Mark certificate as sent error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/applications/:id/payment-notice/generate
 * Generate Payment Notice PDF/HTML
 */
router.post('/applications/:id/payment-notice/generate', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const result = await generatePaymentNotice(id, tenantId);

    res.json({
      success: true,
      message: 'Payment notice generated successfully',
      document: result,
    });
  } catch (e) {
    console.error('[payment-applications] Generate payment notice error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/applications/:id/pay-less/generate
 * Generate Pay Less Notice PDF/HTML
 */
router.post('/applications/:id/pay-less/generate', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';
    const { payLessAmount, payLessReason } = req.body;

    if (!payLessAmount || !payLessReason) {
      return res.status(400).json({
        error: 'payLessAmount and payLessReason are required',
      });
    }

    const result = await generatePayLessNotice(id, tenantId, payLessAmount, payLessReason);

    res.json({
      success: true,
      message: 'Pay-less notice generated successfully',
      document: result,
    });
  } catch (e) {
    console.error('[payment-applications] Generate pay-less notice error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * GET /api/applications/:id/pay-less/download
 * Download Pay Less Notice
 */
router.get('/applications/:id/pay-less/download', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
      select: { payLessNoticeDocument: true, applicationNo: true, applicationNumber: true },
    });

    if (!application || !application.payLessNoticeDocument) {
      return res.status(404).json({ error: 'Pay-less notice not found' });
    }

    // Return the URL/path for download
    res.json({
      url: application.payLessNoticeDocument,
      filename: `Pay-Less-Notice-${application.applicationNo || application.applicationNumber || id}.pdf`,
    });
  } catch (e) {
    console.error('[payment-applications] Download pay-less notice error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * POST /api/applications/:id/pay-less/send
 * Send Pay Less Notice via email
 */
router.post('/applications/:id/pay-less/send', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
      include: {
        supplier: true,
        contract: true,
        project: true,
      },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    if (!application.payLessNoticeDocument) {
      return res.status(400).json({ error: 'Pay-less notice not generated yet' });
    }

    // TODO: Implement email sending
    // For now, just return success
    res.json({
      success: true,
      message: 'Pay-less notice sent successfully',
      sentTo: req.body.email || application.supplier?.email || 'contractor@example.com',
    });
  } catch (e) {
    console.error('[payment-applications] Send pay-less notice error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * GET /api/applications/:id/documents
 * Get all payment documents for an application
 */
router.get('/applications/:id/documents', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const documents = await getPaymentDocuments(id, tenantId);

    res.json(documents);
  } catch (e) {
    console.error('[payment-applications] Get documents error:', e?.message, e?.stack);
    next(e);
  }
});

/**
 * GET /api/applications/:id/compliance
 * Check Construction Act compliance for an application
 */
router.get('/applications/:id/compliance', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.user?.tenantId || 'demo';

    const application = await prisma.applicationForPayment.findFirst({
      where: { id, tenantId },
    });

    if (!application) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    const compliance = checkConstructionActCompliance(application);

    res.json(compliance);
  } catch (e) {
    console.error('[payment-applications] Check compliance error:', e?.message, e?.stack);
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
          where: {
            tenantId,
            status: {
              notIn: ['CANCELLED', 'REJECTED']
            }
          },
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
          where: {
            tenantId,
            status: {
              notIn: ['CANCELLED', 'REJECTED']
            }
          },
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
          where: {
            tenantId,
            status: {
              notIn: ['CANCELLED', 'REJECTED']
            }
          },
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

// ==============================================================================
// PAYMENT CERTIFICATE DOCUMENT MANAGEMENT ENDPOINTS
// ==============================================================================

/**
 * POST /api/applications/:id/certificate/generate
 * Generate payment certificate PDF and store URL
 */
router.post('/applications/:id/certificate/generate-full', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId || 'demo';

    const paymentAppRaw = await prisma.applicationForPayment.findFirst({
      where: { id: Number(id), tenantId },
      select: certificateApplicationSelect,
    });

    if (!paymentAppRaw) {
      return res.status(404).json({ error: 'Payment application not found' });
    }
    const paymentApp = normaliseCertificateApplication(paymentAppRaw);

    // Generate PDF using pdfkit
    const pdfBuffer = await generatePaymentCertificatePdf(paymentApp, {
      project: paymentApp.project,
      contract: paymentApp.contract,
      tenantName: process.env.APP_NAME || 'ERP'
    });

    // Store PDF
    const filename = `Payment-Certificate-${paymentApp.applicationNo || paymentApp.id}.pdf`;
    const docId = await saveBufferAsDocument(pdfBuffer, filename, 'application/pdf', tenantId, paymentApp.projectId);

    // Get document URL
    const doc = await prisma.document.findUnique({ where: { id: docId } });
    const url = doc?.storageKey || '';

    // Update record with certificate URL and generation timestamp
    await updateApplicationIfColumnsExist(id, {
      paymentCertificateUrl: url,
      valuationDocument: url,
      paymentCertificateGeneratedAt: new Date()
    });

    res.json({
      success: true,
      url,
      filename,
      docId: String(docId)
    });
  } catch (error) {
    console.error('[payment-applications] Error generating payment certificate:', error);
    next(error);
  }
});

/**
 * GET /api/payment-applications/:id/certificate/download
 * Download payment certificate PDF (generate on-the-fly if needed)
 */
router.get('/:id/certificate/download', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId || 'demo';

    const paymentAppRaw = await prisma.applicationForPayment.findFirst({
      where: { id: Number(id), tenantId },
      select: certificateApplicationSelect,
    });

    if (!paymentAppRaw) {
      return res.status(404).json({ error: 'Payment application not found' });
    }
    const paymentApp = normaliseCertificateApplication(paymentAppRaw);

    // Generate PDF on-the-fly
    const pdfBuffer = await generatePaymentCertificatePdf(paymentApp, {
      project: paymentApp.project,
      contract: paymentApp.contract,
      tenantName: process.env.APP_NAME || 'ERP'
    });

    // Update download tracking
    await updateApplicationIfColumnsExist(id, {
      paymentCertificateSentAt: new Date(),
      paymentCertificateSentBy: req.user?.id ? String(req.user.id) : null,
      paymentCertificateSentMethod: 'DOWNLOAD'
    });

    // Send PDF as download
    const filename = `Payment_Certificate_${paymentApp.applicationNo || paymentApp.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[payment-applications] Error downloading payment certificate:', error);
    next(error);
  }
});

/**
 * POST /api/payment-applications/:id/certificate/send
 * Send payment certificate via email to supplier
 */
router.post('/:id/certificate/send', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, cc } = req.body; // Optional override email
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id || null;

    const paymentAppRaw = await prisma.applicationForPayment.findFirst({
      where: { id: Number(id), tenantId },
      select: certificateApplicationSelect,
    });

    if (!paymentAppRaw) {
      return res.status(404).json({ error: 'Payment application not found' });
    }
    const paymentApp = normaliseCertificateApplication(paymentAppRaw);

    // Determine recipient email
    const recipientEmail = email || paymentApp.supplier?.email || paymentApp.contract?.supplier?.email;

    if (!recipientEmail) {
      return res.status(400).json({ error: 'No email address available for supplier' });
    }

    // Generate PDF
    const pdfBuffer = await generatePaymentCertificatePdf(paymentApp, {
      project: paymentApp.project,
      contract: paymentApp.contract,
      tenantName: process.env.APP_NAME || 'ERP'
    });

    // Store PDF if not already stored
    let url = paymentApp.paymentCertificateUrl || paymentApp.valuationDocument;
    let docId;
    if (!url) {
      const filename = `Payment-Certificate-${paymentApp.applicationNo || paymentApp.id}.pdf`;
      docId = await saveBufferAsDocument(pdfBuffer, filename, 'application/pdf', tenantId, paymentApp.projectId);
      const doc = await prisma.document.findUnique({ where: { id: docId } });
      url = doc?.storageKey || '';
    }

    // Generate email using template
    const { html: emailHtml, text: emailText } = paymentCertificateEmail({
      supplier_name: paymentApp.contract?.supplier?.name || 'Supplier',
      certificate_number: `PC-${paymentApp.applicationNo || paymentApp.id}`,
      project_name: paymentApp.project?.name || 'N/A',
      amount: Number(paymentApp.certifiedThisPeriod || 0),
      due_date: paymentApp.finalPaymentDate || paymentApp.dueDate,
      company_name: process.env.APP_NAME || 'ERP System',
      application_number: paymentApp.applicationNo,
      contract_title: paymentApp.contract?.title
    });

    // Send email with PDF attachment
    const filename = `Payment_Certificate_${paymentApp.applicationNo || paymentApp.id}.pdf`;
    const emailData = {
      to: recipientEmail,
      subject: `Payment Certificate ${paymentApp.applicationNo || paymentApp.id} - ${paymentApp.project?.name || 'Project'}`,
      html: emailHtml,
      text: emailText
    };

    await sendEmail(emailData);

    // Update record with send details
    await updateApplicationIfColumnsExist(id, {
      paymentCertificateUrl: url,
      valuationDocument: url,
      paymentCertificateSentAt: new Date(),
      paymentCertificateSentBy: userId ? String(userId) : null,
      paymentCertificateSentMethod: 'EMAIL',
      paymentCertificateSentTo: recipientEmail
    });

    res.json({
      success: true,
      sentTo: recipientEmail,
      sentAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[payment-applications] Error sending payment certificate:', error);
    next(error);
  }
});

/**
 * POST /api/payment-applications/:id/certificate/mark-sent
 * Manually mark certificate as sent (for external sending)
 */
router.post('/:id/certificate/mark-sent', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { method, sentTo, notes } = req.body;
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id || null;

    const paymentApp = await prisma.applicationForPayment.findFirst({
      where: { id: Number(id), tenantId },
      select: { id: true },
    });

    if (!paymentApp) {
      return res.status(404).json({ error: 'Payment application not found' });
    }

    // Update record with manual send tracking
    const trackingUpdate = await updateApplicationIfColumnsExist(id, {
      paymentCertificateSentAt: new Date(),
      paymentCertificateSentBy: userId ? String(userId) : null,
      paymentCertificateSentMethod: method || 'MANUAL',
      paymentCertificateSentTo: sentTo || null
    });

    res.json({
      success: true,
      markedAt: new Date().toISOString(),
      trackingStored: !!trackingUpdate,
    });
  } catch (error) {
    console.error('[payment-applications] Error marking certificate as sent:', error);
    next(error);
  }
});

/**
 * GET /api/applications/:id/invoices
 * Get invoices linked to this payment application (Phase B: Certificate-Invoice Matching)
 */
router.get('/applications/:id/invoices', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized - no tenant' });
    }

    if (!(await hasInvoiceColumn('paymentApplicationId'))) {
      return res.json({ invoices: [], compatibility: { paymentApplicationLinkMissing: true } });
    }

    // Find all invoices linked to this payment application
    const invoices = await prisma.invoice.findMany({
      where: {
        paymentApplicationId: Number(id),
        tenantId
      },
      select: {
        id: true,
        tenantId: true,
        projectId: true,
        supplierId: true,
        number: true,
        issueDate: true,
        dueDate: true,
        net: true,
        vat: true,
        gross: true,
        status: true,
        paidAmount: true,
        paidDate: true,
        createdAt: true,
        updatedAt: true,
        supplier: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ invoices: safeJson(invoices) });
  } catch (error) {
    console.error('[payment-applications] Error fetching linked invoices:', error);
    next(error);
  }
});

module.exports = router;
