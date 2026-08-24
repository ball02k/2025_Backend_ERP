/**
 * Payment Service (Task 3.3)
 *
 * Functions for recording and managing payments against certificates
 */

const { prisma, toDecimal } = require('../lib/prisma.js');

/**
 * Record a payment against a certificate
 * Handles full payments, partial payments, and overpayments
 * Updates certificate and application status
 *
 * @param {string} certificateId - Certificate ID
 * @param {Object} paymentData - Payment details
 * @param {string} tenantId - Tenant ID
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Payment record and updated certificate
 */
async function recordPayment(certificateId, paymentData, tenantId, userId) {
  return await prisma.$transaction(async (tx) => {

    // 1. Get certificate with application
    const certificate = await tx.paymentCertificate.findFirst({
      where: {
        id: certificateId,
        tenantId
      },
      include: {
        paymentApplication: {
          select: {
            id: true,
            status: true
          }
        }
      }
    });

    if (!certificate) {
      throw new Error('Certificate not found');
    }

    // 2. Validate payment amount
    const currentOutstanding = Number(certificate.netCertified) - Number(certificate.totalPaid || 0);
    let notes = paymentData.notes || '';

    if (paymentData.paymentAmount > currentOutstanding && currentOutstanding > 0) {
      // Overpayment warning - but allow it
      const overpayment = paymentData.paymentAmount - currentOutstanding;
      notes = `${notes} [OVERPAYMENT: £${overpayment.toFixed(2)} over certificate amount]`.trim();
    }

    // 3. Create payment record
    const payment = await tx.certificatePayment.create({
      data: {
        tenantId,
        paymentCertificateId: certificateId,
        paymentDate: new Date(paymentData.paymentDate),
        paymentAmount: toDecimal(paymentData.paymentAmount),
        paymentReference: paymentData.paymentReference || null,
        paymentMethod: paymentData.paymentMethod || null,
        bankAccountId: paymentData.bankAccountId || null,
        bankTransactionRef: paymentData.bankTransactionRef || null,
        remittanceDocumentUrl: paymentData.remittanceDocumentUrl || null,
        notes,
        isPartialPayment: paymentData.paymentAmount < currentOutstanding,
        createdById: userId
      }
    });

    // 4. Update certificate totals
    const newTotalPaid = Number(certificate.totalPaid || 0) + Number(paymentData.paymentAmount);
    const newOutstanding = Number(certificate.netCertified) - newTotalPaid;

    let newPaymentStatus;
    if (newOutstanding <= 0) {
      newPaymentStatus = 'PAID';
    } else if (newTotalPaid > 0) {
      newPaymentStatus = 'PARTIAL';
    } else {
      newPaymentStatus = certificate.paymentStatus; // Keep existing
    }

    const updatedCertificate = await tx.paymentCertificate.update({
      where: { id: certificateId },
      data: {
        totalPaid: toDecimal(newTotalPaid),
        totalOutstanding: toDecimal(Math.max(0, newOutstanding)),
        lastPaymentDate: new Date(paymentData.paymentDate),
        paymentStatus: newPaymentStatus
      }
    });

    // 5. Update application status if fully paid
    let applicationUpdated = false;
    if (newPaymentStatus === 'PAID' && certificate.paymentApplicationId) {
      await tx.applicationForPayment.update({
        where: { id: certificate.paymentApplicationId },
        data: {
          status: 'PAID',
          paidAt: new Date()
        }
      });

      // Add to status history
      await tx.paymentApplicationStatusHistory.create({
        data: {
          tenantId,
          paymentApplicationId: certificate.paymentApplicationId,
          fromStatus: certificate.paymentApplication?.status || 'CERTIFIED',
          toStatus: 'PAID',
          changedById: userId,
          notes: `Payment received - £${Number(paymentData.paymentAmount).toLocaleString()}`,
          metadata: {
            paymentId: payment.id,
            paymentReference: paymentData.paymentReference || null
          }
        }
      });

      applicationUpdated = true;
    }

    return {
      payment,
      certificate: updatedCertificate,
      applicationUpdated
    };
  });
}

/**
 * Delete a payment and recalculate certificate status
 *
 * @param {string} paymentId - Payment ID
 * @param {string} tenantId - Tenant ID
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Success status
 */
