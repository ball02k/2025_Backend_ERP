/**
 * CVR Cost Aggregation Service (Task 4.2)
 *
 * Aggregates costs from all sources:
 * - Purchase Orders (committed + invoiced amounts)
 * - Invoices (actual invoiced costs)
 * - Subcontract valuations
 * - Direct cost entries (ProjectCost model)
 * - Timesheets (if module exists)
 *
 * Categorizes costs by:
 * - LABOUR, MATERIALS, SUBCONTRACTOR, PLANT, PRELIMINARIES, OVERHEAD, OTHER
 *
 * Tracks cost status:
 * - COMMITTED, ACCRUED, INVOICED, PAID
 */

const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Cost category mapping helpers
 */
const COST_CATEGORIES = {
  LABOUR: 'LABOUR',
  MATERIALS: 'MATERIALS',
  SUBCONTRACTOR: 'SUBCONTRACTOR',
  PLANT: 'PLANT',
  PRELIMINARIES: 'PRELIMINARIES',
  OVERHEAD: 'OVERHEAD',
  OTHER: 'OTHER',
};

const COST_STATUS = {
  COMMITTED: 'COMMITTED',
  ACCRUED: 'ACCRUED',
  INVOICED: 'INVOICED',
  PAID: 'PAID',
};

/**
 * Map allocation category codes to cost categories
 * This mapping can be customized per tenant
 */
function mapAllocationToCostCategory(categoryCode) {
  const mapping = {
    LAB: COST_CATEGORIES.LABOUR,
    LABOUR: COST_CATEGORIES.LABOUR,
    MAT: COST_CATEGORIES.MATERIALS,
    MATERIALS: COST_CATEGORIES.MATERIALS,
    SUB: COST_CATEGORIES.SUBCONTRACTOR,
    SUBS: COST_CATEGORIES.SUBCONTRACTOR,
    SUBCONTRACTOR: COST_CATEGORIES.SUBCONTRACTOR,
    PLT: COST_CATEGORIES.PLANT,
    PLANT: COST_CATEGORIES.PLANT,
    PREL: COST_CATEGORIES.PRELIMINARIES,
    PRELIM: COST_CATEGORIES.PRELIMINARIES,
    PRELIMINARIES: COST_CATEGORIES.PRELIMINARIES,
    OH: COST_CATEGORIES.OVERHEAD,
    OVERHEAD: COST_CATEGORIES.OVERHEAD,
  };

  const upperCode = (categoryCode || '').toUpperCase();
  return mapping[upperCode] || COST_CATEGORIES.OTHER;
}

/**
 * Get aggregated costs for a project across all sources
 *
 * @param {string} tenantId
 * @param {number} projectId
 * @param {Date|null} asOfDate - Optional date to calculate costs as of a specific date
 * @returns {Promise<Object>} Aggregated cost data
 */
