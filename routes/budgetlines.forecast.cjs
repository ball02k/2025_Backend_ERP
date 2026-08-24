/**
 * CVR Forecast API Routes - Phase B Part 3
 *
 * Endpoints for managing budget line and project-level forecasts
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const {
  updateBudgetLineForecast,
  calculateProjectForecast,
  recalculateAllForecasts,
  getForecastHistory,
  getForecastBreakdown,
  calculateForecastTrend,
  bulkUpdateForecasts,
  resetForecastToCommitted,
  getProjectForecastWithCategories
} = require('../services/cvrForecastService.cjs');

// ============================================================================
// Budget Line Forecast Endpoints
// ============================================================================

/**
 * GET /api/budgetlines/:id/forecast
 * Get forecast details for a budget line
 */
router.get('/budgetlines/:id/forecast', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const budgetLineId = Number(req.params.id);

    const budgetLine = await prisma.budgetLine.findUnique({
      where: { id: budgetLineId },
      select: {
        id: true,
        tenantId: true,
        code: true,
        description: true,
        total: true,
        amount: true,
        estimated: true,
        actual: true,

        // CVR Phase B: Forecast fields
        forecastMethod: true,
        forecastFinalCost: true,
        forecastVariance: true,
        forecastAdjustment: true,
        forecastAdjustmentNotes: true,
        anticipatedVariations: true,
        riskAllowance: true,
        forecastStatus: true,
        costToComplete: true,
        forecastUpdatedBy: true,
        lastForecastUpdated: true
      }
    });

    if (!budgetLine || budgetLine.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Budget line not found' });
    }

    res.json({
      ok: true,
      budgetLine
    });
  } catch (error) {
    console.error('[CVR Phase B] Error getting budget line forecast:', error);
    next(error);
  }
});

/**
 * PATCH /api/budgetlines/:id/forecast
 * Update forecast for a budget line
 *
 * Body:
 * {
 *   "forecastMethod": "COMMITTED_PLUS_ADJ",
 *   "forecastAdjustment": 5000,
 *   "forecastAdjustmentNotes": "Anticipated price increase",
 *   "anticipatedVariations": 2000,
 *   "riskAllowance": 1000,
 *   "changeReason": "Monthly forecast review"
 * }
 */
router.patch('/budgetlines/:id/forecast', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const budgetLineId = Number(req.params.id);
    const updatedBy = req.user?.email || req.user?.username || 'unknown';

    const {
      forecastMethod,
      forecastAdjustment,
      forecastAdjustmentNotes,
      anticipatedVariations,
      riskAllowance,
      changeReason
    } = req.body;

    // Build updates object (only include provided fields)
    const updates = {};
    if (forecastMethod !== undefined) updates.forecastMethod = forecastMethod;
    if (forecastAdjustment !== undefined) updates.forecastAdjustment = forecastAdjustment;
    if (forecastAdjustmentNotes !== undefined) updates.forecastAdjustmentNotes = forecastAdjustmentNotes;
    if (anticipatedVariations !== undefined) updates.anticipatedVariations = anticipatedVariations;
    if (riskAllowance !== undefined) updates.riskAllowance = riskAllowance;

    // Determine change type based on updates
    let changeType = 'MANUAL_ADJUSTMENT';
    if (anticipatedVariations !== undefined && anticipatedVariations > 0) {
      changeType = 'VARIATION_APPROVED';
    }

    const updatedBudgetLine = await updateBudgetLineForecast({
      tenantId,
      budgetLineId,
      updates,
      changeType,
      changeReason: changeReason || 'Forecast updated via API',
      updatedBy
    });

    console.log(`[CVR Phase B] Forecast updated for budget line ${budgetLineId} by ${updatedBy}`);

    res.json({
      ok: true,
      budgetLine: updatedBudgetLine
    });
  } catch (error) {
    console.error('[CVR Phase B] Error updating forecast:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * GET /api/budgetlines/:id/forecast/history
 * Get forecast history for a budget line
 *
 * Query params:
 * - limit: Maximum number of records (default: 50)
 */
router.get('/budgetlines/:id/forecast/history', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const budgetLineId = Number(req.params.id);
    const limit = Number(req.query.limit) || 50;

    // Verify budget line exists and belongs to tenant
    const budgetLine = await prisma.budgetLine.findUnique({
      where: { id: budgetLineId },
      select: { id: true, tenantId: true }
    });

    if (!budgetLine || budgetLine.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Budget line not found' });
    }

    const history = await getForecastHistory(tenantId, budgetLineId, limit);

    res.json({
      ok: true,
      count: history.length,
      history
    });
  } catch (error) {
    console.error('[CVR Phase B] Error getting forecast history:', error);
    next(error);
  }
});

