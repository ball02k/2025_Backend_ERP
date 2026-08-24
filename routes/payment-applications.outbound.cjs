/**
 * Outbound Payment Applications API Routes (Task 2.5)
 *
 * For subcontractors raising applications to Main Contractor
 *
 * Routes:
 * - GET    /api/projects/:projectId/payment-applications/new-outbound - Prepare data for new app
 * - POST   /api/projects/:projectId/payment-applications (direction=OUTBOUND) - Create app
 * - POST   /api/projects/:projectId/payment-applications/calculate - Preview calculation
 * - PUT    /api/projects/:projectId/payment-applications/:id - Update draft app
 */

const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const { prisma, toDecimal } = require('../lib/prisma.js');
const {
  calculateOutboundApplication,
  getNextApplicationNumber,
  prepareNewOutboundApplication
} = require('../services/outboundApplicationCalculator.cjs');
const { addDays } = require('date-fns/addDays');
const {
  evaluatePaymentApplicationLock,
  assertCommercialUnlocked,
  sendCommercialLock,
} = require('../services/commercialLockService.cjs');

router.use(requireAuth);

async function enforceApplicationUnlocked(req, applicationId, action, proposedChanges = {}) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    const err = new Error('Tenant context is required for payment application changes');
    err.status = 403;
    err.code = 'TENANT_REQUIRED';
    throw err;
  }
  const decision = await evaluatePaymentApplicationLock({
    prisma,
    tenantId,
    applicationId,
    action,
    proposedChanges,
  });
  return assertCommercialUnlocked(decision);
}

/**
 * GET /api/projects/:projectId/payment-applications/new-outbound
 * Prepare data for raising new outbound application
 */
router.get('/projects/:projectId/payment-applications/new-outbound', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId;

    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    // Verify project and role
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true, projectRole: true }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.projectRole !== 'SUBCONTRACTOR' && project.projectRole !== 'DIRECT_TO_CLIENT') {
      return res.status(400).json({
        error: 'Outbound applications can only be raised for SUBCONTRACTOR and DIRECT_TO_CLIENT projects'
      });
    }

    const data = await prepareNewOutboundApplication(tenantId, projectId);
    res.json(data);

  } catch (error) {
    console.error('[Payment Applications] Error preparing new outbound:', error);
    res.status(500).json({
      error: 'Failed to prepare new outbound application',
      message: error.message
    });
  }
});

/**
 * POST /api/projects/:projectId/payment-applications/calculate
 * Preview calculation without saving
 */
router.post('/projects/:projectId/payment-applications/calculate', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId;
    const { upstreamContractId, lineItems } = req.body;

    if (!upstreamContractId || !lineItems || !Array.isArray(lineItems)) {
      return res.status(400).json({
        error: 'upstreamContractId and lineItems array required'
      });
    }

    const result = await calculateOutboundApplication({
      tenantId,
      upstreamContractId,
      projectId,
      lineItems
    });

    res.json(result);

  } catch (error) {
    console.error('[Payment Applications] Error calculating:', error);
    res.status(500).json({
      error: 'Failed to calculate application',
      message: error.message
    });
  }
});

/**
 * POST /api/projects/:projectId/payment-applications (OUTBOUND)
 * Create new outbound application
 */