async function getAggregatedCosts(tenantId, projectId, asOfDate = null) {
  const dateFilter = asOfDate ? { lte: asOfDate } : {};

  // Parallel fetch all cost sources
  const [
    purchaseOrders,
    invoices,
    contractValuations,
    directCosts,
    budgetLines,
  ] = await Promise.all([
    // Purchase Orders - committed costs
    prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        projectId,
        status: { notIn: ['CANCELLED', 'DRAFT'] },
        ...(asOfDate && { orderDate: dateFilter }),
      },
      select: {
        id: true,
        code: true,
        status: true,
        total: true,
        paidAmount: true,
        orderDate: true,
        budgetLineId: true,
        budgetLine: {
          select: {
            categoryId: true,
            budgetCategory: { select: { code: true } },
          },
        },
      },
    }),

    // Invoices - invoiced and paid costs
    prisma.invoice.findMany({
      where: {
        tenantId,
        projectId,
        direction: 'INBOUND', // Costs received from suppliers
        status: { notIn: ['CANCELLED', 'REJECTED'] },
        ...(asOfDate && { issueDate: dateFilter }),
      },
      select: {
        id: true,
        number: true,
        status: true,
        net: true,
        gross: true,
        paidDate: true,
        paidAmount: true,
        issueDate: true,
        budgetLineId: true,
        budgetLine: {
          select: {
            categoryId: true,
            budgetCategory: { select: { code: true } },
          },
        },
      },
    }),

    // Contract Valuations - subcontractor costs
    prisma.contractValuation.findMany({
      where: {
        tenantId,
        contract: {
          projectId,
        },
        status: { in: ['CERTIFIED', 'INVOICED', 'PAID'] },
        ...(asOfDate && { valuationDate: dateFilter }),
      },
      select: {
        id: true,
        valuationNumber: true,
        netValuation: true,
        thisValuation: true,
        status: true,
        paidDate: true,
        valuationDate: true,
        budgetLineId: true,
        budgetLine: {
          select: {
            categoryId: true,
            budgetCategory: { select: { code: true } },
          },
        },
      },
    }),

    // Direct Cost Entries (ProjectCost model)
    prisma.projectCost.findMany({
      where: {
        tenantId,
        projectId,
        approvalStatus: { notIn: ['DRAFT', 'REJECTED'] },
        ...(asOfDate && { incurredDate: dateFilter }),
      },
      select: {
        id: true,
        costCategory: true,
        costStatus: true,
        amount: true,
        totalAmount: true,
        incurredDate: true,
        paidDate: true,
        budgetLineId: true,
      },
    }),

    // Budget data for variance calculation
    prisma.budgetLine.findMany({
      where: {
        tenantId,
        projectId,
      },
      select: {
        id: true,
        total: true,
        categoryId: true,
        budgetCategory: { select: { code: true } },
      },
    }),
  ]);

  // Initialize cost breakdown by category and status
  const costsByCategory = {};
  const costsByStatus = {
    [COST_STATUS.COMMITTED]: 0,
    [COST_STATUS.ACCRUED]: 0,
    [COST_STATUS.INVOICED]: 0,
    [COST_STATUS.PAID]: 0,
  };

  Object.values(COST_CATEGORIES).forEach((cat) => {
    costsByCategory[cat] = {
      committed: 0,
      accrued: 0,
      invoiced: 0,
      paid: 0,
      total: 0,
    };
  });

  // Aggregate Purchase Orders
  purchaseOrders.forEach((po) => {
    const category = getCategoryFromBudgetLine(po.budgetLine);
    const poTotal = Number(po.total || 0);
    const paidAmount = Number(po.paidAmount || 0);

    // PO represents committed cost
    costsByCategory[category].committed += poTotal;
    costsByStatus[COST_STATUS.COMMITTED] += poTotal;

    // If partially or fully paid, track that too
    if (paidAmount > 0) {
      costsByCategory[category].paid += paidAmount;
      costsByStatus[COST_STATUS.PAID] += paidAmount;
    }
  });

  // Aggregate Invoices
  invoices.forEach((inv) => {
    const invoiceNet = Number(inv.net || 0);
    const paidAmount = Number(inv.paidAmount || 0);

    // Use invoice lines for better categorization if available
    if (inv.lines && inv.lines.length > 0) {
      inv.lines.forEach((line) => {
        const category = getCategoryFromBudgetLine(line.budgetLine);
        const lineAmount = Number(line.totalExVat || 0);

        costsByCategory[category].invoiced += lineAmount;
        costsByStatus[COST_STATUS.INVOICED] += lineAmount;
      });
    } else {
      // Fallback to invoice-level category
      const category = getCategoryFromBudgetLine(inv.budgetLine);
      costsByCategory[category].invoiced += invoiceNet;
      costsByStatus[COST_STATUS.INVOICED] += invoiceNet;
    }

    // Track paid amounts
    if (paidAmount > 0 && inv.paidDate) {
      const category = getCategoryFromBudgetLine(inv.budgetLine);
      costsByCategory[category].paid += paidAmount;
      costsByStatus[COST_STATUS.PAID] += paidAmount;
    }
  });

  // Aggregate Contract Valuations (subcontractor costs)
  contractValuations.forEach((val) => {
    const category = getCategoryFromBudgetLine(val.budgetLine) || COST_CATEGORIES.SUBCONTRACTOR;
    const netVal = Number(val.netValuation || 0);

    costsByCategory[category].invoiced += netVal;
    costsByStatus[COST_STATUS.INVOICED] += netVal;

    if (val.paidDate) {
      costsByCategory[category].paid += netVal;
      costsByStatus[COST_STATUS.PAID] += netVal;
    }
  });

  // Aggregate Direct Costs
  directCosts.forEach((cost) => {
    const category = cost.costCategory || COST_CATEGORIES.OTHER;
    const amount = Number(cost.totalAmount || cost.amount || 0);

    // Map cost status to aggregation buckets
    switch (cost.costStatus) {
      case 'COMMITTED':
        costsByCategory[category].committed += amount;
        costsByStatus[COST_STATUS.COMMITTED] += amount;
        break;
      case 'ACCRUED':
        costsByCategory[category].accrued += amount;
        costsByStatus[COST_STATUS.ACCRUED] += amount;
        break;
      case 'INVOICED':
        costsByCategory[category].invoiced += amount;
        costsByStatus[COST_STATUS.INVOICED] += amount;
        break;
      case 'PAID':
        costsByCategory[category].paid += amount;
        costsByStatus[COST_STATUS.PAID] += amount;
        break;
    }
  });

  // Calculate totals per category
  Object.keys(costsByCategory).forEach((cat) => {
    costsByCategory[cat].total =
      costsByCategory[cat].committed +
      costsByCategory[cat].accrued +
      costsByCategory[cat].invoiced +
      costsByCategory[cat].paid;
  });

  // Calculate overall totals
  const totalCommitted = costsByStatus[COST_STATUS.COMMITTED];
  const totalAccrued = costsByStatus[COST_STATUS.ACCRUED];
  const totalInvoiced = costsByStatus[COST_STATUS.INVOICED];
  const totalPaid = costsByStatus[COST_STATUS.PAID];
  const totalCost = totalCommitted + totalAccrued + totalInvoiced + totalPaid;

  // Calculate budget totals
  const totalBudget = budgetLines.reduce((sum, bl) => sum + Number(bl.total || 0), 0);

  // Source counts for data quality
  const sourceCounts = {
    poCount: purchaseOrders.length,
    invoiceCount: invoices.length,
    valuationCount: contractValuations.length,
    directCostCount: directCosts.length,
  };

  return {
    projectId,
    asOfDate: asOfDate || new Date(),
    totalBudget,
    totalCost,
    costsByStatus,
    costsByCategory,
    sourceCounts,
    breakdown: {
      labour: costsByCategory[COST_CATEGORIES.LABOUR].total,
      materials: costsByCategory[COST_CATEGORIES.MATERIALS].total,
      subcontractors: costsByCategory[COST_CATEGORIES.SUBCONTRACTOR].total,
      plant: costsByCategory[COST_CATEGORIES.PLANT].total,
      preliminaries: costsByCategory[COST_CATEGORIES.PRELIMINARIES].total,
      overheads: costsByCategory[COST_CATEGORIES.OVERHEAD].total,
      other: costsByCategory[COST_CATEGORIES.OTHER].total,
    },
  };
}

