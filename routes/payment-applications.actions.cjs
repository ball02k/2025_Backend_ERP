/**
 * Payment Application Actions & Status Transitions (Task 2.6)
 *
 * Handles status transitions and actions for payment applications:
 * - Submit, mark queried, resubmit, certify, withdraw, delete
 * - Creates status history records for audit trail
 *
 * Routes:
 * - POST   /api/payment-applications/:id/submit
 * - POST   /api/payment-applications/:id/mark-queried
 * - POST   /api/payment-applications/:id/resubmit
 * - POST   /api/payment-applications/:id/mark-certified
 * - POST   /api/payment-applications/:id/withdraw
 * - DELETE /api/payment-applications/:id
 */

const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const { prisma } = require('../lib/prisma.js');
const { onPaymentApplicationStatusChange } = require('../services/cvrActualsService.cjs');

router.use(requireAuth);

/**
 * Helper function to create status history record
 */
async function createStatusHistory(tenantId, applicationId, fromStatus, toStatus, userId, notes = null, metadata = null) {
  return await prisma.paymentApplicationStatusHistory.create({
    data: {
      tenantId,
      paymentApplicationId: applicationId,
      fromStatus,
      toStatus,
      changedById: userId,
      notes,
      metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null
    }
  });
}

/**
 * POST /api/payment-applications/:id/submit
 * Submit a draft application
 */
