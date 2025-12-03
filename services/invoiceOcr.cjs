/**
 * Invoice OCR Service
 *
 * Extracts invoice data from:
 * - PDF files (using PDF.js)
 * - CSV files (direct parsing)
 * - DOCX files (using mammoth)
 *
 * Extracts: invoice number, dates, supplier, amounts, PO reference, line items
 */

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const mammoth = require('mammoth');
const Papa = require('papaparse');

class InvoiceOcrService {
  constructor() {
    console.log('📄 [InvoiceOCR] Initialized with PDF.js, Mammoth, and PapaParse');
  }

  /**
   * Main entry point for invoice extraction
   * @param {Buffer} fileBuffer - File buffer
   * @param {String} fileType - File type: 'pdf', 'csv', 'docx'
   * @param {String} fileName - Original filename
   * @returns {Object} - Extraction results
   */
  async extractInvoiceData(fileBuffer, fileType, fileName = '') {
    try {
      console.log(`📄 [InvoiceOCR] Starting extraction for ${fileName} (${fileType})`);

      // CSV files have direct parsing
      if (fileType === 'csv' || fileName.toLowerCase().endsWith('.csv')) {
        return await this.parseInvoiceCsv(fileBuffer);
      }

      // Extract text based on file type
      let rawText = '';
      if (fileType === 'pdf' || fileName.toLowerCase().endsWith('.pdf')) {
        rawText = await this.extractTextFromPDF(fileBuffer);
      } else if (fileType === 'docx' || fileName.toLowerCase().endsWith('.docx')) {
        rawText = await this.extractTextFromDOCX(fileBuffer);
      } else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }

      if (!rawText || rawText.length < 20) {
        throw new Error('Insufficient text extracted from document');
      }

      console.log(`✅ [InvoiceOCR] Extracted ${rawText.length} characters`);

      // Extract individual fields
      const extracted = {
        invoiceNumber: this.extractInvoiceNumber(rawText),
        supplierName: this.extractSupplierName(rawText),
        invoiceDate: this.extractDate(rawText, ['invoice date', 'date', 'tax point', 'issued']),
        dueDate: this.extractDate(rawText, ['due date', 'payment due', 'pay by', 'payment terms']),
        netAmount: this.extractAmount(rawText, ['net', 'subtotal', 'net total', 'net amount']),
        vatAmount: this.extractAmount(rawText, ['vat', 'tax', 'gst', 'vat amount']),
        grossAmount: this.extractAmount(rawText, ['total', 'amount due', 'gross', 'balance due', 'total amount']),
        poReference: this.extractPoReference(rawText),
        lineItems: this.extractLineItems(rawText),
      };

      // Calculate overall confidence
      const confidenceScores = Object.values(extracted)
        .filter(field => field && field.confidence !== undefined)
        .map(field => field.confidence);

      const overallConfidence = confidenceScores.length > 0
        ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
        : 0;

      console.log(`📊 [InvoiceOCR] Overall confidence: ${(overallConfidence * 100).toFixed(1)}%`);
      console.log(`📊 [InvoiceOCR] Extracted:`, {
        invoiceNumber: extracted.invoiceNumber.value,
        supplier: extracted.supplierName.value,
        invoiceDate: extracted.invoiceDate.value,
        net: extracted.netAmount.value,
        vat: extracted.vatAmount.value,
        gross: extracted.grossAmount.value,
        lineItems: extracted.lineItems.value?.length || 0,
      });

      return {
        success: true,
        source: 'PDF_OCR',
        rawText,
        extracted,
        overallConfidence,
      };
    } catch (error) {
      console.error('❌ [InvoiceOCR] Extraction error:', error);
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
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(fileBuffer),
        useSystemFonts: true,
      });

      const pdfDocument = await loadingTask.promise;
      const numPages = pdfDocument.numPages;
      let fullText = '';

      // Extract text from each page
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }

      return fullText;
    } catch (error) {
      console.error('❌ [InvoiceOCR] PDF extraction error:', error);
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from DOCX using Mammoth
   */
  async extractTextFromDOCX(fileBuffer) {
    try {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    } catch (error) {
      console.error('❌ [InvoiceOCR] DOCX extraction error:', error);
      throw new Error(`DOCX extraction failed: ${error.message}`);
    }
  }

  /**
   * Parse CSV invoice file
   * Expected format:
   * invoice_number,invoice_date,supplier_name,description,quantity,unit_price,vat_rate,net_amount,vat_amount,gross_amount,po_reference
   */
  async parseInvoiceCsv(fileBuffer) {
    try {
      const csvText = fileBuffer.toString('utf-8');
      const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
      });

      if (parsed.errors.length > 0) {
        console.warn('⚠️  [InvoiceOCR] CSV parsing warnings:', parsed.errors);
      }

      const rows = parsed.data;
      if (rows.length === 0) {
        throw new Error('CSV file is empty');
      }

      // Group rows by invoice number
      const invoiceGroups = {};
      rows.forEach((row) => {
        const invNum = row.invoice_number || row.invoice_no || row.number;
        if (!invNum) return;

        if (!invoiceGroups[invNum]) {
          invoiceGroups[invNum] = {
            invoiceNumber: invNum,
            invoiceDate: row.invoice_date || row.date,
            supplierName: row.supplier_name || row.supplier,
            poReference: row.po_reference || row.po_number || row.po,
            lineItems: [],
          };
        }

        // Add line item
        invoiceGroups[invNum].lineItems.push({
          description: row.description || '',
          quantity: parseFloat(row.quantity || row.qty || 1),
          unit: row.unit || 'ea',
          unitPrice: parseFloat(row.unit_price || row.rate || 0),
          netAmount: parseFloat(row.net_amount || row.net || 0),
          vatRate: parseFloat(row.vat_rate || row.vat_pct || 20),
          vatAmount: parseFloat(row.vat_amount || row.vat || 0),
          grossAmount: parseFloat(row.gross_amount || row.gross || row.total || 0),
        });
      });

      // Convert to array
      const invoices = Object.values(invoiceGroups).map((inv) => {
        // Calculate totals from line items
        const netTotal = inv.lineItems.reduce((sum, item) => sum + item.netAmount, 0);
        const vatTotal = inv.lineItems.reduce((sum, item) => sum + item.vatAmount, 0);
        const grossTotal = inv.lineItems.reduce((sum, item) => sum + item.grossAmount, 0);

        return {
          success: true,
          source: 'CSV_IMPORT',
          extracted: {
            invoiceNumber: { value: inv.invoiceNumber, confidence: 1.0 },
            supplierName: { value: inv.supplierName, confidence: 1.0 },
            invoiceDate: { value: inv.invoiceDate, confidence: 1.0 },
            dueDate: { value: null, confidence: 0 },
            netAmount: { value: netTotal, confidence: 1.0 },
            vatAmount: { value: vatTotal, confidence: 1.0 },
            grossAmount: { value: grossTotal, confidence: 1.0 },
            poReference: { value: inv.poReference, confidence: inv.poReference ? 1.0 : 0 },
            lineItems: { value: inv.lineItems, confidence: 1.0 },
          },
          overallConfidence: 1.0,
          rawText: `CSV Import: ${inv.lineItems.length} line items`,
        };
      });

      console.log(`✅ [InvoiceOCR] Parsed ${invoices.length} invoice(s) from CSV`);
      return invoices.length === 1 ? invoices[0] : { invoices, success: true };
    } catch (error) {
      console.error('❌ [InvoiceOCR] CSV parsing error:', error);
      return {
        success: false,
        error: error.message,
        extracted: {},
        overallConfidence: 0,
      };
    }
  }

  /**
   * Extract invoice number
   * Looks for: "Invoice No", "Invoice #", "Inv:", "Invoice Number"
   */
  extractInvoiceNumber(text) {
    const patterns = [
      /(?:invoice\s*(?:no|number|#|ref)?[:\s]+)([A-Z0-9\-\/]+)/i,
      /(?:inv[:\s]+)([A-Z0-9\-\/]+)/i,
      /(?:tax\s*invoice[:\s]+)([A-Z0-9\-\/]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          value: match[1].trim(),
          confidence: 0.9,
          source: 'pattern_match',
        };
      }
    }

    return { value: null, confidence: 0, source: 'not_found' };
  }

  /**
   * Extract supplier name
   * Looks for company name at top of document
   */
  extractSupplierName(text) {
    // Look in first 500 characters for company name patterns
    const topText = text.substring(0, 500);

    const patterns = [
      /(?:from|supplier)[:\s]+([A-Z][A-Za-z\s&.]+(?:Ltd|Limited|LLP|Inc|Corp|PLC))/i,
      /^([A-Z][A-Za-z\s&.]+(?:Ltd|Limited|LLP|Inc|Corp|PLC))/im,
    ];

    for (const pattern of patterns) {
      const match = topText.match(pattern);
      if (match) {
        return {
          value: match[1].trim(),
          confidence: 0.7,
          source: 'pattern_match',
        };
      }
    }

    return { value: null, confidence: 0, source: 'not_found' };
  }

  /**
   * Extract dates
   * @param {String} text - Text to search
   * @param {Array} keywords - Keywords to look for near dates
   */
  extractDate(text, keywords = []) {
    const datePatterns = [
      /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/,  // 25/11/2024 or 25-11-2024
      /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,  // 25 Nov 2024
      /(\d{4}-\d{2}-\d{2})/,  // 2024-11-25
    ];

    for (const keyword of keywords) {
      const regex = new RegExp(`${keyword}[:\\s]*([\\d\\/\\-\\s]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?[\\s\\d]*)`, 'i');
      const match = text.match(regex);

      if (match) {
        // Extract date from matched text
        for (const datePattern of datePatterns) {
          const dateMatch = match[1].match(datePattern);
          if (dateMatch) {
            return {
              value: this.normalizeDate(dateMatch[1]),
              confidence: 0.8,
              source: 'keyword_match',
            };
          }
        }
      }
    }

    return { value: null, confidence: 0, source: 'not_found' };
  }

  /**
   * Normalize date to ISO format
   */
  normalizeDate(dateStr) {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      return date.toISOString().split('T')[0]; // YYYY-MM-DD
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract amount (monetary value)
   * @param {String} text - Text to search
   * @param {Array} keywords - Keywords to look for near amounts
   */
  extractAmount(text, keywords = []) {
    const amountPatterns = [
      /£\s*([\d,]+\.?\d*)/,  // £1,234.56
      /([\d,]+\.?\d*)\s*GBP/i,  // 1234.56 GBP
      /([\d,]+\.\d{2})/,  // 1234.56
    ];

    for (const keyword of keywords) {
      const regex = new RegExp(`${keyword}[:\\s]*([£\\d,\\.\\s]+(?:GBP)?)`, 'i');
      const match = text.match(regex);

      if (match) {
        // Extract number from matched text
        for (const amountPattern of amountPatterns) {
          const amountMatch = match[1].match(amountPattern);
          if (amountMatch) {
            const cleanedAmount = amountMatch[1].replace(/,/g, '');
            const value = parseFloat(cleanedAmount);
            if (!isNaN(value)) {
              return {
                value,
                confidence: 0.85,
                source: 'keyword_match',
              };
            }
          }
        }
      }
    }

    return { value: null, confidence: 0, source: 'not_found' };
  }

  /**
   * Extract PO reference
   */
  extractPoReference(text) {
    const patterns = [
      /(?:PO|purchase\s*order)[:\s#]*([A-Z0-9\-\/]+)/i,
      /(?:your\s*ref|order\s*no)[:\s]*([A-Z0-9\-\/]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          value: match[1].trim(),
          confidence: 0.8,
          source: 'pattern_match',
        };
      }
    }

    return { value: null, confidence: 0, source: 'not_found' };
  }

  /**
   * Extract line items from invoice
   * Looks for table-like structures with description, qty, price, amount
   */
  extractLineItems(text) {
    const lineItems = [];

    // Look for table rows with numbers
    // Pattern: description | number | number | number
    const lines = text.split('\n');
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines
      if (!line) continue;

      // Detect table headers
      if (/description|item|product/i.test(line) && /qty|quantity|price|amount|total/i.test(line)) {
        inTable = true;
        continue;
      }

      // Detect table end
      if (/subtotal|net|total|vat|tax/i.test(line) && !inTable) {
        continue;
      }

      if (inTable) {
        // Try to extract line item data
        // Pattern: Some text followed by 2-4 numbers
        const numberPattern = /(\d+(?:\.\d{2})?)/g;
        const numbers = line.match(numberPattern);

        if (numbers && numbers.length >= 2) {
          const description = line.replace(numberPattern, '').trim();

          if (description && description.length > 2) {
            const nums = numbers.map(n => parseFloat(n));

            // Heuristic: qty, unitPrice, lineTotal OR unitPrice, lineTotal
            const item = {
              description,
              quantity: nums.length >= 3 ? nums[0] : 1,
              unit: 'ea',
              unitPrice: nums.length >= 3 ? nums[1] : nums[0],
              netAmount: nums[nums.length - 1],
              vatRate: 20, // default
              vatAmount: 0,
              grossAmount: nums[nums.length - 1],
            };

            lineItems.push(item);
          }
        }

        // Stop after encountering totals
        if (/^(?:sub)?total|net|gross/i.test(line)) {
          break;
        }
      }
    }

    return {
      value: lineItems.length > 0 ? lineItems : null,
      confidence: lineItems.length > 0 ? 0.6 : 0,
      source: 'table_extraction',
    };
  }
}

// Singleton instance
let instance = null;

function getInvoiceOcrService() {
  if (!instance) {
    instance = new InvoiceOcrService();
  }
  return instance;
}

module.exports = {
  InvoiceOcrService,
  getInvoiceOcrService,
};
