const { prisma } = require('../utils/prisma.cjs');

/**
 * Certificate Matching Service
 * Matches subcontractor invoices to payment certificates
 * Similar to PO matching but for contract-based work
 */

/**
 * Find potential payment certificate matches for an invoice
 * @param {Object} invoice - Invoice with supplier info
 * @param {string} tenantId - Tenant ID for scoping
 * @returns {Object} { matches: Array, reason?: string }
 */
async function findCertificateMatches(invoice, tenantId) {
  const matches = [];

  // Get supplier ID from invoice
  const supplierId = invoice.supplierId;

  if (!supplierId) {
    return { matches: [], reason: 'No supplier on invoice' };
  }

  // Find payment applications for this supplier that have been certified
  // but don't yet have a matched invoice
  const potentialMatches = await prisma.applicationForPayment.findMany({
    where: {
      tenantId,
      contract: {
        supplierId: supplierId
      },
      status: {
        in: ['CERTIFIED', 'PAYMENT_NOTICE_SENT', 'APPROVED']
      },
      invoiceId: null  // Not yet matched to an invoice
    },
    include: {
      contract: {
        include: { supplier: true }
      },
      project: true
    },
    orderBy: {
      certifiedDate: 'desc'
    }
  });

  for (const app of potentialMatches) {
    const confidence = calculateMatchConfidence(invoice, app);

    if (confidence.score > 0) {
      matches.push({
        paymentApplicationId: app.id,
        applicationNumber: app.applicationNumber,
        applicationNo: app.applicationNo,
        reference: app.reference || app.applicationNo || `PA-${app.applicationNumber}`,
        projectName: app.project?.name,
        contractReference: app.contract?.contractRef,
        supplierName: app.contract?.supplier?.name,
        certifiedAmount: app.certifiedThisPeriod || app.certifiedNetValue || app.certifiedGrossValue,
        certifiedAt: app.certifiedDate || app.certifiedAt,
        confidence: confidence.score,
        matchReasons: confidence.reasons,
        warnings: confidence.warnings
      });
    }
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);

  return { matches };
}

/**
 * Calculate match confidence between invoice and payment application
 * @param {Object} invoice - Invoice object
 * @param {Object} paymentApp - Payment application object
 * @returns {Object} { score: number, reasons: string[], warnings: string[] }
 */
function calculateMatchConfidence(invoice, paymentApp) {
  let score = 0;
  const reasons = [];
  const warnings = [];

  const invoiceAmount = parseFloat(invoice.gross || invoice.net || 0);
  const certifiedAmount = parseFloat(
    paymentApp.certifiedThisPeriod ||
    paymentApp.certifiedNetValue ||
    paymentApp.certifiedGrossValue ||
    0
  );

  // 1. Exact amount match (40 points)
  if (invoiceAmount > 0 && certifiedAmount > 0) {
    const amountDiff = Math.abs(invoiceAmount - certifiedAmount);
    const tolerance = certifiedAmount * 0.02; // 2% tolerance

    if (amountDiff === 0) {
      score += 40;
      reasons.push('Exact amount match');
    } else if (amountDiff <= tolerance) {
      score += 35;
      reasons.push(`Amount within 2% (£${amountDiff.toFixed(2)} difference)`);
    } else if (amountDiff <= certifiedAmount * 0.05) {
      score += 25;
      reasons.push(`Amount within 5% (£${amountDiff.toFixed(2)} difference)`);
      warnings.push('Amount difference may need verification');
    } else if (amountDiff <= certifiedAmount * 0.10) {
      score += 10;
      warnings.push(`Amount differs by ${((amountDiff / certifiedAmount) * 100).toFixed(1)}%`);
    }
  }

  // 2. Supplier match (30 points) - already filtered, so automatic
  score += 30;
  reasons.push('Supplier matches');

  // 3. Reference match in invoice (20 points)
  const invoiceRef = (invoice.number || invoice.supplierInvoiceRef || '').toLowerCase();
  const invoiceDesc = (invoice.description || '').toLowerCase();
  const appRef = (paymentApp.applicationNo || paymentApp.reference || `PA-${paymentApp.applicationNumber}`).toLowerCase();
  const appNumber = String(paymentApp.applicationNumber || '');

  if (invoiceRef.includes(appRef) || invoiceRef.includes(appNumber)) {
    score += 20;
    reasons.push('Invoice references payment application');
  } else if (invoiceDesc.includes(appRef) || invoiceDesc.includes(appNumber)) {
    score += 15;
    reasons.push('Invoice description mentions application');
  }

  // 4. Date proximity (10 points)
  if (invoice.issueDate && (paymentApp.certifiedDate || paymentApp.certifiedAt)) {
    const invoiceDate = new Date(invoice.issueDate);
    const certDate = new Date(paymentApp.certifiedDate || paymentApp.certifiedAt);
    const daysDiff = Math.abs((invoiceDate - certDate) / (1000 * 60 * 60 * 24));

    if (daysDiff <= 7) {
      score += 10;
      reasons.push('Invoice dated within 7 days of certificate');
    } else if (daysDiff <= 14) {
      score += 7;
      reasons.push('Invoice dated within 14 days of certificate');
    } else if (daysDiff <= 30) {
      score += 3;
    } else if (daysDiff > 60) {
      warnings.push(`Invoice dated ${Math.round(daysDiff)} days from certificate`);
    }
  }

  return { score, reasons, warnings };
}

