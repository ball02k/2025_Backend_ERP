/**
 * Retention Routes (Task 3.4)
 *
 * API endpoints for retention register and management
 * Handles retention position, claims, releases, and bonds
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth.cjs');
const retentionService = require('../services/retentionService.cjs');

/**
 * GET /api/projects/:projectId/retention
 * Get complete retention position for a project
 */
router.get('/projects/:projectId/retention', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { tenantId } = req.user;

    const position = await retentionService.getRetentionPosition(
      parseInt(projectId),
      tenantId
    );

    res.json(position);
  } catch (error) {
    console.error('Error fetching retention position:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch retention position'
    });
  }
});

/**
 * GET /api/retention/register
 * Get tenant-wide retention register (all projects)
 */
router.get('/retention/register', requireAuth, async (req, res) => {
  try {
    const { tenantId } = req.user;

    const register = await retentionService.getTenantRetentionRegister(tenantId);

    res.json({
      projects: register,
      summary: {
        totalProjects: register.length,
        totalRetentionHeld: register.reduce((sum, p) => sum + p.retentionHeld, 0),
        totalPcReleaseForecast: register.reduce((sum, p) => sum + p.pcReleaseForecast, 0),
        totalDlpReleaseForecast: register.reduce((sum, p) => sum + p.dlpReleaseForecast, 0),
        projectsWithOverduePc: register.filter(p => p.pcReleaseStatus === 'OVERDUE').length,
        projectsWithOverdueDlp: register.filter(p => p.dlpReleaseStatus === 'OVERDUE').length
      }
    });
  } catch (error) {
    console.error('Error fetching retention register:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch retention register'
    });
  }
});

/**
 * POST /api/projects/:projectId/retention/claim
 * Submit a retention release claim
 */
router.post('/projects/:projectId/retention/claim', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { tenantId, userId } = req.user;
    const { releaseType, releaseAmount, requestedDate, notes, documentUrl } = req.body;

    // Validation
    if (!releaseType) {
      return res.status(400).json({ error: 'Release type is required' });
    }

    if (!releaseAmount || releaseAmount <= 0) {
      return res.status(400).json({ error: 'Valid release amount is required' });
    }

    const validReleaseTypes = ['PC_RELEASE', 'DLP_RELEASE', 'EARLY_RELEASE', 'BOND_SUBSTITUTION'];
    if (!validReleaseTypes.includes(releaseType)) {
      return res.status(400).json({ error: 'Invalid release type' });
    }

    const release = await retentionService.createRetentionRelease({
      projectId: parseInt(projectId),
      tenantId,
      releaseType,
      releaseAmount: parseFloat(releaseAmount),
      requestedDate,
      notes,
      documentUrl,
      createdById: userId
    });

    res.status(201).json({
      message: 'Retention release claim submitted successfully',
      release: {
        id: release.id,
        releaseType: release.releaseType,
        releaseAmount: parseFloat(release.releaseAmount),
        retentionBefore: parseFloat(release.retentionBefore),
        retentionAfter: parseFloat(release.retentionAfter),
        claimStatus: release.claimStatus,
        requestedDate: release.requestedDate
      }
    });
  } catch (error) {
    console.error('Error creating retention release claim:', error);
    res.status(500).json({
      error: error.message || 'Failed to create retention release claim'
    });
  }
});

/**
 * PUT /api/projects/:projectId/retention/releases/:releaseId
 * Update a retention release (e.g., mark as approved, paid)
 */
router.put('/projects/:projectId/retention/releases/:releaseId', requireAuth, async (req, res) => {
  try {
    const { releaseId } = req.params;
    const { tenantId } = req.user;
    const updates = req.body;

    // Validate claim status if provided
    if (updates.claimStatus) {
      const validStatuses = ['NOT_CLAIMED', 'CLAIMED', 'APPROVED', 'PAID', 'DISPUTED'];
      if (!validStatuses.includes(updates.claimStatus)) {
        return res.status(400).json({ error: 'Invalid claim status' });
      }
    }

    const updated = await retentionService.updateRetentionRelease(
      releaseId,
      tenantId,
      updates
    );

    res.json({
      message: 'Retention release updated successfully',
      release: {
        id: updated.id,
        releaseType: updated.releaseType,
        releaseAmount: parseFloat(updated.releaseAmount),
        claimStatus: updated.claimStatus,
        releaseDate: updated.releaseDate,
        paymentReceivedDate: updated.paymentReceivedDate,
        paymentAmount: updated.paymentAmount ? parseFloat(updated.paymentAmount) : null
      }
    });
  } catch (error) {
    console.error('Error updating retention release:', error);
    res.status(500).json({
      error: error.message || 'Failed to update retention release'
    });
  }
});

/**
 * POST /api/projects/:projectId/retention/bonds
 * Add a retention bond
 */
router.post('/projects/:projectId/retention/bonds', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { tenantId } = req.user;
    const {
      bondProvider,
      bondReference,
      bondAmount,
      bondType,
      issueDate,
      expiryDate,
      bondDocumentUrl
    } = req.body;

    // Validation
    if (!bondProvider || !bondReference || !bondAmount) {
      return res.status(400).json({
        error: 'Bond provider, reference, and amount are required'
      });
    }

    if (!bondType || !['ON_DEMAND', 'CONDITIONAL'].includes(bondType)) {
      return res.status(400).json({
        error: 'Valid bond type is required (ON_DEMAND or CONDITIONAL)'
      });
    }

    if (!issueDate || !expiryDate) {
      return res.status(400).json({
        error: 'Issue date and expiry date are required'
      });
    }

    const bond = await retentionService.createRetentionBond({
      projectId: parseInt(projectId),
      tenantId,
      bondProvider,
      bondReference,
      bondAmount: parseFloat(bondAmount),
      bondType,
      issueDate,
      expiryDate,
      bondDocumentUrl
    });

    res.status(201).json({
      message: 'Retention bond added successfully',
      bond: {
        id: bond.id,
        bondProvider: bond.bondProvider,
        bondReference: bond.bondReference,
        bondAmount: parseFloat(bond.bondAmount),
        bondType: bond.bondType,
        issueDate: bond.issueDate,
        expiryDate: bond.expiryDate,
        status: bond.status
      }
    });
  } catch (error) {
    console.error('Error creating retention bond:', error);
    res.status(500).json({
      error: error.message || 'Failed to create retention bond'
    });
  }
});

/**
 * GET /api/projects/:projectId/retention/releases
 * Get all retention releases for a project
 */
router.get('/projects/:projectId/retention/releases', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { tenantId } = req.user;

    const position = await retentionService.getRetentionPosition(
      parseInt(projectId),
      tenantId
    );

    res.json({
      releases: position.releases
    });
  } catch (error) {
    console.error('Error fetching retention releases:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch retention releases'
    });
  }
});

/**
 * GET /api/projects/:projectId/retention/bonds
 * Get all retention bonds for a project
 */
router.get('/projects/:projectId/retention/bonds', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { tenantId } = req.user;

    const position = await retentionService.getRetentionPosition(
      parseInt(projectId),
      tenantId
    );

    res.json({
      bonds: position.bonds
    });
  } catch (error) {
    console.error('Error fetching retention bonds:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch retention bonds'
    });
  }
});

module.exports = router;
