/**
 * Approval Decision API
 *
 * User-facing API for managing approval requests and making approval decisions.
 * This is what users interact with to approve/reject packages, contracts, etc.
 *
 * Routes:
 * - GET    /api/approvals/pending - My pending approvals
 * - GET    /api/approvals/history - My approval history
 * - GET    /api/approvals/:workflowId - Workflow details
 * - POST   /api/approvals/:stepId/approve - Approve step
 * - POST   /api/approvals/:stepId/reject - Reject step
 * - POST   /api/approvals/:stepId/delegate - Delegate approval
 * - POST   /api/approvals/:workflowId/override - Override workflow (admin)
 * - POST   /api/approvals/:workflowId/cancel - Cancel workflow
 * - GET    /api/approvals/stats - Approval statistics
 */

const express = require('express');
const prisma = require('../lib/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');
const { requirePerm } = require('../middleware/checkPermission.cjs');
const {
  processDecision,
  delegateApproval,
  overrideApproval,
  cancelWorkflow,
  getWorkflowWithSteps
} = require('../lib/approvalWorkflow.cjs');

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/approvals/pending
 * Get pending approvals for the current user
 */
router.get('/pending', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const { entityType, projectId, limit = 50, offset = 0 } = req.query;

    const where = {
      OR: [
        { assignedUserId: userId },
        { delegatedTo: userId }
      ],
      status: {
        in: ['PENDING', 'IN_REVIEW']
      },
      workflow: {
        tenantId,
        status: 'IN_PROGRESS'
      }
    };

    if (entityType) {
      where.workflow.entityType = entityType.toUpperCase();
    }

    if (projectId) {
      where.workflow.projectId = parseInt(projectId);
    }

    const [steps, total] = await Promise.all([
      prisma.approvalStep.findMany({
        where,
        include: {
          workflow: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  code: true
                }
              },
              threshold: {
                select: {
                  name: true,
                  targetApprovalDays: true
                }
              }
            }
          },
          assignedUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: [
          { dueDate: 'asc' },
          { createdAt: 'asc' }
        ],
        take: parseInt(limit),
        skip: parseInt(offset)
      }),
      prisma.approvalStep.count({ where })
    ]);

    res.json({
      approvals: steps,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('[Approvals] Error fetching pending approvals:', error);
    res.status(500).json({
      error: 'Failed to fetch pending approvals',
      message: error.message
    });
  }
});

/**
 * GET /api/approvals/history
 * Get approval history for the current user
 */
router.get('/history', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const { entityType, limit = 50, offset = 0 } = req.query;

    const where = {
      decidedBy: userId,
      status: {
        in: ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']
      },
      workflow: {
        tenantId
      }
    };

    if (entityType) {
      where.workflow.entityType = entityType.toUpperCase();
    }

    const [steps, total] = await Promise.all([
      prisma.approvalStep.findMany({
        where,
        include: {
          workflow: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  code: true
                }
              }
            }
          }
        },
        orderBy: {
          decidedAt: 'desc'
        },
        take: parseInt(limit),
        skip: parseInt(offset)
      }),
      prisma.approvalStep.count({ where })
    ]);

    res.json({
      history: steps,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('[Approvals] Error fetching approval history:', error);
    res.status(500).json({
      error: 'Failed to fetch approval history',
      message: error.message
    });
  }
});

/**
 * GET /api/approvals/:workflowId
 * Get detailed workflow information
 */
router.get('/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { tenantId } = req.user;

    const workflow = await getWorkflowWithSteps(workflowId);

    if (!workflow) {
      return res.status(404).json({
        error: 'Workflow not found'
      });
    }

    // Verify workflow belongs to tenant
    if (workflow.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    res.json({ workflow });
  } catch (error) {
    console.error('[Approvals] Error fetching workflow:', error);
    res.status(500).json({
      error: 'Failed to fetch workflow',
      message: error.message
    });
  }
});

/**
 * POST /api/approvals/:stepId/approve
 * Approve an approval step
 */
router.post('/:stepId/approve', async (req, res) => {
  try {
    const { stepId } = req.params;
    const { id: userId } = req.user;
    const { comments, conditions } = req.body;

    const decision = conditions ? 'APPROVED_WITH_CONDITIONS' : 'APPROVED';

    const workflow = await processDecision({
      stepId,
      decision,
      userId,
      comments,
      conditions
    });

    console.log(`[Approvals] User ${userId} approved step ${stepId}`);

    res.json({
      message: 'Approval recorded',
      workflow
    });
  } catch (error) {
    console.error('[Approvals] Error approving step:', error);
    res.status(500).json({
      error: 'Failed to approve step',
      message: error.message
    });
  }
});

