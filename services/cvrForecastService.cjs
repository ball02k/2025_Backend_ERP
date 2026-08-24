/**
 * CVR Forecast Service - Phase B
 *
 * Provides forecast calculation and management for CVR:
 * - Calculate Anticipated Final Cost (forecast)
 * - Determine Forecast Status (ON_TRACK, AT_RISK, OVER_BUDGET, etc.)
 * - Update forecasts with history tracking
 * - Calculate project-level forecast summaries
 * - Cost to complete calculations
 *
 * @module services/cvrForecastService
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Calculate anticipated final cost for a budget line based on forecast method
 *
 * @param {Object} budgetLine - Budget line with all forecast fields
 * @returns {number} Anticipated final cost
 */
function calculateAnticipatedFinal(budgetLine) {
  const {
    forecastMethod = 'COMMITTED',
    forecastAdjustment = 0,
    anticipatedVariations = 0,
    riskAllowance = 0,
    forecastFinalCost = null
  } = budgetLine;
  const committed = getLineCommittedValue(budgetLine);

  switch (forecastMethod) {
    case 'COMMITTED':
      // Default: Forecast = Committed (no adjustments)
      return Number(committed);

    case 'MANUAL':
      // QS manually set the anticipated final cost
      return forecastFinalCost !== null ? Number(forecastFinalCost) : Number(committed);

    case 'COMMITTED_PLUS_ADJ':
      // Forecast = Committed + Manual Adjustment + Anticipated Variations + Risk
      return Number(committed) +
             Number(forecastAdjustment) +
             Number(anticipatedVariations) +
             Number(riskAllowance);

    case 'CALCULATED':
      // System calculated based on trends (future enhancement)
      // For now, same as COMMITTED_PLUS_ADJ
      return Number(committed) +
             Number(forecastAdjustment) +
             Number(anticipatedVariations) +
             Number(riskAllowance);

    default:
      return Number(committed);
  }
}

/**
 * Calculate cost to complete (remaining spend)
 *
 * @param {number} anticipatedFinal - Anticipated final cost
 * @param {number} actual - Actual cost to date
 * @returns {number} Cost to complete
 */
function calculateCostToComplete(anticipatedFinal, actual) {
  const remaining = Number(anticipatedFinal) - Number(actual);
  return Math.max(0, remaining); // Can't be negative
}

/**
 * Determine forecast status based on budget vs anticipated final
 *
 * @param {number} budget - Original budget amount
 * @param {number} anticipatedFinal - Forecasted final cost
 * @returns {string} ForecastStatus enum value
 */
function determineForecastStatus(budget, anticipatedFinal) {
  const budgetNum = Number(budget);
  const forecastNum = Number(anticipatedFinal);

  if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
    return forecastNum > 0 ? 'REQUIRES_REVIEW' : 'ON_TRACK';
  }

  if (forecastNum <= budgetNum) {
    // Under or on budget
    const percentUnder = ((budgetNum - forecastNum) / budgetNum) * 100;
    if (percentUnder > 10) {
      return 'UNDER_BUDGET'; // Significantly under (>10%)
    }
    return 'ON_TRACK'; // Within budget
  } else {
    // Over budget
    const percentOver = ((forecastNum - budgetNum) / budgetNum) * 100;
    if (percentOver <= 5) {
      return 'AT_RISK'; // Within 5% over
    }
    return 'OVER_BUDGET'; // More than 5% over
  }
}

function getLineBudgetValue(line) {
  return Number(
    line?.originalValue ??
    line?.currentValue ??
    line?.total ??
    line?.amount ??
    line?.planned ??
    line?.estimated ??
    0
  );
}

function getLineCommittedValue(line) {
  return Number(
    line?.committed ??
    line?.forecastFinalCost ??
    line?.estimated ??
    line?.total ??
    line?.amount ??
    0
  );
}

