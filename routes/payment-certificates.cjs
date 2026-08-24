/**
 * Payment Certificates API Routes (Task 3.1)
 *
 * Certificates received from Main Contractor in response to OUTBOUND applications
 *
 * Routes:
 * - GET    /api/projects/:projectId/payment-certificates
 * - GET    /api/projects/:projectId/payment-certificates/outstanding
 * - GET    /api/projects/:projectId/payment-certificates/:id
 * - POST   /api/projects/:projectId/payment-certificates
 * - PUT    /api/projects/:projectId/payment-certificates/:id
 * - DELETE /api/projects/:projectId/payment-certificates/:id
 * - POST   /api/projects/:projectId/payment-certificates/:id/dispute
 * - POST   /api/projects/:projectId/payment-certificates/:id/accept
 */

const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const { prisma, toDecimal } = require('../lib/prisma.js');
const {
  calculateVariance,
  calculatePaymentDueDate,
  calculateCumulatives,
  prepopulateFromApplication,
  calculateNetCertified,
  getOutstandingCertificates
} = require('../services/certificateService.cjs');
const {
  evaluatePaymentCertificateLock,
  assertCommercialUnlocked,
  sendCommercialLock,
} = require('../services/commercialLockService.cjs');

router.use(requireAuth);

async function enforceCertificateUnlocked(req, certificateId, action, proposedChanges = {}) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    const err = new Error('Tenant context is required for payment certificate changes');
    err.status = 403;
    err.code = 'TENANT_REQUIRED';
    throw err;
  }
  const decision = await evaluatePaymentCertificateLock({
    prisma,
    tenantId,
    certificateId,
    action,
    proposedChanges,
  });
  return assertCommercialUnlocked(decision);
}

/**
 * GET /api/projects/:projectId/payment-certificates
 * List all certificates for project
 */
router.get('/projects/:projectId/payment-certificates', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId;
    const { status, fromDate, toDate, direction } = req.query;

    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    // Build where clause
    const where = {
      projectId,
      tenantId
    };

    if (status) {
      where.paymentStatus = status;
    }

    if (fromDate || toDate) {
      where.certificateDate = {};
      if (fromDate) where.certificateDate.gte = new Date(fromDate);
      if (toDate) where.certificateDate.lte = new Date(toDate);
    }

    // Direction filtering - INBOUND (received from MC) or OUTBOUND (issued to subs)
    if (direction) {
      where.direction = direction;
    }

    // Fetch certificates
    const certificates = await prisma.paymentCertificate.findMany({
      where,
      include: {
        paymentApplication: {
          select: {
            id: true,
            applicationNumber: true,
            applicationNo: true,
            claimedGrossValue: true
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
      },
      orderBy: {
        certificateNumber: 'desc'
      }
    });

    // Calculate summary
    const summary = {
      totalCertified: 0,
      totalPaid: 0,
      totalAwaiting: 0,
      totalRetentionHeld: 0
    };

    for (const cert of certificates) {
      summary.totalCertified += Number(cert.certifiedGross || 0);
      summary.totalRetentionHeld += Number(cert.retentionAmount || 0);

      if (cert.paymentStatus === 'PAID') {
        summary.totalPaid += Number(cert.netCertified || 0);
      } else if (['AWAITING', 'OVERDUE', 'PARTIAL'].includes(cert.paymentStatus)) {
        summary.totalAwaiting += Number(cert.netCertified || 0);
      }
    }

    // Format response
    const data = certificates.map(cert => ({
      id: cert.id,
      certificateNumber: cert.certificateNumber,
      certificateRef: cert.certificateRef,
      certificateDate: cert.certificateDate,
      certifiedGross: Number(cert.certifiedGross),
      netCertified: Number(cert.netCertified),
      varianceAmount: cert.varianceAmount ? Number(cert.varianceAmount) : null,
      variancePercentage: cert.variancePercentage ? Number(cert.variancePercentage) : null,
      paymentDueDate: cert.paymentDueDate,
      paymentStatus: cert.paymentStatus,
      status: cert.status,
      direction: cert.direction, // Include direction in response
      linkedApplication: cert.paymentApplication ? {
        id: cert.paymentApplication.id,
        applicationNumber: cert.paymentApplication.applicationNumber,
        applicationNo: cert.paymentApplication.applicationNo,
        grossAmount: Number(cert.paymentApplication.claimedGrossValue || 0)
      } : null,
      mainContractorName: cert.upstreamContract?.mainContractor?.name || null
    }));

    res.json({
      data,
      summary: {
        totalCertified: Math.round(summary.totalCertified * 100) / 100,
        totalPaid: Math.round(summary.totalPaid * 100) / 100,
        totalAwaiting: Math.round(summary.totalAwaiting * 100) / 100,
        totalRetentionHeld: Math.round(summary.totalRetentionHeld * 100) / 100
      }
    });

  } catch (error) {
    console.error('[Payment Certificates] Error listing certificates:', error);
    res.status(500).json({
      error: 'Failed to list certificates',
      message: error.message
    });
  }
});

