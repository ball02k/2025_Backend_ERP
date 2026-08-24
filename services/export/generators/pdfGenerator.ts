/**
 * PDF Generator (TypeScript Version)
 *
 * Generates professional PDF documents from standardized PaymentApplicationExportData.
 * Uses PDFKit for PDF creation with comprehensive formatting and styling.
 *
 * Features:
 * - Professional A4 layout with proper margins
 * - Table layouts with automatic pagination
 * - Page numbering and watermarks
 * - Declaration and signature sections
 * - UK date and currency formatting
 * - Certification section for approved applications
 */

import * as PDFDocument from 'pdfkit';
import {
  PaymentApplicationExportData,
  ExportTemplateConfig,
  ExportOptions,
  PdfTemplateConfig,
} from '../types';

import { GeneratorOutput } from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;

const COLORS = {
  primary: '#1e3a5f',
  secondary: '#4a5568',
  accent: '#2563eb',
  border: '#d1d5db',
  headerBg: '#f3f4f6',
  highlight: '#fef3c7',
  success: '#10b981',
  danger: '#ef4444',
  text: '#111827',
  textLight: '#6b7280',
};

const FONTS = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
};

// ============================================================================
// MAIN GENERATOR FUNCTION
// ============================================================================

/**
 * Generate PDF from payment application data
 *
 * @param data - Standardized payment application export data
 * @param config - Template configuration
 * @param options - Export options
 * @returns Buffer and MIME type
 */
