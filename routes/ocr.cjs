// routes/ocr.cjs
const express = require('express');
const router = express.Router();
const multer = require('multer');
const requireAuth = require('../middleware/requireAuth.cjs');

function getContractOcrService() {
  return require('../services/contractOcr.cjs').contractOcrService;
}

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

router.use(requireAuth);

/**
 * POST /api/ocr/extract-contract
 * Extract contract details from uploaded PDF
 */
router.post('/extract-contract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Extract contract metadata using the OCR service
    const result = await getContractOcrService().extractContractMetadata(
      req.file.buffer,
      'temp-upload' // Temporary ID for uploaded files
    );

    if (result.success) {
      // Transform extracted data to match frontend expectations
      const extracted = {
        contractName: result.extracted.supplierName?.value || null,
        contractRef: null, // Not extracted by service
        contractValue: result.extracted.contractValue?.value || null,
        supplierName: result.extracted.supplierName?.value || null,
        clientName: result.extracted.clientName?.value || null,
        startDate: result.extracted.startDate?.value || null,
        completionDate: result.extracted.endDate?.value || null,
        retentionPercentage: result.extracted.retentionPercent?.value || null,
        paymentTermsDays: result.extracted.paymentTerms?.value || null,
        defectsLiabilityPeriodMonths: result.extracted.defectsLiabilityPeriod?.value || null,
        liquidatedDamagesPerDay: result.extracted.liquidatedDamages?.value || null,
        contractType: result.extracted.contractType?.value || null,
      };

      res.json({
        success: true,
        extracted,
        confidence: result.overallConfidence,
        rawText: result.rawText.substring(0, 1000), // First 1000 chars for debugging
      });
    } else {
      throw new Error(result.error || 'OCR extraction failed');
    }
  } catch (error) {
    console.error('OCR extraction error:', error);
    res.status(500).json({
      error: 'OCR extraction failed',
      message: error.message
    });
  }
});

module.exports = router;
