const { prisma } = require('../utils/prisma.cjs');

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
  const paymentApp = await prisma.applicationForPayment.findFirst({
    where: { id: paymentApplicationId, tenantId },
    include: {
      payments: true,
      contract: {
        include: { supplier: true }
      },
      project: true
    }
  });

  if (!paymentApp) {
    throw new Error('Payment application not found');
  }

  // Calculate amounts
  const certifiedAmount = parseFloat(paymentApp.certifiedNetValue || paymentApp.certifiedGrossValue || 0);
  const previouslyPaid = paymentApp.payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const remainingBefore = certifiedAmount - previouslyPaid;
  const paymentAmount = parseFloat(amount);

  if (paymentAmount > remainingBefore + 0.01) { // Small tolerance for rounding
    throw new Error(`Payment amount (£${paymentAmount.toFixed(2)}) exceeds remaining balance (£${remainingBefore.toFixed(2)})`);
  }

  const newTotalPaid = previouslyPaid + paymentAmount;
  const newRemainingBalance = certifiedAmount - newTotalPaid;
  const isPaidInFull = newRemainingBalance < 0.01; // Consider paid if less than 1p remaining

  // Create payment record and update application in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create payment record
    const paymentRecord = await tx.paymentRecord.create({
      data: {
        tenantId,
        paymentApplicationId,
        amount: paymentAmount,
        paymentDate: new Date(paymentDate),
        paymentMethod,
        paymentReference,
        bankAccount,
        retentionDeducted: retentionDeducted ? parseFloat(retentionDeducted) : null,
        cisDeducted: cisDeducted ? parseFloat(cisDeducted) : null,
        otherDeductions: otherDeductions ? parseFloat(otherDeductions) : null,
        otherDeductionsNote,
        notes,
        createdBy: String(userId),
        status: 'COMPLETED'
      }
    });

    // Update payment application
    const updatedApp = await tx.applicationForPayment.update({
      where: { id: paymentApplicationId },
      data: {
        totalPaid: newTotalPaid,
        remainingBalance: newRemainingBalance,
        paidInFull: isPaidInFull,
        paidAt: isPaidInFull ? new Date() : null,
        status: isPaidInFull ? 'PAID' : 'PARTIALLY_PAID'
      }
    });

    // Create CVR entry for the actual spend
    await tx.cVRActual.create({
      data: {
        tenantId,
        projectId: paymentApp.projectId,
        budgetLineId: paymentApp.budgetLineId,
        description: `Payment - ${paymentApp.reference || `PA-${paymentApp.applicationNumber}`}`,
        amount: paymentAmount,
        sourceType: 'PAYMENT',
        sourceId: paymentRecord.id,
        status: 'PAID',
        incurredDate: new Date(paymentDate),
        paidDate: new Date(paymentDate)
      }
    });

    return { paymentRecord, updatedApp };
  });

  return result;
}

/**
 * Get payment history for a payment application
 */
async function getPaymentHistory(paymentApplicationId, tenantId) {
  const payments = await prisma.paymentRecord.findMany({
    where: {
      paymentApplicationId,
      tenantId
    },
    orderBy: {
      paymentDate: 'desc'
    }
  });

  return payments;
}

/**
 * Get payment summary for a payment application
 */
async function getPaymentSummary(paymentApplicationId, tenantId) {
  const paymentApp = await prisma.applicationForPayment.findFirst({
    where: { id: paymentApplicationId, tenantId },
    include: {
      payments: true
    }
  });

  if (!paymentApp) {
    throw new Error('Payment application not found');
  }

  // Calculate certifiedNetValue if not set (gross - retention)
  let certifiedAmount = parseFloat(paymentApp.certifiedNetValue || 0);
  if (!certifiedAmount && paymentApp.certifiedGrossValue) {
    certifiedAmount = parseFloat(paymentApp.certifiedGrossValue) - parseFloat(paymentApp.certifiedRetention || 0);
  }
  if (!certifiedAmount) {
    certifiedAmount = parseFloat(paymentApp.certifiedGrossValue || 0);
  }

  const totalPaid = paymentApp.payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const remainingBalance = certifiedAmount - totalPaid;

  return {
    certifiedAmount,
    totalPaid,
    remainingBalance,
    paidInFull: remainingBalance < 0.01,
    paymentCount: paymentApp.payments.length,
    lastPaymentDate: paymentApp.payments[0]?.paymentDate || null
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

    // Update payment application totals
    const currentTotalPaid = parseFloat(payment.paymentApplication.totalPaid || 0);
    const newTotalPaid = currentTotalPaid - paymentAmount;
    const certifiedAmount = parseFloat(payment.paymentApplication.certifiedNetValue || payment.paymentApplication.certifiedGrossValue || 0);

    await tx.applicationForPayment.update({
      where: { id: payment.paymentApplicationId },
      data: {
        totalPaid: newTotalPaid,
        remainingBalance: certifiedAmount - newTotalPaid,
        paidInFull: false,
        paidAt: null,
        status: newTotalPaid > 0 ? 'PARTIALLY_PAID' : 'APPROVED'
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
