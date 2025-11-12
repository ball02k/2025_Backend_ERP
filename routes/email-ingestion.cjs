// ==============================================================================
// EMAIL INGESTION WEBHOOK - Cloudflare Email Routing
// ==============================================================================

const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const multer = require('multer');
const textractService = require('../services/ocr/textract.cjs');
const parser = require('../services/ocr/payment-application-parser.cjs');
const contractMatcher = require('../services/ocr/contract-matcher.cjs');

// Configure multer for file uploads (in-memory for PDF processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

/**
 * POST /api/email-ingestion/webhook
 * Cloudflare Email Routing webhook endpoint
 *
 * Receives emails with payment application PDFs, processes them with OCR,
 * and creates draft payment applications for QS review.
 */
router.post('/webhook', upload.array('attachments', 10), async (req, res) => {
  try {
    console.log('📧 [Email Ingestion] Received email webhook');

    const { from, to, subject, text, html, messageId, receivedAt } = req.body;
    const attachments = req.files || [];

    console.log('[Email Ingestion] Email details:', {
      from,
      to,
      subject,
      attachmentCount: attachments.length,
      messageId,
    });

    // Validate required fields
    if (!from || !subject) {
      return res.status(400).json({ error: 'Missing required fields: from, subject' });
    }

    // Process each PDF attachment
    const results = [];

    for (const attachment of attachments) {
      if (attachment.mimetype !== 'application/pdf') {
        console.log(`⚠️  [Email Ingestion] Skipping non-PDF attachment: ${attachment.originalname}`);
        continue;
      }

      console.log(`📄 [Email Ingestion] Processing PDF: ${attachment.originalname}`);

      try {
        const result = await processPaymentApplicationEmail({
          emailSender: from,
          emailSubject: subject,
          emailBody: text || html,
          emailReceivedAt: receivedAt || new Date().toISOString(),
          emailMessageId: messageId,
          pdfBuffer: attachment.buffer,
          pdfFilename: attachment.originalname,
          tenantId: 'demo', // TODO: Extract from email domain or routing
        });

        results.push({
          filename: attachment.originalname,
          success: true,
          applicationId: result.applicationId,
          matched: result.matched,
          confidence: result.confidence,
        });

        console.log(`✅ [Email Ingestion] Created draft application #${result.applicationId}`);
      } catch (error) {
        console.error(`❌ [Email Ingestion] Error processing ${attachment.originalname}:`, error);
        results.push({
          filename: attachment.originalname,
          success: false,
          error: error.message,
        });
      }
    }

    // Return results
    res.json({
      success: true,
      emailFrom: from,
      emailSubject: subject,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('❌ [Email Ingestion] Webhook error:', error);
    res.status(500).json({
      error: 'Failed to process email',
      details: error.message,
    });
  }
});

/**
 * POST /api/email-ingestion/upload
 * Manual PDF upload endpoint (for testing or manual processing)
 */
router.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    const { tenantId, supplierId, projectId, contractId } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log('📄 [Email Ingestion] Manual upload:', req.file.originalname);

    const result = await processPaymentApplicationEmail({
      emailSender: req.body.emailSender || 'manual-upload@local',
      emailSubject: req.body.subject || `Manual Upload: ${req.file.originalname}`,
      emailBody: req.body.notes || '',
      emailReceivedAt: new Date().toISOString(),
      pdfBuffer: req.file.buffer,
      pdfFilename: req.file.originalname,
      tenantId: tenantId || 'demo',
      supplierId: supplierId ? parseInt(supplierId) : null,
      projectId: projectId ? parseInt(projectId) : null,
      contractId: contractId ? parseInt(contractId) : null,
    });

    res.json({
      success: true,
      applicationId: result.applicationId,
      matched: result.matched,
      confidence: result.confidence,
      application: result.application,
    });
  } catch (error) {
    console.error('❌ [Email Ingestion] Upload error:', error);
    res.status(500).json({
      error: 'Failed to process PDF',
      details: error.message,
    });
  }
});

/**
 * GET /api/email-ingestion/applications/:id/ocr
 * Get OCR details for a payment application
 */
router.get('/applications/:id/ocr', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId || 'demo';

    const application = await prisma.applicationForPayment.findFirst({
      where: {
        id: parseInt(id),
        tenantId,
      },
      select: {
        id: true,
        applicationNo: true,
        sourceType: true,
        emailSender: true,
        emailSubject: true,
        emailReceivedAt: true,
        ocrStatus: true,
        ocrStartedAt: true,
        ocrCompletedAt: true,
        ocrConfidence: true,
        ocrRawText: true,
        ocrError: true,
        ocrExtractedData: true,
        contractMatchMethod: true,
        contractMatchConfidence: true,
        suggestedContracts: true,
        autoPopulated: true,
        requiresReview: true,
      },
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(application);
  } catch (error) {
    console.error('❌ [Email Ingestion] Error fetching OCR data:', error);
    res.status(500).json({ error: 'Failed to fetch OCR data' });
  }
});

/**
 * POST /api/email-ingestion/applications/:id/review
 * Mark OCR data as reviewed by QS
 */
router.post('/applications/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id;

    const updated = await prisma.applicationForPayment.update({
      where: { id: parseInt(id) },
      data: {
        requiresReview: false,
        ocrReviewedBy: userId,
        ocrReviewedAt: new Date(),
        ocrReviewNotes: notes,
      },
    });

    res.json({ success: true, application: updated });
  } catch (error) {
    console.error('❌ [Email Ingestion] Error marking review:', error);
    res.status(500).json({ error: 'Failed to mark as reviewed' });
  }
});