/**
 * Confirm a match between invoice and payment application
 * @param {number} invoiceId - Invoice ID
 * @param {number} paymentApplicationId - Payment application ID
 * @param {string} userId - User ID confirming the match
 * @param {string} tenantId - Tenant ID
 * @param {string|null} notes - Optional match notes
 * @returns {Promise<Object>} Updated invoice
 */
async function confirmCertificateMatch(invoiceId, paymentApplicationId, userId, tenantId, notes = null) {
  // Verify both exist and belong to tenant
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId }
  });

  const paymentApp = await prisma.applicationForPayment.findFirst({
    where: { id: paymentApplicationId, tenantId }
  });

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (!paymentApp) {
    throw new Error('Payment application not found');
  }

  // Check if payment app is in a matchable status
  if (!['CERTIFIED', 'PAYMENT_NOTICE_SENT', 'APPROVED'].includes(paymentApp.status)) {
    throw new Error(`Payment application status '${paymentApp.status}' cannot be matched to invoice`);
  }

  // Calculate match confidence for reference
  const confidence = calculateMatchConfidence(invoice, paymentApp);

  // Update both records in transaction
  const result = await prisma.$transaction([
    // Update invoice
    prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paymentApplicationId,
        matchType: 'CERTIFICATE',
        matchConfidenceNew: confidence.score,
        matchedAt: new Date(),
        matchedByUser: String(userId),
        matchNotes: notes || `Matched to ${paymentApp.applicationNo}. ${confidence.reasons.join('. ')}`,
        status: 'MATCHED'
      }
    }),
    // Update payment application
    prisma.applicationForPayment.update({
      where: { id: paymentApplicationId },
      data: {
        invoiceId,
        invoiceReceivedAt: new Date()
      }
    })
  ]);

  return result[0]; // Return updated invoice
}

/**
 * Unmatch an invoice from a payment application
 * @param {number} invoiceId - Invoice ID
 * @param {string} tenantId - Tenant ID
 * @param {string} userId - User ID performing the unmatch
 * @returns {Promise<Object>} Updated invoice
 */
