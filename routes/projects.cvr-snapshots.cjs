/**
 * CVR Snapshot API Routes (Task 4.3)
 *
 * Endpoints for snapshot creation, finalization, comparison, and trend analysis
 */

const express = require('express');
const router = express.Router();
const {
  createCVRSnapshot,
  finalizeSnapshot,
  getSnapshotHistory,
  getLatestSnapshot,
  compareSnapshots,
  getCVRTrend,
  updateSnapshot,
  deleteSnapshot,
  getSnapshot,
} = require('../services/cvrSnapshotService.cjs');

/**
 * POST /projects/:projectId/cvr/snapshots
 * Create a new CVR snapshot
 */
router.post('/projects/:projectId/cvr/snapshots', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id || 1;

    const { periodStart, periodEnd, notes, costToComplete, forecastFinalCost } = req.body;

    if (!periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        error: 'periodStart and periodEnd are required',
      });
    }

    const snapshot = await createCVRSnapshot({
      tenantId,
      projectId: parseInt(projectId),
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      notes,
      costToComplete,
      forecastFinalCost,
      userId,
    });

    res.status(201).json({
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
 * Get snapshot history
 */
router.get('/projects/:projectId/cvr/snapshots', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const tenantId = req.user?.tenantId || 'demo';
    const { status, limit, includeSuperseded } = req.query;

    const snapshots = await getSnapshotHistory(tenantId, parseInt(projectId), {
      status,
      limit: limit ? Number(limit) : undefined,
      includeSuperseded: includeSuperseded === 'true',
    });

    res.json({
      success: true,
      data: snapshots,
    });
  } catch (error) {
    console.error('Error fetching snapshot history:', error);
    next(error);
  }
});

/**
 * GET /projects/:projectId/cvr/snapshots/latest
 * Get latest finalized snapshot
 */
router.get('/projects/:projectId/cvr/snapshots/latest', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const tenantId = req.user?.tenantId || 'demo';

    const snapshot = await getLatestSnapshot(tenantId, parseInt(projectId));

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        error: 'No finalized snapshots found',
      });
    }

    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    console.error('Error fetching latest snapshot:', error);
    next(error);
  }
});

/**
 * GET /projects/:projectId/cvr/snapshots/trend
 * Get CVR trend data
 */
router.get('/projects/:projectId/cvr/snapshots/trend', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const tenantId = req.user?.tenantId || 'demo';
    const { months = 12 } = req.query;

    const trend = await getCVRTrend(tenantId, parseInt(projectId), Number(months));

    res.json({
      success: true,
      data: trend,
    });
  } catch (error) {
    console.error('Error fetching CVR trend:', error);
    next(error);
  }
});

/**
 * GET /projects/:projectId/cvr/snapshots/compare
 * Compare two snapshots
 */
router.get('/projects/:projectId/cvr/snapshots/compare', async (req, res, next) => {
  try {
    const { snapshot1, snapshot2 } = req.query;

    if (!snapshot1 || !snapshot2) {
      return res.status(400).json({
        success: false,
        error: 'Two snapshot IDs required for comparison (snapshot1 and snapshot2)',
      });
    }

    const comparison = await compareSnapshots(parseInt(snapshot1), parseInt(snapshot2));

    res.json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    console.error('Error comparing snapshots:', error);
    next(error);
  }
});

/**
 * GET /projects/:projectId/cvr/snapshots/:snapshotId
 * Get single snapshot
 */
router.get('/projects/:projectId/cvr/snapshots/:snapshotId', async (req, res, next) => {
  try {
    const { snapshotId } = req.params;

    const snapshot = await getSnapshot(parseInt(snapshotId));

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        error: 'Snapshot not found',
      });
    }

    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    console.error('Error fetching snapshot:', error);
    next(error);
  }
});

/**
 * PATCH /projects/:projectId/cvr/snapshots/:snapshotId
 * Update draft snapshot
 */
router.patch('/projects/:projectId/cvr/snapshots/:snapshotId', async (req, res, next) => {
  try {
    const { snapshotId } = req.params;
    const { notes, costToComplete, forecastFinalCost } = req.body;

    const snapshot = await updateSnapshot(parseInt(snapshotId), {
      notes,
      costToComplete,
      forecastFinalCost,
    });

    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    console.error('Error updating snapshot:', error);
    next(error);
  }
});

/**
 * POST /projects/:projectId/cvr/snapshots/:snapshotId/finalize
 * Finalize a snapshot
 */
router.post('/projects/:projectId/cvr/snapshots/:snapshotId/finalize', async (req, res, next) => {
  try {
    const { snapshotId } = req.params;
    const userId = req.user?.id || 1;

    const snapshot = await finalizeSnapshot(parseInt(snapshotId), userId);

    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    console.error('Error finalizing snapshot:', error);
    next(error);
  }
});

/**
 * DELETE /projects/:projectId/cvr/snapshots/:snapshotId
 * Delete draft snapshot
 */
router.delete('/projects/:projectId/cvr/snapshots/:snapshotId', async (req, res, next) => {
  try {
    const { snapshotId } = req.params;

    await deleteSnapshot(parseInt(snapshotId));

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting snapshot:', error);
    next(error);
  }
});

module.exports = router;
