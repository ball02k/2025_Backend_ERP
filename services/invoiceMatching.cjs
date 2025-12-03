/**
 * Invoice to PO Matching Service
 *
 * Intelligent matching of invoices to purchase orders using:
 * 1. Direct PO reference matching
 * 2. Fuzzy matching on supplier, amount, date, description
 * 3. Confidence scoring (0-1 scale)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Match an invoice to potential POs
 * @param {Number} invoiceId - Invoice ID to match
 * @param {String} tenantId - Tenant ID
 * @returns {Object} - Match results with confidence scores
 */
async function matchInvoiceToPO(invoiceId, tenantId) {
  // Get invoice details
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      supplier: true,
      project: true,
    },
  });

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  console.log(`[Matching] Processing invoice ${invoice.number} (${invoiceId})`);

  // Step 1: Direct PO reference match
  if (invoice.poNumberRef) {
    console.log(`[Matching] Found PO reference: ${invoice.poNumberRef}`);
    const directMatch = await findPOByReference(invoice.poNumberRef, tenantId);
    if (directMatch) {
      const confidence = calculateDirectMatchConfidence(invoice, directMatch);
      console.log(`[Matching] Direct match found with confidence: ${(confidence * 100).toFixed(1)}%`);
      return {
        matched: true,
        matchType: 'DIRECT',
        matches: [{
          po: directMatch,
          confidence,
          reasons: ['PO reference exact match', `Confidence: ${(confidence * 100).toFixed(1)}%`],
        }],
      };
    }
  }

  // Step 2: Fuzzy matching
  console.log('[Matching] No direct match, performing fuzzy matching...');
  const fuzzyMatches = await findFuzzyMatches(invoice, tenantId);

  if (fuzzyMatches.length === 0) {
    console.log('[Matching] No matches found');
    return {
      matched: false,
      matchType: 'NONE',
      matches: [],
    };
  }

  // Sort by confidence
  fuzzyMatches.sort((a, b) => b.confidence - a.confidence);
  const bestMatch = fuzzyMatches[0];

  console.log(`[Matching] Best fuzzy match: PO ${bestMatch.po.code} with confidence ${(bestMatch.confidence * 100).toFixed(1)}%`);

  // Determine match type based on confidence
  let matchType = 'NONE';
  if (bestMatch.confidence >= 0.9) {
    matchType = 'AUTO';
  } else if (bestMatch.confidence >= 0.6) {
    matchType = 'REVIEW';
  }

  return {
    matched: matchType !== 'NONE',
    matchType,
    matches: fuzzyMatches,
    suggestedMatch: matchType === 'AUTO' ? bestMatch.po : null,
  };
}

/**
 * Find PO by reference code
 */
async function findPOByReference(poRef, tenantId) {
  // Try exact match
  let po = await prisma.purchaseOrder.findFirst({
    where: {
      tenantId,
      code: poRef,
      status: { in: ['APPROVED', 'ISSUED', 'SENT'] },
    },
    include: {
      lines: true,
    },
  });

  if (po) return po;

  // Try partial match (case insensitive)
  po = await prisma.purchaseOrder.findFirst({
    where: {
      tenantId,
      code: { contains: poRef, mode: 'insensitive' },
      status: { in: ['APPROVED', 'ISSUED', 'SENT'] },
    },
    include: {
      lines: true,
    },
  });

  return po;
}

/**
 * Calculate confidence for direct PO reference match
 */
function calculateDirectMatchConfidence(invoice, po) {
  let confidence = 0.7; // Base confidence for having a PO reference

  // Check supplier match
  if (invoice.supplierId === po.supplierId) {
    confidence += 0.15;
  }

  // Check amount match (within 5%)
  const amountDiff = Math.abs(Number(invoice.gross) - Number(po.total));
  const amountPercent = amountDiff / Number(po.total);
  if (amountPercent <= 0.05) {
    confidence += 0.15;
  } else if (amountPercent <= 0.10) {
    confidence += 0.08;
  }

  return Math.min(confidence, 1.0);
}

/**
 * Find fuzzy matches based on supplier, amount, date, description
 */
async function findFuzzyMatches(invoice, tenantId) {
  // Get all potential POs for this project/supplier
  const potentialPOs = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      projectId: invoice.projectId,
      status: { in: ['APPROVED', 'ISSUED', 'SENT'] },
      // Optionally filter by supplier if known
      ...(invoice.supplierId && { supplierId: invoice.supplierId }),
    },
    include: {
      lines: true,
    },
  });

  console.log(`[Matching] Found ${potentialPOs.length} potential POs to check`);

  const matches = [];

  for (const po of potentialPOs) {
    const score = calculateFuzzyMatchScore(invoice, po);
    if (score.confidence >= 0.3) { // Only include matches with at least 30% confidence
      matches.push({
        po,
        confidence: score.confidence,
        reasons: score.reasons,
      });
    }
  }

  return matches;
}

