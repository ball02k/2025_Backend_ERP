const { prisma } = require('../utils/prisma.cjs');
const tableAvailabilityCache = new Map();

function isSchemaDriftError(error) {
  return error?.code === 'P2021' || error?.code === 'P2022';
}

function toNumber(value) {
  return Number(value || 0);
}

async function hasTable(tableName) {
  if (tableAvailabilityCache.has(tableName)) {
    return tableAvailabilityCache.get(tableName);
  }

  const rows = await prisma.$queryRaw`
    SELECT 1 AS present
    FROM information_schema.tables
    WHERE table_schema = ${'public'}
      AND table_name = ${tableName}
    LIMIT 1
  `;
  const present = rows.length > 0;
  tableAvailabilityCache.set(tableName, present);
  return present;
}

const paymentApplicationPaymentSelect = {
  id: true,
  tenantId: true,
  projectId: true,
  supplierId: true,
  contractId: true,
  applicationNumber: true,
  applicationNo: true,
  reference: true,
  certifiedGrossValue: true,
  certifiedRetention: true,
  certifiedNetValue: true,
  certifiedThisPeriod: true,
  certifiedAmount: true,
  amountPaid: true,
  paidDate: true,
  paymentReference: true,
  status: true,
};

function certifiedAmountFor(paymentApp) {
  const certifiedNet = toNumber(paymentApp.certifiedNetValue);
  if (certifiedNet) return certifiedNet;

  const certifiedThisPeriod = toNumber(paymentApp.certifiedThisPeriod);
  if (certifiedThisPeriod) return certifiedThisPeriod;

  const certifiedAmount = toNumber(paymentApp.certifiedAmount);
  if (certifiedAmount) return certifiedAmount;

  const certifiedGross = toNumber(paymentApp.certifiedGrossValue);
  if (certifiedGross) {
    return certifiedGross - toNumber(paymentApp.certifiedRetention);
  }

  return 0;
}

async function findPaymentApplication(paymentApplicationId, tenantId) {
  return prisma.applicationForPayment.findFirst({
    where: { id: paymentApplicationId, tenantId },
    select: paymentApplicationPaymentSelect,
  });
}

async function getPaymentRecordsIfAvailable(paymentApplicationId, tenantId) {
  if (!(await hasTable('PaymentRecord'))) {
    return [];
  }

  try {
    return await prisma.paymentRecord.findMany({
      where: {
        paymentApplicationId,
        tenantId,
        status: { not: 'REVERSED' },
      },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        paymentReference: true,
        bankAccount: true,
        retentionDeducted: true,
        cisDeducted: true,
        otherDeductions: true,
        otherDeductionsNote: true,
        status: true,
        createdAt: true,
        createdBy: true,
        notes: true,
      },
      orderBy: { paymentDate: 'desc' },
    });
  } catch (error) {
    if (isSchemaDriftError(error)) {
      tableAvailabilityCache.set('PaymentRecord', false);
      return [];
    }
    throw error;
  }
}

/**
 * Payment Recording Service (Phase C)
 *
 * Handles recording of actual payments made against payment applications
 * Supports full and partial payments with deductions (retention, CIS)
 * Integrates with CVR to record actual spend
 */

/**
 * Record a payment against a payment application
 */
