/**
 * Approval Workflow Processor
 *
 * Handles the execution of approval workflows:
 * - Processing approval/rejection decisions
 * - Advancing workflows through stages
 * - Handling delegations
 * - Escalating overdue approvals
 * - Completing workflows
 *
 * @module lib/approvalWorkflow
 */

const prisma = require('./prisma.cjs');

/**
 * Process an approval decision (approve, reject, etc.)
 *
 * @param {Object} params
 * @param {string} params.stepId - Approval step ID
 * @param {string} params.decision - Decision type (APPROVED, REJECTED, etc.)
 * @param {number} params.userId - User making the decision
 * @param {string} [params.comments] - Decision comments
 * @param {string} [params.conditions] - Conditions if approved with conditions
 * @returns {Promise<Object>} Updated workflow
 */
async function processDecision({
  stepId,
  decision,
  userId,
  comments,
  conditions
}) {
  try {
    // Get the step with workflow context
    const step = await prisma.approvalStep.findUnique({
      where: { id: stepId },
      include: {
        workflow: {
          include: {
            steps: {
              orderBy: { stage: 'asc' }
            }
          }
        },
        assignedUser: true
      }
    });

    if (!step) {
      throw new Error(`Approval step ${stepId} not found`);
    }

    // Verify user is authorized to make this decision
    if (step.assignedUserId !== userId && step.delegatedTo !== userId) {
      throw new Error(`User ${userId} is not authorized to approve this step`);
    }

    // Verify step is in a decidable state
    if (!['PENDING', 'IN_REVIEW'].includes(step.status)) {
      throw new Error(`Step is in status ${step.status} and cannot be decided`);
    }

    // Record decision and create audit trail
    const updatedStep = await prisma.$transaction(async (tx) => {
      // Update the step
      const updated = await tx.approvalStep.update({
        where: { id: stepId },
        data: {
          status: mapDecisionToStatus(decision),
          decision,
          decidedBy: userId,
          decidedAt: new Date(),
          comments,
          conditions
        }
      });

      // Create audit trail entry
      await tx.approvalHistory.create({
        data: {
          workflowId: step.workflowId,
          stepId: step.id,
          action: decision,
          userId,
          comments,
          // TODO: Capture IP and user agent from request context
          ipAddress: null,
          userAgent: null
        }
      });

      return updated;
    });

    console.log(`[ApprovalWorkflow] Decision recorded: ${decision} by user ${userId} on step ${stepId}`);

    // Advance workflow based on decision
    if (decision === 'APPROVED' || decision === 'APPROVED_WITH_CONDITIONS') {
      await advanceWorkflow(step.workflowId);
    } else if (decision === 'REJECTED') {
      await rejectWorkflow(step.workflowId, comments);
    } else if (decision === 'REFER_UP') {
      await escalateWorkflow(step.workflowId, step.stage);
    }

    // Return updated workflow
    return await getWorkflowWithSteps(step.workflowId);
  } catch (error) {
    console.error('[ApprovalWorkflow] Error processing decision:', error);
    throw error;
  }
}

/**
 * Advance workflow to next stage after approval
 *
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<void>}
 */
