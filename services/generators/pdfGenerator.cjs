/**
 * PDF Generator (Task 5.1)
 *
 * Generates PDF documents from export data using PDFKit.
 * Supports custom templates, styling, and professional layouts.
 *
 * @typedef {import('../export/types').PdfTemplateConfig} PdfTemplateConfig
 * @typedef {import('../export/types').PaymentApplicationExportData} PaymentApplicationExportData
 */

const PDFDocument = require('pdfkit');

/**
 * Generate PDF buffer from data
 *
 * @param {Object} data - Data to export
 * @param {Object} template - Template configuration
 * @returns {Promise<Buffer>} PDF file buffer
 */
async function generatePDF(data, template) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];

      // Collect PDF chunks
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Add content based on data type
      // This is a generic PDF generator; specific generators below handle different document types
      addHeader(doc, template);
      addContent(doc, data, template);
      addFooter(doc, template);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate Payment Application PDF
 */
async function generatePaymentApplicationPDF(application, template) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { config } = template;

      // Header
      addPaymentApplicationHeader(doc, application, config);

      // Application details
      doc.moveDown(2);
      addApplicationDetails(doc, application, config);

      // Financial summary
      doc.moveDown(2);
      addFinancialSummary(doc, application, config);

      // Line items (if included)
      if (config.includeLineItems && application.lines && application.lines.length > 0) {
        doc.addPage();
        addLineItemsTable(doc, application.lines, config);
      }

      // Footer
      addDocumentFooter(doc, config);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Add payment application header
 */
function addPaymentApplicationHeader(doc, application, config) {
  // Logo (if provided)
  if (config.logoUrl) {
    try {
      doc.image(config.logoUrl, 50, 45, { width: 100 });
    } catch (err) {
      // Skip if logo can't be loaded
      console.warn('Could not load logo:', err.message);
    }
  }

  // Title
  doc
    .fontSize(20)
    .font('Helvetica-Bold')
    .text('PAYMENT APPLICATION', 50, 50, { align: 'center' });

  doc.moveDown();

  // Application number
  doc
    .fontSize(14)
    .font('Helvetica')
    .text(`Application No: ${application.applicationNo || 'N/A'}`, { align: 'center' });

  doc.moveDown(2);

  // Horizontal line
  doc
    .strokeColor('#aaaaaa')
    .lineWidth(1)
    .moveTo(50, doc.y)
    .lineTo(550, doc.y)
    .stroke();

  doc.moveDown();
}

/**
 * Add application details section
 */
function addApplicationDetails(doc, application, config) {
  doc.fontSize(12).font('Helvetica-Bold').text('Application Details', { underline: true });
  doc.moveDown(0.5);

  const details = [
    ['Application Date:', formatDate(application.applicationDate, config.dateFormat)],
    ['Period Start:', formatDate(application.periodStart, config.dateFormat)],
    ['Period End:', formatDate(application.periodEnd, config.dateFormat)],
    ['Project:', application.project?.name || 'N/A'],
    ['Contract:', application.contract?.contractRef || 'N/A'],
  ];

  doc.font('Helvetica');

  details.forEach(([label, value]) => {
    doc.text(label, 50, doc.y, { continued: true, width: 150 });
    doc.text(value, { width: 350 });
  });
}

/**
 * Add financial summary section
 */
function addFinancialSummary(doc, application, config) {
  doc.fontSize(12).font('Helvetica-Bold').text('Financial Summary', { underline: true });
  doc.moveDown(0.5);

  // Create table
  const startY = doc.y;
  const tableTop = startY + 10;
  const tableWidth = 500;
  const col1X = 50;
  const col2X = 350;

  // Table header
  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .fillColor('#000000');

  doc.rect(col1X, tableTop, tableWidth, 25).fillAndStroke('#f0f0f0', '#000000');

  doc
    .fillColor('#000000')
    .text('Description', col1X + 10, tableTop + 8)
    .text('Amount', col2X + 10, tableTop + 8);

  // Table rows
  const rows = [
    ['Value This Period', application.claimedThisPeriod],
    ['Value to Date', application.cumulativeGross],
  ];

  if (config.includeRetention) {
    rows.push(
      ['Retention This Period', application.retentionThisPeriod],
      ['Retention to Date', application.retentionCumulative]
    );
  }

  rows.push(['Net Amount', application.netAmount]);

  doc.font('Helvetica');

  let currentY = tableTop + 25;

  rows.forEach(([label, value]) => {
    doc
      .rect(col1X, currentY, tableWidth, 20)
      .stroke('#cccccc');

    doc
      .text(label, col1X + 10, currentY + 5)
      .text(formatCurrency(value, config.currencyFormat), col2X + 10, currentY + 5);

    currentY += 20;
  });

  doc.y = currentY + 20;
}

