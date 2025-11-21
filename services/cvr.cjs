/**
 * CVR (Cost Value Reconciliation) Service
 *
 * Provides real-time financial tracking:
 * - Budget: What we planned to spend
 * - Committed: What we've contractually agreed to spend
 * - Actual: What we've actually spent/invoiced
 *
 * CVR Formula: Budget - Committed - Actual = Remaining Budget
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Get CVR summary for a project or specific budget line
 * Returns aggregated financial data showing budget vs committed vs actual
 */
async function getCVRSummary(tenantId, projectId, budgetLineId = null) {
  const where = {
    tenantId,
    projectId,
    ...(budgetLineId && { budgetLineId }),
  };

  // Get budget data
  const budgetLines = await prisma.budgetLine.findMany({
    where: budgetLineId ? { id: budgetLineId, tenantId } : { projectId, tenantId },
    select: {
      id: true,
      code: true,
      description: true,
      total: true,
      planned: true,
      estimated: true,
      actual: true,
    },
  });

  const totalBudget = budgetLines.reduce((sum, bl) => sum + Number(bl.total || 0), 0);

  // Get committed amounts (status: COMMITTED)
  const commitments = await prisma.cVRCommitment.findMany({
    where: { ...where, status: 'COMMITTED' },
    select: { amount: true },
  });
  const totalCommitted = commitments.reduce((sum, c) => sum + Number(c.amount), 0);

  // Get actual amounts (status: RECORDED, CERTIFIED, PAID)
  const actuals = await prisma.cVRActual.findMany({
    where: {
      ...where,
      status: { in: ['RECORDED', 'CERTIFIED', 'PAID'] },
    },
    select: { amount: true },
  });
  const totalActuals = actuals.reduce((sum, a) => sum + Number(a.amount), 0);

  // Calculate remaining and variance
  const remaining = totalBudget - totalCommitted - totalActuals;
  const variance = totalBudget - totalCommitted;
  const percentCommitted = totalBudget > 0 ? (totalCommitted / totalBudget) : 0;
  const percentActual = totalBudget > 0 ? (totalActuals / totalBudget) : 0;

  return {
    budget: totalBudget,
    committed: totalCommitted,
    actuals: totalActuals,
    remaining,
    variance,
    percentCommitted,
    percentActual,
    budgetLines: budgetLineId ? budgetLines : undefined,
  };
}

/**
 * Create a CVR commitment record
 * Call this when: Contract signed, Variation approved, PO issued
 */
async function createCommitment({
  tenantId,
  projectId,
  budgetLineId,
  sourceType, // 'CONTRACT' | 'VARIATION' | 'PURCHASE_ORDER'
  sourceId,
  amount,
  description,
  reference,
  costCode,
  effectiveDate,
  createdBy,
}) {
  return await prisma.cVRCommitment.create({
    data: {
      tenantId,
      projectId,
      budgetLineId,
      sourceType,
      sourceId,
      amount,
      currency: 'GBP',
      status: 'COMMITTED',
      description,
      reference,
      costCode,
      effectiveDate,
      createdBy,
    },
  });
}

/**
 * Update commitment status (e.g., when superseded or cancelled)
 */
async function updateCommitmentStatus(id, status, cancelledDate = null) {
  return await prisma.cVRCommitment.update({
    where: { id },
    data: {
      status,
      ...(cancelledDate && { cancelledDate }),
    },
  });
}

/**
 * Create a CVR actual record
 * Call this when: Invoice received, Payment application certified, Payment made
 */
async function createActual({
  tenantId,
  projectId,
  budgetLineId,
  sourceType, // 'INVOICE' | 'PAYMENT_APPLICATION' | 'DIRECT_COST'
  sourceId,
  amount,
  description,
  reference,
  costCode,
  incurredDate,
  certifiedDate,
  paidDate,
  createdBy,
}) {
  // Determine status based on dates
  let status = 'RECORDED';
  if (paidDate) status = 'PAID';
  else if (certifiedDate) status = 'CERTIFIED';

  return await prisma.cVRActual.create({
    data: {
      tenantId,
      projectId,
      budgetLineId,
      sourceType,
      sourceId,
      amount,
      currency: 'GBP',
      status,
      description,
      reference,
      costCode,
      incurredDate,
      certifiedDate,
      paidDate,
      createdBy,
    },
  });
}

