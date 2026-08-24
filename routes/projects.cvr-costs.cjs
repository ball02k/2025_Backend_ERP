/**
 * CVR Cost Tracking API Routes (Task 4.2)
 *
 * Enhanced cost tracking endpoints with aggregation from all sources
 */

const express = require('express');
const router = express.Router();
const {
  getAggregatedCosts,
  getCostsByPeriod,
  getBudgetVariance,
  createCVRSnapshot,
} = require('../services/cvrCostService.cjs');

/**
 * GET /projects/:projectId/cvr/costs
 *
 * Get aggregated costs for a project
 * Query params:
 * - asOfDate: Optional date to calculate costs as of (YYYY-MM-DD)
 */
router.get('/projects/:projectId/cvr/costs', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { asOfDate } = req.query;
    const tenantId = req.user?.tenantId || 'demo';

    const asOf = asOfDate ? new Date(asOfDate) : null;
    const costs = await getAggregatedCosts(tenantId, parseInt(projectId), asOf);

    res.json({
      success: true,
      data: costs,
    });
  } catch (error) {
    console.error('Error fetching CVR costs:', error);
    next(error);
  }
});

/**
 * GET /projects/:projectId/cvr/costs/period
 *
 * Get period-based cost analysis (trending)
 * Query params:
 * - months: Number of months to include (default: 12)
 */
router.get('/projects/:projectId/cvr/costs/period', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { months = 12 } = req.query;
    const tenantId = req.user?.tenantId || 'demo';

    const periods = await getCostsByPeriod(tenantId, parseInt(projectId), parseInt(months));

    res.json({
      success: true,
      data: {
        projectId: parseInt(projectId),
        months: parseInt(months),
        periods,
      },
    });
  } catch (error) {
    console.error('Error fetching period costs:', error);
    next(error);
  }
});

/**
 * GET /projects/:projectId/cvr/costs/trend
 *
 * Get cost trend analysis over time
 * Alias for /costs/period with additional trend calculations
 */
router.get('/projects/:projectId/cvr/costs/trend', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { months = 12 } = req.query;
    const tenantId = req.user?.tenantId || 'demo';

    const periods = await getCostsByPeriod(tenantId, parseInt(projectId), parseInt(months));

    // Calculate period-over-period changes
    const trendsWithChange = periods.map((period, index) => {
      if (index === 0) {
        return { ...period, costChange: 0, costChangePercentage: 0 };
      }

      const prevPeriod = periods[index - 1];
      const costChange = period.totalCost - prevPeriod.totalCost;
      const costChangePercentage =
        prevPeriod.totalCost > 0 ? (costChange / prevPeriod.totalCost) * 100 : 0;

      return {
        ...period,
        costChange,
        costChangePercentage,
      };
    });

    res.json({
      success: true,
      data: {
        projectId: parseInt(projectId),
        months: parseInt(months),
        trends: trendsWithChange,
      },
    });
  } catch (error) {
    console.error('Error fetching cost trends:', error);
    next(error);
  }
});

/**
 * GET /projects/:projectId/cvr/costs/variance
 *
 * Get budget variance analysis
 */
router.get('/projects/:projectId/cvr/costs/variance', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const tenantId = req.user?.tenantId || 'demo';

    const variance = await getBudgetVariance(tenantId, parseInt(projectId));

    res.json({
      success: true,
      data: variance,
    });
  } catch (error) {
    console.error('Error fetching budget variance:', error);
    next(error);
  }
});

/**
 * GET /projects/:projectId/cvr/costs/breakdown
 *
 * Get detailed cost breakdown by category and status
 */
router.get('/projects/:projectId/cvr/costs/breakdown', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { asOfDate } = req.query;
    const tenantId = req.user?.tenantId || 'demo';

    const asOf = asOfDate ? new Date(asOfDate) : null;
    const costs = await getAggregatedCosts(tenantId, parseInt(projectId), asOf);

    // Transform for easier consumption in UI
    const categoryBreakdown = Object.keys(costs.costsByCategory).map((category) => ({
      category,
      ...costs.costsByCategory[category],
    }));

    const statusBreakdown = Object.keys(costs.costsByStatus).map((status) => ({
      status,
      amount: costs.costsByStatus[status],
    }));

    res.json({
      success: true,
      data: {
        projectId: parseInt(projectId),
        asOfDate: costs.asOfDate,
        totalCost: costs.totalCost,
        byCategory: categoryBreakdown,
        byStatus: statusBreakdown,
        sourceCounts: costs.sourceCounts,
      },
    });
  } catch (error) {
    console.error('Error fetching cost breakdown:', error);
    next(error);
  }
});