router.post('/payment-applications/:id/submit', async (req, res) => {
  try {
    const applicationId = Number(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { submittedVia, submittedToEmail, submittedNotes } = req.body;

    // Verify application exists and is in DRAFT status
    const existing = await prisma.applicationForPayment.findFirst({
      where: {
        id: applicationId,
        tenantId
      },
      select: {
        id: true,
        status: true,
        direction: true,
        applicationNo: true
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (existing.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Can only submit applications in DRAFT status',
        currentStatus: existing.status
      });
    }

    // Update to SUBMITTED
    const updated = await prisma.applicationForPayment.update({
      where: { id: applicationId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        submittedBy: userId,
        submittedVia: submittedVia || 'PORTAL',
        submittedToEmail: submittedToEmail || null,
        submittedNotes: submittedNotes || null
      },
      include: {
        lineItemDetails: true,
        recipient: { select: { id: true, name: true } },
        upstreamContract: { select: { id: true, mainContractor: { select: { name: true } } } }
      }
    });

    // Create status history
    await createStatusHistory(
      tenantId,
      applicationId,
      'DRAFT',
      'SUBMITTED',
      userId,
      submittedNotes || 'Application submitted',
      { submittedVia, submittedToEmail }
    );

    console.log(`[Payment Applications] Application ${existing.applicationNo} submitted by user ${userId}`);

    res.json({
      application: updated,
      message: 'Application submitted successfully'
    });

  } catch (error) {
    console.error('[Payment Applications] Error submitting application:', error);
    res.status(500).json({
      error: 'Failed to submit application',
      message: error.message
    });
  }
});

/**
 * POST /api/payment-applications/:id/mark-queried
 * Mark a submitted application as queried (requires clarification)
 */
router.post('/payment-applications/:id/mark-queried', async (req, res) => {
  try {
    const applicationId = Number(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { queryDetails } = req.body;

    if (!queryDetails) {
      return res.status(400).json({
        error: 'queryDetails is required when marking as queried'
      });
    }

    // Verify application exists and is in SUBMITTED status
    const existing = await prisma.applicationForPayment.findFirst({
      where: {
        id: applicationId,
        tenantId
      },
      select: {
        id: true,
        status: true,
        applicationNo: true
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (existing.status !== 'SUBMITTED') {
      return res.status(400).json({
        error: 'Can only mark SUBMITTED applications as queried',
        currentStatus: existing.status
      });
    }

    // Update to QUERIED
    const updated = await prisma.applicationForPayment.update({
      where: { id: applicationId },
      data: {
        status: 'QUERIED',
        queriedAt: new Date(),
        queriedById: String(userId),
        queryDetails
      },
      include: {
        lineItemDetails: true,
        recipient: { select: { id: true, name: true } },
        upstreamContract: { select: { id: true, mainContractor: { select: { name: true } } } }
      }
    });

    // Create status history
    await createStatusHistory(
      tenantId,
      applicationId,
      'SUBMITTED',
      'QUERIED',
      userId,
      queryDetails
    );

    console.log(`[Payment Applications] Application ${existing.applicationNo} marked as queried by user ${userId}`);

    res.json({
      application: updated,
      message: 'Application marked as queried'
    });

  } catch (error) {
    console.error('[Payment Applications] Error marking as queried:', error);
    res.status(500).json({
      error: 'Failed to mark application as queried',
      message: error.message
    });
  }
});

/**
 * POST /api/payment-applications/:id/resubmit
 * Resubmit a queried application
 */
router.post('/payment-applications/:id/resubmit', async (req, res) => {
  try {
    const applicationId = Number(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { notes } = req.body;

    // Verify application exists and is in QUERIED status
    const existing = await prisma.applicationForPayment.findFirst({
      where: {
        id: applicationId,
        tenantId
      },
      select: {
        id: true,
        status: true,
        applicationNo: true
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (existing.status !== 'QUERIED') {
      return res.status(400).json({
        error: 'Can only resubmit applications in QUERIED status',
        currentStatus: existing.status
      });
    }

    // Update to SUBMITTED (resubmitted)
    const updated = await prisma.applicationForPayment.update({
      where: { id: applicationId },
      data: {
        status: 'SUBMITTED',
        resubmittedAt: new Date(),
        submittedAt: new Date() // Update submitted timestamp
      },
      include: {
        lineItemDetails: true,
        recipient: { select: { id: true, name: true } },
        upstreamContract: { select: { id: true, mainContractor: { select: { name: true } } } }
      }
    });

    // Create status history
    await createStatusHistory(
      tenantId,
      applicationId,
      'QUERIED',
      'SUBMITTED',
      userId,
      notes || 'Application resubmitted after query',
      { action: 'resubmit' }
    );

    console.log(`[Payment Applications] Application ${existing.applicationNo} resubmitted by user ${userId}`);

    res.json({
      application: updated,
      message: 'Application resubmitted successfully'
    });

  } catch (error) {
    console.error('[Payment Applications] Error resubmitting application:', error);
    res.status(500).json({
      error: 'Failed to resubmit application',
      message: error.message
    });
  }
});

/**
 * POST /api/payment-applications/:id/mark-certified
 * Mark a submitted application as certified
 */
router.post('/payment-applications/:id/mark-certified', async (req, res) => {
  try {
    const applicationId = Number(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { notes } = req.body;

    // Verify application exists and is in SUBMITTED status
    const existing = await prisma.applicationForPayment.findFirst({
      where: {
        id: applicationId,
        tenantId
      },
      select: {
        id: true,
        status: true,
        applicationNo: true
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (existing.status !== 'SUBMITTED') {
      return res.status(400).json({
        error: 'Can only certify applications in SUBMITTED status',
        currentStatus: existing.status
      });
    }

    // Update to CERTIFIED
    const updated = await prisma.applicationForPayment.update({
      where: { id: applicationId },
      data: {
        status: 'CERTIFIED',
        certifiedDate: new Date()
      },
      include: {
        lineItemDetails: true,
        recipient: { select: { id: true, name: true } },
        upstreamContract: { select: { id: true, mainContractor: { select: { name: true } } } }
      }
    });

    // Create status history
    await createStatusHistory(
      tenantId,
      applicationId,
      'SUBMITTED',
      'CERTIFIED',
      userId,
      notes || 'Application certified'
    );

    // Trigger CVR update (Phase A)
    try {
      await onPaymentApplicationStatusChange(applicationId);
      console.log(`[CVR Phase A] Triggered CVR update for certified PA ${applicationId}`);
    } catch (cvrError) {
      console.error(`[CVR Phase A] Failed to update CVR for PA ${applicationId}:`, cvrError);
      // Don't fail the certification if CVR update fails
    }

    console.log(`[Payment Applications] Application ${existing.applicationNo} certified by user ${userId}`);

    res.json({
      application: updated,
      message: 'Application certified successfully'
    });

  } catch (error) {
    console.error('[Payment Applications] Error certifying application:', error);
    res.status(500).json({
      error: 'Failed to certify application',
      message: error.message
    });
  }
});

/**
 * POST /api/payment-applications/:id/withdraw
 * Withdraw an application
 */
router.post('/payment-applications/:id/withdraw', async (req, res) => {
  try {
    const applicationId = Number(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { withdrawalReason } = req.body;

    if (!withdrawalReason) {
      return res.status(400).json({
        error: 'withdrawalReason is required when withdrawing an application'
      });
    }

    // Verify application exists
    const existing = await prisma.applicationForPayment.findFirst({
      where: {
        id: applicationId,
        tenantId
      },
      select: {
        id: true,
        status: true,
        applicationNo: true
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Can withdraw from DRAFT, SUBMITTED, or QUERIED status
    if (!['DRAFT', 'SUBMITTED', 'QUERIED'].includes(existing.status)) {
      return res.status(400).json({
        error: 'Can only withdraw applications in DRAFT, SUBMITTED, or QUERIED status',
        currentStatus: existing.status
      });
    }

    // Update to WITHDRAWN
    const updated = await prisma.applicationForPayment.update({
      where: { id: applicationId },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: new Date(),
        withdrawnById: String(userId),
        withdrawalReason
      },
      include: {
        lineItemDetails: true,
        recipient: { select: { id: true, name: true } },
        upstreamContract: { select: { id: true, mainContractor: { select: { name: true } } } }
      }
    });

    // Create status history
    await createStatusHistory(
      tenantId,
      applicationId,
      existing.status,
      'WITHDRAWN',
      userId,
      withdrawalReason
    );

    console.log(`[Payment Applications] Application ${existing.applicationNo} withdrawn by user ${userId}`);

    res.json({
      application: updated,
      message: 'Application withdrawn successfully'
    });

  } catch (error) {
    console.error('[Payment Applications] Error withdrawing application:', error);
    res.status(500).json({
      error: 'Failed to withdraw application',
      message: error.message
    });
  }
});

/**
 * DELETE /api/payment-applications/:id
 * Delete a draft application
 */
router.delete('/payment-applications/:id', async (req, res) => {
  try {
    const applicationId = Number(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    // Verify application exists and is in DRAFT status
    const existing = await prisma.applicationForPayment.findFirst({
      where: {
        id: applicationId,
        tenantId
      },
      select: {
        id: true,
        status: true,
        applicationNo: true
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (existing.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Can only delete applications in DRAFT status. Use withdraw for submitted applications.',
        currentStatus: existing.status
      });
    }

    // Delete the application (cascade will delete line items and status history)
    await prisma.applicationForPayment.delete({
      where: { id: applicationId }
    });

    console.log(`[Payment Applications] Draft application ${existing.applicationNo} deleted by user ${userId}`);

    res.json({
      message: 'Application deleted successfully',
      applicationNo: existing.applicationNo
    });

  } catch (error) {
    console.error('[Payment Applications] Error deleting application:', error);
    res.status(500).json({
      error: 'Failed to delete application',
      message: error.message
    });
  }
});

/**
 * GET /api/payment-applications/:id/export-csv
 * Export a single payment application as CSV
 */
router.get('/payment-applications/:id/export-csv', async (req, res) => {
  try {
    const applicationId = Number(req.params.id);
    const tenantId = req.user?.tenantId;

    // Fetch application with all details
    const application = await prisma.applicationForPayment.findFirst({
      where: {
        id: applicationId,
        tenantId
      },
      include: {
        lineItemDetails: {
          include: {
            budgetLine: {
              select: {
                code: true,
                description: true
              }
            }
          },
          orderBy: {
            id: 'asc'
          }
        },
        recipient: {
          select: {
            name: true
          }
        },
        upstreamContract: {
          select: {
            mainContractor: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Build CSV content
    const recipientName = application.direction === 'OUTBOUND'
      ? (application.upstreamContract?.mainContractor?.name || application.recipient?.name || 'N/A')
      : (application.recipient?.name || 'N/A');

    let csv = 'Payment Application Export\n\n';
    csv += `Application No:,${application.applicationNo}\n`;
    csv += `Direction:,${application.direction}\n`;
    csv += `Status:,${application.status}\n`;
    csv += `${application.direction === 'OUTBOUND' ? 'Recipient' : 'Supplier'}:,${recipientName}\n`;
    csv += `Application Date:,${application.applicationDate ? new Date(application.applicationDate).toLocaleDateString() : 'N/A'}\n`;
    csv += `Valuation Date:,${application.valuationDate ? new Date(application.valuationDate).toLocaleDateString() : 'N/A'}\n`;
    csv += `Due Date:,${application.dueDate ? new Date(application.dueDate).toLocaleDateString() : 'N/A'}\n`;
    csv += '\n';

    // Summary section
    csv += 'Summary\n';
    csv += `Gross Value:,£${Number(application.claimedGrossValue || 0).toFixed(2)}\n`;
    csv += `Previously Paid:,£${Number(application.claimedPreviouslyPaid || 0).toFixed(2)}\n`;
    csv += `Retention (${Number(application.retentionPercentage || 0)}%):,£${Number(application.retentionValue || 0).toFixed(2)}\n`;

    if (application.mcdAmount && Number(application.mcdAmount) > 0) {
      csv += `Main Contractor Discount (${Number(application.mcdPercentage || 0)}%):,£${Number(application.mcdAmount).toFixed(2)}\n`;
    }

    csv += `Net This Period:,£${Number(application.claimedThisPeriod || 0).toFixed(2)}\n`;
    csv += '\n';

    // Line items section
    if (application.lineItemDetails && application.lineItemDetails.length > 0) {
      csv += 'Line Items\n';
      csv += 'Reference,Description,Contract Value,Previous,This Period,Cumulative\n';

      for (const line of application.lineItemDetails) {
        const reference = line.budgetLine?.code || line.reference || 'N/A';
        const description = (line.budgetLine?.description || line.description || '').replace(/,/g, ';');
        const contractValue = Number(line.contractValue || 0).toFixed(2);
        const previous = Number(line.valuePrevious || 0).toFixed(2);
        const thisPeriod = Number(line.valueThisPeriod || 0).toFixed(2);
        const cumulative = Number(line.valueCumulative || 0).toFixed(2);

        csv += `${reference},"${description}",£${contractValue},£${previous},£${thisPeriod},£${cumulative}\n`;
      }
    }

    // Set headers for CSV download
    const filename = `payment-application-${application.applicationNo.replace(/\//g, '-')}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

    console.log(`[Payment Applications] Exported ${application.applicationNo} to CSV`);

  } catch (error) {
    console.error('[Payment Applications] Error exporting to CSV:', error);
    res.status(500).json({
      error: 'Failed to export application to CSV',
      message: error.message
    });
  }
});

/**
 * GET /api/payment-applications/:id/history
 * Get status history for an application
 */
router.get('/payment-applications/:id/history', async (req, res) => {
  try {
    const applicationId = Number(req.params.id);
    const tenantId = req.user?.tenantId;

    // Verify application exists
    const application = await prisma.applicationForPayment.findFirst({
      where: {
        id: applicationId,
        tenantId
      },
      select: {
        id: true,
        applicationNo: true
      }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Get status history
    const history = await prisma.paymentApplicationStatusHistory.findMany({
      where: {
        paymentApplicationId: applicationId,
        tenantId
      },
      include: {
        changedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        changedAt: 'desc'
      }
    });

    res.json({
      applicationNo: application.applicationNo,
      history
    });

  } catch (error) {
    console.error('[Payment Applications] Error fetching history:', error);
    res.status(500).json({
      error: 'Failed to fetch application history',
      message: error.message
    });
  }
});

module.exports = router;