/**
 * Update budget line forecast with history tracking
 *
 * @param {Object} params
 * @param {string} params.tenantId - Tenant ID
 * @param {number} params.budgetLineId - Budget line ID
 * @param {Object} params.updates - Forecast field updates
 * @param {string} params.changeType - ForecastChangeType enum value
 * @param {string} params.changeReason - Reason for the change
 * @param {string} params.updatedBy - User making the update
 * @returns {Promise<Object>} Updated budget line
 */
async function updateBudgetLineForecast({
  tenantId,
  budgetLineId,
  updates,
  changeType,
  changeReason,
  updatedBy
}) {
  console.log(`[CVR Phase B] Updating forecast for budget line ${budgetLineId}`);

  // Get current budget line state
  const currentBudgetLine = await prisma.budgetLine.findUnique({
    where: { id: budgetLineId }
  });

  if (!currentBudgetLine || currentBudgetLine.tenantId !== tenantId) {
    throw new Error(`Budget line ${budgetLineId} not found for tenant ${tenantId}`);
  }

  // Calculate previous and new anticipated final costs
  const previousAnticipatedFinal = calculateAnticipatedFinal(currentBudgetLine);

  // Apply updates to create updated state
  const updatedState = { ...currentBudgetLine, ...updates };
  const newAnticipatedFinal = calculateAnticipatedFinal(updatedState);

  const changeAmount = newAnticipatedFinal - previousAnticipatedFinal;

  // Calculate new forecast status
  const newForecastStatus = determineForecastStatus(
    getLineBudgetValue(currentBudgetLine),
    newAnticipatedFinal
  );

  // Calculate cost to complete
  const costToComplete = calculateCostToComplete(
    newAnticipatedFinal,
    currentBudgetLine.actual || 0
  );

  // Filter updates to only include valid BudgetLine forecast fields
  const validForecastFields = [
    'forecastMethod',
    'forecastAdjustment',
    'forecastAdjustmentNotes',
    'anticipatedVariations',
    'riskAllowance',
    'forecastNotes'
  ];
  const filteredUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    if (validForecastFields.includes(key)) {
      filteredUpdates[key] = value;
    }
  }

  // Update budget line with new forecast data
  const updatedBudgetLine = await prisma.budgetLine.update({
    where: { id: budgetLineId },
    data: {
      ...filteredUpdates,
      forecastFinalCost: newAnticipatedFinal,
      forecastVariance: newAnticipatedFinal - getLineBudgetValue(currentBudgetLine),
      forecastStatus: newForecastStatus,
      costToComplete: costToComplete,
      forecastUpdatedBy: updatedBy,
      lastForecastUpdated: new Date()
    }
  });

  // Create history record only if there's a meaningful change
  if (Math.abs(changeAmount) >= 0.01) {
    await prisma.budgetLineForecastHistory.create({
      data: {
        tenantId,
        budgetLineId,
        previousForecast: previousAnticipatedFinal,
        newForecast: newAnticipatedFinal,
        changeAmount,
        changeReason: changeReason || null,
        changeType,
        committed: getLineCommittedValue(currentBudgetLine),
        actual: Number(currentBudgetLine.actual || 0),
        createdBy: updatedBy
      }
    });

    console.log(`[CVR Phase B] Created forecast history: ${previousAnticipatedFinal} → ${newAnticipatedFinal} (${changeAmount >= 0 ? '+' : ''}${changeAmount.toFixed(2)})`);
  }

  return updatedBudgetLine;
}

/**
 * Calculate project-level forecast summary from all budget lines
 *
 * @param {string} tenantId - Tenant ID
 * @param {number} projectId - Project ID
 * @returns {Promise<Object>} Project forecast summary
 */