/**
 * Get category from budget line with fallback
 */
function getCategoryFromBudgetLine(budgetLine) {
  if (!budgetLine) return COST_CATEGORIES.OTHER;

  const categoryCode = budgetLine.budgetCategory?.code || budgetLine.categoryId;
  return mapAllocationToCostCategory(categoryCode);
}

/**
 * Get cost breakdown by period (for trending)
 *
 * @param {string} tenantId
 * @param {number} projectId
 * @param {number} months - Number of months to include
 * @returns {Promise<Array>} Array of monthly cost breakdowns
 */
async function getCostsByPeriod(tenantId, projectId, months = 12) {
  const periods = [];
  const today = new Date();

  for (let i = 0; i < months; i++) {
    const periodDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const periodEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);

    const costs = await getAggregatedCosts(tenantId, projectId, periodEnd);

    periods.push({
      period: periodDate.toISOString().substring(0, 7), // YYYY-MM
      periodEnd,
      ...costs,
    });
  }

  return periods.reverse(); // Oldest to newest
}

/**
 * Get budget variance analysis
 *
 * @param {string} tenantId
 * @param {number} projectId
 * @returns {Promise<Object>} Variance analysis
 */
async function getBudgetVariance(tenantId, projectId) {
  const costs = await getAggregatedCosts(tenantId, projectId);

  const variance = costs.totalBudget - costs.totalCost;
  const variancePercentage = costs.totalBudget > 0 ? (variance / costs.totalBudget) * 100 : 0;

  // Category-level variances
  const budgetLines = await prisma.budgetLine.findMany({
    where: { tenantId, projectId },
    select: {
      categoryId: true,
      total: true,
      budgetCategory: { select: { code: true } },
    },
  });

  const budgetByCategory = {};
  Object.values(COST_CATEGORIES).forEach((cat) => {
    budgetByCategory[cat] = 0;
  });

  budgetLines.forEach((bl) => {
    const category = getCategoryFromBudgetLine(bl);
    budgetByCategory[category] += Number(bl.total || 0);
  });

  const varianceByCategory = {};
  Object.keys(costs.costsByCategory).forEach((cat) => {
    const budgeted = budgetByCategory[cat];
    const actual = costs.costsByCategory[cat].total;
    varianceByCategory[cat] = {
      budgeted,
      actual,
      variance: budgeted - actual,
      variancePercentage: budgeted > 0 ? ((budgeted - actual) / budgeted) * 100 : 0,
    };
  });

  return {
    projectId,
    totalBudget: costs.totalBudget,
    totalCost: costs.totalCost,
    variance,
    variancePercentage,
    varianceByCategory,
    status: variance >= 0 ? 'UNDER_BUDGET' : 'OVER_BUDGET',
  };
}

