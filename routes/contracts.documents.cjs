/**
 * Contract Document Upload Routes
 *
 * Handles uploading draft and signed contract documents
 * - Draft documents: stored for reference
 * - Signed documents: stored + OCR processing triggered
 */

const router = require('express').Router();
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');
const { processContractOcr } = require('../services/contractOcr.cjs');
const { storageService } = require('../services/storage.factory.cjs');
const cvrService = require('../services/cvr.cjs');
const poGeneration = require('../services/poGeneration.cjs');
const multer = require('multer');

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

/**
 * POST /contracts/:id/documents/upload-draft
 * Upload draft contract document
 */
router.post('/contracts/:id/documents/upload-draft', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const contractId = Number(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    if (!contractId || !tenantId) {
      return res.status(400).json({ error: 'BAD_REQUEST' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'NO_FILE_UPLOADED' });
    }

    // Verify contract exists and user has access
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });

    if (!contract) {
      return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
    }

    // Generate filename
    const timestamp = Date.now();
    const filename = `contract-${contractId}-draft-${timestamp}.pdf`;

    // Upload to storage
    const uploadResult = await storageService.uploadFile(req.file, filename);

    // Update contract with draft document info
    const updated = await prisma.contract.update({
      where: { id: contractId },
      data: {
        documentSource: 'UPLOADED_DRAFT',
        draftDocumentUrl: uploadResult.url,
        draftDocumentName: req.file.originalname,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        entity: 'Contract',
        entityId: String(contractId),
        action: 'upload_draft_document',
        changes: {
          filename: req.file.originalname,
          size: req.file.size,
          url: uploadResult.url,
        },
      },
    });

    console.log(`✅ [ContractDocs] Draft uploaded for contract ${contractId}: ${filename}`);

    return res.json({
      success: true,
      contract: {
        id: updated.id,
        documentSource: updated.documentSource,
        draftDocumentUrl: updated.draftDocumentUrl,
        draftDocumentName: updated.draftDocumentName,
      },
    });
  } catch (error) {
    console.error('[ContractDocs] Upload draft error:', error);
    return res.status(500).json({
      error: 'UPLOAD_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /contracts/:id/documents/upload-signed
 * Upload signed contract document and trigger OCR
 */
router.post('/contracts/:id/documents/upload-signed', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const contractId = Number(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    if (!contractId || !tenantId) {
      return res.status(400).json({ error: 'BAD_REQUEST' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'NO_FILE_UPLOADED' });
    }

    // Verify contract exists and user has access
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });

    if (!contract) {
      return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
    }

    // Generate filename
    const timestamp = Date.now();
    const filename = `contract-${contractId}-signed-${timestamp}.pdf`;

    // Upload to storage
    const uploadResult = await storageService.uploadFile(req.file, filename);

    // Update contract with signed document info
    const updated = await prisma.contract.update({
      where: { id: contractId },
      data: {
        documentSource: 'UPLOADED_SIGNED',
        signedDocumentUrl: uploadResult.url,
        signedDocumentName: req.file.originalname,
        signedDocumentUploadedAt: new Date(),
        signedDocumentUploadedBy: userId ? String(userId) : null,
        ocrStatus: 'PENDING', // Mark as pending OCR
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        entity: 'Contract',
        entityId: String(contractId),
        action: 'upload_signed_document',
        changes: {
          filename: req.file.originalname,
          size: req.file.size,
          url: uploadResult.url,
        },
      },
    });

    console.log(`✅ [ContractDocs] Signed document uploaded for contract ${contractId}: ${filename}`);

    // Trigger OCR processing asynchronously (fire and forget)
    // Don't await - let it run in background
    processContractOcr(contractId, tenantId)
      .then((result) => {
        if (result.success) {
          console.log(`✅ [ContractDocs] OCR completed for contract ${contractId}`);
        } else {
          console.error(`❌ [ContractDocs] OCR failed for contract ${contractId}:`, result.error);
        }
      })
      .catch((error) => {
        console.error(`❌ [ContractDocs] OCR processing error for contract ${contractId}:`, error);
      });

    return res.json({
      success: true,
      contract: {
        id: updated.id,
        documentSource: updated.documentSource,
        signedDocumentUrl: updated.signedDocumentUrl,
        signedDocumentName: updated.signedDocumentName,
        ocrStatus: updated.ocrStatus,
      },
      message: 'Document uploaded successfully. OCR processing started.',
    });
  } catch (error) {
    console.error('[ContractDocs] Upload signed error:', error);
    return res.status(500).json({
      error: 'UPLOAD_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /contracts/:id/ocr-status
 * Get OCR processing status and results
 */
router.get('/contracts/:id/ocr-status', requireAuth, async (req, res) => {
  try {
    const contractId = Number(req.params.id);
    const tenantId = req.user?.tenantId;

    if (!contractId || !tenantId) {
      return res.status(400).json({ error: 'BAD_REQUEST' });
    }

    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      select: {
        id: true,
        ocrStatus: true,
        ocrExtractedData: true,
        ocrConfidence: true,
        ocrRawText: true,
        ocrReviewedBy: true,
        ocrReviewedAt: true,
        ocrReviewNotes: true,
        signedDocumentUrl: true,
        signedDocumentName: true,
      },
    });

    if (!contract) {
      return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
    }

    return res.json({
      success: true,
      ocr: {
        status: contract.ocrStatus,
        confidence: contract.ocrConfidence,
        extractedData: contract.ocrExtractedData,
        reviewedBy: contract.ocrReviewedBy,
        reviewedAt: contract.ocrReviewedAt,
        reviewNotes: contract.ocrReviewNotes,
        document: {
          url: contract.signedDocumentUrl,
          name: contract.signedDocumentName,
        },
      },
    });
  } catch (error) {
    console.error('[ContractDocs] Get OCR status error:', error);
    return res.status(500).json({
      error: 'FETCH_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /contracts/:id/ocr-review
 * Mark OCR data as reviewed and optionally update extracted fields
 */
router.post('/contracts/:id/ocr-review', requireAuth, async (req, res) => {
  try {
    const contractId = Number(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { reviewNotes, updatedData } = req.body;

    if (!contractId || !tenantId) {
      return res.status(400).json({ error: 'BAD_REQUEST' });
    }

    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });

    if (!contract) {
      return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
    }

    // Update contract with review info
    const updateData = {
      ocrReviewedBy: userId ? String(userId) : null,
      ocrReviewedAt: new Date(),
      ocrReviewNotes: reviewNotes || null,
    };

    // If updated data provided, merge with existing extracted data
    if (updatedData) {
      updateData.ocrExtractedData = {
        ...contract.ocrExtractedData,
        ...updatedData,
      };
    }

    const updated = await prisma.contract.update({
      where: { id: contractId },
      data: updateData,
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        entity: 'Contract',
        entityId: String(contractId),
        action: 'review_ocr_data',
        changes: {
          reviewNotes,
          updatedFields: updatedData ? Object.keys(updatedData) : [],
        },
      },
    });

    console.log(`✅ [ContractDocs] OCR reviewed for contract ${contractId} by user ${userId}`);

    return res.json({
      success: true,
      contract: {
        id: updated.id,
        ocrReviewedBy: updated.ocrReviewedBy,
        ocrReviewedAt: updated.ocrReviewedAt,
        ocrExtractedData: updated.ocrExtractedData,
      },
    });
  } catch (error) {
    console.error('[ContractDocs] OCR review error:', error);
    return res.status(500).json({
      error: 'REVIEW_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /contracts/:id/ocr-retry
 * Retry OCR processing for a contract
 */
router.post('/contracts/:id/ocr-retry', requireAuth, async (req, res) => {
  try {
    const contractId = Number(req.params.id);
    const tenantId = req.user?.tenantId;

    if (!contractId || !tenantId) {
      return res.status(400).json({ error: 'BAD_REQUEST' });
    }

    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });

    if (!contract) {
      return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
    }

    if (!contract.signedDocumentUrl) {
      return res.status(400).json({ error: 'NO_SIGNED_DOCUMENT' });
    }

    // Reset OCR status
    await prisma.contract.update({
      where: { id: contractId },
      data: { ocrStatus: 'PENDING' },
    });

    // Trigger OCR processing
    processContractOcr(contractId, tenantId)
      .then((result) => {
        if (result.success) {
          console.log(`✅ [ContractDocs] OCR retry completed for contract ${contractId}`);
        } else {
          console.error(`❌ [ContractDocs] OCR retry failed for contract ${contractId}:`, result.error);
        }
      })
      .catch((error) => {
        console.error(`❌ [ContractDocs] OCR retry error for contract ${contractId}:`, error);
      });

    return res.json({
      success: true,
      message: 'OCR processing restarted',
    });
  } catch (error) {
    console.error('[ContractDocs] OCR retry error:', error);
    return res.status(500).json({
      error: 'RETRY_FAILED',
      message: error.message,
    });
  }
});

/**
 * Helper: Lookup ContractType ID by name
 */
async function lookupContractTypeId(typeName, tenantId) {
  if (!typeName) return null;

  try {
    const contractType = await prisma.contractType.findFirst({
      where: {
        tenantId,
        name: {
          contains: typeName,
          mode: 'insensitive',
        },
      },
    });

    return contractType?.id || null;
  } catch (error) {
    console.error('[ContractDocs] Contract type lookup error:', error);
    return null;
  }
}

/**
 * POST /contracts/:id/documents/confirm-signed
 * Confirm OCR-extracted data and mark contract as signed
 * Triggers PO generation and CVR commitment creation
 */
router.post('/contracts/:id/documents/confirm-signed', requireAuth, async (req, res) => {
  try {
    const contractId = Number(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id ? Number(req.user.id) : null;
    const { confirmedData, reviewNotes } = req.body;

    if (!contractId || !tenantId || !userId) {
      return res.status(400).json({ error: 'BAD_REQUEST' });
    }

    if (!confirmedData) {
      return res.status(400).json({ error: 'CONFIRMED_DATA_REQUIRED' });
    }

    // Fetch contract
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: {
        lineItems: true,
        package: { include: { milestones: true } },
      },
    });

    if (!contract) {
      return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
    }

    // Verify contract is ready for confirmation
    if (contract.documentSource !== 'UPLOADED_SIGNED') {
      return res.status(400).json({
        error: 'CONTRACT_NOT_READY',
        message: 'Contract must have a signed document uploaded',
      });
    }

    if (contract.ocrStatus !== 'COMPLETED') {
      return res.status(400).json({
        error: 'OCR_NOT_COMPLETED',
        message: 'OCR processing must be completed before confirmation',
      });
    }

    if (contract.status === 'signed') {
      return res.status(409).json({
        error: 'ALREADY_SIGNED',
        message: 'Contract is already marked as signed',
      });
    }

    // Lookup contract type ID if provided
    let contractTypeId = contract.contractTypeId;
    if (confirmedData.contractType) {
      const foundTypeId = await lookupContractTypeId(confirmedData.contractType, tenantId);
      if (foundTypeId) {
        contractTypeId = foundTypeId;
      }
    }

    // Update contract with confirmed data
    const updateData = {
      // OCR review tracking
      ocrReviewedBy: String(userId),
      ocrReviewedAt: new Date(),
      ocrReviewNotes: reviewNotes || null,

      // Status update
      status: 'signed',
      signedAt: new Date(),
      signedBy: String(userId),
    };

    // Add confirmed data fields if provided
    if (confirmedData.value !== undefined) {
      updateData.value = Number(confirmedData.value);
    }
    if (confirmedData.startDate) {
      updateData.startDate = new Date(confirmedData.startDate);
    }
    if (confirmedData.endDate) {
      updateData.endDate = new Date(confirmedData.endDate);
    }
    if (confirmedData.retentionPercent !== undefined) {
      updateData.retentionPercentage = Number(confirmedData.retentionPercent);
    }
    if (contractTypeId) {
      updateData.contractTypeId = contractTypeId;
    }
    if (confirmedData.paymentTerms !== undefined) {
      updateData.paymentDueDays = Number(confirmedData.paymentTerms);
    }

    const updated = await prisma.contract.update({
      where: { id: contractId },
      data: updateData,
    });

    console.log(`✅ [ContractDocs] Contract ${contractId} confirmed and marked as signed`);

    // Create CVR commitments for signed contract
    let cvrCommitments = [];
    try {
      const contractWithLines = await prisma.contract.findUnique({
        where: { id: contractId },
        include: { lineItems: true },
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

      console.log(`✅ [ContractDocs] Created ${cvrCommitments.length} CVR commitments for contract ${contractId}`);
    } catch (cvrError) {
      console.error('[ContractDocs] CVR commitment error:', cvrError);
      // Don't fail the whole operation - CVR is supplementary
    }

    // Trigger PO generation based on package strategy
    let poGeneration_result = null;
    let purchaseOrders = [];
    try {
      const result = await poGeneration.generateFromContract(contractId, userId, tenantId);
      if (result) {
        poGeneration_result = result;
        purchaseOrders = Array.isArray(result) ? result : [result];
        console.log(`✅ [ContractDocs] Generated ${purchaseOrders.length} PO(s) for contract ${contractId}`);
      }
    } catch (poError) {
      console.error('[ContractDocs] PO generation error:', poError);
      // Log but don't fail - contract is still signed
      // Return error info in response
      poGeneration_result = {
        error: poError.message,
      };
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        entity: 'Contract',
        entityId: String(contractId),
        action: 'confirm_signed_document',
        changes: {
          confirmedFields: Object.keys(confirmedData),
          reviewNotes,
          cvrCommitmentsCreated: cvrCommitments.length,
          purchaseOrdersGenerated: purchaseOrders.length,
        },
      },
    });

    return res.json({
      success: true,
      contract: {
        id: updated.id,
        status: updated.status,
        value: updated.value,
        startDate: updated.startDate,
        endDate: updated.endDate,
        signedAt: updated.signedAt,
        signedBy: updated.signedBy,
      },
      poGeneration: {
        triggered: purchaseOrders.length > 0,
        count: purchaseOrders.length,
        purchaseOrders: purchaseOrders.map(po => ({
          id: po.id,
          code: po.code,
          total: po.total,
          status: po.status,
          poType: po.poType,
        })),
        error: poGeneration_result?.error || null,
      },
      cvrCommitments: {
        count: cvrCommitments.length,
      },
    });
  } catch (error) {
    console.error('[ContractDocs] Confirm signed error:', error);
    return res.status(500).json({
      error: 'CONFIRMATION_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /contracts/:id/documents/mark-signed-manual
 * Mark contract as signed without OCR review
 * Use case: OCR failed, manual data entry, or data already correct
 */
router.post('/contracts/:id/documents/mark-signed-manual', requireAuth, async (req, res) => {
  try {
    const contractId = Number(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id ? Number(req.user.id) : null;
    const { signedDate, confirmExistingData } = req.body;

    if (!contractId || !tenantId || !userId) {
      return res.status(400).json({ error: 'BAD_REQUEST' });
    }

    // Fetch contract
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: {
        lineItems: true,
        package: { include: { milestones: true } },
      },
    });

    if (!contract) {
      return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
    }

    if (contract.status === 'signed') {
      return res.status(409).json({
        error: 'ALREADY_SIGNED',
        message: 'Contract is already marked as signed',
      });
    }

    // Update contract status
    const updated = await prisma.contract.update({
      where: { id: contractId },
      data: {
        status: 'signed',
        signedAt: signedDate ? new Date(signedDate) : new Date(),
        signedBy: String(userId),
      },
    });

    console.log(`✅ [ContractDocs] Contract ${contractId} manually marked as signed`);

    // Create CVR commitments
    let cvrCommitments = [];
    try {
      const contractWithLines = await prisma.contract.findUnique({
        where: { id: contractId },
        include: { lineItems: true },
      });

      if (contractWithLines && contractWithLines.lineItems?.length > 0) {
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

      console.log(`✅ [ContractDocs] Created ${cvrCommitments.length} CVR commitments for contract ${contractId}`);
    } catch (cvrError) {
      console.error('[ContractDocs] CVR commitment error:', cvrError);
    }

    // Trigger PO generation
    let purchaseOrders = [];
    let poGenerationError = null;
    try {
      const result = await poGeneration.generateFromContract(contractId, userId, tenantId);
      if (result) {
        purchaseOrders = Array.isArray(result) ? result : [result];
        console.log(`✅ [ContractDocs] Generated ${purchaseOrders.length} PO(s) for contract ${contractId}`);
      }
    } catch (poError) {
      console.error('[ContractDocs] PO generation error:', poError);
      poGenerationError = poError.message;
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        entity: 'Contract',
        entityId: String(contractId),
        action: 'mark_signed_manual',
        changes: {
          signedDate: signedDate || new Date(),
          confirmExistingData,
          cvrCommitmentsCreated: cvrCommitments.length,
          purchaseOrdersGenerated: purchaseOrders.length,
        },
      },
    });

    return res.json({
      success: true,
      contract: {
        id: updated.id,
        status: updated.status,
        signedAt: updated.signedAt,
        signedBy: updated.signedBy,
      },
      poGeneration: {
        triggered: purchaseOrders.length > 0,
        count: purchaseOrders.length,
        purchaseOrders: purchaseOrders.map(po => ({
          id: po.id,
          code: po.code,
          total: po.total,
          status: po.status,
          poType: po.poType,
        })),
        error: poGenerationError,
      },
      cvrCommitments: {
        count: cvrCommitments.length,
      },
    });
  } catch (error) {
    console.error('[ContractDocs] Mark signed manual error:', error);
    return res.status(500).json({
      error: 'MARK_SIGNED_FAILED',
      message: error.message,
    });
  }
});

module.exports = router;
