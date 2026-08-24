/**
 * CVR Actuals Service - Phase A
 *
 * Connects Payment Applications to CVR Actuals
 * When PAs are certified, they should update the CVR "Actual" costs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function isSchemaDrift(error) {
  return error?.code === 'P2021' || error?.code === 'P2022';
}

async function findCertifiedPaymentApplications(tenantId, projectId, endDate, includeLineItems = true) {
  const baseQuery = {
    where: {
      tenantId,
      projectId,
      status: { in: ['CERTIFIED', 'PAID', 'PART_PAID'] },
      OR: [
        { applicationDate: { lte: endDate } },
        { certifiedDate: { lte: endDate } },
      ],
    },
    select: {
      id: true,
      certifiedGrossValue: true,
      certifiedNetValue: true,
      claimedGrossValue: true,
    },
  };

  const query = includeLineItems
    ? {
        ...baseQuery,
        select: {
          ...baseQuery.select,
          lineItemDetails: {
            select: {
              budgetLineId: true,
              valueCumulative: true,
              qsCertifiedValue: true,
            },
          },
        },
      }
    : baseQuery;

  try {
    return await prisma.applicationForPayment.findMany(query);
  } catch (error) {
    if (includeLineItems && isSchemaDrift(error)) {
      console.warn('[CVR Actuals] PA line-item allocation unavailable; falling back to PA totals', error.meta || error.message);
      return prisma.applicationForPayment.findMany(baseQuery);
    }
    if (isSchemaDrift(error)) {
      console.warn('[CVR Actuals] Payment applications unavailable for local schema', error.meta || error.message);
      return [];
    }
    throw error;
  }
}

/**
 * Calculate actuals from both Invoices AND certified Payment Applications
 *
 * @param {string} tenantId
 * @param {number} projectId
 * @param {Date} endDate - Calculate actuals up to this date
 * @returns {Promise<Map<number, number>>} Map of budgetLineId → actual amount
 */
async function calculateActuals(tenantId, projectId, endDate) {
  const actuals = new Map();

  // 1. Get invoices (existing logic)
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      projectId,
      status: { notIn: ['CANCELLED', 'VOID'] },
      OR: [
        { issueDate: { lte: endDate } },
        { createdAt: { lte: endDate } },
      ],
    },
    select: {
      gross: true,
      net: true,
      vat: true,
      budgetLineId: true,
    },
  });

  // Aggregate invoices by budget line
  for (const inv of invoices) {
    if (!inv.budgetLineId) continue;

    const gross = inv.gross != null ? Number(inv.gross) : undefined;
    const amount = gross != null ? gross : Number(inv.net || 0) + Number(inv.vat || 0);

    const current = actuals.get(inv.budgetLineId) || 0;
    actuals.set(inv.budgetLineId, current + amount);
  }

  // 2. Get certified Payment Applications (NEW - the critical fix!)
  const certifiedPAs = await findCertifiedPaymentApplications(tenantId, projectId, endDate);

  // Aggregate certified PAs by budget line
  for (const pa of certifiedPAs) {
    // If PA has line items with budget line links, use those
    if (pa.lineItemDetails && pa.lineItemDetails.length > 0) {
      for (const lineItem of pa.lineItemDetails) {
        if (!lineItem.budgetLineId) continue;

        // Use QS certified value if available, else cumulative value
        const amount = Number(lineItem.qsCertifiedValue || lineItem.valueCumulative || 0);

        const current = actuals.get(lineItem.budgetLineId) || 0;
        actuals.set(lineItem.budgetLineId, current + amount);
      }
    } else {
      // Fallback: if no line items, we can't allocate to budget lines
      // This PA won't contribute to CVR actuals
      console.warn(`[CVR Actuals] PA ${pa.id} has no line items with budget line links`);
    }
  }

  return actuals;
}

/**
 * Calculate actuals grouped by package
 *
 * @param {string} tenantId
 * @param {number} projectId
 * @param {Date} endDate
 * @returns {Promise<Map<number|null, number>>} Map of packageId → actual amount
 */
async function calculateActualsByPackage(tenantId, projectId, endDate) {
  const actualsMap = await calculateActuals(tenantId, projectId, endDate);
  const packageMap = new Map();

  // Get budget lines to map budgetLineId → packageId
  const budgetLines = await prisma.budgetLine.findMany({
    where: { tenantId, projectId },
    select: { id: true },
  });

  const budgetToPackage = new Map();
  for (const bl of budgetLines) {
    budgetToPackage.set(bl.id, bl.packageId ?? null);
  }

  // Aggregate actuals by package
  for (const [budgetLineId, amount] of actualsMap.entries()) {
    const packageId = budgetToPackage.get(budgetLineId) || null;
    const current = packageMap.get(packageId) || 0;
    packageMap.set(packageId, current + amount);
  }

  return packageMap;
}