// ==============================================================================
// CORE PROCESSING FUNCTION
// ==============================================================================

/**
 * Process payment application from email/upload
 * @param {Object} params - Processing parameters
 * @returns {Object} - Created application and matching results
 */
async function processPaymentApplicationEmail({
  emailSender,
  emailSubject,
  emailBody,
  emailReceivedAt,
  emailMessageId = null,
  pdfBuffer,
  pdfFilename,
  tenantId,
  supplierId = null,
  projectId = null,
  contractId = null,
}) {
  console.log('[Processing] Starting payment application processing...');

  // Step 1: Upload PDF to S3 and start OCR
  console.log('[Processing] Step 1: Uploading PDF to S3 and starting OCR...');
  const ocrResults = await textractService.processPaymentApplication(
    pdfBuffer,
    pdfFilename,
    tenantId,
    false // Use synchronous processing for now
  );

  // Step 2: Parse OCR text to extract payment application data
  console.log('[Processing] Step 2: Parsing OCR text...');
  const extractedData = parser.parse(
    ocrResults.fullText,
    ocrResults.keyValuePairs
  );

  // Extract line items from tables
  let lineItems = [];
  if (ocrResults.tables && ocrResults.tables.length > 0) {
    lineItems = parser.extractLineItems(ocrResults.tables);
  }

  // Step 3: Match to contract
  console.log('[Processing] Step 3: Matching to contract...');
  const matchResult = await contractMatcher.findMatch(
    extractedData,
    tenantId,
    emailSender
  );

  // Determine contract, project, supplier IDs
  let finalContractId = contractId;
  let finalProjectId = projectId;
  let finalSupplierId = supplierId;

  if (matchResult.matched && matchResult.contract) {
    finalContractId = matchResult.contract.id;
    finalProjectId = matchResult.contract.projectId;
    finalSupplierId = matchResult.contract.supplierId;
    console.log(`[Processing] Auto-matched to contract: ${matchResult.contract.contractRef}`);
  } else if (!contractId) {
    console.log('[Processing] No contract match found - will require manual assignment');
  }

  // Step 4: Get next application number
  let applicationNumber = null;
  if (finalContractId) {
    applicationNumber = await contractMatcher.getNextApplicationNumber(
      finalContractId,
      tenantId
    );
  }

  // Generate unique applicationNo for tenant
  const lastApp = await prisma.applicationForPayment.findFirst({
    where: { tenantId },
    orderBy: { id: 'desc' },
    select: { applicationNo: true },
  });

  let nextNumber = 1;
  if (lastApp?.applicationNo) {
    const match = lastApp.applicationNo.match(/PA-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }
  const applicationNo = `PA-${String(nextNumber).padStart(6, '0')}`;

  // Step 5: Create draft payment application
  console.log('[Processing] Step 4: Creating draft payment application...');
  const application = await prisma.applicationForPayment.create({
    data: {
      tenantId,
      projectId: finalProjectId || 1, // Fallback to first project if no match
      supplierId: finalSupplierId,
      contractId: finalContractId,

      // Application details
      applicationNumber,
      applicationNo,
      reference: extractedData.applicationNo,
      title: extractedData.title || `Payment Application from ${emailSender}`,
      status: 'DRAFT',

      // Dates
      applicationDate: extractedData.applicationDate || new Date().toISOString(),
      valuationDate: extractedData.valuationDate,
      dueDate: extractedData.dueDate,
      periodStart: extractedData.periodStart,
      periodEnd: extractedData.periodEnd,

      // Claimed amounts
      claimedGrossValue: extractedData.claimedGrossValue || 0,
      claimedRetention: extractedData.claimedRetention || 0,
      claimedNetValue: extractedData.claimedNetValue || 0,
      claimedPreviouslyPaid: extractedData.claimedPreviouslyPaid || 0,
      claimedThisPeriod: extractedData.claimedThisPeriod || 0,
      retentionPercentage: extractedData.retentionPercentage || 5.0,

      // Email details
      sourceType: 'EMAIL',
      emailSender,
      emailSubject,
      emailBody,
      emailReceivedAt,
      emailMessageId,
      emailAttachmentCount: 1,

      // OCR details
      ocrStatus: 'COMPLETED',
      ocrStartedAt: new Date(),
      ocrCompletedAt: new Date(),
      ocrConfidence: ocrResults.confidence || 0,
      ocrRawText: ocrResults.fullText,
      ocrS3Key: ocrResults.s3Key,
      ocrS3Bucket: ocrResults.s3Bucket,
      ocrExtractedData: extractedData,

      // Contract matching
      contractMatchMethod: matchResult.matched ? matchResult.method : 'SUGGESTED',
      contractMatchConfidence: matchResult.confidence || 0,
      suggestedContracts: matchResult.suggestions?.map(s => ({
        contractId: s.contract.id,
        contractRef: s.contract.contractRef,
        confidence: s.confidence,
      })),

      // Auto-population flags
      autoPopulated: true,
      requiresReview: true,

      // Line items (if extracted)
      lineItems: lineItems.length > 0 ? lineItems : null,

      // Notes
      contractorNotes: emailBody,
    },
    include: {
      contract: true,
      supplier: true,
      project: true,
    },
  });

  console.log(`✅ [Processing] Created draft application ${application.applicationNo}`);

  return {
    success: true,
    applicationId: application.id,
    application,
    matched: matchResult.matched,
    confidence: matchResult.confidence,
    ocrConfidence: ocrResults.confidence,
    extractedFields: extractedData.extractedFields,
  };
}

module.exports = router;
