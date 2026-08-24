/**
 * CSV Generator (Task 5.1)
 *
 * Generates CSV files from export data.
 * Simple, lightweight format suitable for data import/export.
 *
 * @typedef {import('../export/types').CsvTemplateConfig} CsvTemplateConfig
 * @typedef {import('../export/types').PaymentApplicationExportData} PaymentApplicationExportData
 */

/**
 * Generate CSV from data
 *
 * @param {Object|Array} data - Data to export
 * @param {Object} template - Template configuration
 * @returns {Buffer} CSV file buffer
 */
async function generateCSV(data, template) {
  const { config = {}, fieldMappings = {} } = template;
  const {
    delimiter = ',',
    includeHeaders = true,
    dateFormat = 'YYYY-MM-DD',
  } = config;

  // Transform data based on field mappings
  const items = Array.isArray(data) ? data : [data];
  const headers = Object.keys(fieldMappings);
  const lines = [];

  // Add headers if requested
  if (includeHeaders) {
    lines.push(headers.join(delimiter));
  }

  // Add data rows
  items.forEach((item) => {
    const values = headers.map((header) => {
      const dataPath = fieldMappings[header];
      let value = getNestedValue(item, dataPath);

      // Format value
      value = formatValue(value, dateFormat);

      // Escape value for CSV
      return escapeCSVValue(value, delimiter);
    });

    lines.push(values.join(delimiter));
  });

  // Convert to buffer
  const csvContent = lines.join('\n');
  return Buffer.from(csvContent, 'utf8');
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
  if (!path) return '';

  const keys = path.split('.');
  let value = obj;

  for (const key of keys) {
    if (value === null || value === undefined) return '';
    value = value[key];
  }

  return value;
}

/**
 * Format value for CSV
 */
function formatValue(value, dateFormat) {
  if (value === null || value === undefined) {
    return '';
  }

  // Format dates
  if (value instanceof Date || (typeof value === 'string' && isDateString(value))) {
    return formatDate(value, dateFormat);
  }

  // Format numbers
  if (typeof value === 'number') {
    return value.toString();
  }

  // Convert objects/arrays to JSON string
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Check if string is a date
 */
function isDateString(str) {
  if (typeof str !== 'string') return false;

  // Check for ISO date format or common date formats
  const dateRegex = /^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}/;
  return dateRegex.test(str) && !isNaN(Date.parse(str));
}

/**
 * Format date for CSV
 */
function formatDate(date, format = 'YYYY-MM-DD') {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  switch (format) {
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD':
    default:
      return `${year}-${month}-${day}`;
  }
}

/**
 * Escape CSV value
 *
 * Wraps value in quotes if it contains delimiter, quotes, or newlines
 */
function escapeCSVValue(value, delimiter = ',') {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // Check if value needs escaping
  if (
    str.includes(delimiter) ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    // Escape quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return str;
}

/**
 * Generate CSV from payment application
 */
async function generatePaymentApplicationCSV(application, template) {
  const { config } = template;

  // Flatten application data
  const flatData = {
    applicationNo: application.applicationNo,
    applicationDate: application.applicationDate,
    periodStart: application.periodStart,
    periodEnd: application.periodEnd,
    claimedThisPeriod: application.claimedThisPeriod,
    cumulativeGross: application.cumulativeGross,
    retentionThisPeriod: application.retentionThisPeriod,
    retentionCumulative: application.retentionCumulative,
    netAmount: application.netAmount,
    projectName: application.project?.name,
    contractRef: application.contract?.contractRef,
    supplierName: application.supplier?.name,
  };

  return generateCSV(flatData, template);
}

/**
 * Generate CSV from line items
 */
async function generateLineItemsCSV(lines, template) {
  const { config } = template;

  const csvData = lines.map((line) => ({
    itemNumber: line.itemNumber,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    rate: line.rate,
    thisPeriod: line.thisPeriod,
    toDate: line.toDate,
  }));

  return generateCSV(csvData, template);
}

/**
 * Generate multi-sheet CSV (multiple CSV files in a zip)
 */
async function generateMultiSheetCSV(sheets, template) {
  const csvFiles = [];

  for (const [sheetName, data] of Object.entries(sheets)) {
    const csvBuffer = await generateCSV(data, template);
    csvFiles.push({
      name: `${sheetName}.csv`,
      content: csvBuffer,
    });
  }

  return csvFiles;
}

module.exports = {
  generateCSV,
  generatePaymentApplicationCSV,
  generateLineItemsCSV,
  generateMultiSheetCSV,
};
