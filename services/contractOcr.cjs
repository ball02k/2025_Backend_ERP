/**
 * Contract OCR Service - FREE OPENSOURCE VERSION
 *
 * Extracts key metadata from uploaded contract PDF documents using PDF.js.
 * Looks for: contract value, supplier name, dates, retention, payment terms, etc.
 *
 * Uses Mozilla PDF.js - 100% free, opensource PDF text extraction.
 */

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs').promises;
const path = require('path');
const { prisma } = require('../utils/prisma.cjs');

class ContractOcrService {
  constructor() {
    console.log('📄 [ContractOCR] Initialized with PDF.js (free, opensource)');
  }

  /**
   * Extract contract metadata from PDF buffer
   * @param {Buffer} fileBuffer - PDF file buffer
   * @param {Number} contractId - Contract ID for logging
   * @returns {Object} - Extraction results with confidence scores
   */
  async extractContractMetadata(fileBuffer, contractId) {
    try {
      console.log(`📄 [ContractOCR] Starting extraction for contract ${contractId}`);

      // Extract text from PDF using PDF.js
      const rawText = await this.extractTextFromPDF(fileBuffer);

      if (!rawText || rawText.length < 50) {
        throw new Error('Insufficient text extracted from document');
      }

      console.log(`✅ [ContractOCR] Total extracted text: ${rawText.length} characters`);

      // Extract individual fields
      const extracted = {
        contractValue: this.extractContractValue(rawText),
        supplierName: this.extractSupplierName(rawText),
        clientName: this.extractClientName(rawText),
        startDate: this.extractDate(rawText, ['commencement', 'start date', 'commencing', 'beginning']),
        endDate: this.extractDate(rawText, ['completion', 'end date', 'practical completion', 'contract period']),
        retentionPercent: this.extractRetention(rawText),
        defectsLiabilityPeriod: this.extractDefectsLiability(rawText),
        contractType: this.extractContractType(rawText),
        paymentTerms: this.extractPaymentTerms(rawText),
        liquidatedDamages: this.extractLiquidatedDamages(rawText),
      };

      // Calculate overall confidence
      const confidenceScores = Object.values(extracted)
        .filter(field => field && field.confidence)
        .map(field => field.confidence);

      const overallConfidence = confidenceScores.length > 0
        ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
        : 0;

      console.log(`📊 [ContractOCR] Overall confidence: ${(overallConfidence * 100).toFixed(1)}%`);
      console.log(`📊 [ContractOCR] Extracted fields:`, {
        contractValue: extracted.contractValue.value,
        startDate: extracted.startDate.value,
        endDate: extracted.endDate.value,
        retention: extracted.retentionPercent.value,
        contractType: extracted.contractType.value,
      });

      return {
        success: true,
        rawText,
        extracted,
        overallConfidence,
      };
    } catch (error) {
      console.error('❌ [ContractOCR] Extraction error:', error);
      return {
        success: false,
        error: error.message,
        rawText: '',
        extracted: {},
        overallConfidence: 0,
      };
    }
  }

  /**
   * Extract text from PDF using PDF.js
   */
  async extractTextFromPDF(fileBuffer) {
    try {
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(fileBuffer),
        useSystemFonts: true,
      });

      const pdfDocument = await loadingTask.promise;
      const numPages = pdfDocument.numPages;

      console.log(`📄 [ContractOCR] PDF has ${numPages} pages`);

      // Extract text from all pages
      const textParts = [];

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Combine text items
        const pageText = textContent.items
          .map(item => item.str)
          .join(' ');