async function calculateProjectForecast(tenantId, projectId) {
  console.log(`[CVR Phase B] Calculating project forecast for project ${projectId}`);

  // Get all budget lines for the project
  const budgetLines = await prisma.budgetLine.findMany({
    where: {
      tenantId,
      projectId
    }
  });

  if (budgetLines.length === 0) {
    throw new Error(`No budget lines found for project ${projectId}`);
  }

  // Calculate totals
  let totalBudget = 0;
  let totalCommitted = 0;
  let totalActual = 0;
  let totalAnticipatedFinal = 0;
  let totalRiskAllowance = 0;
  let linesOverBudget = 0;
  let linesAtRisk = 0;

  for (const line of budgetLines) {
    totalBudget += getLineBudgetValue(line);
    totalCommitted += getLineCommittedValue(line);
    totalActual += Number(line.actual || 0);
    totalRiskAllowance += Number(line.riskAllowance || 0);

    // Calculate anticipated final for this line
    const anticipatedFinal = calculateAnticipatedFinal(line);
    totalAnticipatedFinal += anticipatedFinal;

    // Count lines by status
    const status = determineForecastStatus(
      getLineBudgetValue(line),
      anticipatedFinal
    );
    if (status === 'OVER_BUDGET') linesOverBudget++;
    if (status === 'AT_RISK') linesAtRisk++;
  }

  // Calculate variances
  const budgetVariance = totalBudget - totalAnticipatedFinal;
  const commitmentVariance = totalCommitted - totalAnticipatedFinal;
  const costToComplete = Math.max(0, totalAnticipatedFinal - totalActual);

  // Calculate contingency remaining (if any contingency lines exist)
  const contingencyRemaining = totalBudget - totalAnticipatedFinal;

  // Determine overall project status
  let overallStatus = determineForecastStatus(totalBudget, totalAnticipatedFinal);

  // Override to REQUIRES_REVIEW if many lines are over/at risk
  if (linesOverBudget > 0 || linesAtRisk > budgetLines.length * 0.2) {
    overallStatus = 'REQUIRES_REVIEW';
  }

  const forecastData = {
    tenantId,
    projectId,
    totalBudget,
    totalCommitted,
    totalActual,
    totalAnticipatedFinal,
    budgetVariance,
    commitmentVariance,
    costToComplete,
    totalRiskAllowance,
    contingencyRemaining,
    overallStatus,
    lastCalculatedAt: new Date()
  };

  // Upsert project forecast record
  const projectForecast = await prisma.projectForecast.upsert({
    where: { projectId },
    create: forecastData,
    update: forecastData
  });

  console.log(`[CVR Phase B] Project forecast calculated: Budget=${totalBudget}, Anticipated=${totalAnticipatedFinal}, Variance=${budgetVariance}`);

  return projectForecast;
}

/**
 * Recalculate forecasts for all budget lines in a project
 * Useful after bulk changes or data imports
 *
 * @param {string} tenantId - Tenant ID
 * @param {number} projectId - Project ID
 * @param {string} triggeredBy - User triggering the recalculation
 * @returns {Promise<Object>} Summary of recalculation
 */
async function recalculateAllForecasts(tenantId, projectId, triggeredBy) {
  console.log(`[CVR Phase B] Recalculating all forecasts for project ${projectId}`);

  const budgetLines = await prisma.budgetLine.findMany({
    where: { tenantId, projectId }
  });

  let updatedCount = 0;
  let unchangedCount = 0;

  for (const line of budgetLines) {
    // Calculate new anticipated final
    const newAnticipatedFinal = calculateAnticipatedFinal(line);
    const previousAnticipatedFinal = Number(line.forecastFinalCost || getLineCommittedValue(line));

    // Only update if changed
    if (Math.abs(newAnticipatedFinal - previousAnticipatedFinal) >= 0.01) {
      await updateBudgetLineForecast({
        tenantId,
        budgetLineId: line.id,
        updates: {},
        changeType: 'SYSTEM_RECALCULATION',
        changeReason: 'Bulk recalculation triggered',
        updatedBy: triggeredBy
      });
      updatedCount++;
    } else {
      unchangedCount++;
    }
  }

  // Recalculate project-level forecast
  await calculateProjectForecast(tenantId, projectId);

  console.log(`[CVR Phase B] Recalculation complete: ${updatedCount} updated, ${unchangedCount} unchanged`);

  return {
    ok: true,
    totalLines: budgetLines.length,
    updatedCount,
    unchangedCount
  };
}

