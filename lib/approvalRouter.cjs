/**
 * Smart Approval Router
 *
 * This is the brain of the approval system. It handles:
 * - Matching entity values to approval thresholds
 * - Creating approval workflows automatically
 * - Assigning approvers based on project roles
 * - Routing entities through the approval process
 *
 * @module lib/approvalRouter
 */

const prisma = require('./prisma.cjs');

/**
 * Main routing function - determines if approval is needed and creates workflow
 *
 * @param {Object} params
 * @param {string} params.entityType - Type of entity (PACKAGE, CONTRACT, VARIATION, etc.)
 * @param {string} params.entityId - ID of the entity being approved
 * @param {number} params.entityValue - Value/amount requiring approval
 * @param {number} params.projectId - Project context
 * @param {string} params.tenantId - Tenant context
 * @param {number} params.initiatedByUserId - User creating the entity
 * @param {string} [params.notes] - Optional notes about the approval request
 * @returns {Promise<Object|null>} Created workflow or null if no approval needed
 */
async function routeForApproval({
  entityType,
  entityId,
  entityValue,
  projectId,
  tenantId,
  initiatedByUserId,
  notes
}) {
  try {
    // 1. Find matching threshold for this entity type and value
    const threshold = await matchThreshold({
      entityType,
      entityValue,
      tenantId
    });

    // If no threshold matches, no approval required
    if (!threshold) {
      console.log(`[ApprovalRouter] No threshold matched for ${entityType} with value ${entityValue}`);
      return null;
    }

    console.log(`[ApprovalRouter] Matched threshold: ${threshold.name} (${threshold.minValue} - ${threshold.maxValue || 'unlimited'})`);

    // 2. Create approval workflow
    const workflow = await createWorkflow({
      entityType,
      entityId,
      entityValue,
      projectId,
      tenantId,
      threshold,
      initiatedByUserId,
      notes
    });

    // 3. Assign approvers from project roles
    await assignApprovers(workflow.id, projectId, threshold.approvalSteps);

    // 4. Notify first approver
    await notifyFirstApprover(workflow.id);

    console.log(`[ApprovalRouter] Workflow created: ${workflow.id} with ${workflow.steps.length} steps`);

    return workflow;
  } catch (error) {
    console.error('[ApprovalRouter] Error routing for approval:', error);
    throw error;
  }
}

/**
 * Match entity value to approval threshold
 *
 * @param {Object} params
 * @param {string} params.entityType - Type of entity
 * @param {number} params.entityValue - Value to match
 * @param {string} params.tenantId - Tenant context
 * @returns {Promise<Object|null>} Matching threshold or null
 */
async function matchThreshold({ entityType, entityValue, tenantId }) {
  try {
    // Find active thresholds for this entity type, ordered by value ranges
    const thresholds = await prisma.approvalThreshold.findMany({
      where: {
        tenantId,
        entityType,
        isActive: true
      },
      orderBy: {
        minValue: 'asc'
      }
    });

    if (!thresholds || thresholds.length === 0) {
      console.log(`[ApprovalRouter] No thresholds configured for ${entityType} in tenant ${tenantId}`);
      return null;
    }

    // Find the first threshold where value falls within range
    const matched = thresholds.find(threshold => {
      const minValue = parseFloat(threshold.minValue);
      const maxValue = threshold.maxValue ? parseFloat(threshold.maxValue) : Infinity;

      return entityValue >= minValue && entityValue < maxValue;
    });

    return matched || null;
  } catch (error) {
    console.error('[ApprovalRouter] Error matching threshold:', error);
    throw error;
  }
}

/**
 * Create approval workflow instance
 *
 * @param {Object} params
 * @returns {Promise<Object>} Created workflow with steps
 */
async function createWorkflow({
  entityType,
  entityId,
  entityValue,
  projectId,
  tenantId,
  threshold,
  initiatedByUserId,
  notes
}) {
  try {
    // Parse approval steps from threshold JSON
    const approvalSteps = Array.isArray(threshold.approvalSteps)
      ? threshold.approvalSteps
      : JSON.parse(threshold.approvalSteps);

    // Create workflow with steps in a transaction
    const workflow = await prisma.approvalWorkflow.create({
      data: {
        tenantId,
        entityType,
        entityId,
        entityValue,
        projectId,
        thresholdId: threshold.id,
        status: 'PENDING',
        initiatedBy: `User ${initiatedByUserId}`,
        initiatedByUser: initiatedByUserId,
        notes,
        steps: {
          create: approvalSteps.map((step, index) => ({
            stage: step.stage || index + 1,
            role: step.role,
            isRequired: step.required !== false,
            description: step.description || `${step.role} approval`,
            status: index === 0 ? 'PENDING' : 'PENDING', // First step starts as PENDING
            dueDate: calculateDueDate(threshold.targetApprovalDays, step.stage || index + 1)
          }))
        }
      },
      include: {
        steps: {
          orderBy: {
            stage: 'asc'
          }
        },
        threshold: true
      }
    });

    return workflow;
  } catch (error) {
    console.error('[ApprovalRouter] Error creating workflow:', error);
    throw error;
  }
}