router.post('/projects/:projectId/payment-applications', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const {
      direction,
      applicationPeriodStart,
      applicationPeriodEnd,
      valuationDate,
      lineItems,
      notes,
      status = 'DRAFT'
    } = req.body;

    // This endpoint only handles OUTBOUND
    if (direction !== 'OUTBOUND') {
      return res.status(400).json({
        error: 'This endpoint only handles OUTBOUND applications. Use the standard endpoint for INBOUND.'
      });
    }

    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({
        error: 'At least one line item is required'
      });
    }

    // Verify project and get upstream contract
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: {
        id: true,
        projectRole: true,
        upstreamContract: {
          select: {
            id: true,
            mainContractorId: true,
            mainContractor: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.upstreamContract) {
      return res.status(400).json({
        error: 'No upstream contract found. Set up upstream contract before raising applications.'
      });
    }

    // Calculate totals
    const calculation = await calculateOutboundApplication({
      tenantId,
      upstreamContractId: project.upstreamContract.id,
      projectId,
      lineItems
    });

    // Get next application number
    const applicationNumber = await getNextApplicationNumber(tenantId, projectId);

    // Generate application number string
    const applicationNo = `OUT-${projectId}-${String(applicationNumber).padStart(3, '0')}`;

    // Calculate payment due date
    const applicationDate = new Date(valuationDate || new Date());
    const dueDate = addDays(applicationDate, calculation.paymentTerms.paymentTermsDays);

    // Create application
    const application = await prisma.applicationForPayment.create({
      data: {
        tenantId,
        projectId,
        direction: 'OUTBOUND',
        applicationNumber,
        applicationNo,
        status,

        // Dates
        applicationDate,
        valuationDate: valuationDate ? new Date(valuationDate) : applicationDate,
        periodStart: applicationPeriodStart ? new Date(applicationPeriodStart) : null,
        periodEnd: applicationPeriodEnd ? new Date(applicationPeriodEnd) : null,
        dueDate,

        // Link to upstream contract
        upstreamContractId: project.upstreamContract.id,

        // Recipient
        recipientType: 'MAIN_CONTRACTOR',
        recipientId: project.upstreamContract.mainContractorId,

        // Claimed figures
        claimedGrossValue: toDecimal(calculation.summary.grossThisPeriod),
        claimedPreviouslyPaid: toDecimal(calculation.summary.grossPrevious),
        claimedThisPeriod: toDecimal(calculation.summary.netThisPeriod),

        // Totals (legacy fields)
        grossToDate: toDecimal(calculation.summary.grossCumulative),
        retentionValue: toDecimal(calculation.summary.retentionCumulative),
        netClaimed: toDecimal(calculation.summary.netThisPeriod),

        // Retention
        retentionPercentage: toDecimal(calculation.summary.retentionPercentage),
        retentionHeldToDate: toDecimal(calculation.summary.retentionHeldToDate),

        // MCD
        mcdPercentage: toDecimal(calculation.summary.mcdPercentage),
        mcdAmount: toDecimal(calculation.summary.mcdCumulative),

        // Notes
        contractorNotes: notes || null,
        submittedBy: userId,
        submittedAt: status === 'SUBMITTED' ? new Date() : null,

        // Currency
        currency: 'GBP'
      }
    });

    // Create line items
    for (const calcLine of calculation.lineItems) {
      await prisma.paymentApplicationLineItem.create({
        data: {
          tenantId,
          applicationId: application.id,
          budgetLineId: calcLine.budgetLineId,
          description: calcLine.description,
          reference: calcLine.reference,
          contractValue: toDecimal(calcLine.contractValue),
          valuePrevious: toDecimal(calcLine.previousCumulative),
          valueThisPeriod: toDecimal(calcLine.thisPeriod),
          valueCumulative: toDecimal(calcLine.cumulativeToDate)
        }
      });
    }

    // Fetch complete application with line items
    const completeApplication = await prisma.applicationForPayment.findUnique({
      where: { id: application.id },
      include: {
        lineItemDetails: {
          include: {
            budgetLine: {
              select: {
                id: true,
                code: true,
                description: true
              }
            }
          }
        },
        recipient: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    console.log(`[Payment Applications] Created outbound application #${applicationNumber} for project ${projectId}`);

    res.status(201).json({
      application: completeApplication,
      calculation: calculation.summary,
      warnings: calculation.warnings
    });

  } catch (error) {
    console.error('[Payment Applications] Error creating outbound:', error);
    res.status(500).json({
      error: 'Failed to create outbound application',
      message: error.message
    });
  }
});

/**
 * PUT /api/projects/:projectId/payment-applications/:id
 * Update draft outbound application
 */
router.put('/projects/:projectId/payment-applications/:id', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const applicationId = Number(req.params.id);
    const tenantId = req.user?.tenantId;
    const {
      applicationPeriodStart,
      applicationPeriodEnd,
      valuationDate,
      lineItems,
      notes,
      status
    } = req.body;

    // Verify application exists and is draft
    const existing = await prisma.applicationForPayment.findFirst({
      where: {
        id: applicationId,
        projectId,
        tenantId,
        direction: 'OUTBOUND'
      },
      select: {
        id: true,
        status: true,
        upstreamContractId: true
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    await enforceApplicationUnlocked(req, applicationId, 'update', {
      applicationPeriodStart,
      applicationPeriodEnd,
      valuationDate,
      lineItems,
      notes,
      status,
    });

    if (existing.status !== 'DRAFT' && existing.status !== 'QUERIED') {
      return res.status(400).json({
        error: 'Can only update applications in DRAFT or QUERIED status'
      });
    }

    // Recalculate if line items provided
    let calculation;
    if (lineItems && Array.isArray(lineItems)) {
      calculation = await calculateOutboundApplication({
        tenantId,
        upstreamContractId: existing.upstreamContractId,
        projectId,
        lineItems
      });

      // Delete existing line items
      await prisma.paymentApplicationLineItem.deleteMany({
        where: {
          applicationId,
          tenantId
        }
      });

      // Create new line items
      for (const calcLine of calculation.lineItems) {
        await prisma.paymentApplicationLineItem.create({
          data: {
            tenantId,
            applicationId,
            budgetLineId: calcLine.budgetLineId,
            description: calcLine.description,
            reference: calcLine.reference,
            contractValue: toDecimal(calcLine.contractValue),
            valuePrevious: toDecimal(calcLine.previousCumulative),
            valueThisPeriod: toDecimal(calcLine.thisPeriod),
            valueCumulative: toDecimal(calcLine.cumulativeToDate)
          }
        });
      }
    }

    // Build update data
    const updateData = {};
    if (applicationPeriodStart) updateData.periodStart = new Date(applicationPeriodStart);
    if (applicationPeriodEnd) updateData.periodEnd = new Date(applicationPeriodEnd);
    if (valuationDate) updateData.valuationDate = new Date(valuationDate);
    if (notes !== undefined) updateData.contractorNotes = notes;
    if (status) updateData.status = status;

    if (calculation) {
      updateData.claimedGrossValue = toDecimal(calculation.summary.grossThisPeriod);
      updateData.claimedPreviouslyPaid = toDecimal(calculation.summary.grossPrevious);
      updateData.claimedThisPeriod = toDecimal(calculation.summary.netThisPeriod);
      updateData.grossToDate = toDecimal(calculation.summary.grossCumulative);
      updateData.retentionValue = toDecimal(calculation.summary.retentionCumulative);
      updateData.retentionHeldToDate = toDecimal(calculation.summary.retentionHeldToDate);
      updateData.netClaimed = toDecimal(calculation.summary.netThisPeriod);
      updateData.mcdAmount = toDecimal(calculation.summary.mcdCumulative);
    }

    if (status === 'SUBMITTED') {
      updateData.submittedAt = new Date();
    }

    // Update application
    const updated = await prisma.applicationForPayment.update({
      where: { id: applicationId },
      data: updateData,
      include: {
        lineItemDetails: {
          include: {
            budgetLine: {
              select: {
                id: true,
                code: true,
                description: true
              }
            }
          }
        },
        recipient: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    console.log(`[Payment Applications] Updated outbound application ${applicationId}`);

    res.json({
      application: updated,
      calculation: calculation?.summary,
      warnings: calculation?.warnings
    });

  } catch (error) {
    if (sendCommercialLock(res, error)) return;
    if (error?.status) return res.status(error.status).json({ error: error.code || 'REQUEST_FAILED', message: error.message });
    console.error('[Payment Applications] Error updating:', error);
    res.status(500).json({
      error: 'Failed to update application',
      message: error.message
    });
  }
});

module.exports = router;