/**
 * Add line items table
 */
function addLineItemsTable(doc, lines, config) {
  doc.fontSize(12).font('Helvetica-Bold').text('Line Items', { underline: true });
  doc.moveDown(0.5);

  const tableTop = doc.y;
  const itemX = 50;
  const descX = 100;
  const qtyX = 300;
  const rateX = 350;
  const thisX = 420;
  const toDateX = 480;

  // Header
  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor('#000000');

  doc.rect(50, tableTop, 500, 20).fillAndStroke('#f0f0f0', '#000000');

  doc
    .fillColor('#000000')
    .text('Item', itemX + 5, tableTop + 5)
    .text('Description', descX + 5, tableTop + 5)
    .text('Qty', qtyX + 5, tableTop + 5)
    .text('Rate', rateX + 5, tableTop + 5)
    .text('This Period', thisX + 5, tableTop + 5)
    .text('To Date', toDateX + 5, tableTop + 5);

  // Rows
  doc.font('Helvetica').fontSize(8);

  let currentY = tableTop + 20;

  lines.forEach((line, index) => {
    // Check if we need a new page
    if (currentY > 700) {
      doc.addPage();
      currentY = 50;
    }

    doc.rect(50, currentY, 500, 20).stroke('#cccccc');

    doc
      .text(line.itemNumber || (index + 1), itemX + 5, currentY + 5)
      .text(line.description || '', descX + 5, currentY + 5, { width: 190, ellipsis: true })
      .text(line.quantity || '', qtyX + 5, currentY + 5)
      .text(formatCurrency(line.rate, config.currencyFormat), rateX + 5, currentY + 5)
      .text(formatCurrency(line.thisPeriod, config.currencyFormat), thisX + 5, currentY + 5)
      .text(formatCurrency(line.toDate, config.currencyFormat), toDateX + 5, currentY + 5);

    currentY += 20;
  });

  doc.y = currentY + 20;
}

/**
 * Add document footer
 */
function addDocumentFooter(doc, config) {
  const pageHeight = doc.page.height;

  doc
    .fontSize(8)
    .font('Helvetica')
    .fillColor('#888888')
    .text(
      config.footerText || 'Generated by ERP System',
      50,
      pageHeight - 50,
      { align: 'center', width: 500 }
    );
}

/**
 * Add generic header
 */
function addHeader(doc, template) {
  doc
    .fontSize(18)
    .font('Helvetica-Bold')
    .text(template.name || 'Export Document', 50, 50, { align: 'center' });

  doc.moveDown(2);

  doc
    .strokeColor('#aaaaaa')
    .lineWidth(1)
    .moveTo(50, doc.y)
    .lineTo(550, doc.y)
    .stroke();

  doc.moveDown();
}

/**
 * Add generic content
 */
function addContent(doc, data, template) {
  doc.fontSize(10).font('Helvetica');

  // Simple key-value display
  const displayData = Array.isArray(data) ? data[0] : data;

  Object.entries(displayData).forEach(([key, value]) => {
    doc.text(`${key}: ${value}`, 50, doc.y, { width: 500 });
    doc.moveDown(0.5);
  });
}

/**
 * Add generic footer
 */
function addFooter(doc, template) {
  const pageHeight = doc.page.height;

  doc
    .fontSize(8)
    .font('Helvetica')
    .fillColor('#888888')
    .text(
      template.config?.footerText || 'Generated by ERP System',
      50,
      pageHeight - 50,
      { align: 'center', width: 500 }
    );
}

/**
 * Format date
 */
function formatDate(date, format = 'DD/MM/YYYY') {
  if (!date) return 'N/A';

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
      return d.toISOString().split('T')[0];
  }
}

/**
 * Format currency
 */
function formatCurrency(amount, format) {
  if (amount === null || amount === undefined) return '£0.00';

  const { decimals = 2, symbol = '£' } = format || {};
  const formatted = Number(amount).toFixed(decimals);

  return `${symbol}${formatted}`;
}

module.exports = {
  generatePDF,
  generatePaymentApplicationPDF,
};