async function unmatchCertificate(invoiceId, tenantId, userId) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: { paymentApplication: true }
  });

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (!invoice.paymentApplicationId) {
    throw new Error('Invoice is not matched to a certificate');
  }

  const paymentAppId = invoice.paymentApplicationId;

  // Update both records in transaction
  const result = await prisma.$transaction([
    // Clear invoice match
    prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paymentApplicationId: null,
        matchType: 'NONE',
        matchConfidenceNew: null,
        matchedAt: null,
        matchedByUser: null,
        matchNotes: `Unmatched by user ${userId} at ${new Date().toISOString()}`,
        status: 'RECEIVED'
      }
    }),
    // Clear payment application invoice link
    prisma.applicationForPayment.update({
      where: { id: paymentAppId },
      data: {
        invoiceId: null,
        invoiceReceivedAt: null
      }
    })
  ]);

  return result[0];
}

/**
 * Flag invoice as not requiring a match
 * @param {number} invoiceId - Invoice ID
 * @param {string} reason - Reason for no match
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Updated invoice
 */
async function flagNoMatchRequired(invoiceId, reason, userId, tenantId) {
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      noMatchRequired: true,
      noMatchReason: reason,
      matchType: 'NONE',
      matchedAt: new Date(),
      matchedByUser: String(userId),
      status: 'APPROVED'  // Skip matching, move to approved
    }
  });
}

/**
 * Auto-match invoices with high confidence
 * @param {string} tenantId - Tenant ID
 * @param {number} confidenceThreshold - Minimum confidence score (0-100)
 * @returns {Promise<Object>} Matching results
 */
async function autoMatchInvoices(tenantId, confidenceThreshold = 90) {
  const unmatchedInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      paymentApplicationId: null,
      noMatchRequired: false,
      status: { notIn: ['CANCELLED', 'MATCHED'] }
    },
    include: {
      supplier: true
    }
  });

  const results = {
    processed: 0,
    autoMatched: 0,
    needsReview: 0,
    noMatch: 0,
    errors: []
  };

  for (const invoice of unmatchedInvoices) {
    results.processed++;

    try {
      // Try certificate match
      const { matches } = await findCertificateMatches(invoice, tenantId);

      if (matches.length > 0 && matches[0].confidence >= confidenceThreshold) {
        // Auto-match high confidence
        await confirmCertificateMatch(
          invoice.id,
          matches[0].paymentApplicationId,
          'SYSTEM',
          tenantId,
          `Auto-matched with ${matches[0].confidence}% confidence. ${matches[0].matchReasons.join('. ')}`
        );
        results.autoMatched++;
      } else if (matches.length > 0) {
        results.needsReview++;
      } else {
        results.noMatch++;
      }
    } catch (error) {
      console.error(`Error auto-matching invoice ${invoice.id}:`, error);
      results.errors.push({
        invoiceId: invoice.id,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Get matching statistics for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Statistics
 */
async function getMatchingStats(tenantId) {
  const [
    totalInvoices,
    certificateMatched,
    poMatched,
    noMatchRequired,
    unmatched
  ] = await Promise.all([
    prisma.invoice.count({ where: { tenantId } }),
    prisma.invoice.count({ where: { tenantId, matchType: 'CERTIFICATE' } }),
    prisma.invoice.count({ where: { tenantId, matchType: 'PO' } }),
    prisma.invoice.count({ where: { tenantId, noMatchRequired: true } }),
    prisma.invoice.count({
      where: {
        tenantId,
        paymentApplicationId: null,
        matchedPoId: null,
        noMatchRequired: false,
        status: { notIn: ['CANCELLED', 'PAID'] }
      }
    })
  ]);

  return {
    totalInvoices,
    certificateMatched,
    poMatched,
    noMatchRequired,
    unmatched,
    matchRate: totalInvoices > 0
      ? ((certificateMatched + poMatched) / totalInvoices * 100).toFixed(1)
      : 0
  };
}

module.exports = {
  findCertificateMatches,
  calculateMatchConfidence,
  confirmCertificateMatch,
  unmatchCertificate,
  flagNoMatchRequired,
  autoMatchInvoices,
  getMatchingStats
};