async function deletePayment(paymentId, tenantId, userId) {
  return await prisma.$transaction(async (tx) => {

    // 1. Get payment and certificate
    const payment = await tx.certificatePayment.findFirst({
      where: {
        id: paymentId,
        tenantId
      },
      include: {
        paymentCertificate: {
          include: {
            paymentApplication: {
              select: {
                id: true,
                status: true
              }
            }
          }
        }
      }
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    const wasFullyPaid = payment.paymentCertificate.paymentStatus === 'PAID';

    // 2. Delete payment
    await tx.certificatePayment.delete({
      where: { id: paymentId }
    });

    // 3. Recalculate certificate totals
    const remainingPayments = await tx.certificatePayment.findMany({
      where: {
        paymentCertificateId: payment.paymentCertificateId,
        tenantId
      },
      orderBy: {
        paymentDate: 'desc'
      }
    });

    const newTotalPaid = remainingPayments.reduce(
      (sum, p) => sum + Number(p.paymentAmount), 0
    );
    const newOutstanding = Number(payment.paymentCertificate.netCertified) - newTotalPaid;

    // Determine new payment status
    let newPaymentStatus;
    const today = new Date();
    const dueDate = new Date(payment.paymentCertificate.paymentDueDate);

    if (newTotalPaid === 0) {
      newPaymentStatus = today > dueDate ? 'OVERDUE' : 'AWAITING';
    } else if (newOutstanding > 0) {
      newPaymentStatus = 'PARTIAL';
    } else {
      newPaymentStatus = 'PAID';
    }

    await tx.paymentCertificate.update({
      where: { id: payment.paymentCertificateId },
      data: {
        totalPaid: toDecimal(newTotalPaid),
        totalOutstanding: toDecimal(newOutstanding),
        lastPaymentDate: remainingPayments.length > 0
          ? remainingPayments[0].paymentDate
          : null,
        paymentStatus: newPaymentStatus
      }
    });

    // 4. Update application status if was PAID
    if (wasFullyPaid && payment.paymentCertificate.paymentApplicationId) {
      await tx.applicationForPayment.update({
        where: { id: payment.paymentCertificate.paymentApplicationId },
        data: {
          status: 'CERTIFIED',
          paidAt: null
        }
      });

      // Add to status history
      await tx.paymentApplicationStatusHistory.create({
        data: {
          tenantId,
          paymentApplicationId: payment.paymentCertificate.paymentApplicationId,
          fromStatus: 'PAID',
          toStatus: 'CERTIFIED',
          changedById: userId,
          notes: `Payment record deleted - £${Number(payment.paymentAmount).toLocaleString()}`,
          metadata: {
            deletedPaymentId: paymentId,
            paymentReference: payment.paymentReference || null
          }
        }
      });
    }

    return {
      success: true,
      certificateId: payment.paymentCertificateId,
      newStatus: newPaymentStatus
    };
  });
}

/**
 * Update a payment record
 *
 * @param {string} paymentId - Payment ID
 * @param {Object} updateData - Updated payment details
 * @param {string} tenantId - Tenant ID
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Updated payment
 */
async function updatePayment(paymentId, updateData, tenantId, userId) {
  return await prisma.$transaction(async (tx) => {

    const existing = await tx.certificatePayment.findFirst({
      where: {
        id: paymentId,
        tenantId
      },
      select: {
        id: true,
        paymentAmount: true,
        paymentCertificateId: true
      }
    });

    if (!existing) {
      throw new Error('Payment not found');
    }

    // Check if amount is changing
    const amountChanging = updateData.paymentAmount !== undefined &&
                           Number(updateData.paymentAmount) !== Number(existing.paymentAmount);

    // Update payment
    const updated = await tx.certificatePayment.update({
      where: { id: paymentId },
      data: {
        paymentDate: updateData.paymentDate ? new Date(updateData.paymentDate) : undefined,
        paymentAmount: updateData.paymentAmount ? toDecimal(updateData.paymentAmount) : undefined,
        paymentReference: updateData.paymentReference !== undefined ? updateData.paymentReference : undefined,
        paymentMethod: updateData.paymentMethod !== undefined ? updateData.paymentMethod : undefined,
        bankAccountId: updateData.bankAccountId !== undefined ? updateData.bankAccountId : undefined,
        bankTransactionRef: updateData.bankTransactionRef !== undefined ? updateData.bankTransactionRef : undefined,
        remittanceDocumentUrl: updateData.remittanceDocumentUrl !== undefined ? updateData.remittanceDocumentUrl : undefined,
        notes: updateData.notes !== undefined ? updateData.notes : undefined
      }
    });

    // If amount changed, recalculate certificate totals
    if (amountChanging) {
      const certificate = await tx.paymentCertificate.findUnique({
        where: { id: existing.paymentCertificateId }
      });

      const allPayments = await tx.certificatePayment.findMany({
        where: {
          paymentCertificateId: existing.paymentCertificateId,
          tenantId
        }
      });

      const newTotalPaid = allPayments.reduce(
        (sum, p) => sum + Number(p.paymentAmount), 0
      );
      const newOutstanding = Number(certificate.netCertified) - newTotalPaid;

      let newPaymentStatus;
      if (newOutstanding <= 0) {
        newPaymentStatus = 'PAID';
      } else if (newTotalPaid > 0) {
        newPaymentStatus = 'PARTIAL';
      } else {
        const today = new Date();
        const dueDate = new Date(certificate.paymentDueDate);
        newPaymentStatus = today > dueDate ? 'OVERDUE' : 'AWAITING';
      }

      await tx.paymentCertificate.update({
        where: { id: existing.paymentCertificateId },
        data: {
          totalPaid: toDecimal(newTotalPaid),
          totalOutstanding: toDecimal(newOutstanding),
          paymentStatus: newPaymentStatus
        }
      });
    }

    return updated;
  });
}

/**
 * Allocate a single payment across multiple certificates
 *
 * @param {Object} allocationData - Payment and allocation details
 * @param {string} tenantId - Tenant ID
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Created payments
 */
async function allocatePayment(allocationData, tenantId, userId) {
  const { paymentDate, totalAmount, paymentReference, paymentMethod, allocations, notes } = allocationData;

  if (!allocations || allocations.length === 0) {
    throw new Error('At least one allocation is required');
  }

  // Validate total matches allocations
  const allocatedTotal = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
  if (Math.abs(allocatedTotal - Number(totalAmount)) > 0.01) {
    throw new Error(`Allocated total (£${allocatedTotal}) does not match payment amount (£${totalAmount})`);
  }

  return await prisma.$transaction(async (tx) => {
    const payments = [];

    for (const allocation of allocations) {
      // Record payment for each certificate
      const result = await recordPayment(
        allocation.certificateId,
        {
          paymentDate,
          paymentAmount: allocation.amount,
          paymentReference: `${paymentReference} (Split)`,
          paymentMethod,
          notes: `${notes || ''} [Part of split payment totaling £${Number(totalAmount).toLocaleString()}]`.trim()
        },
        tenantId,
        userId
      );

      payments.push(result.payment);
    }

    return {
      payments,
      totalAmount,
      certificatesUpdated: allocations.length
    };
  });
}

/**
 * Get outstanding payments summary for a project
 *
 * @param {number} projectId - Project ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Summary and outstanding certificates
 */
async function getOutstandingPayments(projectId, tenantId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const certificates = await prisma.paymentCertificate.findMany({
    where: {
      projectId,
      tenantId,
      paymentStatus: {
        in: ['AWAITING', 'OVERDUE', 'PARTIAL']
      }
    },
    select: {
      id: true,
      certificateNumber: true,
      certificateDate: true,
      netCertified: true,
      totalPaid: true,
      totalOutstanding: true,
      paymentDueDate: true,
      paymentStatus: true
    },
    orderBy: {
      certificateNumber: 'asc'
    }
  });

  let totalOutstanding = 0;
  let totalOverdue = 0;
  let certificatesAwaiting = 0;
  let certificatesOverdue = 0;

  const outstanding = certificates.map(cert => {
    const dueDate = new Date(cert.paymentDueDate);
    const diffDays = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));
    const outstandingAmount = Number(cert.totalOutstanding || 0);

    totalOutstanding += outstandingAmount;

    if (cert.paymentStatus === 'OVERDUE' || diffDays < 0) {
      totalOverdue += outstandingAmount;
      certificatesOverdue++;
    } else {
      certificatesAwaiting++;
    }

    return {
      certificateId: cert.id,
      certificateNumber: cert.certificateNumber,
      certificateDate: cert.certificateDate,
      netCertified: Number(cert.netCertified),
      totalPaid: Number(cert.totalPaid || 0),
      outstanding: outstandingAmount,
      dueDate: cert.paymentDueDate,
      daysUntilDue: diffDays > 0 ? diffDays : 0,
      daysOverdue: diffDays < 0 ? Math.abs(diffDays) : 0,
      status: cert.paymentStatus
    };
  });

  return {
    summary: {
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      totalOverdue: Math.round(totalOverdue * 100) / 100,
      certificatesAwaiting,
      certificatesOverdue
    },
    outstanding
  };
}

module.exports = {
  recordPayment,
  deletePayment,
  updatePayment,
  allocatePayment,
  getOutstandingPayments
};