/**
 * POST /api/approvals/:stepId/reject
 * Reject an approval step
 */
router.post('/:stepId/reject', async (req, res) => {
  try {
    const { stepId } = req.params;
    const { id: userId } = req.user;
    const { comments } = req.body;

    if (!comments) {
      return res.status(400).json({
        error: 'Comments are required when rejecting'
      });
    }

    const workflow = await processDecision({
      stepId,
      decision: 'REJECTED',
      userId,
      comments
    });

    console.log(`[Approvals] User ${userId} rejected step ${stepId}`);

    res.json({
      message: 'Rejection recorded',
      workflow
    });
  } catch (error) {
    console.error('[Approvals] Error rejecting step:', error);
    res.status(500).json({
      error: 'Failed to reject step',
      message: error.message
    });
  }
});

/**
 * POST /api/approvals/:stepId/changes-required
 * Request changes for an approval step
 */
router.post('/:stepId/changes-required', async (req, res) => {
  try {
    const { stepId } = req.params;
    const { id: userId } = req.user;
    const { comments } = req.body;

    if (!comments) {
      return res.status(400).json({
        error: 'Comments are required when requesting changes'
      });
    }

    const workflow = await processDecision({
      stepId,
      decision: 'CHANGES_REQUIRED',
      userId,
      comments
    });

    console.log(`[Approvals] User ${userId} requested changes for step ${stepId}`);

    res.json({
      message: 'Change request recorded',
      workflow
    });
  } catch (error) {
    console.error('[Approvals] Error requesting changes:', error);
    res.status(500).json({
      error: 'Failed to request changes',
      message: error.message
    });
  }
});

/**
 * POST /api/approvals/:stepId/refer-up
 * Refer approval to higher authority
 */
router.post('/:stepId/refer-up', async (req, res) => {
  try {
    const { stepId } = req.params;
    const { id: userId } = req.user;
    const { comments } = req.body;

    const workflow = await processDecision({
      stepId,
      decision: 'REFER_UP',
      userId,
      comments
    });

    console.log(`[Approvals] User ${userId} referred step ${stepId} up`);

    res.json({
      message: 'Referral recorded',
      workflow
    });
  } catch (error) {
    console.error('[Approvals] Error referring up:', error);
    res.status(500).json({
      error: 'Failed to refer approval',
      message: error.message
    });
  }
});

/**
 * POST /api/approvals/:stepId/delegate
 * Delegate approval to another user
 */
router.post('/:stepId/delegate', async (req, res) => {
  try {
    const { stepId } = req.params;
    const { id: userId } = req.user;
    const { toUserId, reason } = req.body;

    if (!toUserId) {
      return res.status(400).json({
        error: 'toUserId is required'
      });
    }

    const step = await delegateApproval({
      stepId,
      fromUserId: userId,
      toUserId: parseInt(toUserId),
      reason
    });

    console.log(`[Approvals] User ${userId} delegated step ${stepId} to user ${toUserId}`);

    res.json({
      message: 'Approval delegated',
      step
    });
  } catch (error) {
    console.error('[Approvals] Error delegating approval:', error);
    res.status(500).json({
      error: 'Failed to delegate approval',
      message: error.message
    });
  }
});

/**
 * POST /api/approvals/:workflowId/override
 * Override an approval workflow (admin/emergency use)
 */
router.post('/:workflowId/override', requirePerm('approvals_override'), async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { id: userId } = req.user;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        error: 'Reason is required for overriding approvals'
      });
    }

    const workflow = await overrideApproval({
      workflowId,
      userId,
      reason
    });

    console.log(`[Approvals] User ${userId} overrode workflow ${workflowId}`);

    res.json({
      message: 'Workflow overridden',
      workflow
    });
  } catch (error) {
    console.error('[Approvals] Error overriding workflow:', error);
    res.status(500).json({
      error: 'Failed to override workflow',
      message: error.message
    });
  }
});

/**
 * POST /api/approvals/:workflowId/cancel
 * Cancel an approval workflow
 */