/**
 * GET /api/projects/:projectId/payment-certificates/outstanding
 * Get certificates awaiting payment
 */
router.get('/projects/:projectId/payment-certificates/outstanding', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId;

    const result = await getOutstandingCertificates(projectId, tenantId);
    res.json(result);

  } catch (error) {
    console.error('[Payment Certificates] Error getting outstanding:', error);
    res.status(500).json({
      error: 'Failed to get outstanding certificates',
      message: error.message
    });
  }
});

/**
 * GET /api/projects/:projectId/payment-certificates/:id
 * Get single certificate with full details
 */
router.get('/projects/:projectId/payment-certificates/:id', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const certificateId = req.params.id;
    const tenantId = req.user?.tenantId;

    const certificate = await prisma.paymentCertificate.findFirst({
      where: {
        id: certificateId,
        projectId,
        tenantId
      },
      include: {
        paymentApplication: {
          select: {
            id: true,
            applicationNumber: true,
            applicationNo: true,
            claimedGrossValue: true,
            applicationDate: true
          }
        },
        upstreamContract: {
          select: {
            id: true,
            mainContractor: {
              select: {
                id: true,
                name: true
              }
            },
            paymentTermsDays: true
          }
        },
        payments: {
          orderBy: {
            paymentDate: 'desc'
          },
          select: {
            id: true,
            paymentDate: true,
            paymentAmount: true,
            paymentReference: true,
            paymentMethod: true,
            notes: true
          }
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    res.json(certificate);

  } catch (error) {
    console.error('[Payment Certificates] Error getting certificate:', error);
    res.status(500).json({
      error: 'Failed to get certificate',
      message: error.message
    });
  }
});

/**
 * POST /api/projects/:projectId/payment-certificates
 * Create new certificate
 */
router.post('/projects/:projectId/payment-certificates', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    const {
      paymentApplicationId,
      certificateNumber,
      certificateRef,
      certificateDate,
      certifiedGross,
      retentionPercentage,
      retentionAmount,
      mcdPercentage,
      mcdAmount,
      cisRate,
      cisAmount,
      otherDeductions,
      otherDeductionsDesc,
      varianceNotes,
      certificateDocumentUrl,
      upstreamContractId
    } = req.body;

    if (!certificateNumber || !certificateDate || !certifiedGross || !upstreamContractId) {
      return res.status(400).json({
        error: 'certificateNumber, certificateDate, certifiedGross, and upstreamContractId are required'
      });
    }

    // Verify project and upstream contract
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const upstreamContract = await prisma.upstreamContract.findFirst({
      where: {
        id: upstreamContractId,
        tenantId,
        projectId
      }
    });

    if (!upstreamContract) {
      return res.status(404).json({ error: 'Upstream contract not found' });
    }

    const suppliedCertificateNumber = String(certificateNumber).trim();
    const parsedCertificateNumber = Number(suppliedCertificateNumber);
    const hasNumericCertificateNumber = Number.isInteger(parsedCertificateNumber) && parsedCertificateNumber > 0;
    let normalizedCertificateNumber = hasNumericCertificateNumber ? parsedCertificateNumber : null;
    const normalizedCertificateRef = certificateRef || (!hasNumericCertificateNumber ? suppliedCertificateNumber : null);

    if (!normalizedCertificateNumber) {
      const nextNumber = await prisma.paymentCertificate.aggregate({
        where: { tenantId, projectId, upstreamContractId },
        _max: { certificateNumber: true },
      });
      normalizedCertificateNumber = Number(nextNumber._max.certificateNumber || 0) + 1;
    }

    // Get application if linked
    let appliedGross = null;
    if (paymentApplicationId) {
      const app = await prisma.applicationForPayment.findFirst({
        where: {
          id: paymentApplicationId,
          tenantId
        },
        select: {
          claimedGrossValue: true
        }
      });

      if (app) {
        appliedGross = Number(app.claimedGrossValue || 0);
      }
    }

    // Calculate variance
    let variance = { varianceAmount: null, variancePercentage: null };
    if (appliedGross) {
      variance = calculateVariance(certifiedGross, appliedGross);
    }

    // Calculate net certified
    const netCertified = calculateNetCertified(
      certifiedGross,
      retentionAmount || 0,
      mcdAmount || 0,
      cisAmount || 0,
      otherDeductions || 0
    );

    // Calculate payment due date
    const paymentDueDate = calculatePaymentDueDate(upstreamContract, certificateDate);

    // Calculate cumulatives
    const cumulatives = await calculateCumulatives(
      projectId,
      upstreamContractId,
      tenantId,
      normalizedCertificateNumber
    );

    // Create certificate
    const certificate = await prisma.paymentCertificate.create({
      data: {
        tenantId,
        projectId,
        upstreamContractId,
        paymentApplicationId: paymentApplicationId || null,

        certificateNumber: normalizedCertificateNumber,
        certificateRef: normalizedCertificateRef || null,
        certificateDate: new Date(certificateDate),

        certifiedGross: toDecimal(certifiedGross),
        retentionPercentage: retentionPercentage ? toDecimal(retentionPercentage) : null,
        retentionAmount: toDecimal(retentionAmount || 0),
        mcdPercentage: mcdPercentage ? toDecimal(mcdPercentage) : null,
        mcdAmount: toDecimal(mcdAmount || 0),
        cisRate: cisRate ? toDecimal(cisRate) : null,
        cisAmount: toDecimal(cisAmount || 0),
        otherDeductions: toDecimal(otherDeductions || 0),
        otherDeductionsDesc: otherDeductionsDesc || null,

        netCertified: toDecimal(netCertified),

        cumulativeGross: toDecimal(cumulatives.cumulativeGross),
        cumulativeRetention: toDecimal(cumulatives.cumulativeRetention),
        cumulativeNetCertified: toDecimal(cumulatives.cumulativeNetCertified),

        appliedGross: appliedGross ? toDecimal(appliedGross) : null,
        varianceAmount: variance.varianceAmount ? toDecimal(variance.varianceAmount) : null,
        variancePercentage: variance.variancePercentage ? toDecimal(variance.variancePercentage) : null,
        varianceNotes: varianceNotes || null,

        paymentDueDate,
        paymentStatus: 'AWAITING',

        certificateDocumentUrl: certificateDocumentUrl || null,

        status: 'RECEIVED',

        createdById: userId
      },
      include: {
        paymentApplication: {
          select: {
            id: true,
            applicationNumber: true,
            applicationNo: true
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

    // If linked to application, update application status
    if (paymentApplicationId) {
      await prisma.applicationForPayment.update({
        where: { id: paymentApplicationId },
        data: {
          status: 'CERTIFIED',
          certifiedDate: new Date()
        }
      });

      // Create status history
      await prisma.paymentApplicationStatusHistory.create({
        data: {
          tenantId,
          paymentApplicationId,
          fromStatus: 'SUBMITTED',
          toStatus: 'CERTIFIED',
          changedById: userId,
          notes: `Certificate #${normalizedCertificateRef || normalizedCertificateNumber} received`,
          metadata: { certificateId: certificate.id }
        }
      });
    }

    console.log(`[Payment Certificates] Created certificate #${normalizedCertificateRef || normalizedCertificateNumber} for project ${projectId}`);

    res.status(201).json(certificate);

  } catch (error) {
    console.error('[Payment Certificates] Error creating certificate:', error);
    res.status(500).json({
      error: 'Failed to create certificate',
      message: error.message
    });
  }
});

/**
 * PUT /api/projects/:projectId/payment-certificates/:id
 * Update certificate
 */
router.put('/projects/:projectId/payment-certificates/:id', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const certificateId = req.params.id;
    const tenantId = req.user?.tenantId;

    const {
      certificateRef,
      certificateDate,
      certifiedGross,
      retentionPercentage,
      retentionAmount,
      mcdPercentage,
      mcdAmount,
      cisRate,
      cisAmount,
      otherDeductions,
      otherDeductionsDesc,
      varianceNotes,
      certificateDocumentUrl
    } = req.body;

    // Verify certificate exists
    const existing = await prisma.paymentCertificate.findFirst({
      where: {
        id: certificateId,
        projectId,
        tenantId
      },
      select: {
        id: true,
        appliedGross: true,
        upstreamContractId: true,
        certificateNumber: true
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    await enforceCertificateUnlocked(req, certificateId, 'update', req.body || {});

    // Build update data
    const updateData = {};

    if (certificateRef !== undefined) updateData.certificateRef = certificateRef;
    if (certificateDate) updateData.certificateDate = new Date(certificateDate);
    if (certifiedGross !== undefined) updateData.certifiedGross = toDecimal(certifiedGross);
    if (retentionPercentage !== undefined) updateData.retentionPercentage = toDecimal(retentionPercentage);
    if (retentionAmount !== undefined) updateData.retentionAmount = toDecimal(retentionAmount);
    if (mcdPercentage !== undefined) updateData.mcdPercentage = toDecimal(mcdPercentage);
    if (mcdAmount !== undefined) updateData.mcdAmount = toDecimal(mcdAmount);
    if (cisRate !== undefined) updateData.cisRate = toDecimal(cisRate);
    if (cisAmount !== undefined) updateData.cisAmount = toDecimal(cisAmount);
    if (otherDeductions !== undefined) updateData.otherDeductions = toDecimal(otherDeductions);
    if (otherDeductionsDesc !== undefined) updateData.otherDeductionsDesc = otherDeductionsDesc;
    if (varianceNotes !== undefined) updateData.varianceNotes = varianceNotes;
    if (certificateDocumentUrl !== undefined) updateData.certificateDocumentUrl = certificateDocumentUrl;

    // Recalculate derived fields if amounts changed
    if (certifiedGross !== undefined || retentionAmount !== undefined ||
        mcdAmount !== undefined || cisAmount !== undefined || otherDeductions !== undefined) {

      const newCertifiedGross = certifiedGross !== undefined ? certifiedGross : existing.certifiedGross;
      const newRetentionAmount = retentionAmount !== undefined ? retentionAmount : existing.retentionAmount;
      const newMcdAmount = mcdAmount !== undefined ? mcdAmount : existing.mcdAmount;
      const newCisAmount = cisAmount !== undefined ? cisAmount : existing.cisAmount;
      const newOtherDeductions = otherDeductions !== undefined ? otherDeductions : existing.otherDeductions;

      updateData.netCertified = toDecimal(
        calculateNetCertified(newCertifiedGross, newRetentionAmount, newMcdAmount, newCisAmount, newOtherDeductions)
      );

      // Recalculate variance if we have appliedGross
      if (existing.appliedGross && certifiedGross !== undefined) {
        const variance = calculateVariance(certifiedGross, Number(existing.appliedGross));
        updateData.varianceAmount = toDecimal(variance.varianceAmount);
        updateData.variancePercentage = toDecimal(variance.variancePercentage);
      }

      // Recalculate cumulatives
      const cumulatives = await calculateCumulatives(
        projectId,
        existing.upstreamContractId,
        tenantId,
        existing.certificateNumber
      );

      updateData.cumulativeGross = toDecimal(cumulatives.cumulativeGross);
      updateData.cumulativeRetention = toDecimal(cumulatives.cumulativeRetention);
      updateData.cumulativeNetCertified = toDecimal(cumulatives.cumulativeNetCertified);
    }

    // Update certificate
    const updated = await prisma.paymentCertificate.update({
      where: { id: certificateId },
      data: updateData,
      include: {
        paymentApplication: {
          select: {
            id: true,
            applicationNumber: true,
            applicationNo: true
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

    console.log(`[Payment Certificates] Updated certificate ${certificateId}`);

    res.json(updated);

  } catch (error) {
    if (sendCommercialLock(res, error)) return;
    if (error?.status) return res.status(error.status).json({ error: error.code || 'REQUEST_FAILED', message: error.message });
    console.error('[Payment Certificates] Error updating certificate:', error);
    res.status(500).json({
      error: 'Failed to update certificate',
      message: error.message
    });
  }
});

/**
 * DELETE /api/projects/:projectId/payment-certificates/:id
 * Delete certificate (only if no payments recorded)
 */
router.delete('/projects/:projectId/payment-certificates/:id', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const certificateId = req.params.id;
    const tenantId = req.user?.tenantId;

    // Verify certificate exists
    const existing = await prisma.paymentCertificate.findFirst({
      where: {
        id: certificateId,
        projectId,
        tenantId
      },
      include: {
        payments: true
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    await enforceCertificateUnlocked(req, certificateId, 'delete', {});

    // Check if payments recorded
    if (existing.payments && existing.payments.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete certificate with recorded payments'
      });
    }

    // Delete certificate
    await prisma.paymentCertificate.delete({
      where: { id: certificateId }
    });

    console.log(`[Payment Certificates] Deleted certificate ${certificateId}`);

    res.json({
      message: 'Certificate deleted successfully',
      certificateNumber: existing.certificateNumber
    });

  } catch (error) {
    if (sendCommercialLock(res, error)) return;
    if (error?.status) return res.status(error.status).json({ error: error.code || 'REQUEST_FAILED', message: error.message });
    console.error('[Payment Certificates] Error deleting certificate:', error);
    res.status(500).json({
      error: 'Failed to delete certificate',
      message: error.message
    });
  }
});

/**
 * POST /api/projects/:projectId/payment-certificates/:id/dispute
 * Mark certificate as disputed
 */
router.post('/projects/:projectId/payment-certificates/:id/dispute', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const certificateId = req.params.id;
    const tenantId = req.user?.tenantId;
    const { disputeNotes } = req.body;

    if (!disputeNotes) {
      return res.status(400).json({
        error: 'disputeNotes is required when disputing a certificate'
      });
    }

    const updated = await prisma.paymentCertificate.update({
      where: {
        id: certificateId,
        tenantId,
        projectId
      },
      data: {
        status: 'DISPUTED',
        paymentStatus: 'DISPUTED',
        disputeNotes
      }
    });

    console.log(`[Payment Certificates] Certificate ${certificateId} marked as disputed`);

    res.json(updated);

  } catch (error) {
    console.error('[Payment Certificates] Error disputing certificate:', error);
    res.status(500).json({
      error: 'Failed to dispute certificate',
      message: error.message
    });
  }
});

/**
 * POST /api/projects/:projectId/payment-certificates/:id/accept
 * Accept certificate (clear dispute)
 */
router.post('/projects/:projectId/payment-certificates/:id/accept', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const certificateId = req.params.id;
    const tenantId = req.user?.tenantId;

    const updated = await prisma.paymentCertificate.update({
      where: {
        id: certificateId,
        tenantId,
        projectId
      },
      data: {
        status: 'ACCEPTED',
        paymentStatus: 'AWAITING'
      }
    });

    console.log(`[Payment Certificates] Certificate ${certificateId} accepted`);

    res.json(updated);

  } catch (error) {
    console.error('[Payment Certificates] Error accepting certificate:', error);
    res.status(500).json({
      error: 'Failed to accept certificate',
      message: error.message
    });
  }
});

/**
 * POST /api/projects/:projectId/payment-certificates/:id/prepopulate
 * Get prepopulated certificate data from application
 */
router.post('/projects/:projectId/payment-certificates/prepopulate', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { paymentApplicationId } = req.body;

    if (!paymentApplicationId) {
      return res.status(400).json({ error: 'paymentApplicationId is required' });
    }

    const prepopulated = await prepopulateFromApplication(paymentApplicationId, tenantId);
    res.json(prepopulated);

  } catch (error) {
    console.error('[Payment Certificates] Error prepopulating:', error);
    res.status(500).json({
      error: 'Failed to prepopulate certificate',
      message: error.message
    });
  }
});

// ============================================================================
// PAYMENT TRACKING ENDPOINTS (Task 3.3)
// ============================================================================

const {
  recordPayment,
  deletePayment,
  updatePayment,
  allocatePayment,
  getOutstandingPayments
} = require('../services/paymentService.cjs');

/**
 * GET /api/projects/:projectId/payment-certificates/:certId/payments
 * List all payments for a certificate
 */
router.get('/projects/:projectId/payment-certificates/:certId/payments', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const certificateId = req.params.certId;
    const tenantId = req.user?.tenantId;

    // Verify certificate exists and belongs to project
    const certificate = await prisma.paymentCertificate.findFirst({
      where: {
        id: certificateId,
        projectId,
        tenantId
      },
      select: {
        id: true,
        certificateNumber: true,
        netCertified: true,
        totalPaid: true,
        totalOutstanding: true
      }
    });

    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    // Get payments
    const payments = await prisma.certificatePayment.findMany({
      where: {
        paymentCertificateId: certificateId,
        tenantId
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        paymentDate: 'desc'
      }
    });

    // Format response
    const data = payments.map(p => ({
      id: p.id,
      paymentDate: p.paymentDate,
      paymentAmount: Number(p.paymentAmount),
      paymentReference: p.paymentReference,
      paymentMethod: p.paymentMethod,
      bankAccountId: p.bankAccountId,
      bankTransactionRef: p.bankTransactionRef,
      isPartialPayment: p.isPartialPayment,
      remittanceDocumentUrl: p.remittanceDocumentUrl,
      notes: p.notes,
      createdAt: p.createdAt,
      createdBy: p.createdBy ? {
        id: p.createdBy.id,
        name: p.createdBy.name,
        email: p.createdBy.email
      } : null
    }));

    res.json({
      certificate: {
        id: certificate.id,
        certificateNumber: certificate.certificateNumber,
        netCertified: Number(certificate.netCertified),
        totalPaid: Number(certificate.totalPaid || 0),
        totalOutstanding: Number(certificate.totalOutstanding || 0)
      },
      payments: data
    });

  } catch (error) {
    console.error('[Payment Tracking] Error listing payments:', error);
    res.status(500).json({
      error: 'Failed to list payments',
      message: error.message
    });
  }
});

/**
 * POST /api/projects/:projectId/payment-certificates/:certId/payments
 * Record a payment against a certificate
 */
router.post('/projects/:projectId/payment-certificates/:certId/payments', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const certificateId = req.params.certId;
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    const {
      paymentDate,
      paymentAmount,
      paymentReference,
      paymentMethod,
      bankAccountId,
      bankTransactionRef,
      remittanceDocumentUrl,
      notes
    } = req.body;

    // Validate required fields
    if (!paymentDate || !paymentAmount) {
      return res.status(400).json({
        error: 'paymentDate and paymentAmount are required'
      });
    }

    if (paymentAmount <= 0) {
      return res.status(400).json({
        error: 'paymentAmount must be greater than zero'
      });
    }

    // Verify certificate exists and belongs to project
    const certificate = await prisma.paymentCertificate.findFirst({
      where: {
        id: certificateId,
        projectId,
        tenantId
      },
      select: {
        id: true,
        certificateNumber: true
      }
    });

    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    // Record payment
    const result = await recordPayment(
      certificateId,
      {
        paymentDate,
        paymentAmount,
        paymentReference,
        paymentMethod,
        bankAccountId,
        bankTransactionRef,
        remittanceDocumentUrl,
        notes
      },
      tenantId,
      userId
    );

    console.log(`[Payment Tracking] Recorded payment of £${paymentAmount} for certificate #${certificate.certificateNumber}`);

    res.status(201).json({
      payment: {
        id: result.payment.id,
        paymentDate: result.payment.paymentDate,
        paymentAmount: Number(result.payment.paymentAmount),
        paymentReference: result.payment.paymentReference,
        paymentMethod: result.payment.paymentMethod,
        isPartialPayment: result.payment.isPartialPayment,
        notes: result.payment.notes
      },
      certificate: {
        id: result.certificate.id,
        totalPaid: Number(result.certificate.totalPaid),
        totalOutstanding: Number(result.certificate.totalOutstanding),
        paymentStatus: result.certificate.paymentStatus
      },
      applicationUpdated: result.applicationUpdated
    });

  } catch (error) {
    console.error('[Payment Tracking] Error recording payment:', error);
    res.status(500).json({
      error: 'Failed to record payment',
      message: error.message
    });
  }
});

