/**
 * CVR Snapshot Service (Task 4.3)
 *
 * Provides snapshot creation, finalization, comparison, and trend analysis
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Import CVR services from Task 4.1 and 4.2
const { getCVRValueData } = require('./cvrValueService.cjs');
const { getAggregatedCosts, getBudgetVariance } = require('./cvrCostService.cjs');

/**
 * Create a new CVR snapshot
 */
async function createCVRSnapshot({
  tenantId,
  projectId,
  periodStart,
  periodEnd,
  notes,
  costToComplete,
  forecastFinalCost,
  userId,
}) {
  // Get project details
  const project = await prisma.project.findUnique({
    where: { id: projectId, tenantId },
    select: {
      id: true,
      name: true,
      projectRole: true,
      budget: true,
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  // Get next snapshot number
  const lastSnapshot = await prisma.cVRSnapshot.findFirst({
    where: { projectId, tenantId },
    orderBy: { snapshotNumber: 'desc' },
    select: { snapshotNumber: true },
  });
  const snapshotNumber = (lastSnapshot?.snapshotNumber ?? 0) + 1;

  // Generate snapshot reference (e.g., "CVR-2024-11")
  const snapshotRef = generateSnapshotRef(periodEnd, snapshotNumber);

  // Generate period string for compatibility
  const period = `${periodEnd.getFullYear()}-${String(periodEnd.getMonth() + 1).padStart(2, '0')}`;

  // Get current CVR data as of periodEnd
  const valueData = await getCVRValueData(tenantId, projectId, periodEnd);
  const costData = await getAggregatedCosts(tenantId, projectId, periodEnd);
  const variance = await getBudgetVariance(tenantId, projectId);

  // Calculate period value (difference from previous snapshot)
  const previousSnapshot = await prisma.cVRSnapshot.findFirst({
    where: {
      projectId,
      tenantId,
      status: 'FINAL',
      periodEnd: { lt: periodEnd },
    },
    orderBy: { periodEnd: 'desc' },
  });

  const cumulativeValue = Number(valueData.netValue || 0);
  const periodValue = previousSnapshot
    ? cumulativeValue - Number(previousSnapshot.certifiedValue || 0)
    : cumulativeValue;

  // Calculate margins
  const totalValue = cumulativeValue;
  const totalCost = costData.totalCost;
  const grossMargin = totalValue - totalCost;
  const grossMarginPct = totalValue > 0 ? (grossMargin / totalValue) * 100 : 0;
  const netMargin = grossMargin - costData.breakdown.overheads;
  const netMarginPct = totalValue > 0 ? (netMargin / totalValue) * 100 : 0;

  // Calculate forecast if provided
  let forecastFinalMargin = null;
  let forecastMarginPct = null;

  if (forecastFinalCost !== undefined && costToComplete !== undefined) {
    forecastFinalMargin = totalValue - forecastFinalCost;
    forecastMarginPct = totalValue > 0 ? (forecastFinalMargin / totalValue) * 100 : 0;
  }

  // Create snapshot
  const snapshot = await prisma.cVRSnapshot.create({
    data: {
      tenantId,
      projectId,
      snapshotNumber,
      snapshotRef,
      period,
      periodStart,
      periodEnd,
      snapshotDate: new Date(),
      snapshotType: 'MONTHLY', // Default, can be overridden

      // Project context
      projectRole: project.projectRole,
      contractValue: project.budget,
      valueSource: valueData.source,
      periodValue,

      // Value
      certifiedValue: valueData.cumulativeCertified,
      appliedValue: valueData.cumulativeApplied,
      pendingValue: valueData.pendingValue,
      totalValue,
      retentionHeld: valueData.retentionHeld,

      // Costs by status
      committedCost: costData.costsByStatus.COMMITTED,
      accruedCost: costData.costsByStatus.ACCRUED,
      invoicedCost: costData.costsByStatus.INVOICED,
      paidCost: costData.costsByStatus.PAID,
      totalCost,

      // Costs by category
      labourCost: costData.breakdown.labour,
      materialsCost: costData.breakdown.materials,
      subcontractorCost: costData.breakdown.subcontractors,
      plantCost: costData.breakdown.plant,
      preliminariesCost: costData.breakdown.preliminaries,
      overheadCost: costData.breakdown.overheads,
      otherCost: costData.breakdown.other,

      // Margins
      grossMargin,
      grossMarginPercentage: grossMarginPct,
      netMargin,
      netMarginPercentage: netMarginPct,

      // Budget comparison
      originalBudget: project.budget,
      currentBudget: project.budget,
      budgetVariance: variance.variance,
      budgetVariancePercentage: variance.variancePercentage,

      // Forecast
      costToComplete: costToComplete || null,
      forecastFinalCost: forecastFinalCost || null,
      forecastFinalMargin,
      forecastMarginVariance: forecastFinalMargin ? forecastFinalMargin - grossMargin : null,

      // Source counts
      poCount: costData.sourceCounts.poCount,
      invoiceCount: costData.sourceCounts.invoiceCount,
      directCostCount: costData.sourceCounts.directCostCount,
      contractCount: costData.sourceCounts.valuationCount,

      // Metadata
      status: 'DRAFT',
      note: notes || null,
      createdBy: userId,
    },
  });

  return snapshot;
}

/**
 * Finalize a snapshot (makes it immutable)
 */
async function finalizeSnapshot(snapshotId, userId) {
  const snapshot = await prisma.cVRSnapshot.findUnique({
    where: { id: snapshotId },
  });

  if (!snapshot) {
    throw new Error('Snapshot not found');
  }

  if (snapshot.status === 'FINAL') {
    throw new Error('Snapshot is already finalized');
  }

  // Check for existing final snapshot for same period
  const existing = await prisma.cVRSnapshot.findFirst({
    where: {
      projectId: snapshot.projectId,
      tenantId: snapshot.tenantId,
      periodEnd: snapshot.periodEnd,
      status: 'FINAL',
      id: { not: snapshotId },
    },
  });

  if (existing) {
    // Mark existing as superseded
    await prisma.cVRSnapshot.update({
      where: { id: existing.id },
      data: { status: 'SUPERSEDED' },
    });
  }

  return prisma.cVRSnapshot.update({
    where: { id: snapshotId },
    data: {
      status: 'FINAL',
      finalizedAt: new Date(),
      finalizedBy: userId,
    },
  });
}

/**
 * Get snapshot history for a project
 */
async function getSnapshotHistory(tenantId, projectId, options = {}) {
  const { status, limit, includeSuperseded = false } = options;

  const where = {
    projectId,
    tenantId,
  };

  if (status) {
    where.status = status;
  } else if (!includeSuperseded) {
    where.status = { not: 'SUPERSEDED' };
  }

  return prisma.cVRSnapshot.findMany({
    where,
    orderBy: { periodEnd: 'desc' },
    take: limit,
  });
}

/**
 * Get latest finalized snapshot
 */
async function getLatestSnapshot(tenantId, projectId) {
  return prisma.cVRSnapshot.findFirst({
    where: {
      projectId,
      tenantId,
      status: 'FINAL',
    },
    orderBy: { periodEnd: 'desc' },
  });
}

/**
 * Compare two snapshots
 */
async function compareSnapshots(snapshot1Id, snapshot2Id) {
  const [snapshot1, snapshot2] = await Promise.all([
    prisma.cVRSnapshot.findUnique({ where: { id: snapshot1Id } }),
    prisma.cVRSnapshot.findUnique({ where: { id: snapshot2Id } }),
  ]);

  if (!snapshot1 || !snapshot2) {
    throw new Error('One or both snapshots not found');
  }

  // Determine which is current (later) and which is previous
  const [current, previous] =
    new Date(snapshot1.periodEnd) > new Date(snapshot2.periodEnd)
      ? [snapshot1, snapshot2]
      : [snapshot2, snapshot1];

  const valueChange = Number(current.certifiedValue || 0) - Number(previous.certifiedValue || 0);
  const costChange = Number(current.totalCost || 0) - Number(previous.totalCost || 0);
  const marginChange = Number(current.grossMargin || 0) - Number(previous.grossMargin || 0);

  const valueChangePct =
    Number(previous.certifiedValue || 0) > 0
      ? (valueChange / Number(previous.certifiedValue || 0)) * 100
      : 0;
  const costChangePct =
    Number(previous.totalCost || 0) > 0 ? (costChange / Number(previous.totalCost || 0)) * 100 : 0;
  const marginChangePct =
    Number(previous.grossMargin || 0) !== 0
      ? (marginChange / Math.abs(Number(previous.grossMargin || 0))) * 100
      : 0;

  // Determine trend
  let trendDirection = 'STABLE';
  const currentMarginPct = Number(current.grossMarginPercentage || 0);
  const previousMarginPct = Number(previous.grossMarginPercentage || 0);

  if (currentMarginPct > previousMarginPct + 1) {
    trendDirection = 'IMPROVING';
  } else if (currentMarginPct < previousMarginPct - 1) {
    trendDirection = 'DECLINING';
  }

  return {
    current,
    previous,
    changes: {
      valueChange,
      valueChangePct,
      costChange,
      costChangePct,
      marginChange,
      marginChangePct,
      trendDirection,
    },
  };
}

/**
 * Get CVR trend data over time
 */
async function getCVRTrend(tenantId, projectId, months = 12) {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);

  const snapshots = await prisma.cVRSnapshot.findMany({
    where: {
      projectId,
      tenantId,
      status: 'FINAL',
      periodEnd: { gte: cutoffDate },
    },
    orderBy: { periodEnd: 'asc' },
  });

  if (snapshots.length === 0) {
    throw new Error('No finalized snapshots found');
  }

  const firstSnapshot = snapshots[0];
  const latestSnapshot = snapshots[snapshots.length - 1];

  const totalValueGrowth =
    Number(latestSnapshot.certifiedValue || 0) - Number(firstSnapshot.certifiedValue || 0);
  const totalCostGrowth =
    Number(latestSnapshot.totalCost || 0) - Number(firstSnapshot.totalCost || 0);

  const margins = snapshots.map((s) => Number(s.grossMarginPercentage || 0));
  const averageMarginPct = margins.reduce((a, b) => a + b, 0) / margins.length;
  const lowestMarginPct = Math.min(...margins);
  const highestMarginPct = Math.max(...margins);

  // Determine overall trend
  let marginTrend = 'STABLE';
  if (snapshots.length >= 2) {
    const recentMargins = margins.slice(-3);
    const olderMargins = margins.slice(0, Math.min(3, margins.length));
    const recentAvg = recentMargins.reduce((a, b) => a + b, 0) / recentMargins.length;
    const olderAvg = olderMargins.reduce((a, b) => a + b, 0) / olderMargins.length;

    if (recentAvg > olderAvg + 1) {
      marginTrend = 'IMPROVING';
    } else if (recentAvg < olderAvg - 1) {
      marginTrend = 'DECLINING';
    }
  }

  return {
    snapshots,
    summary: {
      firstSnapshot,
      latestSnapshot,
      totalValueGrowth,
      totalCostGrowth,
      marginTrend,
      averageMarginPct,
      lowestMarginPct,
      highestMarginPct,
    },
  };
}

/**
 * Update a draft snapshot
 */
async function updateSnapshot(snapshotId, updates) {
  const snapshot = await prisma.cVRSnapshot.findUnique({
    where: { id: snapshotId },
  });

  if (!snapshot) {
    throw new Error('Snapshot not found');
  }

  if (snapshot.status === 'FINAL') {
    throw new Error('Cannot update a finalized snapshot');
  }

  // Recalculate forecast if updated
  let forecastFinalMargin = undefined;
  let forecastMarginVariance = undefined;

  if (updates.costToComplete !== undefined || updates.forecastFinalCost !== undefined) {
    const forecastFinalCost =
      updates.forecastFinalCost !== undefined
        ? updates.forecastFinalCost
        : Number(snapshot.forecastFinalCost || 0);

    if (forecastFinalCost) {
      const totalValue = Number(snapshot.totalValue || 0);
      forecastFinalMargin = totalValue - forecastFinalCost;
      forecastMarginVariance = forecastFinalMargin - Number(snapshot.grossMargin || 0);
    }
  }

  return prisma.cVRSnapshot.update({
    where: { id: snapshotId },
    data: {
      note: updates.notes,
      costToComplete: updates.costToComplete,
      forecastFinalCost: updates.forecastFinalCost,
      forecastFinalMargin,
      forecastMarginVariance,
    },
  });
}

/**
 * Delete a draft snapshot
 */
async function deleteSnapshot(snapshotId) {
  const snapshot = await prisma.cVRSnapshot.findUnique({
    where: { id: snapshotId },
  });

  if (!snapshot) {
    throw new Error('Snapshot not found');
  }

  if (snapshot.status === 'FINAL') {
    throw new Error('Cannot delete a finalized snapshot');
  }

  await prisma.cVRSnapshot.delete({
    where: { id: snapshotId },
  });
}

/**
 * Get single snapshot by ID
 */
async function getSnapshot(snapshotId) {
  return prisma.cVRSnapshot.findUnique({
    where: { id: snapshotId },
  });
}

/**
 * Generate snapshot reference
 */
function generateSnapshotRef(periodEnd, number) {
  const year = periodEnd.getFullYear();
  const month = String(periodEnd.getMonth() + 1).padStart(2, '0');
  return `CVR-${year}-${month}-${number}`;
}

module.exports = {
  createCVRSnapshot,
  finalizeSnapshot,
  getSnapshotHistory,
  getLatestSnapshot,
  compareSnapshots,
  getCVRTrend,
  updateSnapshot,
  deleteSnapshot,
  getSnapshot,
};