/**
 * POST /projects/:projectId/cvr/snapshot
 *
 * Create or update a CVR snapshot for a specific period
 * Body:
 * - period: YYYY-MM
 * - snapshotType: MONTHLY | QUARTER_END | YEAR_END | AD_HOC
 */
router.post('/projects/:projectId/cvr/snapshot', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { period, snapshotType = 'MONTHLY' } = req.body;
    const tenantId = req.user?.tenantId || 'demo';

    if (!period) {
      return res.status(400).json({
        success: false,
        error: 'Period (YYYY-MM) is required',
      });
    }

    const snapshot = await createCVRSnapshot(
      tenantId,
      parseInt(projectId),
      period,
      snapshotType
    );

    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    console.error('Error creating CVR snapshot:', error);
    next(error);
  }
});

/**
 * GET /projects/:projectId/cvr/snapshots
 *
 * Get historical CVR snapshots for a project
 * Query params:
 * - limit: Number of snapshots to return (default: 12)
 * - snapshotType: Filter by type (MONTHLY, QUARTER_END, etc.)
 */
router.get('/projects/:projectId/cvr/snapshots', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { limit = 12, snapshotType } = req.query;
    const tenantId = req.user?.tenantId || 'demo';

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const snapshots = await prisma.cVRSnapshot.findMany({
      where: {
        tenantId,
        projectId: parseInt(projectId),
        ...(snapshotType && { snapshotType }),
      },
      orderBy: { snapshotDate: 'desc' },
      take: parseInt(limit),
    });

    res.json({
      success: true,
      data: {
        projectId: parseInt(projectId),
        count: snapshots.length,
        snapshots,
      },
    });
  } catch (error) {
    console.error('Error fetching CVR snapshots:', error);
    next(error);
  }
});

/**
 * GET /projects/:projectId/cvr/report/full
 *
 * Get complete CVR report combining value (Task 4.1) and enhanced costs (Task 4.2)
 */
router.get('/projects/:projectId/cvr/report/full', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { asOfDate } = req.query;
    const tenantId = req.user?.tenantId || 'demo';

    const asOf = asOfDate ? new Date(asOfDate) : null;

    // Get value data (Task 4.1)
    const { getCVRValueData } = require('../services/cvrValueService.cjs');
    const valueData = await getCVRValueData(tenantId, parseInt(projectId), asOf);

    // Get cost data (Task 4.2)
    const costs = await getAggregatedCosts(tenantId, parseInt(projectId), asOf);

    // Get variance
    const variance = await getBudgetVariance(tenantId, parseInt(projectId));

    // Get project info
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const project = await prisma.project.findUnique({
      where: { id: parseInt(projectId), tenantId },
      select: {
        id: true,
        name: true,
        code: true,
        projectRole: true,
        budget: true,
      },
    });

    // Calculate margins
    const totalValue = Number(valueData.netValue || 0);
    const totalCost = costs.totalCost;
    const grossMargin = totalValue - totalCost;
    const grossMarginPercentage = totalValue > 0 ? (grossMargin / totalValue) * 100 : 0;
    const netMargin = grossMargin - costs.costsByCategory.OVERHEAD.total;
    const netMarginPercentage = totalValue > 0 ? (netMargin / totalValue) * 100 : 0;

    res.json({
      success: true,
      data: {
        project: {
          id: project.id,
          name: project.name,
          code: project.code,
          projectRole: project.projectRole,
        },
        asOfDate: asOf || new Date(),

        // Value section
        value: {
          source: valueData.source,
          description: valueData.description,
          certified: valueData.cumulativeCertified,
          applied: valueData.cumulativeApplied,
          pending: valueData.pendingValue,
          retention: valueData.retentionHeld,
          netValue: valueData.netValue,
          totalValue,
        },

        // Cost section
        cost: {
          totalCost,
          byStatus: costs.costsByStatus,
          byCategory: costs.costsByCategory,
          breakdown: costs.breakdown,
        },

        // Margins
        margins: {
          grossMargin,
          grossMarginPercentage,
          netMargin,
          netMarginPercentage,
        },

        // Variance
        variance: {
          budget: variance.totalBudget,
          actual: variance.totalCost,
          variance: variance.variance,
          variancePercentage: variance.variancePercentage,
          status: variance.status,
        },

        // Data quality
        sourceCounts: costs.sourceCounts,
      },
    });
  } catch (error) {
    console.error('Error generating full CVR report:', error);
    next(error);
  }
});

module.exports = router;