/**
 * Update CVR Snapshot with latest actuals
 * Call this after a PA is certified to refresh the CVR
 *
 * @param {string} tenantId
 * @param {number} projectId
 * @param {string} period - YYYY-MM format
 */
async function updateCVRActuals(tenantId, projectId, period) {
  // Find the CVR snapshot for this period
  const snapshot = await prisma.cVRSnapshot.findFirst({
    where: { tenantId, projectId, period },
  });

  if (!snapshot) {
    console.log(`[CVR Actuals] No snapshot found for ${period}, skipping update`);
    return;
  }

  // Calculate actuals up to period end
  const periodEndDate = new Date(period + '-01');
  periodEndDate.setMonth(periodEndDate.getMonth() + 1);
  periodEndDate.setDate(0); // Last day of the month

  const actualsMap = await calculateActuals(tenantId, projectId, periodEndDate);

  // Update each CVR line with new actuals
  const lines = await prisma.cVRSnapshotLine.findMany({
    where: { tenantId, snapshotId: snapshot.id },
    select: { id: true, budgetLineId: true },
  });

  for (const line of lines) {
    if (!line.budgetLineId) continue;

    const actualAmount = actualsMap.get(line.budgetLineId) || 0;

    await prisma.cVRSnapshotLine.update({
      where: { id: line.id },
      data: { actualToDate: actualAmount },
    });
  }

  console.log(`[CVR Actuals] Updated ${lines.length} CVR lines for period ${period}`);
}

/**
 * Trigger CVR update when a PA status changes
 * Call this from PA workflow hooks
 *
 * @param {number} paymentApplicationId
 */
async function onPaymentApplicationStatusChange(paymentApplicationId) {
  const pa = await prisma.applicationForPayment.findUnique({
    where: { id: paymentApplicationId },
    select: {
      tenantId: true,
      projectId: true,
      status: true,
      applicationDate: true,
      certifiedDate: true,
    },
  });

  if (!pa) return;

  // Only trigger on certification/payment
  const triggerStatuses = ['CERTIFIED', 'PAID', 'PART_PAID'];
  if (!triggerStatuses.includes(pa.status)) {
    return;
  }

  // Determine which period to update
  const date = pa.certifiedDate || pa.applicationDate;
  if (!date) return;

  const period = date.toISOString().slice(0, 7); // YYYY-MM

  // Update the CVR for this period
  await updateCVRActuals(pa.tenantId, pa.projectId, period);

  console.log(`[CVR Actuals] Triggered update for PA ${paymentApplicationId} in period ${period}`);
}

/**
 * Get actual costs breakdown for reporting
 *
 * @param {string} tenantId
 * @param {number} projectId
 * @param {Date} asOfDate
 * @returns {Promise<Object>} Breakdown of actuals by source
 */
async function getActualsBreakdown(tenantId, projectId, asOfDate) {
  const endDate = asOfDate || new Date();

  // Calculate from invoices
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      projectId,
      status: { notIn: ['CANCELLED', 'VOID'] },
      OR: [
        { issueDate: { lte: endDate } },
        { createdAt: { lte: endDate } },
      ],
    },
    select: { gross: true, net: true, vat: true },
  });

  const fromInvoices = invoices.reduce((sum, inv) => {
    const gross = inv.gross != null ? Number(inv.gross) : undefined;
    const amount = gross != null ? gross : Number(inv.net || 0) + Number(inv.vat || 0);
    return sum + amount;
  }, 0);

  // Calculate from certified PAs
  const certifiedPAs = await findCertifiedPaymentApplications(tenantId, projectId, endDate);

  const fromPaymentApps = certifiedPAs.reduce((sum, pa) => {
    if (pa.lineItemDetails && pa.lineItemDetails.length > 0) {
      return sum + pa.lineItemDetails.reduce((itemSum, item) => {
        return itemSum + Number(item.qsCertifiedValue || item.valueCumulative || 0);
      }, 0);
    }
    return sum + Number(pa.certifiedGrossValue || pa.certifiedNetValue || 0);
  }, 0);

  return {
    total: fromInvoices + fromPaymentApps,
    fromInvoices,
    fromPaymentApplications: fromPaymentApps,
    invoiceCount: invoices.length,
    paymentApplicationCount: certifiedPAs.length,
  };
}

module.exports = {
  calculateActuals,
  calculateActualsByPackage,
  updateCVRActuals,
  onPaymentApplicationStatusChange,
  getActualsBreakdown,
};