async function recordPayment({
  paymentApplicationId,
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
}) {
  // Get the payment application
  const paymentApp = await findPaymentApplication(paymentApplicationId, tenantId);

  if (!paymentApp) {
    throw new Error('Payment application not found');
  }

  // Calculate amounts
  const certifiedAmount = certifiedAmountFor(paymentApp);
  const existingPayments = await getPaymentRecordsIfAvailable(paymentApplicationId, tenantId);
  const previouslyPaid = existingPayments.length
    ? existingPayments.reduce((sum, p) => sum + toNumber(p.amount), 0)
    : toNumber(paymentApp.amountPaid);
  const remainingBefore = certifiedAmount - previouslyPaid;
  const paymentAmount = toNumber(amount);

  if (paymentAmount > remainingBefore + 0.01) { // Small tolerance for rounding
    throw new Error(`Payment amount (£${paymentAmount.toFixed(2)}) exceeds remaining balance (£${remainingBefore.toFixed(2)})`);
  }

  const newTotalPaid = previouslyPaid + paymentAmount;
  const newRemainingBalance = certifiedAmount - newTotalPaid;
  const isPaidInFull = newRemainingBalance < 0.01; // Consider paid if less than 1p remaining

  // Create payment record and update application in transaction
  const result = await prisma.$transaction(async (tx) => {
    let paymentRecord = {
      id: null,
      tenantId,
      paymentApplicationId,
      amount: paymentAmount,
      paymentDate: new Date(paymentDate),
      paymentMethod,
      paymentReference,
      bankAccount,
      retentionDeducted: retentionDeducted ? toNumber(retentionDeducted) : null,
      cisDeducted: cisDeducted ? toNumber(cisDeducted) : null,
      otherDeductions: otherDeductions ? toNumber(otherDeductions) : null,
      otherDeductionsNote,
      notes,
      createdBy: String(userId),
      status: 'COMPLETED',
      source: 'APPLICATION_LEGACY_FIELDS',
    };

    if (await hasTable('PaymentRecord')) {
      try {
        paymentRecord = await tx.paymentRecord.create({
          data: {
            tenantId,
            paymentApplicationId,
            amount: paymentAmount,
            paymentDate: new Date(paymentDate),
            paymentMethod,
            paymentReference,
            bankAccount,
            retentionDeducted: retentionDeducted ? toNumber(retentionDeducted) : null,
            cisDeducted: cisDeducted ? toNumber(cisDeducted) : null,
            otherDeductions: otherDeductions ? toNumber(otherDeductions) : null,
            otherDeductionsNote,
            notes,
            createdBy: String(userId),
            status: 'COMPLETED'
          }
        });
      } catch (error) {
        if (!isSchemaDriftError(error)) {
          throw error;
        }
        tableAvailabilityCache.set('PaymentRecord', false);
      }
    }

    // Update payment application
    const updatedApp = await tx.applicationForPayment.update({
      where: { id: paymentApplicationId },
      data: {
        amountPaid: newTotalPaid,
        totalPaid: newTotalPaid,
        remainingBalance: newRemainingBalance,
        paidInFull: isPaidInFull,
        paidAt: new Date(paymentDate),
        paidDate: new Date(paymentDate),
        paymentReference: paymentReference || null,
        status: isPaidInFull ? 'PAID' : 'PARTIALLY_PAID'
      },
      select: paymentApplicationPaymentSelect,
    });

    if (paymentApp.contractId) {
      await tx.contract.update({
        where: { id: paymentApp.contractId },
        data: {
          totalPaidToDate: { increment: paymentAmount },
        },
        select: { id: true },
      });
    }

    // A certified application has already created the CVR actual. Recording
    // payment should advance that actual to paid, not create a second cost.
    const existingActual = await tx.cVRActual.findFirst({
      where: {
        tenantId,
        sourceType: 'PAYMENT_APPLICATION',
        sourceId: paymentApplicationId,
      },
      select: { id: true },
    });

    if (existingActual) {
      await tx.cVRActual.update({
        where: { id: existingActual.id },
        data: {
          status: isPaidInFull ? 'PAID' : 'PARTIALLY_PAID',
          paidDate: new Date(paymentDate),
        },
      });
    } else {
      await tx.cVRActual.create({
        data: {
          tenantId,
          projectId: paymentApp.projectId,
          budgetLineId: null,
          description: `Payment Application - ${paymentApp.reference || `PA-${paymentApp.applicationNumber}`}`,
          amount: paymentAmount,
          sourceType: 'PAYMENT_APPLICATION',
          sourceId: paymentApplicationId,
          status: isPaidInFull ? 'PAID' : 'PARTIALLY_PAID',
          incurredDate: new Date(paymentDate),
          paidDate: new Date(paymentDate)
        }
      });
    }

    return {
      paymentRecord,
      updatedApp: {
        ...updatedApp,
        totalPaid: newTotalPaid,
        remainingBalance: newRemainingBalance,
        paidInFull: isPaidInFull,
      },
    };
  });

  return result;
}

/**
 * Get payment history for a payment application
 */
async function getPaymentHistory(paymentApplicationId, tenantId) {
  const payments = await getPaymentRecordsIfAvailable(paymentApplicationId, tenantId);
  if (payments.length) {
    return payments;
  }

  const paymentApp = await findPaymentApplication(paymentApplicationId, tenantId);
  if (!paymentApp || !paymentApp.amountPaid) {
    return [];
  }

  return [{
    id: null,
    tenantId,
    paymentApplicationId,
    amount: paymentApp.amountPaid,
    paymentDate: paymentApp.paidDate,
    paymentMethod: null,
    paymentReference: paymentApp.paymentReference,
    bankAccount: null,
    retentionDeducted: null,
    cisDeducted: null,
    otherDeductions: null,
    otherDeductionsNote: null,
    status: paymentApp.status === 'PAID' ? 'COMPLETED' : 'PARTIAL',
    createdAt: paymentApp.paidDate,
    createdBy: null,
    notes: 'Legacy payment recorded on the application',
    source: 'APPLICATION_LEGACY_FIELDS',
  }];
}

