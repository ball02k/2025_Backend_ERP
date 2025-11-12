// ==============================================================================
// PAYMENT APPLICATION OCR PARSER
// ==============================================================================

/**
 * Parse OCR text to extract payment application data
 *
 * Supports common UK construction payment application formats:
 * - JCT Interim Application forms
 * - NEC Payment Certificates
 * - Custom contractor formats
 */
class PaymentApplicationParser {
  constructor() {
    // Common field patterns
    this.patterns = {
      // Application reference/number
      applicationNo: [
        /application\s*(?:no|number|#|ref)[\s:]*([A-Z0-9\-\/]+)/i,
        /valuation\s*(?:no|number|#)[\s:]*([A-Z0-9\-\/]+)/i,
        /interim\s*(?:certificate|application)\s*(?:no|number|#)[\s:]*([A-Z0-9\-\/]+)/i,
      ],

      // Dates
      applicationDate: [
        /application\s*date[\s:]*(\d{1,2}[\s\/-]\d{1,2}[\s\/-]\d{2,4})/i,
        /date\s*of\s*application[\s:]*(\d{1,2}[\s\/-]\d{1,2}[\s\/-]\d{2,4})/i,
        /submission\s*date[\s:]*(\d{1,2}[\s\/-]\d{1,2}[\s\/-]\d{2,4})/i,
      ],

      valuationDate: [
        /valuation\s*date[\s:]*(\d{1,2}[\s\/-]\d{1,2}[\s\/-]\d{2,4})/i,
        /period\s*end[\s:]*(\d{1,2}[\s\/-]\d{1,2}[\s\/-]\d{2,4})/i,
        /assessment\s*date[\s:]*(\d{1,2}[\s\/-]\d{1,2}[\s\/-]\d{2,4})/i,
      ],

      dueDate: [
        /due\s*date[\s:]*(\d{1,2}[\s\/-]\d{1,2}[\s\/-]\d{2,4})/i,
        /payment\s*due[\s:]*(\d{1,2}[\s\/-]\d{1,2}[\s\/-]\d{2,4})/i,
      ],

      periodStart: [
        /period\s*start[\s:]*(\d{1,2}[\s\/-]\d{1,2}[\s\/-]\d{2,4})/i,
        /from[\s:]*(\d{1,2}[\s\/-]\d{1,2}[\s\/-]\d{2,4})/i,
      ],

      periodEnd: [
        /period\s*end[\s:]*(\d{1,2}[\s\/-]\d{1,2}[\s\/-]\d{2,4})/i,
        /to[\s:]*(\d{1,2}[\s\/-]\d{1,2}[\s\/-]\d{2,4})/i,
      ],

      // Money amounts (£ symbol or GBP)
      grossValue: [
        /gross\s*(?:value|amount|total)[\s:]*[£$]?\s*([0-9,]+\.?\d{0,2})/i,
        /total\s*(?:value|amount)[\s:]*[£$]?\s*([0-9,]+\.?\d{0,2})/i,
        /cumulative\s*value[\s:]*[£$]?\s*([0-9,]+\.?\d{0,2})/i,
      ],

      retention: [
        /retention[\s:]*[£$]?\s*([0-9,]+\.?\d{0,2})/i,
        /retention\s*(?:held|amount)[\s:]*[£$]?\s*([0-9,]+\.?\d{0,2})/i,
      ],

      retentionPercentage: [
        /retention[\s:]*(\d{1,2}(?:\.\d{1,2})?)\s*%/i,
      ],

      previouslyPaid: [
        /previously\s*(?:paid|certified)[\s:]*[£$]?\s*([0-9,]+\.?\d{0,2})/i,
        /less\s*previous\s*(?:payments?|certificates?)[\s:]*[£$]?\s*([0-9,]+\.?\d{0,2})/i,
      ],

      thisPeriod: [
        /(?:amount|value)\s*(?:due|payable)\s*this\s*period[\s:]*[£$]?\s*([0-9,]+\.?\d{0,2})/i,
        /net\s*(?:amount|value)\s*due[\s:]*[£$]?\s*([0-9,]+\.?\d{0,2})/i,
        /payment\s*due[\s:]*[£$]?\s*([0-9,]+\.?\d{0,2})/i,
      ],

      // Contract details
      contractRef: [
        /contract\s*(?:ref|reference|no|number)[\s:]*([A-Z0-9\-\/]+)/i,
        /project\s*(?:ref|reference|no|number)[\s:]*([A-Z0-9\-\/]+)/i,
      ],

      contractName: [
        /contract\s*(?:name|title)[\s:]*(.+?)(?:\n|$)/i,
        /project\s*(?:name|title)[\s:]*(.+?)(?:\n|$)/i,
      ],

      // Supplier/Contractor
      supplierName: [
        /contractor[\s:]*(.+?)(?:\n|$)/i,
        /supplier[\s:]*(.+?)(?:\n|$)/i,
        /company[\s:]*(.+?)(?:\n|$)/i,
      ],

      supplierEmail: [
        /email[\s:]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      ],
    };
  }

  /**
   * Parse OCR text to extract payment application data
   * @param {String} ocrText - Raw OCR text
   * @param {Object} keyValuePairs - Key-value pairs from Textract FORMS
   * @returns {Object} - Extracted data
   */
  parse(ocrText, keyValuePairs = {}) {
    console.log('[Parser] Parsing payment application OCR text...');

    const extracted = {
      // Application details
      applicationNo: this.extractField('applicationNo', ocrText),
      title: null, // Will be generated from extracted data

      // Dates
      applicationDate: this.extractDate('applicationDate', ocrText),
      valuationDate: this.extractDate('valuationDate', ocrText),
      dueDate: this.extractDate('dueDate', ocrText),
      periodStart: this.extractDate('periodStart', ocrText),
      periodEnd: this.extractDate('periodEnd', ocrText),

      // Claimed amounts
      claimedGrossValue: this.extractMoney('grossValue', ocrText),
      claimedRetention: this.extractMoney('retention', ocrText),
      retentionPercentage: this.extractField('retentionPercentage', ocrText),
      claimedPreviouslyPaid: this.extractMoney('previouslyPaid', ocrText),
      claimedThisPeriod: this.extractMoney('thisPeriod', ocrText),

      // Contract details
      contractRef: this.extractField('contractRef', ocrText),
      contractName: this.extractField('contractName', ocrText),

      // Supplier details
      supplierName: this.extractField('supplierName', ocrText),
      supplierEmail: this.extractField('supplierEmail', ocrText),

      // Confidence and metadata
      confidence: 0,
      extractedFields: 0,
      totalFields: 0,
    };

    // Also check key-value pairs from Textract FORMS
    if (keyValuePairs && Object.keys(keyValuePairs).length > 0) {
      this.enrichFromKeyValuePairs(extracted, keyValuePairs);
    }

    // Calculate extraction confidence
    extracted.totalFields = 15; // Number of fields we're trying to extract
    extracted.extractedFields = Object.values(extracted).filter(v => v !== null && v !== undefined && v !== '').length;
    extracted.confidence = (extracted.extractedFields / extracted.totalFields) * 100;

    // Calculate missing fields
    if (!extracted.claimedNetValue && extracted.claimedGrossValue && extracted.claimedRetention) {
      extracted.claimedNetValue = extracted.claimedGrossValue - extracted.claimedRetention;
    }

    // Generate title if not present
    if (!extracted.title && extracted.applicationNo) {
      extracted.title = `Payment Application ${extracted.applicationNo}`;
    }

    console.log(`[Parser] Extracted ${extracted.extractedFields}/${extracted.totalFields} fields (${extracted.confidence.toFixed(1)}% confidence)`);

    return extracted;
  }

  /**
   * Extract field using patterns
   * @param {String} fieldName - Field name
   * @param {String} text - OCR text
   * @returns {String|null} - Extracted value
   */
  extractField(fieldName, text) {
    const patterns = this.patterns[fieldName];
    if (!patterns) return null;

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract and parse date
   * @param {String} fieldName - Field name
   * @param {String} text - OCR text
   * @returns {String|null} - ISO date string
   */
  extractDate(fieldName, text) {
    const dateStr = this.extractField(fieldName, text);
    if (!dateStr) return null;

    try {
      // Try to parse various date formats
      const parsed = this.parseDate(dateStr);
      return parsed ? parsed.toISOString() : null;
    } catch (error) {
      console.warn(`[Parser] Failed to parse date: ${dateStr}`);
      return null;
    }
  }

  /**
   * Parse date string in various UK formats
   * @param {String} dateStr - Date string
   * @returns {Date|null} - Parsed date
   */
  parseDate(dateStr) {
    // Try DD/MM/YYYY, DD-MM-YYYY, DD MM YYYY
    const patterns = [
      /^(\d{1,2})[\/\-\s](\d{1,2})[\/\-\s](\d{2,4})$/,  // DD/MM/YYYY
      /^(\d{2,4})[\/\-\s](\d{1,2})[\/\-\s](\d{1,2})$/,  // YYYY/MM/DD
    ];

    for (const pattern of patterns) {
      const match = dateStr.match(pattern);
      if (match) {
        let day, month, year;

        // UK format: DD/MM/YYYY
        if (match[1].length <= 2) {
          day = parseInt(match[1]);
          month = parseInt(match[2]) - 1; // JS months are 0-indexed
          year = parseInt(match[3]);
        } else {
          // ISO format: YYYY/MM/DD
          year = parseInt(match[1]);
          month = parseInt(match[2]) - 1;
          day = parseInt(match[3]);
        }

        // Handle 2-digit years
        if (year < 100) {
          year += 2000;
        }

        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Try native Date parsing as fallback
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) ? date : null;
  }

  /**
   * Extract and parse money amount
   * @param {String} fieldName - Field name
   * @param {String} text - OCR text
   * @returns {Number|null} - Amount in pounds
   */
  extractMoney(fieldName, text) {
    const amountStr = this.extractField(fieldName, text);
    if (!amountStr) return null;

    try {
      // Remove commas and convert to number
      const cleaned = amountStr.replace(/,/g, '');
      const amount = parseFloat(cleaned);
      return isNaN(amount) ? null : amount;
    } catch (error) {
      console.warn(`[Parser] Failed to parse money: ${amountStr}`);
      return null;
    }
  }

  /**
   * Enrich extracted data with key-value pairs from Textract FORMS
   * @param {Object} extracted - Extracted data
   * @param {Object} keyValuePairs - Key-value pairs from Textract
   */
  enrichFromKeyValuePairs(extracted, keyValuePairs) {
    // Common form field labels mapped to our schema
    const fieldMappings = {
      'Application Number': 'applicationNo',
      'Application No': 'applicationNo',
      'Valuation No': 'applicationNo',
      'Application Date': 'applicationDate',
      'Valuation Date': 'valuationDate',
      'Due Date': 'dueDate',
      'Period Start': 'periodStart',
      'Period End': 'periodEnd',
      'Gross Value': 'claimedGrossValue',
      'Retention': 'claimedRetention',
      'Previously Paid': 'claimedPreviouslyPaid',
      'Amount Due': 'claimedThisPeriod',
      'Contract Ref': 'contractRef',
      'Contract Name': 'contractName',
      'Contractor': 'supplierName',
      'Supplier': 'supplierName',
    };

    for (const [formLabel, ourField] of Object.entries(fieldMappings)) {
      // Check if this field exists in key-value pairs
      for (const [key, value] of Object.entries(keyValuePairs)) {
        if (key.toLowerCase().includes(formLabel.toLowerCase())) {
          // Only set if we haven't extracted it already
          if (!extracted[ourField] && value) {
            extracted[ourField] = value;
            console.log(`[Parser] Enriched ${ourField} from form field: ${key} = ${value}`);
          }
        }
      }
    }
  }

  /**
   * Extract line items from tables
   * @param {Array} tables - Tables extracted from Textract
   * @returns {Array} - Line items
   */
  extractLineItems(tables) {
    const lineItems = [];

    for (const table of tables) {
      // Skip tables that don't look like line item tables
      if (!table.rows || table.rows.length < 2) continue;

      const headers = table.rows[0];

      // Look for common column headers
      const descriptionCol = this.findColumnIndex(headers, ['description', 'item', 'work package']);
      const quantityCol = this.findColumnIndex(headers, ['quantity', 'qty']);
      const unitCol = this.findColumnIndex(headers, ['unit', 'um']);
      const rateCol = this.findColumnIndex(headers, ['rate', 'unit rate']);
      const valueCol = this.findColumnIndex(headers, ['value', 'amount', 'total']);

      if (descriptionCol === -1 || valueCol === -1) {
        continue; // Not a line item table
      }

      // Process data rows
      for (let i = 1; i < table.rows.length; i++) {
        const row = table.rows[i];

        const item = {
          description: row[descriptionCol] || '',
          quantity: this.parseNumber(row[quantityCol]) || 0,
          unit: row[unitCol] || '',
          rate: this.parseNumber(row[rateCol]) || 0,
          value: this.parseNumber(row[valueCol]) || 0,
        };

        // Only add if description and value are present
        if (item.description && item.value > 0) {
          lineItems.push(item);
        }
      }
    }

    console.log(`[Parser] Extracted ${lineItems.length} line items from tables`);
    return lineItems;
  }

  /**
   * Find column index by header keywords
   * @param {Array} headers - Table headers
   * @param {Array} keywords - Keywords to search for
   * @returns {Number} - Column index or -1
   */
  findColumnIndex(headers, keywords) {
    for (let i = 0; i < headers.length; i++) {
      const header = (headers[i] || '').toLowerCase();
      for (const keyword of keywords) {
        if (header.includes(keyword)) {
          return i;
        }
      }
    }
    return -1;
  }

  /**
   * Parse number from string (handles commas, currency symbols)
   * @param {String} str - String to parse
   * @returns {Number|null} - Parsed number
   */
  parseNumber(str) {
    if (!str) return null;
    const cleaned = String(str).replace(/[£$,]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
}

module.exports = new PaymentApplicationParser();
