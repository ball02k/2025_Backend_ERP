/**
 * Excel Generator (Task 5.1)
 *
 * Generates Excel files (.xlsx) from export data using the xlsx library.
 * Supports custom templates, styling, and multiple sheets.
 *
 * @typedef {import('../export/types').ExcelTemplateConfig} ExcelTemplateConfig
 * @typedef {import('../export/types').PaymentApplicationExportData} PaymentApplicationExportData
 */

const XLSX = require('xlsx');

/**
 * Generate Excel file from data
 *
 * @param {Object} data - Data to export
 * @param {Object} template - Template configuration
 * @param {Object} options - Generation options
 * @returns {Buffer} Excel file buffer
 */
async function generateExcel(data, template, options = {}) {
  const { config = {}, fieldMappings = {} } = template;
  const {
    sheetName = 'Export',
    includeHeaders = true,
    autoWidth = true,
  } = options;

  // Create a new workbook
  const workbook = XLSX.utils.book_new();

  // Transform data based on field mappings
  const transformedData = transformDataForExcel(data, fieldMappings, config);

  // Create worksheet from data
  const worksheet = XLSX.utils.json_to_sheet(transformedData, {
    header: includeHeaders ? Object.keys(fieldMappings) : undefined,
  });

  // Auto-size columns if requested
  if (autoWidth) {
    worksheet['!cols'] = calculateColumnWidths(transformedData, Object.keys(fieldMappings));
  }

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Generate buffer
  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  });

  return buffer;
}

/**
 * Generate Excel file for Payment Application
 *
 * @param {Object} application - Payment application data
 * @param {Object} template - Template configuration
 * @returns {Buffer} Excel file buffer
 */
async function generatePaymentApplicationExcel(application, template) {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Application Summary
  const summaryData = buildApplicationSummary(application, template);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

  // Auto-size columns
  summarySheet['!cols'] = [
    { wch: 30 }, // Label column
    { wch: 20 }, // Value column
  ];

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Sheet 2: Line Items (if included)
  if (template.config.includeLineItems && application.lines) {
    const linesData = buildLineItemsData(application.lines, template);
    const linesSheet = XLSX.utils.json_to_sheet(linesData);

    // Auto-size columns
    linesSheet['!cols'] = calculateColumnWidths(linesData, Object.keys(linesData[0] || {}));

    XLSX.utils.book_append_sheet(workbook, linesSheet, 'Line Items');
  }

  // Generate buffer
  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  });

  return buffer;
}

/**
 * Build application summary data
 */
function buildApplicationSummary(application, template) {
  const { config } = template;
  const summary = [];

  // Header
  summary.push(['Payment Application']);
  summary.push([]);

  // Application details
  summary.push(['Application Number', application.applicationNo || '']);
  summary.push(['Application Date', formatDate(application.applicationDate, config.dateFormat)]);
  summary.push(['Period Start', formatDate(application.periodStart, config.dateFormat)]);
  summary.push(['Period End', formatDate(application.periodEnd, config.dateFormat)]);
  summary.push([]);

  // Project details
  summary.push(['Project', application.project?.name || '']);
  summary.push(['Contract', application.contract?.contractRef || '']);
  summary.push([]);

  // Financial summary
  summary.push(['FINANCIAL SUMMARY']);
  summary.push(['Value This Period', formatCurrency(application.claimedThisPeriod, config.currencyFormat)]);
  summary.push(['Value to Date', formatCurrency(application.cumulativeGross, config.currencyFormat)]);

  if (config.includeRetention) {
    summary.push(['Retention This Period', formatCurrency(application.retentionThisPeriod, config.currencyFormat)]);
    summary.push(['Retention to Date', formatCurrency(application.retentionCumulative, config.currencyFormat)]);
  }

  summary.push(['Net Amount', formatCurrency(application.netAmount, config.currencyFormat)]);

  return summary;
}

/**
 * Build line items data
 */
function buildLineItemsData(lines, template) {
  const { config } = template;

  return lines.map((line) => ({
    'Item': line.itemNumber || '',
    'Description': line.description || '',
    'Quantity': line.quantity || 0,
    'Unit': line.unit || '',
    'Rate': formatCurrency(line.rate, config.currencyFormat),
    'This Period': formatCurrency(line.thisPeriod, config.currencyFormat),
    'To Date': formatCurrency(line.toDate, config.currencyFormat),
  }));
}

/**
 * Transform data for Excel export based on field mappings
 */
function transformDataForExcel(data, fieldMappings, config) {
  if (!fieldMappings || Object.keys(fieldMappings).length === 0) {
    return Array.isArray(data) ? data : [data];
  }

  const items = Array.isArray(data) ? data : [data];

  return items.map((item) => {
    const transformed = {};

    for (const [excelColumn, dataPath] of Object.entries(fieldMappings)) {
      let value = getNestedValue(item, dataPath);

      // Apply formatting based on config
      if (value instanceof Date && config.dateFormat) {
        value = formatDate(value, config.dateFormat);
      } else if (typeof value === 'number' && config.currencyFormat && dataPath.toLowerCase().includes('amount')) {
        value = formatCurrency(value, config.currencyFormat);
      }

      transformed[excelColumn] = value || '';
    }

    return transformed;
  });
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
  if (!path) return undefined;

  const keys = path.split('.');
  let value = obj;

  for (const key of keys) {
    if (value === null || value === undefined) return undefined;
    value = value[key];
  }

  return value;
}