/**
 * GET /api/budgetlines/:id/forecast/breakdown
 * Get detailed forecast breakdown showing all components
 */
router.get('/budgetlines/:id/forecast/breakdown', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const budgetLineId = Number(req.params.id);

    const breakdown = await getForecastBreakdown(tenantId, budgetLineId);

    res.json({
      ok: true,
      breakdown
    });
  } catch (error) {
    console.error('[CVR Phase B] Error getting forecast breakdown:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * GET /api/budgetlines/:id/forecast/trend
 * Get forecast trend for a budget line (IMPROVING, STABLE, WORSENING)
 */
router.get('/budgetlines/:id/forecast/trend', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const budgetLineId = Number(req.params.id);

    // Verify budget line exists and belongs to tenant
    const budgetLine = await prisma.budgetLine.findUnique({
      where: { id: budgetLineId },
      select: { id: true, tenantId: true }
    });

    if (!budgetLine || budgetLine.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Budget line not found' });
    }

    const trend = await calculateForecastTrend(tenantId, budgetLineId);

    res.json({
      ok: true,
      trend
    });
  } catch (error) {
    console.error('[CVR Phase B] Error getting forecast trend:', error);
    next(error);
  }
});

/**
 * POST /api/budgetlines/:id/forecast/reset
 * Reset forecast to committed value (clear all adjustments)
 */
router.post('/budgetlines/:id/forecast/reset', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const budgetLineId = Number(req.params.id);
    const updatedBy = req.user?.email || req.user?.username || 'unknown';

    // Verify budget line exists and belongs to tenant
    const budgetLine = await prisma.budgetLine.findUnique({
      where: { id: budgetLineId },
      select: { id: true, tenantId: true }
    });

    if (!budgetLine || budgetLine.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Budget line not found' });
    }

    const updatedBudgetLine = await resetForecastToCommitted(tenantId, budgetLineId, updatedBy);

    console.log(`[CVR Phase B] Forecast reset to committed for budget line ${budgetLineId} by ${updatedBy}`);

    res.json({
      ok: true,
      message: 'Forecast reset to committed value',
      budgetLine: updatedBudgetLine
    });
  } catch (error) {
    console.error('[CVR Phase B] Error resetting forecast:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// ============================================================================
// Project Forecast Endpoints
// ============================================================================

/**
 * GET /api/projects/:id/forecast
 * Get project-level forecast summary
 */
router.get('/projects/:id/forecast', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.id);

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, tenantId: true, name: true }
    });

    if (!project || project.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get or calculate project forecast
    let projectForecast = await prisma.projectForecast.findUnique({
      where: { projectId }
    });

    // If forecast doesn't exist or is stale (>1 hour), recalculate
    const isStale = !projectForecast ||
      (Date.now() - projectForecast.lastCalculatedAt.getTime() > 3600000);

    if (isStale) {
      console.log(`[CVR Phase B] Project forecast stale or missing, recalculating...`);
      projectForecast = await calculateProjectForecast(tenantId, projectId);
    }

    res.json({
      ok: true,
      project: {
        id: project.id,
        name: project.name
      },
      forecast: projectForecast
    });
  } catch (error) {
    console.error('[CVR Phase B] Error getting project forecast:', error);
    if (error.message.includes('not found') || error.message.includes('No budget lines')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * POST /api/projects/:id/forecast/recalculate
 * Recalculate all forecasts for a project
 *
 * Body (optional):
 * {
 *   "reason": "Monthly forecast review"
 * }
 */
router.post('/projects/:id/forecast/recalculate', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.id);
    const triggeredBy = req.user?.email || req.user?.username || 'unknown';

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, tenantId: true, name: true }
    });

    if (!project || project.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Project not found' });
    }

    console.log(`[CVR Phase B] Recalculating forecasts for project ${projectId} (${project.name}) by ${triggeredBy}`);

    const result = await recalculateAllForecasts(tenantId, projectId, triggeredBy);

    res.json({
      ok: true,
      message: `Recalculated ${result.updatedCount} of ${result.totalLines} budget lines`,
      ...result
    });
  } catch (error) {
    console.error('[CVR Phase B] Error recalculating forecasts:', error);
    if (error.message.includes('not found') || error.message.includes('No budget lines')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * POST /api/projects/:id/forecast/review
 * Mark project forecast as reviewed
 *
 * Body:
 * {
 *   "notes": "Reviewed with PM, all forecasts look good"
 * }
 */
router.post('/projects/:id/forecast/review', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.id);
    const reviewedBy = req.user?.email || req.user?.username || 'unknown';

    const projectForecast = await prisma.projectForecast.update({
      where: { projectId },
      data: {
        lastReviewedAt: new Date(),
        lastReviewedBy: reviewedBy
      }
    });

    console.log(`[CVR Phase B] Project ${projectId} forecast reviewed by ${reviewedBy}`);

    res.json({
      ok: true,
      message: 'Forecast marked as reviewed',
      forecast: projectForecast
    });
  } catch (error) {
    console.error('[CVR Phase B] Error marking forecast as reviewed:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Project forecast not found. Calculate forecast first.' });
    }
    next(error);
  }
});