        textParts.push(pageText);
      }

      const fullText = textParts.join('\n');

      console.log(`✅ [ContractOCR] Extracted ${fullText.length} characters from ${numPages} pages`);

      return fullText;
    } catch (error) {
      console.error('❌ [ContractOCR] PDF text extraction failed:', error);
      throw error;
    }
  }

  /**
   * Extract contract value (monetary amount)
   */
  extractContractValue(text) {
    const patterns = [
      { regex: /contract\s*sum[:\s]*£?([\d,]+\.?\d*)/i, priority: 10 },
      { regex: /total\s*(?:contract\s*)?value[:\s]*£?([\d,]+\.?\d*)/i, priority: 9 },
      { regex: /sum\s*of[:\s]*£?([\d,]+\.?\d*)/i, priority: 8 },
      { regex: /£([\d,]+\.?\d*)\s*\([^)]*pounds?\)/i, priority: 7 },
      { regex: /contract\s*price[:\s]*£?([\d,]+\.?\d*)/i, priority: 6 },
    ];

    let bestMatch = null;
    let highestPriority = 0;

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match && pattern.priority > highestPriority) {
        const valueStr = match[1].replace(/,/g, '');
        const value = parseFloat(valueStr);

        if (!isNaN(value) && value > 0) {
          bestMatch = {
            value,
            confidence: pattern.priority / 10,
            source: match[0].trim(),
          };
          highestPriority = pattern.priority;
        }
      }
    }

    return bestMatch || { value: null, confidence: 0, source: 'Not found' };
  }

  /**
   * Extract supplier/contractor name
   */
  extractSupplierName(text) {
    const patterns = [
      // "between X and Y" pattern - take second party
      {
        regex: /between\s+(.+?)\s+(?:and|&)\s+(.+?)\s+(?:for|in respect|relating|dated)/i,
        extract: (match) => match[2], // Second party is usually contractor
        priority: 10,
      },
      // "contractor: Company Name"
      {
        regex: /contractor[:\s]+([A-Z][A-Za-z\s&]+(?:Ltd|Limited|PLC|LLP|Inc)\.?)/i,
        extract: (match) => match[1],
        priority: 9,
      },
      // "carried out by Company Name"
      {
        regex: /carried\s+out\s+by[:\s]+([A-Z][A-Za-z\s&]+(?:Ltd|Limited|PLC|LLP|Inc)\.?)/i,
        extract: (match) => match[1],
        priority: 8,
      },
    ];

    let bestMatch = null;
    let highestPriority = 0;

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match && pattern.priority > highestPriority) {
        const value = pattern.extract(match).trim();

        if (value.length > 3) {
          bestMatch = {
            value,
            confidence: pattern.priority / 10,
            source: match[0].trim().substring(0, 100),
          };
          highestPriority = pattern.priority;
        }
      }
    }

    return bestMatch || { value: null, confidence: 0, source: 'Not found' };
  }

  /**
   * Extract client/employer name
   */
  extractClientName(text) {
    const patterns = [
      // "between X and Y" pattern - take first party
      {
        regex: /between\s+(.+?)\s+(?:and|&)\s+(.+?)\s+(?:for|in respect|relating|dated)/i,
        extract: (match) => match[1], // First party is usually client
        priority: 10,
      },
      // "employer: Company Name"
      {
        regex: /employer[:\s]+([A-Z][A-Za-z\s&]+(?:Ltd|Limited|PLC|LLP|Inc)\.?)/i,
        extract: (match) => match[1],
        priority: 9,
      },
      // "client: Company Name"
      {
        regex: /client[:\s]+([A-Z][A-Za-z\s&]+(?:Ltd|Limited|PLC|LLP|Inc)\.?)/i,
        extract: (match) => match[1],
        priority: 8,
      },
    ];

    let bestMatch = null;
    let highestPriority = 0;

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match && pattern.priority > highestPriority) {
        const value = pattern.extract(match).trim();

        if (value.length > 3) {
          bestMatch = {
            value,
            confidence: pattern.priority / 10,
            source: match[0].trim().substring(0, 100),
          };
          highestPriority = pattern.priority;
        }
      }
    }

    return bestMatch || { value: null, confidence: 0, source: 'Not found' };
  }

  /**
   * Extract date based on keywords
   */
  extractDate(text, keywords) {
    // Build regex pattern from keywords
    const keywordPattern = keywords.join('|');
    const patterns = [
      // DD Month YYYY (24 November 2025)
      {
        regex: new RegExp(`(?:${keywordPattern})[:\\s]+(?:on\\s+)?(\\d{1,2})\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{4})`, 'i'),
        parse: (match) => this.parseDate(`${match[1]} ${match[2]} ${match[3]}`),
        priority: 10,
      },
      // DD/MM/YYYY or DD-MM-YYYY
      {
        regex: new RegExp(`(?:${keywordPattern})[:\\s]+(?:on\\s+)?(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4})`, 'i'),
        parse: (match) => this.parseDate(`${match[1]}/${match[2]}/${match[3]}`),
        priority: 9,
      },
      // YYYY-MM-DD
      {
        regex: new RegExp(`(?:${keywordPattern})[:\\s]+(?:on\\s+)?(\\d{4})-(\\d{1,2})-(\\d{1,2})`, 'i'),
        parse: (match) => `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`,
        priority: 8,
      },
    ];

    let bestMatch = null;
    let highestPriority = 0;

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match && pattern.priority > highestPriority) {
        const parsedDate = pattern.parse(match);

        if (parsedDate) {
          bestMatch = {
            value: parsedDate,
            confidence: pattern.priority / 10,
            source: match[0].trim(),
          };
          highestPriority = pattern.priority;
        }
      }
    }

    return bestMatch || { value: null, confidence: 0, source: 'Not found' };
  }

  /**
   * Parse date string to YYYY-MM-DD format
   */
  parseDate(dateStr) {
    try {
      const months = {
        january: '01', february: '02', march: '03', april: '04',
        may: '05', june: '06', july: '07', august: '08',
        september: '09', october: '10', november: '11', december: '12',
      };

      // Handle "DD Month YYYY"
      const monthMatch = dateStr.match(/(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i);
      if (monthMatch) {
        const day = monthMatch[1].padStart(2, '0');
        const month = months[monthMatch[2].toLowerCase()];
        const year = monthMatch[3];
        return `${year}-${month}-${day}`;
      }

      // Handle DD/MM/YYYY
      const slashMatch = dateStr.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
      if (slashMatch) {
        const day = slashMatch[1].padStart(2, '0');
        const month = slashMatch[2].padStart(2, '0');
        const year = slashMatch[3];
        return `${year}-${month}-${day}`;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract retention percentage
   */
  extractRetention(text) {
    const patterns = [
      { regex: /retention[:\s]*(\d+\.?\d*)%/i, priority: 10 },
      { regex: /(\d+\.?\d*)%\s*retention/i, priority: 9 },
      { regex: /retention\s*percentage[:\s]*(\d+\.?\d*)/i, priority: 8 },
      { regex: /retention\s*rate[:\s]*(\d+\.?\d*)%/i, priority: 7 },
    ];

    let bestMatch = null;
    let highestPriority = 0;

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match && pattern.priority > highestPriority) {
        const value = parseFloat(match[1]);

        if (!isNaN(value) && value >= 0 && value <= 100) {
          bestMatch = {
            value,
            confidence: pattern.priority / 10,
            source: match[0].trim(),
          };
          highestPriority = pattern.priority;
        }
      }
    }

    return bestMatch || { value: null, confidence: 0, source: 'Not found' };
  }

  /**
   * Extract defects liability period (in months)
   */
  extractDefectsLiability(text) {
    const patterns = [
      { regex: /defects\s*liability\s*period[:\s]*(\d+)\s*months?/i, priority: 10 },
      { regex: /DLP[:\s]*(\d+)\s*months?/i, priority: 9 },
      { regex: /(\d+)\s*months?\s*(?:defects|DLP)/i, priority: 8 },
      { regex: /rectification\s*period[:\s]*(\d+)\s*months?/i, priority: 7 },
    ];

    let bestMatch = null;
    let highestPriority = 0;

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match && pattern.priority > highestPriority) {
        const value = parseInt(match[1], 10);

        if (!isNaN(value) && value > 0 && value <= 60) { // Reasonable range
          bestMatch = {
            value,
            confidence: pattern.priority / 10,
            source: match[0].trim(),
          };
          highestPriority = pattern.priority;
        }
      }
    }

    return bestMatch || { value: null, confidence: 0, source: 'Not found' };
  }

  /**
   * Extract contract type (NEC4, JCT, FIDIC, etc.)
   */
  extractContractType(text) {
    const contractTypes = [
      // NEC contracts
      { pattern: /NEC4\s*(?:ECC\s*)?(?:Option\s+[A-F])?/i, type: 'NEC4', priority: 10 },
      { pattern: /NEC3\s*(?:ECC\s*)?(?:Option\s+[A-F])?/i, type: 'NEC3', priority: 10 },
      { pattern: /NEC\s*Engineering\s*and\s*Construction\s*Contract/i, type: 'NEC', priority: 9 },

      // JCT contracts
      { pattern: /JCT\s*Design\s*and\s*Build/i, type: 'JCT Design and Build', priority: 10 },
      { pattern: /JCT\s*Standard\s*Building\s*Contract/i, type: 'JCT Standard Building', priority: 10 },
      { pattern: /JCT\s*Minor\s*Works/i, type: 'JCT Minor Works', priority: 10 },
      { pattern: /JCT\s*[\d]{4}/i, type: 'JCT', priority: 9 },

      // FIDIC contracts
      { pattern: /FIDIC\s*Red\s*Book/i, type: 'FIDIC Red Book', priority: 10 },
      { pattern: /FIDIC\s*Yellow\s*Book/i, type: 'FIDIC Yellow Book', priority: 10 },
      { pattern: /FIDIC\s*Silver\s*Book/i, type: 'FIDIC Silver Book', priority: 10 },
      { pattern: /FIDIC/i, type: 'FIDIC', priority: 8 },

      // Other common types
      { pattern: /ICE\s*Conditions\s*of\s*Contract/i, type: 'ICE', priority: 9 },
      { pattern: /bespoke\s*contract/i, type: 'Bespoke', priority: 7 },
    ];

    let bestMatch = null;
    let highestPriority = 0;

    for (const contractType of contractTypes) {
      const match = text.match(contractType.pattern);
      if (match && contractType.priority > highestPriority) {
        bestMatch = {
          value: contractType.type,
          confidence: contractType.priority / 10,
          source: match[0].trim(),
        };
        highestPriority = contractType.priority;
      }
    }

    return bestMatch || { value: null, confidence: 0, source: 'Not found' };
  }

  /**
   * Extract payment terms (in days)
   */
  extractPaymentTerms(text) {
    const patterns = [
      { regex: /payment\s*(?:within|of|terms?)[:\s]*(\d+)\s*days/i, priority: 10 },
      { regex: /(\d+)\s*days?\s*(?:from|after|of)\s*(?:invoice|application|valuation)/i, priority: 9 },
      { regex: /pay(?:ment)?\s*(?:due\s*)?(?:in|within)[:\s]*(\d+)\s*days/i, priority: 8 },
      { regex: /(\d+)\s*day\s*payment/i, priority: 7 },
    ];

    let bestMatch = null;
    let highestPriority = 0;

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match && pattern.priority > highestPriority) {
        const value = parseInt(match[1], 10);

        if (!isNaN(value) && value > 0 && value <= 180) { // Reasonable range
          bestMatch = {
            value,
            confidence: pattern.priority / 10,
            source: match[0].trim(),
          };
          highestPriority = pattern.priority;
        }
      }
    }

    return bestMatch || { value: null, confidence: 0, source: 'Not found' };
  }

  /**
   * Extract liquidated damages (£ per day/week)
   */
  extractLiquidatedDamages(text) {
    const patterns = [
      { regex: /liquidated\s*(?:and\s*ascertained\s*)?damages[:\s]*£?([\d,]+)/i, priority: 10 },
      { regex: /LADs?[:\s]*£?([\d,]+)/i, priority: 9 },
      { regex: /damages\s*of\s*£?([\d,]+)\s*per\s*(?:day|week)/i, priority: 8 },
      { regex: /£([\d,]+)\s*per\s*(?:day|week).*(?:delay|damages)/i, priority: 7 },
    ];

    let bestMatch = null;
    let highestPriority = 0;

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match && pattern.priority > highestPriority) {
        const valueStr = match[1].replace(/,/g, '');
        const value = parseFloat(valueStr);

        if (!isNaN(value) && value > 0) {
          bestMatch = {
            value,
            confidence: pattern.priority / 10,
            source: match[0].trim(),
          };
          highestPriority = pattern.priority;
        }
      }
    }

    return bestMatch || { value: null, confidence: 0, source: 'Not found' };
  }

  /**
   * Process contract OCR - main orchestration function
   * Fetches document from storage, runs OCR, updates database
   */
  async processContractOcr(contractId, tenantId) {
    try {
      console.log(`🔄 [ContractOCR] Starting OCR processing for contract ${contractId}`);

      // Update status to PROCESSING
      await prisma.contract.update({
        where: { id: contractId },
        data: { ocrStatus: 'PROCESSING' },
      });

      // Fetch contract to get signed document URL
      const contract = await prisma.contract.findFirst({
        where: { id: contractId, tenantId },
        select: {
          id: true,
          signedDocumentUrl: true,
          signedDocumentName: true,
        },
      });

      if (!contract || !contract.signedDocumentUrl) {
        throw new Error('No signed document found for contract');
      }

      // Download document from local storage
      const fileBuffer = await this.downloadFromLocalStorage(contract.signedDocumentUrl);

      // Extract metadata
      const result = await this.extractContractMetadata(fileBuffer, contractId);

      if (result.success) {
        // Update contract with OCR results
        await prisma.contract.update({
          where: { id: contractId },
          data: {
            ocrStatus: 'COMPLETED',
            ocrRawText: result.rawText,
            ocrExtractedData: result.extracted,
            ocrConfidence: result.overallConfidence,
          },
        });

        console.log(`✅ [ContractOCR] Successfully processed contract ${contractId}`);
        return { success: true, extracted: result.extracted };
      } else {
        throw new Error(result.error || 'OCR extraction failed');
      }
    } catch (error) {
      console.error(`❌ [ContractOCR] Failed to process contract ${contractId}:`, error);

      // Update status to FAILED
      await prisma.contract.update({
        where: { id: contractId },
        data: {
          ocrStatus: 'FAILED',
          ocrRawText: error.message,
        },
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Download file from local storage
   */
  async downloadFromLocalStorage(storageUrl) {
    try {
      // storageUrl is like "/uploads/contract-7-signed-1763986296093.pdf"
      // Convert to absolute path
      const uploadsDir = path.join(__dirname, '../uploads');
      const filename = path.basename(storageUrl);
      const filePath = path.join(uploadsDir, filename);

      console.log(`📁 [ContractOCR] Reading file: ${filePath}`);

      const fileBuffer = await fs.readFile(filePath);

      console.log(`✅ [ContractOCR] File loaded: ${fileBuffer.length} bytes`);

      return fileBuffer;
    } catch (error) {
      console.error('❌ [ContractOCR] Failed to download from local storage:', error);
      throw new Error(`Failed to download document: ${error.message}`);
    }
  }
}

// Export singleton instance
const contractOcrService = new ContractOcrService();

module.exports = {
  contractOcrService,
  extractContractMetadata: (fileBuffer, contractId) =>
    contractOcrService.extractContractMetadata(fileBuffer, contractId),
  processContractOcr: (contractId, tenantId) =>
    contractOcrService.processContractOcr(contractId, tenantId),
};