/**
 * Update actual status (e.g., when invoice is certified or paid)
 */
async function updateActualStatus(id, status, certifiedDate = null, paidDate = null) {
  return await prisma.cVRActual.update({
    where: { id },
    data: {
      status,
      ...(certifiedDate && { certifiedDate }),
      ...(paidDate && { paidDate }),
    },
  });
}

/**
 * Get commitment breakdown by source type for a project
 */
async function getCommitmentBreakdown(tenantId, projectId) {
  const commitments = await prisma.cVRCommitment.groupBy({
    by: ['sourceType'],
    where: { tenantId, projectId, status: 'COMMITTED' },
    _sum: { amount: true },
    _count: true,
  });

  return commitments.map(c => ({
    sourceType: c.sourceType,
    total: Number(c._sum.amount || 0),
    count: c._count,
  }));
}

/**
 * Get actual breakdown by source type for a project
 */
async function getActualBreakdown(tenantId, projectId) {
  const actuals = await prisma.cVRActual.groupBy({
    by: ['sourceType'],
    where: {
      tenantId,
      projectId,
      status: { in: ['RECORDED', 'CERTIFIED', 'PAID'] },
    },
    _sum: { amount: true },
    _count: true,
  });

  return actuals.map(a => ({
    sourceType: a.sourceType,
    total: Number(a._sum.amount || 0),
    count: a._count,
  }));
}

/**
 * Get CVR data for all budget lines in a project
 * Returns array of budget lines with their committed and actual amounts
 */
async function getCVRByBudgetLine(tenantId, projectId) {
  const budgetLines = await prisma.budgetLine.findMany({
    where: { tenantId, projectId },
    select: {
      id: true,
      code: true,
      description: true,
      budgetCategory: {
        select: {
          id: true,
          code: true,
          name: true,
          color: true,
        },
      },
      total: true,
      forecastFinalCost: true,
      forecastVariance: true,
      lastForecastUpdated: true,
      costCode: { select: { code: true, description: true } },
    },
  });

  const results = await Promise.all(
    budgetLines.map(async (bl) => {
      const commitments = await prisma.cVRCommitment.aggregate({
        where: { tenantId, budgetLineId: bl.id, status: 'COMMITTED' },
        _sum: { amount: true },
      });

      const actuals = await prisma.cVRActual.aggregate({
        where: {
          tenantId,
          budgetLineId: bl.id,
          status: { in: ['RECORDED', 'CERTIFIED', 'PAID'] },
        },
        _sum: { amount: true },
      });

      const committed = Number(commitments._sum.amount || 0);
      const actual = Number(actuals._sum.amount || 0);
      const budget = Number(bl.total || 0);
      const remaining = budget - committed - actual;
      const forecastFinal = bl.forecastFinalCost ? Number(bl.forecastFinalCost) : null;
      const forecastVariance = forecastFinal !== null ? forecastFinal - budget : null;

      return {
        budgetLineId: bl.id,
        code: bl.code,
        description: bl.description,
        budgetCategory: bl.budgetCategory,
        costCode: bl.costCode?.code,
        budget,
        committed,
        actual,
        remaining,
        variance: budget - committed,
        percentCommitted: budget > 0 ? (committed / budget) : 0,
        percentActual: budget > 0 ? (actual / budget) : 0,
        // Forecast fields
        forecastFinal,
        forecastVariance,
        lastForecastUpdated: bl.lastForecastUpdated,
      };
    })
  );

  return results;
}

/**
 * Delete a commitment (e.g., when source is deleted)
 */
async function deleteCommitment(id) {
  return await prisma.cVRCommitment.delete({ where: { id } });
}

/**
 * Delete an actual (e.g., when invoice is reversed)
 */
async function deleteActual(id) {
  return await prisma.cVRActual.delete({ where: { id } });
}

// ==============================================================================
// ENHANCED CVR FUNCTIONS - Forecast, Revenue, Profit/Loss (British English)
// ==============================================================================

/**
 * Calculate forecast final cost for a budget line
 * Forecast = Committed + Anticipated additional costs/variations
 */