/**
 * Get forecast history for a budget line
 *
 * @param {string} tenantId - Tenant ID
 * @param {number} budgetLineId - Budget line ID
 * @param {number} limit - Maximum number of history records (default: 50)
 * @returns {Promise<Array>} Forecast history records
 */
async function getForecastHistory(tenantId, budgetLineId, limit = 50) {
  const history = await prisma.budgetLineForecastHistory.findMany({
    where: {
      tenantId,
      budgetLineId
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: limit
  });

  return history;
}

/**
 * Get forecast breakdown showing components (committed, adjustments, variations, risk)
 *
 * @param {string} tenantId - Tenant ID
 * @param {number} budgetLineId - Budget line ID
 * @returns {Promise<Object>} Forecast breakdown
 */
async function getForecastBreakdown(tenantId, budgetLineId) {
  const budgetLine = await prisma.budgetLine.findUnique({
    where: { id: budgetLineId }
  });

  if (!budgetLine || budgetLine.tenantId !== tenantId) {
    throw new Error(`Budget line ${budgetLineId} not found`);
  }

  const anticipatedFinal = calculateAnticipatedFinal(budgetLine);
  const costToComplete = calculateCostToComplete(anticipatedFinal, budgetLine.actual || 0);

  return {
    budgetLineId,
    originalBudget: getLineBudgetValue(budgetLine),
    committed: getLineCommittedValue(budgetLine),
    actual: Number(budgetLine.actual || 0),

    // Forecast components
    forecastMethod: budgetLine.forecastMethod,
    forecastAdjustment: Number(budgetLine.forecastAdjustment || 0),
    anticipatedVariations: Number(budgetLine.anticipatedVariations || 0),
    riskAllowance: Number(budgetLine.riskAllowance || 0),

    // Calculated values
    anticipatedFinal,
    costToComplete,
    forecastVariance: anticipatedFinal - getLineBudgetValue(budgetLine),
    forecastStatus: budgetLine.forecastStatus,

    // Metadata
    lastUpdated: budgetLine.lastForecastUpdated,
    updatedBy: budgetLine.forecastUpdatedBy,
    notes: budgetLine.forecastAdjustmentNotes
  };
}

/**
 * Trigger forecast update when contract is awarded (affects committed)
 *
 * @param {string} tenantId - Tenant ID
 * @param {number} contractId - Contract ID
 * @param {string} updatedBy - User who awarded the contract
 * @returns {Promise<Object>} Update summary
 */
async function onContractAwarded(tenantId, contractId, updatedBy) {
  console.log(`[CVR Phase B] Contract ${contractId} awarded, updating forecasts`);

  // Get contract and its budget line links
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      budgetLineLinks: {
        include: {
          budgetLine: true
        }
      }
    }
  });

  if (!contract || contract.tenantId !== tenantId) {
    console.warn(`[CVR Phase B] Contract ${contractId} not found`);
    return { ok: false, error: 'Contract not found' };
  }

  let updatedCount = 0;

  // Update forecasts for all linked budget lines
  for (const link of contract.budgetLineLinks || []) {
    try {
      await updateBudgetLineForecast({
        tenantId,
        budgetLineId: link.budgetLineId,
        updates: {}, // No direct updates, just recalculate
        changeType: 'CONTRACT_AWARDED',
        changeReason: `Contract ${contract.contractRef || contractId} awarded`,
        updatedBy
      });
      updatedCount++;
    } catch (error) {
      console.error(`[CVR Phase B] Failed to update forecast for budget line ${link.budgetLineId}:`, error);
    }
  }

  // Recalculate project-level forecast
  if (contract.projectId) {
    await calculateProjectForecast(tenantId, contract.projectId);
  }

  console.log(`[CVR Phase B] Updated ${updatedCount} budget line forecasts after contract award`);

  return {
    ok: true,
    updatedCount
  };
}