/**
 * Format date
 */
function formatDate(date, format = 'DD/MM/YYYY') {
  if (!date) return '';

  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  switch (format) {
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    default:
      return d.toISOString();
  }
}

/**
 * Format currency
 */
function formatCurrency(amount, format) {
  if (amount === null || amount === undefined) return '';

  const { decimals = 2, symbol = '£' } = format || {};
  const formatted = Number(amount).toFixed(decimals);

  return `${symbol}${formatted}`;
}

/**
 * Calculate optimal column widths
 */
function calculateColumnWidths(data, headers) {
  const widths = headers.map((header) => header.length);

  data.forEach((row) => {
    headers.forEach((header, index) => {
      const value = row[header];
      const length = value ? String(value).length : 0;
      widths[index] = Math.max(widths[index], length);
    });
  });

  // Add some padding and limit max width
  return widths.map((width) => ({
    wch: Math.min(Math.max(width + 2, 10), 50),
  }));
}

/**
 * Generate CVR Report Excel
 */
async function generateCVRReportExcel(cvrData, template) {
  const workbook = XLSX.utils.book_new();
  const { config } = template;

  // Sheet 1: CVR Summary
  const summaryData = buildCVRSummary(cvrData, config);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'CVR Summary');

  // Sheet 2: Cost Breakdown
  if (config.includeCostBreakdown) {
    const costData = buildCostBreakdown(cvrData.cost, config);
    const costSheet = XLSX.utils.json_to_sheet(costData);
    XLSX.utils.book_append_sheet(workbook, costSheet, 'Cost Breakdown');
  }

  // Sheet 3: Value Breakdown
  if (config.includeValueBreakdown) {
    const valueData = buildValueBreakdown(cvrData.value, config);
    const valueSheet = XLSX.utils.json_to_sheet(valueData);
    XLSX.utils.book_append_sheet(workbook, valueSheet, 'Value Breakdown');
  }

  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  });

  return buffer;
}

/**
 * Build CVR summary data
 */
function buildCVRSummary(cvrData, config) {
  const summary = [];

  summary.push(['Cost Value Reconciliation Report']);
  summary.push([]);
  summary.push(['Report Date', formatDate(cvrData.reportDate, config.dateFormat)]);
  summary.push(['Period End', formatDate(cvrData.periodEnd, config.dateFormat)]);
  summary.push([]);

  summary.push(['VALUE']);
  summary.push(['Total Value', formatCurrency(cvrData.value.totalValue, config.currencyFormat)]);
  summary.push([]);

  summary.push(['COST']);
  summary.push(['Total Cost', formatCurrency(cvrData.cost.totalCost, config.currencyFormat)]);
  summary.push([]);

  summary.push(['MARGIN']);
  summary.push(['Gross Margin', formatCurrency(cvrData.results.grossMargin, config.currencyFormat)]);
  summary.push(['Gross Margin %', `${cvrData.results.grossMarginPercentage.toFixed(2)}%`]);

  return summary;
}

/**
 * Build cost breakdown data
 */
function buildCostBreakdown(cost, config) {
  return [
    { Category: 'Labour', Amount: formatCurrency(cost.labour, config.currencyFormat) },
    { Category: 'Materials', Amount: formatCurrency(cost.materials, config.currencyFormat) },
    { Category: 'Subcontractors', Amount: formatCurrency(cost.subcontractors, config.currencyFormat) },
    { Category: 'Plant', Amount: formatCurrency(cost.plant, config.currencyFormat) },
    { Category: 'Overheads', Amount: formatCurrency(cost.overheads, config.currencyFormat) },
    { Category: 'Other', Amount: formatCurrency(cost.other, config.currencyFormat) },
    { Category: 'TOTAL', Amount: formatCurrency(cost.totalCost, config.currencyFormat) },
  ];
}

/**
 * Build value breakdown data
 */
function buildValueBreakdown(value, config) {
  return [
    { Category: 'Certified Value', Amount: formatCurrency(value.cumulativeCertified, config.currencyFormat) },
    { Category: 'Pending Certification', Amount: formatCurrency(value.pendingCertification, config.currencyFormat) },
    { Category: 'Retention Held', Amount: formatCurrency(value.retentionHeld, config.currencyFormat) },
    { Category: 'TOTAL', Amount: formatCurrency(value.totalValue, config.currencyFormat) },
  ];
}

module.exports = {
  generateExcel,
  generatePaymentApplicationExcel,
  generateCVRReportExcel,
};