async function calculateForecastFinalCost(tenantId, budgetLineId) {
  const budgetLine = await prisma.budgetLine.findUnique({
    where: { id: budgetLineId },
    include: {
      cvrCommitments: { where: { status: 'COMMITTED' } },
      cvrActuals: { where: { status: { in: ['RECORDED', 'CERTIFIED', 'PAID'] } } },
    },
  });

  if (!budgetLine) {
    throw new Error(`Budget line ${budgetLineId} not found`);
  }

  // Committed (contracts + variations + POs)
  const committed = budgetLine.cvrCommitments.reduce(
    (sum, c) => sum + Number(c.amount),
    0
  );

  // Actual to date
  const actualToDate = budgetLine.cvrActuals.reduce(
    (sum, a) => sum + Number(a.amount),
    0
  );

  // Remaining work = Committed - Actual
  const remainingWork = committed - actualToDate;

  // Forecast variance (if set manually, use it; otherwise assume committed is forecast)
  const forecastVariance = Number(budgetLine.forecastVariance || 0);

  // Forecast final cost = Committed + Forecast variance
  const forecastFinal = committed + forecastVariance;

  // Budget variance
  const budget = Number(budgetLine.total || 0);
  const varianceFromBudget = budget - forecastFinal;

  return {
    budgetLineId,
    budget,
    committed,
    actualToDate,
    remainingWork,
    forecastVariance,
    forecastFinal,
    varianceFromBudget,
    percentComplete: committed > 0 ? (actualToDate / committed) * 100 : 0,
  };
}

/**
 * Calculate project revenue (from contract valuations)
 */
async function calculateProjectRevenue(tenantId, projectId) {
  // Get all certified/invoiced valuations
  const valuations = await prisma.contractValuation.findMany({
    where: {
      tenantId,
      contract: { projectId },
      status: { in: ['CERTIFIED', 'INVOICED'] },
    },
    select: {
      netValuation: true,
      grossValuation: true,
      retention: true,
      status: true,
    },
  });

  const grossRevenue = valuations.reduce(
    (sum, v) => sum + Number(v.grossValuation || 0),
    0
  );
  const totalRetention = valuations.reduce(
    (sum, v) => sum + Number(v.retention || 0),
    0
  );
  const netRevenue = valuations.reduce(
    (sum, v) => sum + Number(v.netValuation || 0),
    0
  );

  // Count by status
  const certified = valuations.filter(v => v.status === 'CERTIFIED').length;
  const invoiced = valuations.filter(v => v.status === 'INVOICED').length;

  return {
    grossRevenue,
    totalRetention,
    netRevenue,
    valuationCount: valuations.length,
    certifiedCount: certified,
    invoicedCount: invoiced,
  };
}

/**
 * Calculate project costs (from CVR actuals)
 */
async function calculateProjectCosts(tenantId, projectId) {
  const actuals = await prisma.cVRActual.findMany({
    where: {
      tenantId,
      projectId,
      status: { in: ['RECORDED', 'CERTIFIED', 'PAID'] },
    },
    select: { amount: true, status: true },
  });

  const totalCosts = actuals.reduce((sum, a) => sum + Number(a.amount), 0);
  const paidCosts = actuals
    .filter(a => a.status === 'PAID')
    .reduce((sum, a) => sum + Number(a.amount), 0);
  const certifiedCosts = actuals
    .filter(a => a.status === 'CERTIFIED')
    .reduce((sum, a) => sum + Number(a.amount), 0);

  return {
    totalCosts,
    paidCosts,
    certifiedCosts,
    recordedCosts: totalCosts - paidCosts - certifiedCosts,
    costCount: actuals.length,
  };
}

/**
 * Calculate profit/loss for a project (British English: "Profit" not "Margin")
 * Profit = Revenue - Costs
 */