/**
 * Get payment summary for a payment application
 */
async function getPaymentSummary(paymentApplicationId, tenantId) {
  const paymentApp = await findPaymentApplication(paymentApplicationId, tenantId);

  if (!paymentApp) {
    throw new Error('Payment application not found');
  }

  const certifiedAmount = certifiedAmountFor(paymentApp);
  const payments = await getPaymentHistory(paymentApplicationId, tenantId);
  const totalPaid = payments.length
    ? payments.reduce((sum, p) => sum + toNumber(p.amount), 0)
    : toNumber(paymentApp.amountPaid);
  const remainingBalance = certifiedAmount - totalPaid;

  return {
    certifiedAmount,
    totalPaid,
    remainingBalance,
    paidInFull: remainingBalance < 0.01,
    paymentCount: payments.length,
    lastPaymentDate: payments[0]?.paymentDate || null
  };
}

/**
 * Reverse/void a payment (for corrections)
 */
async function reversePayment(paymentRecordId, reason, userId, tenantId) {
  const payment = await prisma.paymentRecord.findFirst({
    where: { id: paymentRecordId, tenantId },
    include: {
      paymentApplication: true
    }
  });

  if (!payment) {
    throw new Error('Payment record not found');
  }

  if (payment.status === 'REVERSED') {
    throw new Error('Payment already reversed');
  }

  const paymentAmount = parseFloat(payment.amount);

  await prisma.$transaction(async (tx) => {
    // Mark payment as reversed
    await tx.paymentRecord.update({
      where: { id: paymentRecordId },
      data: {
        status: 'REVERSED',
        notes: `${payment.notes || ''}\n\nREVERSED: ${reason} (by ${userId} on ${new Date().toISOString()})`
      }
    });

    // Update payment application totals. Keep legacy amountPaid/paidDate aligned
    // because older finance views still read those fields directly.
    const activePayments = await tx.paymentRecord.findMany({
      where: {
        tenantId,
        paymentApplicationId: payment.paymentApplicationId,
        status: { not: 'REVERSED' },
      },
      orderBy: { paymentDate: 'desc' },
      select: {
        amount: true,
        paymentDate: true,
        paymentReference: true,
      },
    });
    const newTotalPaid = activePayments.reduce((sum, p) => sum + toNumber(p.amount), 0);
    const lastActivePayment = activePayments[0] || null;
    const certifiedAmount = certifiedAmountFor(payment.paymentApplication);
    const newRemainingBalance = Math.max(certifiedAmount - newTotalPaid, 0);
    const isPaidInFull = certifiedAmount > 0 && newRemainingBalance < 0.01;

    await tx.applicationForPayment.update({
      where: { id: payment.paymentApplicationId },
      data: {
        amountPaid: newTotalPaid,
        totalPaid: newTotalPaid,
        remainingBalance: newRemainingBalance,
        paidInFull: isPaidInFull,
        paidAt: lastActivePayment?.paymentDate || null,
        paidDate: lastActivePayment?.paymentDate || null,
        paymentReference: lastActivePayment?.paymentReference || null,
        status: isPaidInFull ? 'PAID' : (newTotalPaid > 0 ? 'PARTIALLY_PAID' : 'APPROVED')
      }
    });

    // Create reversing CVR entry
    await tx.cVRActual.create({
      data: {
        tenantId,
        projectId: payment.paymentApplication.projectId,
        budgetLineId: payment.paymentApplication.budgetLineId,
        description: `Payment Reversal - ${payment.paymentReference || paymentRecordId}`,
        amount: -paymentAmount, // Negative to reverse
        sourceType: 'PAYMENT_REVERSAL',
        sourceId: paymentRecordId,
        status: 'REVERSED',
        incurredDate: new Date()
      }
    });
  });

  return { success: true };
}

module.exports = {
  recordPayment,
  getPaymentHistory,
  getPaymentSummary,
  reversePayment
};