export async function generatePdf(
  data: PaymentApplicationExportData,
  config: ExportTemplateConfig,
  options?: ExportOptions
): Promise<GeneratorOutput> {
  return new Promise((resolve, reject) => {
    try {
      const pdfConfig: PdfTemplateConfig = {
        pageSize: 'A4',
        orientation: 'portrait',
        margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        currencySymbol: config.pdf?.currencySymbol || '£',
        ...config.pdf,
      };

      const doc = new PDFDocument({
        size: pdfConfig.pageSize,
        margins: pdfConfig.margins,
        bufferPages: true, // Enable page numbering
        autoFirstPage: true,
      });

      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () =>
        resolve({
          buffer: Buffer.concat(chunks),
          mimeType: 'application/pdf',
        })
      );
      doc.on('error', reject);

      // Generate PDF content
      generatePdfContent(doc, data, config, pdfConfig);

      // Add page numbers (must be done after all content)
      addPageNumbers(doc);

      // Add watermark if specified
      if (options?.watermark) {
        addWatermark(doc, options.watermark);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate all PDF content sections
 */
function generatePdfContent(
  doc: PDFKit.PDFDocument,
  data: PaymentApplicationExportData,
  config: ExportTemplateConfig,
  pdfConfig: PdfTemplateConfig
): void {
  const currencySymbol = pdfConfig.currencySymbol || '£';

  // Page 1: Header and Project Info
  addDocumentHeader(doc, data, config);
  doc.moveDown(1);

  if (config.sections.header) {
    addProjectInfo(doc, data, config);
    doc.moveDown(1);
  }

  // Financial Summary (on first page if space allows)
  if (config.sections.summary) {
    // Check if we need a new page
    if (doc.y > A4_HEIGHT - 300) {
      doc.addPage();
    }
    addFinancialSummary(doc, data, config, currencySymbol);
  }

  // Line Items (new page)
  if (config.sections.lines && data.lines.length > 0) {
    doc.addPage();
    addLineItemsTable(doc, data.lines, config, currencySymbol);
  }

  // Variations (new page if present)
  if (config.sections.variations && data.variations && data.variations.length > 0) {
    doc.addPage();
    addVariationsSection(doc, data.variations, config, currencySymbol);
  }

  // Certification (if present)
  if (config.sections.certification && data.certification) {
    if (doc.y > A4_HEIGHT - 200) {
      doc.addPage();
    }
    doc.moveDown(2);
    addCertificationSection(doc, data.certification, config);
  }

  // Declaration and Signatures
  if (doc.y > A4_HEIGHT - 250) {
    doc.addPage();
  }
  doc.moveDown(2);
  addDeclarationSection(doc, data, config);

  // Document footer on last page
  addDocumentFooter(doc, config);
}

// ============================================================================
// SECTION GENERATORS
// ============================================================================

/**
 * Add document header with company info and title
 */
function addDocumentHeader(
  doc: PDFKit.PDFDocument,
  data: PaymentApplicationExportData,
  config: ExportTemplateConfig
): void {
  const startY = doc.y;

  // Company name and logo area
  if (config.branding?.logoUrl) {
    try {
      doc.image(config.branding.logoUrl, MARGIN, startY, { width: 80, height: 80 });
    } catch (err) {
      console.warn('Could not load logo:', err);
    }
  }

  // Company info (top right)
  doc
    .fontSize(10)
    .font(FONTS.regular)
    .fillColor(COLORS.textLight)
    .text(data.header.contractor.name, MARGIN + 350, startY, {
      width: 145,
      align: 'right',
    });

  if (data.header.contractor.address) {
    doc.text(data.header.contractor.address, {
      width: 145,
      align: 'right',
    });
  }

  doc.moveDown(2);

  // Main title
  doc
    .fontSize(24)
    .font(FONTS.bold)
    .fillColor(COLORS.primary)
    .text('PAYMENT APPLICATION', MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      align: 'center',
    });

  doc.moveDown(0.5);

  // Application reference
  doc
    .fontSize(14)
    .font(FONTS.regular)
    .fillColor(COLORS.secondary)
    .text(`Application No. ${data.header.applicationNumber}`, {
      width: CONTENT_WIDTH,
      align: 'center',
    });

  doc
    .fontSize(12)
    .fillColor(COLORS.textLight)
    .text(`Reference: ${data.header.applicationRef}`, {
      width: CONTENT_WIDTH,
      align: 'center',
    });

  doc.moveDown(1.5);

  // Horizontal separator line
  doc
    .strokeColor(COLORS.border)
    .lineWidth(2)
    .moveTo(MARGIN, doc.y)
    .lineTo(A4_WIDTH - MARGIN, doc.y)
    .stroke();

  doc.moveDown(1);
}

/**
 * Add project information in two-column layout
 */
function addProjectInfo(
  doc: PDFKit.PDFDocument,
  data: PaymentApplicationExportData,
  config: ExportTemplateConfig
): void {
  const { header } = data;
  const startY = doc.y;
  const col1X = MARGIN;
  const col2X = MARGIN + CONTENT_WIDTH / 2 + 10;
  const colWidth = CONTENT_WIDTH / 2 - 10;

  // Section title
  doc
    .fontSize(14)
    .font(FONTS.bold)
    .fillColor(COLORS.primary)
    .text('PROJECT INFORMATION', MARGIN, startY, { width: CONTENT_WIDTH });

  doc.moveDown(0.5);

  const sectionStartY = doc.y;

  // Left column - Project details
  doc
    .fontSize(10)
    .font(FONTS.bold)
    .fillColor(COLORS.secondary)
    .text('Project Details', col1X, sectionStartY);

  let leftY = doc.y + 5;

  const projectDetails: [string, string][] = [
    ['Project:', header.projectName],
    ['Project Ref:', header.projectRef],
    ['Contract:', header.contractRef || 'N/A'],
    ['Period Start:', formatDate(header.periodStart)],
    ['Period End:', formatDate(header.periodEnd)],
    ['Valuation Date:', formatDate(header.valuationDate)],
  ];

  doc.fontSize(9).font(FONTS.regular).fillColor(COLORS.text);

  projectDetails.forEach(([label, value]) => {
    doc.font(FONTS.bold).text(label, col1X, leftY, { width: 100, continued: true });
    doc.font(FONTS.regular).text(value, { width: colWidth - 100 });
    leftY = doc.y + 3;
  });

  // Right column - Parties
  doc
    .fontSize(10)
    .font(FONTS.bold)
    .fillColor(COLORS.secondary)
    .text('Parties', col2X, sectionStartY);

  let rightY = doc.y + 5;

  // Contractor
  doc
    .fontSize(9)
    .font(FONTS.bold)
    .fillColor(COLORS.text)
    .text('Contractor:', col2X, rightY);
  rightY = doc.y + 2;
  doc.font(FONTS.regular).text(header.contractor.name, col2X, rightY, { width: colWidth });
  rightY = doc.y + 2;

  if (header.contractor.address) {
    doc.text(header.contractor.address, col2X, rightY, { width: colWidth });
    rightY = doc.y + 8;
  }

  // Employer
  doc.font(FONTS.bold).text('Employer:', col2X, rightY);
  rightY = doc.y + 2;
  doc.font(FONTS.regular).text(header.employer.name, col2X, rightY, { width: colWidth });
  rightY = doc.y + 2;

  if (header.employer.address) {
    doc.text(header.employer.address, col2X, rightY, { width: colWidth });
    rightY = doc.y;
  }

  // Move past both columns
  doc.y = Math.max(leftY, rightY) + 10;

  // Bottom border
  doc
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .moveTo(MARGIN, doc.y)
    .lineTo(A4_WIDTH - MARGIN, doc.y)
    .stroke();

  doc.moveDown(0.5);
}

/**
 * Add financial summary section with highlighted total
 */
function addFinancialSummary(
  doc: PDFKit.PDFDocument,
  data: PaymentApplicationExportData,
  config: ExportTemplateConfig,
  currencySymbol: string
): void {
  const { summary } = data;
  const startY = doc.y;

  // Section title
  doc
    .fontSize(14)
    .font(FONTS.bold)
    .fillColor(COLORS.primary)
    .text('FINANCIAL SUMMARY', MARGIN, startY, { width: CONTENT_WIDTH });

  doc.moveDown(0.5);

  const tableTop = doc.y;
  const labelX = MARGIN;
  const valueX = MARGIN + CONTENT_WIDTH - 120;
  const rowHeight = 22;

  // Summary items with subtotals and spacing
  const items: Array<{ label: string; value: number; type?: 'header' | 'subtotal' | 'total' | 'spacer' }> = [
    { label: 'Gross Value This Period', value: summary.grossThisPeriod },
    { label: 'Materials on Site', value: summary.materialsOnSite },
    { label: 'Total This Period', value: summary.totalThisPeriod, type: 'subtotal' },
    { label: '', value: 0, type: 'spacer' },
    { label: 'Previous Cumulative', value: summary.previousCumulative },
    { label: 'Current Cumulative', value: summary.currentCumulative, type: 'subtotal' },
    { label: '', value: 0, type: 'spacer' },
    { label: 'Retention This Period', value: -summary.retentionThisPeriod },
    { label: 'Retention Cumulative', value: -summary.retentionCumulative },
  ];

  if (summary.mcdThisPeriod || summary.mcdCumulative) {
    items.push({ label: '', value: 0, type: 'spacer' });
    items.push({ label: 'MC Discount This Period', value: -(summary.mcdThisPeriod || 0) });
    items.push({ label: 'MC Discount Cumulative', value: -(summary.mcdCumulative || 0) });
  }

  items.push({ label: '', value: 0, type: 'spacer' });
  items.push({ label: 'Net This Period', value: summary.netThisPeriod, type: 'subtotal' });
  items.push({ label: 'Less: Previous Payments', value: -summary.previousPayments });
  items.push({ label: '', value: 0, type: 'spacer' });
  items.push({ label: 'AMOUNT DUE (excl. VAT)', value: summary.amountDue, type: 'total' });

  let currentY = tableTop;

  items.forEach((item) => {
    if (item.type === 'spacer') {
      currentY += 8;
      return;
    }

    const isTotal = item.type === 'total';
    const isSubtotal = item.type === 'subtotal';

    // Background for total row
    if (isTotal) {
      doc
        .rect(labelX, currentY, CONTENT_WIDTH, rowHeight)
        .fillAndStroke(COLORS.highlight, COLORS.border);
    }

    // Row border
    if (!isTotal) {
      doc.rect(labelX, currentY, CONTENT_WIDTH, rowHeight).stroke(COLORS.border);
    }

    // Label
    doc
      .fontSize(isTotal ? 11 : isSubtotal ? 10 : 9)
      .font(isTotal || isSubtotal ? FONTS.bold : FONTS.regular)
      .fillColor(isTotal ? COLORS.primary : COLORS.text)
      .text(item.label, labelX + 10, currentY + 6, {
        width: CONTENT_WIDTH - 140,
      });

    // Value
    doc
      .fontSize(isTotal ? 12 : isSubtotal ? 10 : 9)
      .font(isTotal || isSubtotal ? FONTS.bold : FONTS.regular)
      .text(formatCurrency(item.value, currencySymbol), valueX, currentY + 6, {
        width: 110,
        align: 'right',
      });

    currentY += rowHeight;
  });

  doc.y = currentY + 10;
}

/**
 * Add line items table with enhanced styling
 */
function addLineItemsTable(
  doc: PDFKit.PDFDocument,
  lines: PaymentApplicationExportData['lines'],
  config: ExportTemplateConfig,
  currencySymbol: string
): void {
  // Section title
  doc
    .fontSize(14)
    .font(FONTS.bold)
    .fillColor(COLORS.primary)
    .text('LINE ITEMS', MARGIN, doc.y, { width: CONTENT_WIDTH });

  doc.moveDown(0.5);

  const tableTop = doc.y;
  const itemX = MARGIN;
  const refX = MARGIN + 30;
  const descX = MARGIN + 90;
  const prevX = MARGIN + 290;
  const thisX = MARGIN + 370;
  const cumX = MARGIN + 450;

  const headerHeight = 25;
  const rowHeight = 22;

  // Header row
  doc
    .fontSize(9)
    .font(FONTS.bold)
    .fillColor('#ffffff')
    .rect(itemX, tableTop, CONTENT_WIDTH, headerHeight)
    .fillAndStroke(COLORS.primary, COLORS.primary);

  doc
    .fillColor('#ffffff')
    .text('#', itemX + 5, tableTop + 8, { width: 20 })
    .text('Ref', refX + 5, tableTop + 8, { width: 55 })
    .text('Description', descX + 5, tableTop + 8, { width: 195 })
    .text('Previous', prevX + 5, tableTop + 8, { width: 75, align: 'right' })
    .text('This Period', thisX + 5, tableTop + 8, { width: 75, align: 'right' })
    .text('Cumulative', cumX + 5, tableTop + 8, { width: 90, align: 'right' });

  let currentY = tableTop + headerHeight;

  // Calculate totals
  let totalPrev = 0;
  let totalThis = 0;
  let totalCum = 0;

  lines.forEach((line, index) => {
    totalPrev += line.previousCumulative;
    totalThis += line.thisPeriod;
    totalCum += line.currentCumulative;

    // Check if we need a new page (leave space for totals row)
    if (currentY > A4_HEIGHT - MARGIN - 100) {
      doc.addPage();
      currentY = MARGIN;
    }

    // Alternating row colors
    const isEven = index % 2 === 0;
    if (!isEven) {
      doc.rect(itemX, currentY, CONTENT_WIDTH, rowHeight).fill(COLORS.headerBg);
    }

    // Row border
    doc.rect(itemX, currentY, CONTENT_WIDTH, rowHeight).stroke(COLORS.border);

    // Row data
    doc
      .fontSize(8)
      .font(FONTS.regular)
      .fillColor(COLORS.text)
      .text(line.lineNumber.toString(), itemX + 5, currentY + 7, { width: 20 })
      .text(line.reference || '', refX + 5, currentY + 7, { width: 55, ellipsis: true })
      .text(line.description || '', descX + 5, currentY + 7, { width: 195, ellipsis: true })
      .text(formatCurrency(line.previousCumulative, currencySymbol), prevX + 5, currentY + 7, { width: 75, align: 'right' })
      .text(formatCurrency(line.thisPeriod, currencySymbol), thisX + 5, currentY + 7, { width: 75, align: 'right' })
      .text(formatCurrency(line.currentCumulative, currencySymbol), cumX + 5, currentY + 7, { width: 90, align: 'right' });

    currentY += rowHeight;
  });

  // Totals row
  doc
    .rect(itemX, currentY, CONTENT_WIDTH, rowHeight + 5)
    .fillAndStroke(COLORS.highlight, COLORS.border);

  doc
    .fontSize(9)
    .font(FONTS.bold)
    .fillColor(COLORS.primary)
    .text('TOTALS', itemX + 5, currentY + 9, { width: 285 })
    .text(formatCurrency(totalPrev, currencySymbol), prevX + 5, currentY + 9, { width: 75, align: 'right' })
    .text(formatCurrency(totalThis, currencySymbol), thisX + 5, currentY + 9, { width: 75, align: 'right' })
    .text(formatCurrency(totalCum, currencySymbol), cumX + 5, currentY + 9, { width: 90, align: 'right' });

  doc.y = currentY + rowHeight + 15;
}

/**
 * Add variations section with enhanced table
 */
function addVariationsSection(
  doc: PDFKit.PDFDocument,
  variations: NonNullable<PaymentApplicationExportData['variations']>,
  config: ExportTemplateConfig,
  currencySymbol: string
): void {
  // Section title
  doc
    .fontSize(14)
    .font(FONTS.bold)
    .fillColor(COLORS.primary)
    .text('VARIATIONS', MARGIN, doc.y, { width: CONTENT_WIDTH });

  doc.moveDown(0.5);

  const tableTop = doc.y;
  const numX = MARGIN;
  const refX = MARGIN + 35;
  const descX = MARGIN + 110;
  const valueX = MARGIN + 350;
  const prevX = MARGIN + 440;

  const headerHeight = 25;
  const rowHeight = 22;

  // Header row
  doc
    .fontSize(9)
    .font(FONTS.bold)
    .fillColor('#ffffff')
    .rect(numX, tableTop, CONTENT_WIDTH, headerHeight)
    .fillAndStroke(COLORS.primary, COLORS.primary);

  doc
    .fillColor('#ffffff')
    .text('No.', numX + 5, tableTop + 8, { width: 25 })
    .text('Reference', refX + 5, tableTop + 8, { width: 70 })
    .text('Description', descX + 5, tableTop + 8, { width: 235 })
    .text('Value', valueX + 5, tableTop + 8, { width: 85, align: 'right' })
    .text('This Period', prevX + 5, tableTop + 8, { width: 100, align: 'right' });

  let currentY = tableTop + headerHeight;

  // Calculate totals
  let totalValue = 0;
  let totalThis = 0;

  variations.forEach((variation, index) => {
    totalValue += variation.value;
    totalThis += variation.thisPeriod;

    // Check if we need a new page
    if (currentY > A4_HEIGHT - MARGIN - 100) {
      doc.addPage();
      currentY = MARGIN;
    }

    // Alternating row colors
    const isEven = index % 2 === 0;
    if (!isEven) {
      doc.rect(numX, currentY, CONTENT_WIDTH, rowHeight).fill(COLORS.headerBg);
    }

    // Row border
    doc.rect(numX, currentY, CONTENT_WIDTH, rowHeight).stroke(COLORS.border);

    // Row data
    doc
      .fontSize(8)
      .font(FONTS.regular)
      .fillColor(COLORS.text)
      .text(variation.variationNumber.toString(), numX + 5, currentY + 7, { width: 25 })
      .text(variation.reference, refX + 5, currentY + 7, { width: 70, ellipsis: true })
      .text(variation.description, descX + 5, currentY + 7, { width: 235, ellipsis: true })
      .text(formatCurrency(variation.value, currencySymbol), valueX + 5, currentY + 7, { width: 85, align: 'right' })
      .text(formatCurrency(variation.thisPeriod, currencySymbol), prevX + 5, currentY + 7, { width: 100, align: 'right' });

    currentY += rowHeight;
  });

  // Totals row
  doc
    .rect(numX, currentY, CONTENT_WIDTH, rowHeight + 5)
    .fillAndStroke(COLORS.highlight, COLORS.border);

  doc
    .fontSize(9)
    .font(FONTS.bold)
    .fillColor(COLORS.primary)
    .text('TOTALS', numX + 5, currentY + 9, { width: 345 })
    .text(formatCurrency(totalValue, currencySymbol), valueX + 5, currentY + 9, { width: 85, align: 'right' })
    .text(formatCurrency(totalThis, currencySymbol), prevX + 5, currentY + 9, { width: 100, align: 'right' });

  doc.y = currentY + rowHeight + 15;
}

/**
 * Add certification section (if certified)
 */
function addCertificationSection(
  doc: PDFKit.PDFDocument,
  certification: NonNullable<PaymentApplicationExportData['certification']>,
  config: ExportTemplateConfig
): void {
  // Section title
  doc
    .fontSize(14)
    .font(FONTS.bold)
    .fillColor(COLORS.success)
    .text('CERTIFICATION', MARGIN, doc.y, { width: CONTENT_WIDTH });

  doc.moveDown(0.5);

  const boxX = MARGIN;
  const boxY = doc.y;
  const boxWidth = CONTENT_WIDTH;
  const boxHeight = 100;

  // Certification box
  doc
    .rect(boxX, boxY, boxWidth, boxHeight)
    .fillAndStroke('#f0fdf4', COLORS.success);

  // Certification text
  doc
    .fontSize(10)
    .font(FONTS.regular)
    .fillColor(COLORS.text)
    .text(`Certified by: ${certification.certifiedBy || 'N/A'}`, boxX + 15, boxY + 15, {
      width: boxWidth - 30,
    });

  doc.text(`Certified Amount: ${formatCurrency(certification.certifiedAmount)}`, {
    width: boxWidth - 30,
  });

  if (certification.certifiedDate) {
    doc.text(`Date: ${formatDate(certification.certifiedDate)}`, {
      width: boxWidth - 30,
    });
  }

  if (certification.varianceNotes) {
    doc.moveDown(0.3);
    doc
      .font(FONTS.italic)
      .fillColor(COLORS.textLight)
      .text(`Notes: ${certification.varianceNotes}`, boxX + 15, doc.y, {
        width: boxWidth - 30,
      });
  }

  doc.y = boxY + boxHeight + 15;
}

/**
 * Add declaration and signature section
 */
function addDeclarationSection(
  doc: PDFKit.PDFDocument,
  data: PaymentApplicationExportData,
  config: ExportTemplateConfig
): void {
  const startY = doc.y;

  // Section title
  doc
    .fontSize(14)
    .font(FONTS.bold)
    .fillColor(COLORS.primary)
    .text('DECLARATION', MARGIN, startY, { width: CONTENT_WIDTH });

  doc.moveDown(0.5);

  // Declaration text
  doc
    .fontSize(9)
    .font(FONTS.regular)
    .fillColor(COLORS.text)
    .text(
      'I/We hereby certify that the payment application set out above is in all respects correct ' +
        'and that the work has been executed and materials supplied in accordance with the contract ' +
        'documents, and that all amounts stated are properly due and payable.',
      MARGIN,
      doc.y,
      {
        width: CONTENT_WIDTH,
        align: 'justify',
      }
    );

  doc.moveDown(1.5);

  // Signature lines in two columns
  const col1X = MARGIN;
  const col2X = MARGIN + CONTENT_WIDTH / 2 + 20;
  const colWidth = CONTENT_WIDTH / 2 - 20;
  const signY = doc.y;

  // Contractor signature
  doc
    .fontSize(10)
    .font(FONTS.bold)
    .fillColor(COLORS.secondary)
    .text('For the Contractor:', col1X, signY);

  doc.moveDown(2);
  doc
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .moveTo(col1X, doc.y)
    .lineTo(col1X + colWidth, doc.y)
    .stroke();

  const signLineY = doc.y;
  doc.moveDown(0.3);
  doc
    .fontSize(8)
    .font(FONTS.regular)
    .fillColor(COLORS.textLight)
    .text('Signature', col1X, doc.y);

  doc.moveDown(0.5);
  doc
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .moveTo(col1X, doc.y)
    .lineTo(col1X + colWidth, doc.y)
    .stroke();

  doc.moveDown(0.3);
  doc.text(`Name: ${data.header.contractor.name}`, col1X, doc.y);

  doc.moveDown(0.5);
  doc
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .moveTo(col1X, doc.y)
    .lineTo(col1X + colWidth, doc.y)
    .stroke();

  const dateLineY = doc.y;
  doc.moveDown(0.3);
  doc.text('Date', col1X, doc.y);

  // Employer signature (right column)
  doc
    .fontSize(10)
    .font(FONTS.bold)
    .fillColor(COLORS.secondary)
    .text('For the Employer:', col2X, signY);

  doc.y = signLineY - 20;
  doc
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .moveTo(col2X, doc.y + 20)
    .lineTo(col2X + colWidth, doc.y + 20)
    .stroke();

  doc.y = signLineY + 5;
  doc
    .fontSize(8)
    .font(FONTS.regular)
    .fillColor(COLORS.textLight)
    .text('Signature', col2X, doc.y);

  doc.y = signLineY + 20;
  doc
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .moveTo(col2X, doc.y)
    .lineTo(col2X + colWidth, doc.y)
    .stroke();

  doc.moveDown(0.3);
  doc.text(`Name: ${data.header.employer.name}`, col2X, doc.y);

  doc.y = dateLineY - 10;
  doc
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .moveTo(col2X, doc.y + 10)
    .lineTo(col2X + colWidth, doc.y + 10)
    .stroke();

  doc.y = dateLineY + 5;
  doc.text('Date', col2X, doc.y);

  doc.y = Math.max(doc.y, dateLineY + 25);
}

/**
 * Add page numbers to all pages
 */
function addPageNumbers(doc: PDFKit.PDFDocument): void {
  const pages = doc.bufferedPageRange();
  const totalPages = pages.count;

  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);

    // Page number at bottom center
    doc
      .fontSize(9)
      .font(FONTS.regular)
      .fillColor(COLORS.textLight)
      .text(
        `Page ${i + 1} of ${totalPages}`,
        MARGIN,
        A4_HEIGHT - MARGIN + 10,
        {
          width: CONTENT_WIDTH,
          align: 'center',
        }
      );
  }
}

/**
 * Add watermark to all pages
 */
function addWatermark(doc: PDFKit.PDFDocument, watermarkText: string): void {
  const pages = doc.bufferedPageRange();

  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);

    // Rotate and add semi-transparent watermark
    doc.save();
    doc.rotate(-45, { origin: [A4_WIDTH / 2, A4_HEIGHT / 2] });
    doc
      .fontSize(60)
      .font(FONTS.bold)
      .fillColor(COLORS.border)
      .opacity(0.1)
      .text(watermarkText, 0, A4_HEIGHT / 2 - 30, {
        width: A4_WIDTH,
        align: 'center',
      });
    doc.restore();
  }
}

/**
 * Add document footer
 */
function addDocumentFooter(doc: PDFKit.PDFDocument, config: ExportTemplateConfig): void {
  const footerText = config.pdf?.footerText || 'Generated by ERP System';
  const footerY = A4_HEIGHT - MARGIN - 15;

  doc
    .fontSize(8)
    .font(FONTS.regular)
    .fillColor(COLORS.textLight)
    .text(footerText, MARGIN, footerY, { align: 'center', width: CONTENT_WIDTH });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format date for display (UK format: DD/MM/YYYY)
 */
function formatDate(date: Date | string): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format currency for display (UK format: £1,234.56)
 * Negative values shown in parentheses: (£1,234.56)
 */
function formatCurrency(amount: number, symbol: string = '£'): string {
  if (isNaN(amount)) return `${symbol}0.00`;

  const absAmount = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(absAmount)
    .replace('£', symbol);

  return amount < 0 ? `(${formatted})` : formatted;
}