async function calculateProfitLoss(tenantId, projectId) {
  const revenue = await calculateProjectRevenue(tenantId, projectId);
  const costs = await calculateProjectCosts(tenantId, projectId);

  const grossProfit = revenue.grossRevenue - costs.totalCosts;
  const netProfit = revenue.netRevenue - costs.totalCosts;
  const gpPercentage = costs.totalCosts > 0 ? (grossProfit / costs.totalCosts) * 100 : 0;

  return {
    // Revenue side
    grossRevenue: revenue.grossRevenue,
    netRevenue: revenue.netRevenue,
    retention: revenue.totalRetention,

    // Cost side
    totalCosts: costs.totalCosts,
    paidCosts: costs.paidCosts,
    certifiedCosts: costs.certifiedCosts,

    // Profit
    grossProfit,
    netProfit,
    gpPercentage,

    // Status
    isProfit: grossProfit > 0,
  };
}

/**
 * Take a period snapshot for movement tracking
 * Creates CVRSnapshot record for the project and all budget lines
 */
async function takePeriodSnapshot(tenantId, projectId, periodEnd, userId) {
  const periodLabel = periodEnd.toISOString().substring(0, 7); // YYYY-MM

  // Get CVR summary
  const cvr = await getCVRSummary(tenantId, projectId);

  // Get budget line breakdown
  const lines = await getCVRByBudgetLine(tenantId, projectId);

  // Create snapshot with data stored as JSON
  const snapshot = await prisma.cVRReport.create({
    data: {
      tenantId,
      projectId,
      reportDate: new Date(),
      periodEnd,
      reportType: 'MONTHLY',
      status: 'IN_PROGRESS',
      snapshotData: {
        periodLabel,
        summary: cvr,
        lines,
        timestamp: new Date().toISOString(),
      },
      createdBy: userId,
    },
  });

  return snapshot;
}

/**
 * Get CVR movement between two periods
 * Compares snapshots to show what changed
 */
async function getCVRMovement(tenantId, projectId, fromPeriod, toPeriod) {
  const snapshots = await prisma.cVRReport.findMany({
    where: {
      tenantId,
      projectId,
      periodEnd: {
        gte: fromPeriod,
        lte: toPeriod,
      },
      status: 'APPROVED',
    },
    orderBy: { periodEnd: 'asc' },
  });

  if (snapshots.length < 2) {
    return { error: 'Need at least 2 approved snapshots to calculate movement' };
  }

  const from = snapshots[0].snapshotData;
  const to = snapshots[snapshots.length - 1].snapshotData;

  return {
    period: {
      from: from.periodLabel,
      to: to.periodLabel,
    },
    movement: {
      committedMovement: to.summary.committed - from.summary.committed,
      actualMovement: to.summary.actuals - from.summary.actuals,
      remainingMovement: to.summary.remaining - from.summary.remaining,
    },
    fromSnapshot: from.summary,
    toSnapshot: to.summary,
  };
}

/**
 * Get CVR summary with forecast included (Enhanced)
 */
async function getCVRSummaryEnhanced(tenantId, projectId) {
  const basicCVR = await getCVRSummary(tenantId, projectId);

  // Calculate forecast by summing all budget line forecasts
  const budgetLines = await prisma.budgetLine.findMany({
    where: { tenantId, projectId },
    select: {
      id: true,
      forecastFinalCost: true,
      forecastVariance: true,
    },
  });

  const forecastFinal = budgetLines.reduce(
    (sum, bl) => sum + Number(bl.forecastFinalCost || bl.forecastVariance || 0),
    0
  );

  // Get revenue and profit
  let profitLoss = null;
  try {
    profitLoss = await calculateProfitLoss(tenantId, projectId);
  } catch (err) {
    // Revenue tracking may not be enabled yet
    profitLoss = { error: 'Revenue tracking not yet configured' };
  }

  return {
    ...basicCVR,
    forecast: {
      forecastFinal: forecastFinal || basicCVR.committed,
      forecastVariance: basicCVR.budget - (forecastFinal || basicCVR.committed),
    },
    profitLoss,
  };
}

module.exports = {
  // Basic CVR functions
  getCVRSummary,
  createCommitment,
  updateCommitmentStatus,
  createActual,
  updateActualStatus,
  getCommitmentBreakdown,
  getActualBreakdown,
  getCVRByBudgetLine,
  deleteCommitment,
  deleteActual,

  // Enhanced CVR functions (British English)
  calculateForecastFinalCost,
  calculateProjectRevenue,
  calculateProjectCosts,
  calculateProfitLoss,
  takePeriodSnapshot,
  getCVRMovement,
  getCVRSummaryEnhanced,
};