/**
 * Calculate forecast trend (comparing to previous period)
 *
 * @param {string} tenantId - Tenant ID
 * @param {number} budgetLineId - Budget line ID
 * @returns {Promise<Object>} Trend analysis
 */
async function calculateForecastTrend(tenantId, budgetLineId) {
  const history = await prisma.budgetLineForecastHistory.findMany({
    where: { tenantId, budgetLineId },
    orderBy: { createdAt: 'desc' },
    take: 2
  });

  if (history.length < 2) {
    // Not enough history, get current forecast
    const budgetLine = await prisma.budgetLine.findUnique({
      where: { id: budgetLineId }
    });

    const currentForecast = budgetLine ? calculateAnticipatedFinal(budgetLine) : 0;

    return {
      trend: 'STABLE',
      previousForecast: currentForecast,
      currentForecast,
      change: 0,
      changePercent: 0
    };
  }

  const currentForecast = Number(history[0].newForecast);
  const previousForecast = Number(history[1].newForecast);
  const change = currentForecast - previousForecast;
  const changePercent = previousForecast > 0 ? (change / previousForecast) * 100 : 0;

  // Determine trend (lower forecast = improving for costs)
  let trend;
  if (changePercent < -2) trend = 'IMPROVING';
  else if (changePercent > 2) trend = 'WORSENING';
  else trend = 'STABLE';

  return {
    trend,
    previousForecast,
    currentForecast,
    change,
    changePercent
  };
}

/**
 * Bulk update forecasts (for period-end review with manual updates)
 *
 * @param {string} tenantId - Tenant ID
 * @param {number} projectId - Project ID
 * @param {Array} updates - Array of {budgetLineId, ...forecastFields}
 * @param {string} updatedBy - User performing the update
 * @returns {Promise<Object>} Update summary
 */
async function bulkUpdateForecasts(tenantId, projectId, updates, updatedBy) {
  console.log(`[CVR Phase B] Bulk updating ${updates.length} forecast(s) for project ${projectId}`);

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for (const update of updates) {
    try {
      const { budgetLineId, ...forecastUpdates } = update;

      await updateBudgetLineForecast({
        tenantId,
        budgetLineId,
        updates: forecastUpdates,
        changeType: 'PERIOD_END_REVIEW',
        changeReason: update.changeReason || 'Bulk update',
        updatedBy
      });

      successCount++;
    } catch (error) {
      errorCount++;
      errors.push({
        budgetLineId: update.budgetLineId,
        error: error.message
      });
      console.error(`[CVR Phase B] Failed to update budget line ${update.budgetLineId}:`, error);
    }
  }

  // Recalculate project forecast after all updates
  await calculateProjectForecast(tenantId, projectId);

  console.log(`[CVR Phase B] Bulk update complete: ${successCount} successful, ${errorCount} errors`);

  return {
    ok: true,
    totalUpdates: updates.length,
    successCount,
    errorCount,
    errors: errorCount > 0 ? errors : undefined
  };
}

/**
 * Reset forecast to committed value (remove all adjustments)
 *
 * @param {string} tenantId - Tenant ID
 * @param {number} budgetLineId - Budget line ID
 * @param {string} updatedBy - User performing the reset
 * @returns {Promise<Object>} Updated budget line
 */
async function resetForecastToCommitted(tenantId, budgetLineId, updatedBy) {
  console.log(`[CVR Phase B] Resetting forecast to committed for budget line ${budgetLineId}`);

  return updateBudgetLineForecast({
    tenantId,
    budgetLineId,
    updates: {
      forecastMethod: 'COMMITTED',
      forecastAdjustment: 0,
      anticipatedVariations: 0,
      riskAllowance: 0,
      forecastAdjustmentNotes: null
    },
    changeType: 'MANUAL_ADJUSTMENT',
    changeReason: 'Reset to committed value',
    updatedBy
  });
}