/**
 * PUT /api/projects/:projectId/payments/:paymentId
 * Update a payment record
 */
router.put('/projects/:projectId/payments/:paymentId', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const paymentId = req.params.paymentId;
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    const {
      paymentDate,
      paymentAmount,
      paymentReference,
      paymentMethod,
      bankAccountId,
      bankTransactionRef,
      remittanceDocumentUrl,
      notes
    } = req.body;

    // Verify payment exists and belongs to tenant
    const existing = await prisma.certificatePayment.findFirst({
      where: {
        id: paymentId,
        tenantId
      },
      include: {
        paymentCertificate: {
          select: {
            projectId: true
          }
        }
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (existing.paymentCertificate.projectId !== projectId) {
      return res.status(403).json({ error: 'Payment does not belong to this project' });
    }

    // Validate amount if changing
    if (paymentAmount !== undefined && paymentAmount <= 0) {
      return res.status(400).json({
        error: 'paymentAmount must be greater than zero'
      });
    }

    // Update payment
    const updated = await updatePayment(
      paymentId,
      {
        paymentDate,
        paymentAmount,
        paymentReference,
        paymentMethod,
        bankAccountId,
        bankTransactionRef,
        remittanceDocumentUrl,
        notes
      },
      tenantId,
      userId
    );

    console.log(`[Payment Tracking] Updated payment ${paymentId}`);

    res.json({
      id: updated.id,
      paymentDate: updated.paymentDate,
      paymentAmount: Number(updated.paymentAmount),
      paymentReference: updated.paymentReference,
      paymentMethod: updated.paymentMethod,
      bankAccountId: updated.bankAccountId,
      bankTransactionRef: updated.bankTransactionRef,
      isPartialPayment: updated.isPartialPayment,
      remittanceDocumentUrl: updated.remittanceDocumentUrl,
      notes: updated.notes,
      updatedAt: updated.updatedAt
    });

  } catch (error) {
    console.error('[Payment Tracking] Error updating payment:', error);
    res.status(500).json({
      error: 'Failed to update payment',
      message: error.message
    });
  }
});

/**
 * DELETE /api/projects/:projectId/payments/:paymentId
 * Delete a payment and recalculate certificate status
 */
router.delete('/projects/:projectId/payments/:paymentId', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const paymentId = req.params.paymentId;
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    // Verify payment exists and belongs to tenant
    const existing = await prisma.certificatePayment.findFirst({
      where: {
        id: paymentId,
        tenantId
      },
      include: {
        paymentCertificate: {
          select: {
            projectId: true,
            certificateNumber: true
          }
        }
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (existing.paymentCertificate.projectId !== projectId) {
      return res.status(403).json({ error: 'Payment does not belong to this project' });
    }

    // Delete payment
    const result = await deletePayment(paymentId, tenantId, userId);

    console.log(`[Payment Tracking] Deleted payment ${paymentId} for certificate #${existing.paymentCertificate.certificateNumber}`);

    res.json({
      message: 'Payment deleted successfully',
      certificateId: result.certificateId,
      newPaymentStatus: result.newStatus
    });

  } catch (error) {
    console.error('[Payment Tracking] Error deleting payment:', error);
    res.status(500).json({
      error: 'Failed to delete payment',
      message: error.message
    });
  }
});

/**
 * GET /api/projects/:projectId/payments/outstanding
 * Get all outstanding payments across the project
 */
router.get('/projects/:projectId/payments/outstanding', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId;

    // Verify project exists
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true, name: true }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get outstanding payments summary
    const result = await getOutstandingPayments(projectId, tenantId);

    console.log(`[Payment Tracking] Retrieved outstanding payments for project ${projectId}`);

    res.json(result);

  } catch (error) {
    console.error('[Payment Tracking] Error getting outstanding payments:', error);
    res.status(500).json({
      error: 'Failed to get outstanding payments',
      message: error.message
    });
  }
});