async function advanceWorkflow(workflowId) {
  try {
    const workflow = await prisma.approvalWorkflow.findUnique({
      where: { id: workflowId },
      include: {
        steps: {
          orderBy: { stage: 'asc' }
        }
      }
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Find current stage (first non-completed step)
    const currentStageIndex = workflow.steps.findIndex(
      s => !['APPROVED', 'SKIPPED', 'OVERRIDDEN'].includes(s.status)
    );

    // If all steps are approved, complete the workflow
    if (currentStageIndex === -1) {
      await completeWorkflow(workflowId);
      return;
    }

    // Check if there's a next stage
    const nextStageIndex = currentStageIndex + 1;
    if (nextStageIndex >= workflow.steps.length) {
      // This was the last step - complete workflow
      await completeWorkflow(workflowId);
      return;
    }

    // Move to next stage
    const nextStep = workflow.steps[nextStageIndex];
    await prisma.approvalStep.update({
      where: { id: nextStep.id },
      data: {
        status: 'IN_REVIEW'
      }
    });

    console.log(`[ApprovalWorkflow] Advanced to stage ${nextStep.stage} in workflow ${workflowId}`);

    // Notify next approver
    await notifyApprover(nextStep.id);
  } catch (error) {
    console.error('[ApprovalWorkflow] Error advancing workflow:', error);
    throw error;
  }
}

/**
 * Complete a workflow when all steps are approved
 *
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<void>}
 */
async function completeWorkflow(workflowId) {
  try {
    await prisma.approvalWorkflow.update({
      where: { id: workflowId },
      data: {
        status: 'APPROVED',
        completedAt: new Date()
      }
    });

    console.log(`[ApprovalWorkflow] Workflow ${workflowId} completed successfully`);

    // TODO: Trigger entity-specific completion actions
    // e.g., update Package status, enable Contract signing, etc.
  } catch (error) {
    console.error('[ApprovalWorkflow] Error completing workflow:', error);
    throw error;
  }
}

/**
 * Reject a workflow
 *
 * @param {string} workflowId - Workflow ID
 * @param {string} reason - Rejection reason
 * @returns {Promise<void>}
 */
async function rejectWorkflow(workflowId, reason) {
  try {
    await prisma.approvalWorkflow.update({
      where: { id: workflowId },
      data: {
        status: 'REJECTED',
        completedAt: new Date(),
        notes: reason || 'Rejected during approval process'
      }
    });

    console.log(`[ApprovalWorkflow] Workflow ${workflowId} rejected`);

    // TODO: Notify requester of rejection
    // TODO: Update entity status
  } catch (error) {
    console.error('[ApprovalWorkflow] Error rejecting workflow:', error);
    throw error;
  }
}

/**
 * Escalate workflow to higher authority
 *
 * @param {string} workflowId - Workflow ID
 * @param {number} fromStage - Stage being escalated from
 * @returns {Promise<void>}
 */
async function escalateWorkflow(workflowId, fromStage) {
  try {
    await prisma.approvalWorkflow.update({
      where: { id: workflowId },
      data: {
        isOverdue: true,
        escalatedAt: new Date()
      }
    });

    console.log(`[ApprovalWorkflow] Workflow ${workflowId} escalated from stage ${fromStage}`);

    // TODO: Create escalation step or notify senior management
  } catch (error) {
    console.error('[ApprovalWorkflow] Error escalating workflow:', error);
    throw error;
  }
}

/**
 * Delegate an approval step to another user
 *
 * @param {Object} params
 * @param {string} params.stepId - Step ID
 * @param {number} params.fromUserId - Current assignee
 * @param {number} params.toUserId - User to delegate to
 * @param {string} [params.reason] - Delegation reason
 * @returns {Promise<Object>} Updated step
 */
async function delegateApproval({
  stepId,
  fromUserId,
  toUserId,
  reason
}) {
  try {
    const step = await prisma.approvalStep.findUnique({
      where: { id: stepId }
    });

    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }

    if (step.assignedUserId !== fromUserId) {
      throw new Error(`User ${fromUserId} is not assigned to this step`);
    }

    const updatedStep = await prisma.approvalStep.update({
      where: { id: stepId },
      data: {
        delegatedTo: toUserId,
        delegationReason: reason,
        delegatedAt: new Date()
      },
      include: {
        assignedUser: true,
        delegatedToUser: true
      }
    });

    console.log(`[ApprovalWorkflow] Step ${stepId} delegated from user ${fromUserId} to ${toUserId}`);

    // Notify delegated user
    await notifyApprover(stepId);

    return updatedStep;
  } catch (error) {
    console.error('[ApprovalWorkflow] Error delegating approval:', error);
    throw error;
  }
}

/**
 * Override an approval (admin/emergency use)
 *
 * @param {Object} params
 * @param {string} params.workflowId - Workflow ID
 * @param {number} params.userId - User performing override
 * @param {string} params.reason - Override reason (required)
 * @returns {Promise<Object>} Updated workflow
 */
async function overrideApproval({
  workflowId,
  userId,
  reason
}) {
  try {
    if (!reason) {
      throw new Error('Override reason is required');
    }

    const workflow = await prisma.$transaction(async (tx) => {
      // Mark all pending steps as overridden
      await tx.approvalStep.updateMany({
        where: {
          workflowId,
          status: {
            in: ['PENDING', 'IN_REVIEW']
          }
        },
        data: {
          status: 'OVERRIDDEN',
          decidedBy: userId,
          decidedAt: new Date(),
          comments: `Overridden: ${reason}`
        }
      });

      // Mark workflow as overridden
      const updated = await tx.approvalWorkflow.update({
        where: { id: workflowId },
        data: {
          status: 'OVERRIDDEN',
          completedAt: new Date(),
          notes: `Overridden by user ${userId}: ${reason}`
        }
      });

      // Create audit trail
      await tx.approvalHistory.create({
        data: {
          workflowId,
          action: 'OVERRIDE',
          userId,
          comments: reason,
          ipAddress: null,
          userAgent: null
        }
      });

      return updated;
    });

    console.log(`[ApprovalWorkflow] Workflow ${workflowId} overridden by user ${userId}`);

    return workflow;
  } catch (error) {
    console.error('[ApprovalWorkflow] Error overriding approval:', error);
    throw error;
  }
}

/**
 * Cancel a workflow
 *
 * @param {string} workflowId - Workflow ID
 * @param {number} userId - User cancelling
 * @param {string} reason - Cancellation reason
 * @returns {Promise<Object>} Updated workflow
 */
async function cancelWorkflow(workflowId, userId, reason) {
  try {
    const workflow = await prisma.$transaction(async (tx) => {
      // Cancel all pending steps
      await tx.approvalStep.updateMany({
        where: {
          workflowId,
          status: {
            in: ['PENDING', 'IN_REVIEW']
          }
        },
        data: {
          status: 'SKIPPED'
        }
      });

      // Cancel workflow
      const updated = await tx.approvalWorkflow.update({
        where: { id: workflowId },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
          notes: reason
        }
      });

      // Audit trail
      await tx.approvalHistory.create({
        data: {
          workflowId,
          action: 'CANCEL',
          userId,
          comments: reason,
          ipAddress: null,
          userAgent: null
        }
      });

      return updated;
    });

    console.log(`[ApprovalWorkflow] Workflow ${workflowId} cancelled by user ${userId}`);

    return workflow;
  } catch (error) {
    console.error('[ApprovalWorkflow] Error cancelling workflow:', error);
    throw error;
  }
}