/**
 * Create or update CVR snapshot for a period
 *
 * @param {string} tenantId
 * @param {number} projectId
 * @param {string} period - YYYY-MM
 * @param {string} snapshotType - MONTHLY, QUARTER_END, YEAR_END, AD_HOC
 * @returns {Promise<Object>} Created snapshot
 */
async function createCVRSnapshot(tenantId, projectId, period, snapshotType = 'MONTHLY') {
  // Get costs for the period
  const periodDate = new Date(period + '-01');
  const periodEnd = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0);
  const costs = await getAggregatedCosts(tenantId, projectId, periodEnd);

  // Get value data (from Task 4.1)
  const { getCVRValueData } = require('./cvrValueService.cjs');
  const valueData = await getCVRValueData(tenantId, projectId, periodEnd);

  // Get project for budget
  const project = await prisma.project.findUnique({
    where: { id: projectId, tenantId },
    select: { budget: true },
  });

  // Calculate margins
  const totalValue = Number(valueData.netValue || 0);
  const totalCost = costs.totalCost;
  const grossMargin = totalValue - totalCost;
  const grossMarginPercentage = totalValue > 0 ? (grossMargin / totalValue) * 100 : 0;
  const netMargin = grossMargin - costs.costsByCategory[COST_CATEGORIES.OVERHEAD].total;
  const netMarginPercentage = totalValue > 0 ? (netMargin / totalValue) * 100 : 0;

  const budgetVariance = Number(project.budget || 0) - totalCost;
  const budgetVariancePercentage =
    Number(project.budget || 0) > 0 ? (budgetVariance / Number(project.budget || 0)) * 100 : 0;

  // Create or update snapshot
  const snapshotData = {
    tenantId,
    projectId,
    period,
    snapshotDate: periodEnd,
    snapshotType,
    status: 'APPROVED',

    // Budget
    originalBudget: project.budget,
    currentBudget: project.budget,

    // Costs
    committedCost: costs.costsByStatus[COST_STATUS.COMMITTED],
    accruedCost: costs.costsByStatus[COST_STATUS.ACCRUED],
    invoicedCost: costs.costsByStatus[COST_STATUS.INVOICED],
    paidCost: costs.costsByStatus[COST_STATUS.PAID],
    totalCost,

    // Cost breakdown
    labourCost: costs.breakdown.labour,
    materialsCost: costs.breakdown.materials,
    subcontractorCost: costs.breakdown.subcontractors,
    plantCost: costs.breakdown.plant,
    preliminariesCost: costs.breakdown.preliminaries,
    overheadCost: costs.breakdown.overheads,
    otherCost: costs.breakdown.other,

    // Value
    certifiedValue: valueData.cumulativeCertified,
    appliedValue: valueData.cumulativeApplied,
    pendingValue: valueData.pendingValue,
    totalValue,

    // Retention
    retentionHeld: valueData.retentionHeld,

    // Margins
    grossMargin,
    grossMarginPercentage,
    netMargin,
    netMarginPercentage,

    // Variance
    budgetVariance,
    budgetVariancePercentage,

    // Source counts
    poCount: costs.sourceCounts.poCount,
    invoiceCount: costs.sourceCounts.invoiceCount,
    directCostCount: costs.sourceCounts.directCostCount,
    contractCount: costs.sourceCounts.valuationCount,
  };

  const snapshot = await prisma.cVRSnapshot.upsert({
    where: {
      tenantId_projectId_period: {
        tenantId,
        projectId,
        period,
      },
    },
    update: snapshotData,
    create: snapshotData,
  });

  return snapshot;
}

module.exports = {
  getAggregatedCosts,
  getCostsByPeriod,
  getBudgetVariance,
  createCVRSnapshot,
  COST_CATEGORIES,
  COST_STATUS,
};