router.post('/:workflowId/cancel', requirePerm('project_manage'), async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { id: userId } = req.user;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        error: 'Reason is required for cancelling workflow'
      });
    }

    const workflow = await cancelWorkflow(workflowId, userId, reason);

    console.log(`[Approvals] User ${userId} cancelled workflow ${workflowId}`);

    res.json({
      message: 'Workflow cancelled',
      workflow
    });
  } catch (error) {
    console.error('[Approvals] Error cancelling workflow:', error);
    res.status(500).json({
      error: 'Failed to cancel workflow',
      message: error.message
    });
  }
});

/**
 * GET /api/approvals/stats
 * Get approval statistics for the current user
 */
router.get('/stats/me', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;

    const [
      pendingCount,
      overdueCount,
      approvedLast30Days,
      rejectedLast30Days
    ] = await Promise.all([
      // Pending approvals
      prisma.approvalStep.count({
        where: {
          OR: [
            { assignedUserId: userId },
            { delegatedTo: userId }
          ],
          status: {
            in: ['PENDING', 'IN_REVIEW']
          },
          workflow: {
            tenantId,
            status: 'IN_PROGRESS'
          }
        }
      }),

      // Overdue approvals
      prisma.approvalStep.count({
        where: {
          OR: [
            { assignedUserId: userId },
            { delegatedTo: userId }
          ],
          status: 'IN_REVIEW',
          dueDate: {
            lt: new Date()
          },
          workflow: {
            tenantId,
            status: 'IN_PROGRESS'
          }
        }
      }),

      // Approved in last 30 days
      prisma.approvalStep.count({
        where: {
          decidedBy: userId,
          status: 'APPROVED',
          decidedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          },
          workflow: {
            tenantId
          }
        }
      }),

      // Rejected in last 30 days
      prisma.approvalStep.count({
        where: {
          decidedBy: userId,
          status: 'REJECTED',
          decidedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          },
          workflow: {
            tenantId
          }
        }
      })
    ]);

    res.json({
      pending: pendingCount,
      overdue: overdueCount,
      approvedLast30Days,
      rejectedLast30Days,
      totalLast30Days: approvedLast30Days + rejectedLast30Days
    });
  } catch (error) {
    console.error('[Approvals] Error fetching approval stats:', error);
    res.status(500).json({
      error: 'Failed to fetch approval statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/approvals/stats/tenant
 * Get tenant-wide approval statistics (admin only)
 */
router.get('/stats/tenant', requirePerm('analytics_view'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { days = 30 } = req.query;

    const sinceDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const [
      totalWorkflows,
      activeWorkflows,
      completedWorkflows,
      rejectedWorkflows,
      overdueWorkflows,
      avgCompletionTime
    ] = await Promise.all([
      // Total workflows
      prisma.approvalWorkflow.count({
        where: {
          tenantId,
          createdAt: { gte: sinceDate }
        }
      }),

      // Active workflows
      prisma.approvalWorkflow.count({
        where: {
          tenantId,
          status: {
            in: ['PENDING', 'IN_PROGRESS']
          }
        }
      }),

      // Completed workflows
      prisma.approvalWorkflow.count({
        where: {
          tenantId,
          status: 'APPROVED',
          completedAt: { gte: sinceDate }
        }
      }),

      // Rejected workflows
      prisma.approvalWorkflow.count({
        where: {
          tenantId,
          status: 'REJECTED',
          completedAt: { gte: sinceDate }
        }
      }),

      // Overdue workflows
      prisma.approvalWorkflow.count({
        where: {
          tenantId,
          isOverdue: true,
          status: {
            in: ['PENDING', 'IN_PROGRESS']
          }
        }
      }),

      // Average completion time (in days)
      prisma.approvalWorkflow.aggregate({
        where: {
          tenantId,
          status: 'APPROVED',
          completedAt: { gte: sinceDate }
        },
        _avg: {
          // Calculate average days between initiated and completed
          // This would need a raw query for proper calculation
        }
      })
    ]);

    res.json({
      period: `Last ${days} days`,
      total: totalWorkflows,
      active: activeWorkflows,
      completed: completedWorkflows,
      rejected: rejectedWorkflows,
      overdue: overdueWorkflows,
      completionRate: totalWorkflows > 0
        ? ((completedWorkflows / totalWorkflows) * 100).toFixed(1)
        : 0
    });
  } catch (error) {
    console.error('[Approvals] Error fetching tenant stats:', error);
    res.status(500).json({
      error: 'Failed to fetch tenant statistics',
      message: error.message
    });
  }
});

module.exports = router;