/**
 * Find and escalate overdue approvals
 *
 * @returns {Promise<number>} Count of escalated workflows
 */
async function escalateOverdueApprovals() {
  try {
    const now = new Date();

    // Find steps that are overdue
    const overdueSteps = await prisma.approvalStep.findMany({
      where: {
        status: 'IN_REVIEW',
        dueDate: {
          lt: now
        }
      },
      include: {
        workflow: true,
        assignedUser: true
      }
    });

    console.log(`[ApprovalWorkflow] Found ${overdueSteps.length} overdue approval steps`);

    let escalatedCount = 0;

    for (const step of overdueSteps) {
      // Mark workflow as overdue
      await prisma.approvalWorkflow.update({
        where: { id: step.workflowId },
        data: {
          isOverdue: true,
          escalatedAt: new Date()
        }
      });

      // TODO: Send escalation notification to manager/deputy
      console.log(`[ApprovalWorkflow] Escalated workflow ${step.workflowId} - step ${step.stage} overdue`);

      escalatedCount++;
    }

    return escalatedCount;
  } catch (error) {
    console.error('[ApprovalWorkflow] Error escalating overdue approvals:', error);
    throw error;
  }
}

/**
 * Get workflow with all related data
 *
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<Object>} Workflow with steps, threshold, project
 */
async function getWorkflowWithSteps(workflowId) {
  return await prisma.approvalWorkflow.findUnique({
    where: { id: workflowId },
    include: {
      steps: {
        include: {
          assignedUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          },
          decidedByUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          },
          delegatedToUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: {
          stage: 'asc'
        }
      },
      threshold: true,
      project: {
        select: {
          id: true,
          name: true,
          code: true
        }
      }
    }
  });
}

/**
 * Notify approver about pending approval
 *
 * @param {string} stepId - Step ID
 * @returns {Promise<void>}
 */
async function notifyApprover(stepId) {
  try {
    const step = await prisma.approvalStep.findUnique({
      where: { id: stepId },
      include: {
        assignedUser: true,
        delegatedToUser: true,
        workflow: {
          include: {
            project: true
          }
        }
      }
    });

    if (!step) {
      console.warn(`[ApprovalWorkflow] Step ${stepId} not found for notification`);
      return;
    }

    const notifyUser = step.delegatedToUser || step.assignedUser;

    if (!notifyUser) {
      console.warn(`[ApprovalWorkflow] No user to notify for step ${stepId}`);
      return;
    }

    // TODO: Integrate with notification system
    console.log(`[ApprovalWorkflow] Would notify ${notifyUser.email} about pending approval`);
    console.log(`  - Entity: ${step.workflow.entityType} #${step.workflow.entityId}`);
    console.log(`  - Project: ${step.workflow.project.name}`);
    console.log(`  - Stage: ${step.stage} - ${step.description}`);
    console.log(`  - Due: ${step.dueDate}`);

    await prisma.approvalStep.update({
      where: { id: stepId },
      data: { reminderSent: true }
    });
  } catch (error) {
    console.error('[ApprovalWorkflow] Error notifying approver:', error);
    // Don't throw - notification failures shouldn't break workflow
  }
}

/**
 * Map decision type to step status
 *
 * @param {string} decision - Decision type
 * @returns {string} Step status
 */
function mapDecisionToStatus(decision) {
  const mapping = {
    APPROVED: 'APPROVED',
    APPROVED_WITH_CONDITIONS: 'APPROVED',
    REJECTED: 'REJECTED',
    CHANGES_REQUIRED: 'CHANGES_REQUESTED',
    REFER_UP: 'PENDING',
    DEFER: 'PENDING'
  };

  return mapping[decision] || 'PENDING';
}

module.exports = {
  processDecision,
  advanceWorkflow,
  completeWorkflow,
  rejectWorkflow,
  escalateWorkflow,
  delegateApproval,
  overrideApproval,
  cancelWorkflow,
  escalateOverdueApprovals,
  getWorkflowWithSteps,
  notifyApprover
};