/**
 * Calculate percent complete for a budget line
 *
 * @param {number} actual - Actual cost to date
 * @param {number} anticipatedFinal - Anticipated final cost
 * @returns {number} Percent complete (0-100)
 */
function calculatePercentComplete(actual, anticipatedFinal) {
  if (anticipatedFinal === 0) return 0;
  const percent = (Number(actual) / Number(anticipatedFinal)) * 100;
  return Math.min(100, Math.max(0, percent)); // Clamp between 0-100
}

/**
 * Get project forecast with category aggregation
 *
 * @param {string} tenantId - Tenant ID
 * @param {number} projectId - Project ID
 * @returns {Promise<Object>} Project forecast with category breakdown
 */
async function getProjectForecastWithCategories(tenantId, projectId) {
  const budgetLines = await prisma.budgetLine.findMany({
    where: { tenantId, projectId },
    orderBy: [{ categoryId: 'asc' }, { code: 'asc' }]
  });

  if (budgetLines.length === 0) {
    throw new Error(`No budget lines found for project ${projectId}`);
  }

  // Aggregate by category
  const byCategory = {};
  let totalBudget = 0;
  let totalCommitted = 0;
  let totalActual = 0;
  let totalAnticipatedFinal = 0;
  let totalRiskAllowance = 0;

  for (const line of budgetLines) {
    const category = line.categoryId || 'Uncategorized';
    const budget = getLineBudgetValue(line);
    const committed = getLineCommittedValue(line);
    const actual = Number(line.actual || 0);
    const anticipatedFinal = calculateAnticipatedFinal(line);

    // Initialize category if needed
    if (!byCategory[category]) {
      byCategory[category] = {
        category,
        budget: 0,
        committed: 0,
        actual: 0,
        anticipatedFinal: 0,
        variance: 0,
        percentComplete: 0,
        status: 'ON_TRACK',
        lineCount: 0
      };
    }

    // Add to category totals
    byCategory[category].budget += budget;
    byCategory[category].committed += committed;
    byCategory[category].actual += actual;
    byCategory[category].anticipatedFinal += anticipatedFinal;
    byCategory[category].lineCount++;

    // Add to project totals
    totalBudget += budget;
    totalCommitted += committed;
    totalActual += actual;
    totalAnticipatedFinal += anticipatedFinal;
    totalRiskAllowance += Number(line.riskAllowance || 0);
  }

  // Calculate category-level metrics
  Object.values(byCategory).forEach((cat) => {
    cat.variance = cat.budget - cat.anticipatedFinal;
    cat.percentComplete = calculatePercentComplete(cat.actual, cat.anticipatedFinal);
    cat.status = determineForecastStatus(cat.budget, cat.anticipatedFinal);
  });

  // Calculate overall metrics
  const budgetVariance = totalBudget - totalAnticipatedFinal;
  const percentComplete = calculatePercentComplete(totalActual, totalAnticipatedFinal);
  const overallStatus = determineForecastStatus(totalBudget, totalAnticipatedFinal);

  return {
    projectId,
    totalBudget,
    totalCommitted,
    totalActual,
    totalAnticipatedFinal,
    budgetVariance,
    percentComplete,
    costToComplete: Math.max(0, totalAnticipatedFinal - totalActual),
    totalRiskAllowance,
    overallStatus,
    byCategory
  };
}

module.exports = {
  // Core calculations
  calculateAnticipatedFinal,
  calculateCostToComplete,
  determineForecastStatus,
  calculatePercentComplete,

  // Forecast management
  updateBudgetLineForecast,
  calculateProjectForecast,
  recalculateAllForecasts,
  bulkUpdateForecasts,
  resetForecastToCommitted,

  // History and reporting
  getForecastHistory,
  getForecastBreakdown,
  calculateForecastTrend,

  // Category aggregation
  getProjectForecastWithCategories,

  // Event triggers
  onContractAwarded
};
