/**
 * Approval Threshold Configuration API
 *
 * Manages approval thresholds - the rules that determine which approvals
 * are required based on entity type and value.
 *
 * Routes:
 * - GET    /api/settings/approvals/thresholds - List all thresholds
 * - GET    /api/settings/approvals/thresholds/:entityType - List by entity type
 * - GET    /api/settings/approvals/thresholds/:id - Get threshold details
 * - POST   /api/settings/approvals/thresholds - Create threshold
 * - PUT    /api/settings/approvals/thresholds/:id - Update threshold
 * - DELETE /api/settings/approvals/thresholds/:id - Delete threshold
 * - POST   /api/settings/approvals/thresholds/:id/test - Test threshold matching
 */

const express = require('express');
const prisma = require('../lib/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');
const { requirePerm } = require('../middleware/checkPermission.cjs');

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/settings/approvals/thresholds
 * List all approval thresholds for the tenant
 */
router.get('/thresholds', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { entityType, isActive } = req.query;

    const where = { tenantId };

    if (entityType) {
      where.entityType = entityType;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const thresholds = await prisma.approvalThreshold.findMany({
      where,
      orderBy: [
        { entityType: 'asc' },
        { sequence: 'asc' },
        { minValue: 'asc' }
      ],
      include: {
        _count: {
          select: {
            workflows: true
          }
        }
      }
    });

    res.json({ thresholds });
  } catch (error) {
    console.error('[Approval Thresholds] Error listing thresholds:', error);
    res.status(500).json({
      error: 'Failed to list approval thresholds',
      message: error.message
    });
  }
});

/**
 * GET /api/settings/approvals/thresholds/by-entity/:entityType
 * List thresholds for a specific entity type
 */
router.get('/thresholds/by-entity/:entityType', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { entityType } = req.params;

    const thresholds = await prisma.approvalThreshold.findMany({
      where: {
        tenantId,
        entityType: entityType.toUpperCase(),
        isActive: true
      },
      orderBy: [
        { sequence: 'asc' },
        { minValue: 'asc' }
      ]
    });

    res.json({ thresholds });
  } catch (error) {
    console.error('[Approval Thresholds] Error listing thresholds by entity:', error);
    res.status(500).json({
      error: 'Failed to list thresholds',
      message: error.message
    });
  }
});

/**
 * GET /api/settings/approvals/thresholds/:id
 * Get threshold details
 */
router.get('/thresholds/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const threshold = await prisma.approvalThreshold.findFirst({
      where: {
        id,
        tenantId
      },
      include: {
        workflows: {
          take: 10,
          orderBy: {
            createdAt: 'desc'
          },
          select: {
            id: true,
            entityType: true,
            entityId: true,
            entityValue: true,
            status: true,
            createdAt: true
          }
        },
        _count: {
          select: {
            workflows: true
          }
        }
      }
    });

    if (!threshold) {
      return res.status(404).json({
        error: 'Threshold not found'
      });
    }

    res.json({ threshold });
  } catch (error) {
    console.error('[Approval Thresholds] Error getting threshold:', error);
    res.status(500).json({
      error: 'Failed to get threshold',
      message: error.message
    });
  }
});

/**
 * POST /api/settings/approvals/thresholds
 * Create new approval threshold
 *
 * Requires admin or settings management permission
 */