/**
 * GET /api/projects/:id/forecast/summary
 * Get project forecast summary - totals only, no line details (optimized for dashboards)
 */
router.get('/projects/:id/forecast/summary', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.id);

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, tenantId: true, name: true }
    });

    if (!project || project.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get or calculate project forecast
    let projectForecast = await prisma.projectForecast.findUnique({
      where: { projectId }
    });

    // If forecast doesn't exist or is stale (>1 hour), recalculate
    const isStale = !projectForecast ||
      (Date.now() - projectForecast.lastCalculatedAt.getTime() > 3600000);

    if (isStale) {
      projectForecast = await calculateProjectForecast(tenantId, projectId);
    }

    // Return only summary fields (no detailed breakdown)
    res.json({
      ok: true,
      project: {
        id: project.id,
        name: project.name
      },
      summary: {
        totalBudget: projectForecast.totalBudget,
        totalCommitted: projectForecast.totalCommitted,
        totalActual: projectForecast.totalActual,
        totalAnticipatedFinal: projectForecast.totalAnticipatedFinal,
        budgetVariance: projectForecast.budgetVariance,
        costToComplete: projectForecast.costToComplete,
        overallStatus: projectForecast.overallStatus,
        lastCalculatedAt: projectForecast.lastCalculatedAt
      }
    });
  } catch (error) {
    console.error('[CVR Phase B] Error getting project forecast summary:', error);
    if (error.message.includes('not found') || error.message.includes('No budget lines')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * GET /api/projects/:id/forecast/by-category
 * Get project forecast grouped by category with subtotals
 */
router.get('/projects/:id/forecast/by-category', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.id);

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, tenantId: true, name: true }
    });

    if (!project || project.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const forecastWithCategories = await getProjectForecastWithCategories(tenantId, projectId);

    res.json({
      ok: true,
      project: {
        id: project.id,
        name: project.name
      },
      forecast: forecastWithCategories
    });
  } catch (error) {
    console.error('[CVR Phase B] Error getting forecast by category:', error);
    if (error.message.includes('not found') || error.message.includes('No budget lines')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * POST /api/projects/:id/forecast/bulk-update
 * Bulk update forecasts for multiple budget lines
 *
 * Body:
 * {
 *   "updates": [
 *     {
 *       "budgetLineId": 123,
 *       "forecastMethod": "COMMITTED_PLUS_ADJ",
 *       "forecastAdjustment": 5000,
 *       "changeReason": "Period end review"
 *     },
 *     {
 *       "budgetLineId": 124,
 *       "anticipatedVariations": 2000,
 *       "changeReason": "New variation expected"
 *     }
 *   ]
 * }
 */
router.post('/projects/:id/forecast/bulk-update', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.id);
    const updatedBy = req.user?.email || req.user?.username || 'unknown';

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, tenantId: true, name: true }
    });

    if (!project || project.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Updates array is required and must not be empty' });
    }

    console.log(`[CVR Phase B] Bulk updating ${updates.length} forecasts for project ${projectId} (${project.name}) by ${updatedBy}`);

    const result = await bulkUpdateForecasts(tenantId, projectId, updates, updatedBy);

    res.json(result);
  } catch (error) {
    console.error('[CVR Phase B] Error in bulk update:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;
