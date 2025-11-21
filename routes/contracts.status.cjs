const router = require('express').Router();
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');
const cvrService = require('../services/cvr.cjs');
const poGeneration = require('../services/poGeneration.cjs');

/**
 * POST /contracts/:id/status
 * Changes the contract status and optionally creates approval steps
 * Body: { status, approvalWorkflow? }
 * approvalWorkflow: [{ seq, role, required }]
 */
router.post('/contracts/:id/status', requireAuth, async (req, res) => {
  const contractId = Number(req.params.id);
  const tenantId = req.user?.tenantId;
  const userId = req.user?.id ? Number(req.user.id) : null;

  if (!tenantId || !Number.isFinite(contractId)) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }

  const { status, approvalWorkflow } = req.body || {};

  if (!status || typeof status !== 'string') {
    return res.status(400).json({ error: 'STATUS_REQUIRED' });
  }

  const validStatuses = ['draft', 'internalReview', 'approved', 'issued', 'signed', 'archived', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ 
      error: 'INVALID_STATUS',
      validStatuses,
    });
  }

  try {
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });

    if (!contract) {
      return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
    }

    const oldStatus = contract.status;

    // Update contract status
    const updated = await prisma.contract.update({
      where: { id: contractId },
      data: { status },
    });

    // If moving to internalReview and approvalWorkflow provided, create approval steps
    if (status === 'internalReview' && Array.isArray(approvalWorkflow)) {
      // Delete existing steps for this contract
      await prisma.contractApprovalStep.deleteMany({
        where: { contractId, tenantId },
      });

      // Create new approval steps
      for (const step of approvalWorkflow) {
        await prisma.contractApprovalStep.create({
          data: {
            tenantId,
            contractId,
            seq: step.seq || 0,
            role: step.role || 'Reviewer',
            required: step.required !== false,
          },
        });
      }
    }

    // When contract is signed, create CVR commitment records
    let cvrCommitments = [];
    if (status === 'signed' && oldStatus !== 'signed') {
      try {
        // Get contract with line items to create commitments
        const contractWithLines = await prisma.contract.findUnique({
          where: { id: contractId },
          include: {
            lineItems: true,
          },
        });

        if (contractWithLines && contractWithLines.lineItems?.length > 0) {
          // Create CVR commitment for each line item with budget line
          for (const line of contractWithLines.lineItems) {
            if (line.budgetLineId && line.total) {
              const commitment = await cvrService.createCommitment({
                tenantId,
                projectId: contractWithLines.projectId,
                budgetLineId: line.budgetLineId,
                sourceType: 'CONTRACT',
                sourceId: contractId,
                amount: Number(line.total),
                description: `Contract ${contractWithLines.contractRef}: ${line.description}`,
                reference: contractWithLines.contractRef,
                costCode: line.costCode,
                effectiveDate: new Date(),
                createdBy: userId,
              });
              cvrCommitments.push(commitment);
            }
          }
        } else if (contractWithLines && contractWithLines.value) {
          // No line items - create single commitment for contract value
          // Try to find associated budget line from package
          let budgetLineId = null;
          if (contractWithLines.packageId) {
            const packageItem = await prisma.packageItem.findFirst({
              where: { packageId: contractWithLines.packageId },
              select: { budgetLineId: true },
            });
            budgetLineId = packageItem?.budgetLineId;
          }

          if (budgetLineId) {
            const commitment = await cvrService.createCommitment({
              tenantId,
              projectId: contractWithLines.projectId,
              budgetLineId,
              sourceType: 'CONTRACT',
              sourceId: contractId,
              amount: Number(contractWithLines.value),
              description: `Contract ${contractWithLines.contractRef}: ${contractWithLines.title}`,
              reference: contractWithLines.contractRef,
              effectiveDate: new Date(),
              createdBy: userId,
            });
            cvrCommitments.push(commitment);
          }
        }
      } catch (cvrError) {
        console.error('Error creating CVR commitments:', cvrError);
        // Don't fail the status change - CVR is supplementary
      }
    }

    // Generate POs based on package strategy when contract is signed
    let purchaseOrders = [];
    if (status === 'signed' && oldStatus !== 'signed') {
      try {
        const result = await poGeneration.generateFromContract(contractId, userId, tenantId);
        if (result) {
          purchaseOrders = Array.isArray(result) ? result : [result];
        }
      } catch (poError) {
        console.error('Error generating POs:', poError);
        // Don't fail the status change - PO generation is supplementary
      }
    }

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        entity: 'Contract',
        entityId: String(contractId),
        action: 'status.change',
        changes: {
          oldStatus,
          newStatus: status,
          approvalWorkflowCreated: status === 'internalReview' && Array.isArray(approvalWorkflow),
          cvrCommitmentsCreated: cvrCommitments.length,
        },
      },
    });

    return res.json({
      id: updated.id,
      status: updated.status,
      previousStatus: oldStatus,
      cvrCommitmentsCreated: cvrCommitments.length,
      purchaseOrdersGenerated: purchaseOrders.length,
      purchaseOrders: purchaseOrders.map(po => ({
        id: po.id,
        code: po.code,
        total: po.total,
        status: po.status,
        poType: po.poType,
      })),
    });
  } catch (error) {
    console.error('contracts.status error', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /contracts/:id/approvals/:stepId/decision
 * Records an approval decision for a specific step
 * Body: { decision: 'Approved'|'Rejected', comment? }
 */
router.post('/contracts/:id/approvals/:stepId/decision', requireAuth, async (req, res) => {
  const contractId = Number(req.params.id);
  const stepId = Number(req.params.stepId);
  const tenantId = req.user?.tenantId;
  const userId = req.user?.id ? Number(req.user.id) : null;

  if (!tenantId || !Number.isFinite(contractId) || !Number.isFinite(stepId)) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }

  if (!userId) {
    return res.status(401).json({ error: 'USER_REQUIRED' });
  }

  const { decision, comment } = req.body || {};

  if (!decision || !['Approved', 'Rejected'].includes(decision)) {
    return res.status(400).json({ error: 'INVALID_DECISION' });
  }

  try {
    // Verify contract exists
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });

    if (!contract) {
      return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
    }

    // Verify approval step exists
    const step = await prisma.contractApprovalStep.findFirst({
      where: { id: stepId, contractId, tenantId },
    });

    if (!step) {
      return res.status(404).json({ error: 'APPROVAL_STEP_NOT_FOUND' });
    }

    // Check if user already has an approval for this step
    const existing = await prisma.contractApproval.findFirst({
      where: {
        contractId,
        stepId,
        userId,
        tenantId,
      },
    });

    let approval;
    if (existing) {
      // Update existing approval
      approval = await prisma.contractApproval.update({
        where: { id: existing.id },
        data: {
          decision,
          comment: comment || null,
          decidedAt: new Date(),
        },
      });
    } else {
      // Create new approval
      approval = await prisma.contractApproval.create({
        data: {
          tenantId,
          contractId,
          stepId,
          userId,
          decision,
          comment: comment || null,
          decidedAt: new Date(),
        },
      });
    }

    // Check if all required approvals are complete
    const allSteps = await prisma.contractApprovalStep.findMany({
      where: { contractId, tenantId, required: true },
      include: {
        approvals: {
          where: { decision: 'Approved' },
        },
      },
    });

    const allApproved = allSteps.every(s => s.approvals.length > 0);

    // If all approved, automatically advance to 'approved' status
    if (allApproved && decision === 'Approved') {
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: 'approved' },
      });
    }

    // If any rejection, move to 'draft' for rework
    if (decision === 'Rejected') {
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: 'draft' },
      });
    }

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        entity: 'ContractApproval',
        entityId: String(approval.id),
        action: 'approval.decision',
        changes: {
          contractId,
          stepId,
          decision,
          comment,
          allApproved,
        },
      },
    });

    return res.json({
      id: approval.id,
      decision: approval.decision,
      decidedAt: approval.decidedAt,
      allApproved,
    });
  } catch (error) {
    console.error('contracts.status approval error', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /contracts/:id/approvals
 * Gets all approval steps and their current status
 */
router.get('/contracts/:id/approvals', requireAuth, async (req, res) => {
  const contractId = Number(req.params.id);
  const tenantId = req.user?.tenantId;

  if (!tenantId || !Number.isFinite(contractId)) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }

  try {
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      select: { id: true, status: true },
    });

    if (!contract) {
      return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
    }

    const steps = await prisma.contractApprovalStep.findMany({
      where: { contractId, tenantId },
      orderBy: { seq: 'asc' },
      include: {
        approvals: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            userId: true,
            decision: true,
            comment: true,
            decidedAt: true,
            createdAt: true,
          },
        },
      },
    });

    const allRequired = steps.filter(s => s.required);
    const allApproved = allRequired.every(s => 
      s.approvals.some(a => a.decision === 'Approved')
    );
    const anyRejected = steps.some(s => 
      s.approvals.some(a => a.decision === 'Rejected')
    );

    return res.json({
      contractId,
      contractStatus: contract.status,
      steps,
      summary: {
        totalSteps: steps.length,
        requiredSteps: allRequired.length,
        allApproved,
        anyRejected,
      },
    });
  } catch (error) {
    console.error('contracts.status get approvals error', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