/**
 * POST /api/projects/:projectId/payments/allocate
 * Allocate a single payment across multiple certificates
 */
router.post('/projects/:projectId/payments/allocate', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    const {
      paymentDate,
      totalAmount,
      paymentReference,
      paymentMethod,
      allocations,
      notes
    } = req.body;

    // Validate required fields
    if (!paymentDate || !totalAmount || !allocations || !Array.isArray(allocations)) {
      return res.status(400).json({
        error: 'paymentDate, totalAmount, and allocations array are required'
      });
    }

    if (totalAmount <= 0) {
      return res.status(400).json({
        error: 'totalAmount must be greater than zero'
      });
    }

    if (allocations.length === 0) {
      return res.status(400).json({
        error: 'At least one allocation is required'
      });
    }

    // Validate each allocation
    for (const alloc of allocations) {
      if (!alloc.certificateId || !alloc.amount) {
        return res.status(400).json({
          error: 'Each allocation must have certificateId and amount'
        });
      }

      if (alloc.amount <= 0) {
        return res.status(400).json({
          error: 'Allocation amounts must be greater than zero'
        });
      }

      // Verify certificate exists and belongs to project
      const cert = await prisma.paymentCertificate.findFirst({
        where: {
          id: alloc.certificateId,
          projectId,
          tenantId
        },
        select: { id: true }
      });

      if (!cert) {
        return res.status(404).json({
          error: `Certificate ${alloc.certificateId} not found in this project`
        });
      }
    }

    // Allocate payment
    const result = await allocatePayment(
      {
        paymentDate,
        totalAmount,
        paymentReference,
        paymentMethod,
        allocations,
        notes
      },
      tenantId,
      userId
    );

    console.log(`[Payment Tracking] Allocated payment of £${totalAmount} across ${result.certificatesUpdated} certificates`);

    res.status(201).json({
      payments: result.payments.map(p => ({
        id: p.id,
        paymentCertificateId: p.paymentCertificateId,
        paymentDate: p.paymentDate,
        paymentAmount: Number(p.paymentAmount),
        paymentReference: p.paymentReference
      })),
      totalAmount: result.totalAmount,
      certificatesUpdated: result.certificatesUpdated
    });

  } catch (error) {
    console.error('[Payment Tracking] Error allocating payment:', error);
    res.status(500).json({
      error: 'Failed to allocate payment',
      message: error.message
    });
  }
});

module.exports = router;