/**
 * Assign approvers to workflow steps based on project roles
 *
 * @param {string} workflowId - Workflow ID
 * @param {number} projectId - Project ID
 * @param {Array} approvalSteps - Approval step definitions from threshold
 * @returns {Promise<void>}
 */
async function assignApprovers(workflowId, projectId, approvalSteps) {
  try {
    // Parse if JSON string
    const steps = Array.isArray(approvalSteps)
      ? approvalSteps
      : JSON.parse(approvalSteps);

    // Get workflow steps
    const workflowSteps = await prisma.approvalStep.findMany({
      where: { workflowId },
      orderBy: { stage: 'asc' }
    });

    // For each step, find the appropriate project role and assign
    for (let i = 0; i < workflowSteps.length; i++) {
      const workflowStep = workflowSteps[i];
      const stepDef = steps[i];

      // Find project role matching this step's role requirement
      const projectRole = await prisma.projectRole.findFirst({
        where: {
          projectId,
          role: stepDef.role,
          isActive: true,
          // Check if role has appropriate permissions based on entity type
          // This will be enhanced in entity-specific integration
        },
        include: {
          user: true
        }
      });

      if (projectRole) {
        // Assign this step to the user and project role
        await prisma.approvalStep.update({
          where: { id: workflowStep.id },
          data: {
            projectRoleId: projectRole.id,
            assignedUserId: projectRole.userId,
            status: i === 0 ? 'IN_REVIEW' : 'PENDING' // First step goes to IN_REVIEW
          }
        });

        console.log(`[ApprovalRouter] Assigned step ${i + 1} to user ${projectRole.userId} (${stepDef.role})`);
      } else {
        console.warn(`[ApprovalRouter] No project role found for ${stepDef.role} on project ${projectId}`);
        // Leave step unassigned - will need manual assignment or escalation
      }
    }

    // Update workflow status to IN_PROGRESS if first step is assigned
    await prisma.approvalWorkflow.update({
      where: { id: workflowId },
      data: { status: 'IN_PROGRESS' }
    });
  } catch (error) {
    console.error('[ApprovalRouter] Error assigning approvers:', error);
    throw error;
  }
}

/**
 * Notify the first approver that they have an approval request
 *
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<void>}
 */
async function notifyFirstApprover(workflowId) {
  try {
    // Get first step with assigned user
    const firstStep = await prisma.approvalStep.findFirst({
      where: {
        workflowId,
        status: 'IN_REVIEW'
      },
      include: {
        assignedUser: true,
        workflow: {
          include: {
            project: true
          }
        }
      },
      orderBy: {
        stage: 'asc'
      }
    });

    if (!firstStep || !firstStep.assignedUser) {
      console.warn(`[ApprovalRouter] No assigned user for first step in workflow ${workflowId}`);
      return;
    }

    // TODO: Integrate with notification system
    // For now, just log
    console.log(`[ApprovalRouter] Would notify user ${firstStep.assignedUser.email} about approval request`);
    console.log(`  - Entity: ${firstStep.workflow.entityType} #${firstStep.workflow.entityId}`);
    console.log(`  - Project: ${firstStep.workflow.project.name}`);
    console.log(`  - Value: £${firstStep.workflow.entityValue}`);
    console.log(`  - Due: ${firstStep.dueDate}`);

    // Mark reminder as sent
    await prisma.approvalStep.update({
      where: { id: firstStep.id },
      data: { reminderSent: true }
    });
  } catch (error) {
    console.error('[ApprovalRouter] Error notifying first approver:', error);
    // Don't throw - notification failure shouldn't break workflow creation
  }
}

/**
 * Calculate due date for an approval step
 *
 * @param {number} targetDays - Target approval days from threshold
 * @param {number} stage - Step stage number
 * @returns {Date} Due date
 */
function calculateDueDate(targetDays, stage) {
  const now = new Date();
  // Distribute target days across stages
  // Earlier stages get proportionally more time
  const daysForThisStage = Math.ceil(targetDays / stage);
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + daysForThisStage);
  return dueDate;
}

/**
 * Check if entity requires approval (without creating workflow)
 *
 * @param {Object} params
 * @returns {Promise<boolean>}
 */
async function requiresApproval({ entityType, entityValue, tenantId }) {
  const threshold = await matchThreshold({ entityType, entityValue, tenantId });
  return threshold !== null;
}

/**
 * Get active workflow for an entity
 *
 * @param {Object} params
 * @returns {Promise<Object|null>}
 */
async function getActiveWorkflow({ entityType, entityId }) {
  return await prisma.approvalWorkflow.findFirst({
    where: {
      entityType,
      entityId,
      status: {
        in: ['PENDING', 'IN_PROGRESS']
      }
    },
    include: {
      steps: {
        include: {
          assignedUser: true,
          decidedByUser: true
        },
        orderBy: {
          stage: 'asc'
        }
      },
      threshold: true,
      project: true
    }
  });
}

module.exports = {
  routeForApproval,
  matchThreshold,
  createWorkflow,
  assignApprovers,
  notifyFirstApprover,
  requiresApproval,
  getActiveWorkflow
};
