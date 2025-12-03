/**
 * Invoices API Routes
 *
 * Provides CRUD operations and workflow management for Invoices
 * Integrates with CVR system for actual cost tracking
 */

const express = require('express');
const multer = require('multer');
const invoiceService = require('../services/invoice.cjs');
const { getInvoiceOcrService } = require('../services/invoiceOcr.cjs');
const { makeStorageKey, writeLocalFile, localPath } = require('../utils/storage.cjs');
const invoiceMatching = require('../services/invoiceMatching.cjs');
const certificateMatching = require('../services/certificateMatching.cjs');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const allowedExts = ['.pdf', '.csv', '.docx'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));

    if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, CSV, and DOCX files are allowed'));
    }
  },
});

module.exports = function invoicesRouter(prisma) {
  const router = express.Router();

  function getTenantId(req) {
    return req.user && req.user.tenantId;
  }

  function getUserId(req) {
    return req.user && req.user.id;
  }

  /**
   * GET /api/invoices?projectId=123&status=RECEIVED&limit=50&offset=0
   * List invoices with filters
   */
  router.get('/', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const filters = {
        projectId: req.query.projectId ? Number(req.query.projectId) : undefined,
        status: req.query.status,
        supplierId: req.query.supplierId ? Number(req.query.supplierId) : undefined,
        budgetLineId: req.query.budgetLineId ? Number(req.query.budgetLineId) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 50,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      };

      const result = await invoiceService.getInvoices(tenantId, filters);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/invoices/awaiting-approval?projectId=123
   * Get invoices awaiting approval
   */
  router.get('/awaiting-approval', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = req.query.projectId ? Number(req.query.projectId) : null;

      const invoices = await invoiceService.getInvoicesAwaitingApproval(tenantId, projectId);
      res.json(invoices);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/invoices/overdue?projectId=123
   * Get overdue invoices
   */
  router.get('/overdue', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = req.query.projectId ? Number(req.query.projectId) : null;

      const invoices = await invoiceService.getOverdueInvoices(tenantId, projectId);
      res.json(invoices);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/invoices/:id
   * Get single invoice by ID
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);

      const invoice = await invoiceService.getInvoiceById(id, tenantId);
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/invoices
   * Create new invoice (RECEIVED status)
   * Creates CVR actual record
   */
  router.post('/', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      const invoice = await invoiceService.createInvoice({
        tenantId,
        ...req.body,
        createdBy: userId,
      });

      res.status(201).json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /api/invoices/:id
   * Update invoice
   */
  router.patch('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);

      const invoice = await invoiceService.updateInvoice(id, tenantId, req.body);
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/invoices/:id/match
   * Match invoice to purchase order (RECEIVED → MATCHED)
   */
  router.post('/:id/match', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const id = Number(req.params.id);
      const { poId } = req.body;

      if (!poId) {
        return res.status(400).json({ error: 'poId is required' });
      }

      const invoice = await invoiceService.matchInvoiceToPO(id, poId, tenantId, userId);
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/invoices/:id/approve
   * Approve invoice (MATCHED → APPROVED)
   * Updates CVR actual status to CERTIFIED
   */
  router.post('/:id/approve', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const id = Number(req.params.id);

      const invoice = await invoiceService.approveInvoice(id, tenantId, userId);
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/invoices/:id/pay
   * Mark invoice as paid (APPROVED → PAID)
   * Updates CVR actual status to PAID
   */
  router.post('/:id/pay', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);
      const { paidAmount, paidDate, paymentRef } = req.body;

      if (!paidAmount) {
        return res.status(400).json({ error: 'paidAmount is required' });
      }

      const invoice = await invoiceService.markInvoicePaid(
        id,
        tenantId,
        paidAmount,
        paidDate ? new Date(paidDate) : undefined,
        paymentRef
      );
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/invoices/:id/dispute
   * Dispute invoice
   */
  router.post('/:id/dispute', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);
      const { disputeReason } = req.body;

      if (!disputeReason) {
        return res.status(400).json({ error: 'disputeReason is required' });
      }

      const invoice = await invoiceService.disputeInvoice(id, tenantId, disputeReason);
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/invoices/:id/cancel
   * Cancel invoice (reverses CVR actual)
   */
  router.post('/:id/cancel', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);
      const { cancelReason } = req.body;

      const invoice = await invoiceService.cancelInvoice(id, tenantId, cancelReason);
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/invoices/upload
   * Upload invoice with OCR extraction
   * Accepts: PDF, DOCX, CSV
   */
  router.post('/upload', upload.single('file'), async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { projectId, supplierId } = req.body;

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      console.log(`📤 [Invoice Upload] File: ${req.file.originalname}, Size: ${req.file.size} bytes`);

      // Determine file type
      const ext = req.file.originalname.toLowerCase().substring(req.file.originalname.lastIndexOf('.'));
      let fileType = ext.substring(1); // Remove the dot

      // Extract invoice data using OCR service
      const ocrService = getInvoiceOcrService();
      const ocrResult = await ocrService.extractInvoiceData(req.file.buffer, fileType, req.file.originalname);

      if (!ocrResult.success) {
        return res.status(400).json({
          error: 'OCR extraction failed',
          message: ocrResult.error,
        });
      }

      // Upload file to local storage
      let documentUrl = null;
      let storageKey = null;
      try {
        storageKey = makeStorageKey(req.file.originalname);
        await writeLocalFile(storageKey, req.file.buffer);
        documentUrl = `/uploads/${storageKey}`;
        console.log(`✅ [Invoice Upload] File saved to storage: ${storageKey}`);
      } catch (uploadError) {
        console.warn('⚠️  File upload to storage failed, continuing without URL:', uploadError.message);
      }

      // Create draft invoice with OCR data
      const invoice = await prisma.invoice.create({
        data: {
          tenantId,
          projectId: Number(projectId),
          supplierId: supplierId ? Number(supplierId) : null,
          number: ocrResult.extracted.invoiceNumber?.value || `TEMP-${Date.now()}`,
          issueDate: ocrResult.extracted.invoiceDate?.value ? new Date(ocrResult.extracted.invoiceDate.value) : null,
          dueDate: ocrResult.extracted.dueDate?.value ? new Date(ocrResult.extracted.dueDate.value) : null,
          net: ocrResult.extracted.netAmount?.value || 0,
          vat: ocrResult.extracted.vatAmount?.value || 0,
          gross: ocrResult.extracted.grossAmount?.value || 0,
          status: 'DRAFT',
          source: ocrResult.source || 'PDF_OCR',
          ocrStatus: 'COMPLETED',
          ocrResultJson: ocrResult.extracted,
          ocrRawText: ocrResult.rawText,
          ocrConfidence: ocrResult.overallConfidence,
          matchStatus: 'UNMATCHED',
          documentUrl,
          documentName: req.file.originalname,
          poNumberRef: ocrResult.extracted.poReference?.value,
          receivedDate: new Date(),
          createdBy: userId?.toString(),
        },
      });

      res.status(201).json({
        success: true,
        invoice,
        ocr: {
          status: 'COMPLETED',
          extractedData: ocrResult.extracted,
          confidence: ocrResult.overallConfidence,
        },
      });
    } catch (err) {
      console.error('❌ [Invoice Upload] Error:', err);
      next(err);
    }
  });

  /**
   * POST /api/invoices/:id/confirm
   * Confirm OCR data and update invoice
   * Moves invoice from DRAFT to PENDING_REVIEW or RECEIVED
   */
  router.post('/:id/confirm', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);
      const { confirmedData } = req.body;

      if (!confirmedData) {
        return res.status(400).json({ error: 'confirmedData is required' });
      }

      // Update invoice with confirmed data
      const invoice = await prisma.invoice.update({
        where: { id },
        data: {
          number: confirmedData.invoiceNumber || undefined,
          supplierInvoiceRef: confirmedData.supplierInvoiceRef || undefined,
          issueDate: confirmedData.invoiceDate ? new Date(confirmedData.invoiceDate) : undefined,
          dueDate: confirmedData.dueDate ? new Date(confirmedData.dueDate) : undefined,
          net: confirmedData.netAmount !== undefined ? confirmedData.netAmount : undefined,
          vat: confirmedData.vatAmount !== undefined ? confirmedData.vatAmount : undefined,
          gross: confirmedData.grossAmount !== undefined ? confirmedData.grossAmount : undefined,
          supplierId: confirmedData.supplierId ? Number(confirmedData.supplierId) : undefined,
          poNumberRef: confirmedData.poReference || undefined,
          status: 'RECEIVED', // Move to RECEIVED status after confirmation
        },
        include: {
          supplier: true,
          project: true,
        },
      });

      // Create line items if provided
      if (confirmedData.lineItems && Array.isArray(confirmedData.lineItems)) {
        // Delete existing line items
        await prisma.invoiceLine.deleteMany({ where: { invoiceId: id } });

        // Create new line items
        for (let i = 0; i < confirmedData.lineItems.length; i++) {
          const item = confirmedData.lineItems[i];
          await prisma.invoiceLine.create({
            data: {
              tenantId,
              invoiceId: id,
              lineNo: i + 1,
              description: item.description || '',
              qty: item.quantity || 1,
              unit: item.unit || 'ea',
              rate: item.unitPrice || 0,
              vatRatePct: item.vatRate || 20,
              totalExVat: item.netAmount || 0,
              totalVat: item.vatAmount || 0,
              totalIncVat: item.grossAmount || 0,
              costCode: item.costCode || null,
              budgetLineId: item.budgetLineId ? Number(item.budgetLineId) : null,
            },
          });
        }
      }

      res.json({ success: true, invoice });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/invoices/:id/find-matching-pos
   * Find potential matching POs for an invoice
   * Returns matches with confidence scores
   */
  router.post('/:id/find-matching-pos', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);

      console.log(`🔍 [PO Matching] Finding matches for invoice ${id}`);

      const matchResult = await invoiceMatching.matchInvoiceToPO(id, tenantId);

      res.json({
        success: true,
        matched: matchResult.matched,
        matchType: matchResult.matchType,
        matches: matchResult.matches,
        suggestedMatch: matchResult.suggestedMatch,
      });
    } catch (err) {
      console.error('❌ [PO Matching] Error:', err);
      next(err);
    }
  });

  /**
   * POST /api/invoices/:id/confirm-match
   * Confirm a match to a specific PO
   * Updates invoice with matchStatus = FULL_MATCH
   */
  router.post('/:id/confirm-match', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const id = Number(req.params.id);
      const { poId, confidence } = req.body;

      if (!poId) {
        return res.status(400).json({ error: 'poId is required' });
      }

      console.log(`✅ [PO Matching] Confirming match: Invoice ${id} → PO ${poId}`);

      const invoice = await invoiceMatching.confirmMatch(id, poId, tenantId, userId);

      res.json({
        success: true,
        invoice,
      });
    } catch (err) {
      console.error('❌ [PO Matching] Confirm error:', err);
      next(err);
    }
  });

  /**
   * POST /api/invoices/import-csv
   * Import invoices from CSV file
   */
  router.post('/import-csv', upload.single('file'), async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { projectId } = req.body;

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      console.log(`📤 [CSV Import] File: ${req.file.originalname}`);

      // Parse CSV
      const ocrService = getInvoiceOcrService();
      const parseResult = await ocrService.parseInvoiceCsv(req.file.buffer);

      if (!parseResult.success) {
        return res.status(400).json({
          error: 'CSV parsing failed',
          message: parseResult.error,
        });
      }

      // Handle multiple invoices from CSV
      const invoices = parseResult.invoices || [parseResult];
      const createdInvoices = [];

      for (const result of invoices) {
        const extracted = result.extracted;

        const invoice = await prisma.invoice.create({
          data: {
            tenantId,
            projectId: Number(projectId),
            number: extracted.invoiceNumber?.value || `TEMP-${Date.now()}`,
            issueDate: extracted.invoiceDate?.value ? new Date(extracted.invoiceDate.value) : null,
            dueDate: extracted.dueDate?.value ? new Date(extracted.dueDate.value) : null,
            net: extracted.netAmount?.value || 0,
            vat: extracted.vatAmount?.value || 0,
            gross: extracted.grossAmount?.value || 0,
            status: 'RECEIVED',
            source: 'CSV_IMPORT',
            ocrStatus: 'COMPLETED',
            ocrConfidence: 1.0,
            matchStatus: 'UNMATCHED',
            poNumberRef: extracted.poReference?.value,
            receivedDate: new Date(),
            createdBy: userId?.toString(),
          },
        });

        // Create line items
        if (extracted.lineItems?.value && Array.isArray(extracted.lineItems.value)) {
          for (let i = 0; i < extracted.lineItems.value.length; i++) {
            const item = extracted.lineItems.value[i];
            await prisma.invoiceLine.create({
              data: {
                tenantId,
                invoiceId: invoice.id,
                lineNo: i + 1,
                description: item.description || '',
                qty: item.quantity || 1,
                unit: item.unit || 'ea',
                rate: item.unitPrice || 0,
                vatRatePct: item.vatRate || 20,
                totalExVat: item.netAmount || 0,
                totalVat: item.vatAmount || 0,
                totalIncVat: item.grossAmount || 0,
              },
            });
          }
        }

        createdInvoices.push(invoice);
      }

      res.status(201).json({
        success: true,
        imported: createdInvoices.length,
        invoices: createdInvoices,
      });
    } catch (err) {
      console.error('❌ [CSV Import] Error:', err);
      next(err);
    }
  });

  /**
   * DELETE /api/invoices/:id
   * Delete invoice (and CVR actual if exists)
   */
  router.delete('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);

      await invoiceService.deleteInvoice(id, tenantId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/invoices/:id/certificate-matches
   * Find potential payment certificate matches for an invoice
   */
  router.get('/:id/certificate-matches', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const tenantId = getTenantId(req);

      const invoice = await prisma.invoice.findFirst({
        where: { id, tenantId },
        include: { supplier: true }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const result = await certificateMatching.findCertificateMatches(invoice, tenantId);

      res.json({
        invoiceId: id,
        invoiceNumber: invoice.number,
        invoiceAmount: invoice.gross || invoice.net,
        supplier: invoice.supplier?.name,
        ...result
      });
    } catch (error) {
      console.error('[invoices] Error finding certificate matches:', error);
      next(error);
    }
  });

  /**
   * POST /api/invoices/:id/match-certificate
   * Confirm a match between invoice and payment certificate
   */
  router.post('/:id/match-certificate', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { paymentApplicationId, notes } = req.body;
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      if (!paymentApplicationId) {
        return res.status(400).json({ error: 'Payment application ID required' });
      }

      const updatedInvoice = await certificateMatching.confirmCertificateMatch(
        id,
        Number(paymentApplicationId),
        userId,
        tenantId,
        notes
      );

      res.json({
        success: true,
        invoice: updatedInvoice,
        message: 'Invoice matched to payment certificate'
      });
    } catch (error) {
      console.error('[invoices] Error matching invoice to certificate:', error);
      res.status(400).json({ error: error.message || 'Failed to match invoice' });
    }
  });

  /**
   * POST /api/invoices/:id/unmatch-certificate
   * Remove match between invoice and payment certificate
   */
  router.post('/:id/unmatch-certificate', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      const updatedInvoice = await certificateMatching.unmatchCertificate(
        id,
        tenantId,
        userId
      );

      res.json({
        success: true,
        invoice: updatedInvoice,
        message: 'Invoice unmatched from certificate'
      });
    } catch (error) {
      console.error('[invoices] Error unmatching certificate:', error);
      res.status(400).json({ error: error.message || 'Failed to unmatch invoice' });
    }
  });

  /**
   * POST /api/invoices/:id/no-match-required
   * Flag invoice as not requiring PO/Certificate match
   */
  router.post('/:id/no-match-required', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { reason } = req.body;
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      if (!reason) {
        return res.status(400).json({ error: 'Reason required' });
      }

      const updatedInvoice = await certificateMatching.flagNoMatchRequired(
        id,
        reason,
        userId,
        tenantId
      );

      res.json({
        success: true,
        invoice: updatedInvoice
      });
    } catch (error) {
      console.error('[invoices] Error flagging invoice:', error);
      next(error);
    }
  });

  /**
   * POST /api/invoices/auto-match
   * Run auto-matching for all unmatched invoices
   */
  router.post('/auto-match', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const { confidenceThreshold = 90 } = req.body;

      const results = await certificateMatching.autoMatchInvoices(tenantId, confidenceThreshold);

      res.json({
        success: true,
        ...results
      });
    } catch (error) {
      console.error('[invoices] Error auto-matching invoices:', error);
      next(error);
    }
  });

  /**
   * GET /api/invoices/matching-stats
   * Get matching statistics for the tenant
   */
  router.get('/matching-stats', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);

      const stats = await certificateMatching.getMatchingStats(tenantId);

      res.json(stats);
    } catch (error) {
      console.error('[invoices] Error getting matching stats:', error);
      next(error);
    }
  });

  return router;
};