/**
 * Calculate fuzzy match score
 * Scoring breakdown:
 * - Supplier match: 40%
 * - Amount match: 30%
 * - Date proximity: 15%
 * - Description keywords: 15%
 */
function calculateFuzzyMatchScore(invoice, po) {
  let score = 0;
  const reasons = [];

  // 1. Supplier match (40%)
  if (invoice.supplierId && invoice.supplierId === po.supplierId) {
    score += 0.4;
    reasons.push('Supplier matches');
  } else if (invoice.supplierId && invoice.supplierId !== po.supplierId) {
    // Different supplier - major penalty
    score -= 0.2;
    reasons.push('Supplier mismatch');
  }

  // 2. Amount match (30%)
  const invoiceAmount = Number(invoice.gross || invoice.net || 0);
  const poAmount = Number(po.total);

  if (invoiceAmount > 0 && poAmount > 0) {
    const amountDiff = Math.abs(invoiceAmount - poAmount);
    const amountPercent = amountDiff / poAmount;

    if (amountPercent <= 0.05) { // Within 5%
      score += 0.30;
      reasons.push(`Amount within 5% (£${invoiceAmount.toFixed(2)} vs £${poAmount.toFixed(2)})`);
    } else if (amountPercent <= 0.10) { // Within 10%
      score += 0.20;
      reasons.push(`Amount within 10% (£${invoiceAmount.toFixed(2)} vs £${poAmount.toFixed(2)})`);
    } else if (amountPercent <= 0.20) { // Within 20%
      score += 0.10;
      reasons.push(`Amount within 20% (£${invoiceAmount.toFixed(2)} vs £${poAmount.toFixed(2)})`);
    } else {
      reasons.push(`Amount differs by ${(amountPercent * 100).toFixed(1)}%`);
    }
  }

  // 3. Date proximity (15%)
  if (invoice.issueDate && po.orderDate) {
    const daysDiff = Math.abs(
      (new Date(invoice.issueDate) - new Date(po.orderDate)) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff <= 30) { // Within 30 days
      score += 0.15;
      reasons.push(`Invoice within 30 days of PO (${Math.floor(daysDiff)} days)`);
    } else if (daysDiff <= 60) { // Within 60 days
      score += 0.10;
      reasons.push(`Invoice within 60 days of PO (${Math.floor(daysDiff)} days)`);
    } else if (daysDiff <= 90) { // Within 90 days
      score += 0.05;
      reasons.push(`Invoice within 90 days of PO (${Math.floor(daysDiff)} days)`);
    }
  }

  // 4. Description keyword matching (15%)
  const descScore = matchDescriptions(invoice, po);
  score += descScore.score;
  if (descScore.keywords.length > 0) {
    reasons.push(`Matching keywords: ${descScore.keywords.join(', ')}`);
  }

  return {
    confidence: Math.max(0, Math.min(1, score)), // Clamp between 0 and 1
    reasons,
  };
}

/**
 * Match descriptions using keyword extraction
 */
function matchDescriptions(invoice, po) {
  const invoiceText = `${invoice.number || ''} ${invoice.ocrRawText || ''}`.toLowerCase();
  const poLines = (po.lines || []).map(line => line.item.toLowerCase());
  const poText = poLines.join(' ');

  // Extract potential keywords (words > 4 characters, excluding common words)
  const commonWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'been', 'were', 'said']);

  const extractKeywords = (text) => {
    return text
      .split(/\W+/)
      .filter(word => word.length > 4 && !commonWords.has(word))
      .slice(0, 20); // Limit to top 20 words
  };

  const invoiceKeywords = extractKeywords(invoiceText);
  const poKeywords = extractKeywords(poText);

  // Find matching keywords
  const matches = invoiceKeywords.filter(keyword => poKeywords.includes(keyword));

  // Score based on match ratio
  const matchRatio = matches.length / Math.max(invoiceKeywords.length, 1);
  const score = Math.min(matchRatio * 0.15, 0.15);

  return {
    score,
    keywords: matches.slice(0, 3), // Return top 3 matching keywords
  };
}

/**
 * Auto-match invoice to PO (if confidence > 90%)
 */
async function autoMatchInvoice(invoiceId, poId, tenantId) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });

  if (!invoice || !po) {
    throw new Error('Invoice or PO not found');
  }

  // Update invoice with match
  return await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      matchStatus: 'FULL_MATCH',
      matchedPoId: poId,
      matchConfidence: 1.0,
      matchedBy: 'AUTO',
      matchedDate: new Date(),
    },
    include: {
      supplier: true,
      project: true,
    },
  });
}

/**
 * Manually confirm a match
 */
async function confirmMatch(invoiceId, poId, tenantId, userId) {
  return await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      matchStatus: 'FULL_MATCH',
      matchedPoId: poId,
      matchedBy: userId?.toString() || 'MANUAL',
      matchedDate: new Date(),
    },
    include: {
      supplier: true,
      project: true,
    },
  });
}

module.exports = {
  matchInvoiceToPO,
  autoMatchInvoice,
  confirmMatch,
};