router.post('/thresholds', requirePerm('settings_manage'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const {
      entityType,
      name,
      minValue,
      maxValue,
      approvalSteps,
      requiresRiskAssessment,
      requiresDesignReview,
      requiresHSQE,
      requiresClientApproval,
      targetApprovalDays,
      sequence,
      description,
      isActive
    } = req.body;

    // Validation
    if (!entityType || !name || minValue === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: entityType, name, minValue'
      });
    }

    if (!approvalSteps || !Array.isArray(approvalSteps) || approvalSteps.length === 0) {
      return res.status(400).json({
        error: 'approvalSteps must be a non-empty array'
      });
    }

    // Validate approval steps structure
    for (let i = 0; i < approvalSteps.length; i++) {
      const step = approvalSteps[i];
      if (!step.role || !step.stage) {
        return res.status(400).json({
          error: `Approval step ${i + 1} must have 'role' and 'stage' fields`
        });
      }
    }

    // Check for overlapping thresholds
    const overlapping = await prisma.approvalThreshold.findFirst({
      where: {
        tenantId,
        entityType,
        isActive: true,
        OR: [
          {
            AND: [
              { minValue: { lte: minValue } },
              maxValue ? { maxValue: { gt: minValue } } : {}
            ]
          },
          maxValue ? {
            AND: [
              { minValue: { lt: maxValue } },
              { maxValue: { gte: maxValue } }
            ]
          } : {}
        ]
      }
    });

    if (overlapping) {
      return res.status(400).json({
        error: 'Threshold range overlaps with existing threshold',
        overlappingThreshold: {
          id: overlapping.id,
          name: overlapping.name,
          range: `£${overlapping.minValue} - ${overlapping.maxValue || 'unlimited'}`
        }
      });
    }

    // Determine sequence if not provided
    let finalSequence = sequence;
    if (finalSequence === undefined) {
      const maxSeq = await prisma.approvalThreshold.findFirst({
        where: { tenantId, entityType },
        orderBy: { sequence: 'desc' },
        select: { sequence: true }
      });
      finalSequence = (maxSeq?.sequence || 0) + 1;
    }

    const threshold = await prisma.approvalThreshold.create({
      data: {
        tenantId,
        entityType,
        name,
        minValue,
        maxValue: maxValue || null,
        approvalSteps,
        requiresRiskAssessment: requiresRiskAssessment || false,
        requiresDesignReview: requiresDesignReview || false,
        requiresHSQE: requiresHSQE || false,
        requiresClientApproval: requiresClientApproval || false,
        targetApprovalDays: targetApprovalDays || 5,
        sequence: finalSequence,
        description,
        isActive: isActive !== false
      }
    });

    console.log(`[Approval Thresholds] Created threshold: ${threshold.name} (${threshold.id})`);

    res.status(201).json({ threshold });
  } catch (error) {
    console.error('[Approval Thresholds] Error creating threshold:', error);
    res.status(500).json({
      error: 'Failed to create threshold',
      message: error.message
    });
  }
});

/**
 * PUT /api/settings/approvals/thresholds/:id
 * Update approval threshold
 */
router.put('/thresholds/:id', requirePerm('settings_manage'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const {
      name,
      minValue,
      maxValue,
      approvalSteps,
      requiresRiskAssessment,
      requiresDesignReview,
      requiresHSQE,
      requiresClientApproval,
      targetApprovalDays,
      sequence,
      description,
      isActive
    } = req.body;

    // Check threshold exists and belongs to tenant
    const existing = await prisma.approvalThreshold.findFirst({
      where: { id, tenantId }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Threshold not found'
      });
    }

    // Check if threshold is being used in active workflows
    const activeWorkflowsCount = await prisma.approvalWorkflow.count({
      where: {
        thresholdId: id,
        status: {
          in: ['PENDING', 'IN_PROGRESS']
        }
      }
    });

    if (activeWorkflowsCount > 0 && (minValue !== undefined || maxValue !== undefined || approvalSteps !== undefined)) {
      return res.status(400).json({
        error: 'Cannot modify threshold rules while it has active workflows',
        activeWorkflows: activeWorkflowsCount,
        suggestion: 'Create a new threshold instead or wait for workflows to complete'
      });
    }

    // Build update data
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (minValue !== undefined) updateData.minValue = minValue;
    if (maxValue !== undefined) updateData.maxValue = maxValue;
    if (approvalSteps !== undefined) updateData.approvalSteps = approvalSteps;
    if (requiresRiskAssessment !== undefined) updateData.requiresRiskAssessment = requiresRiskAssessment;
    if (requiresDesignReview !== undefined) updateData.requiresDesignReview = requiresDesignReview;
    if (requiresHSQE !== undefined) updateData.requiresHSQE = requiresHSQE;
    if (requiresClientApproval !== undefined) updateData.requiresClientApproval = requiresClientApproval;
    if (targetApprovalDays !== undefined) updateData.targetApprovalDays = targetApprovalDays;
    if (sequence !== undefined) updateData.sequence = sequence;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;

    const threshold = await prisma.approvalThreshold.update({
      where: { id },
      data: updateData
    });

    console.log(`[Approval Thresholds] Updated threshold: ${threshold.name} (${threshold.id})`);

    res.json({ threshold });
  } catch (error) {
    console.error('[Approval Thresholds] Error updating threshold:', error);
    res.status(500).json({
      error: 'Failed to update threshold',
      message: error.message
    });
  }
});

/**
 * DELETE /api/settings/approvals/thresholds/:id
 * Delete approval threshold (soft delete by deactivating)
 */
router.delete('/thresholds/:id', requirePerm('settings_manage'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    // Check threshold exists
    const existing = await prisma.approvalThreshold.findFirst({
      where: { id, tenantId },
      include: {
        _count: {
          select: {
            workflows: true
          }
        }
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Threshold not found'
      });
    }

    // Check if threshold has been used
    if (existing._count.workflows > 0) {
      // Soft delete - deactivate instead of deleting
      await prisma.approvalThreshold.update({
        where: { id },
        data: { isActive: false }
      });

      console.log(`[Approval Thresholds] Deactivated threshold: ${existing.name} (${id})`);

      return res.json({
        message: 'Threshold deactivated',
        note: 'Threshold has been used in workflows and was deactivated instead of deleted'
      });
    }

    // Hard delete if never used
    await prisma.approvalThreshold.delete({
      where: { id }
    });

    console.log(`[Approval Thresholds] Deleted threshold: ${existing.name} (${id})`);

    res.json({
      message: 'Threshold deleted'
    });
  } catch (error) {
    console.error('[Approval Thresholds] Error deleting threshold:', error);
    res.status(500).json({
      error: 'Failed to delete threshold',
      message: error.message
    });
  }
});

/**
 * POST /api/settings/approvals/thresholds/:id/test
 * Test if a value would match this threshold
 */
router.post('/thresholds/:id/test', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({
        error: 'Missing required field: value'
      });
    }

    const threshold = await prisma.approvalThreshold.findFirst({
      where: { id, tenantId }
    });

    if (!threshold) {
      return res.status(404).json({
        error: 'Threshold not found'
      });
    }

    const minValue = parseFloat(threshold.minValue);
    const maxValue = threshold.maxValue ? parseFloat(threshold.maxValue) : Infinity;
    const testValue = parseFloat(value);

    const matches = testValue >= minValue && testValue < maxValue;

    res.json({
      matches,
      threshold: {
        id: threshold.id,
        name: threshold.name,
        minValue: threshold.minValue,
        maxValue: threshold.maxValue
      },
      testValue: value
    });
  } catch (error) {
    console.error('[Approval Thresholds] Error testing threshold:', error);
    res.status(500).json({
      error: 'Failed to test threshold',
      message: error.message
    });
  }
});

/**
 * GET /api/settings/approvals/thresholds/match/:entityType/:value
 * Find which threshold would match a specific value
 */
router.get('/thresholds/match/:entityType/:value', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { entityType, value } = req.params;

    const { matchThreshold } = require('../lib/approvalRouter.cjs');

    const threshold = await matchThreshold({
      entityType: entityType.toUpperCase(),
      entityValue: parseFloat(value),
      tenantId
    });

    if (!threshold) {
      return res.json({
        matched: false,
        message: 'No threshold matches this value',
        value: parseFloat(value)
      });
    }

    res.json({
      matched: true,
      threshold,
      value: parseFloat(value)
    });
  } catch (error) {
    console.error('[Approval Thresholds] Error matching threshold:', error);
    res.status(500).json({
      error: 'Failed to match threshold',
      message: error.message
    });
  }
});

module.exports = router;
