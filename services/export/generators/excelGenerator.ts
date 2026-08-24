/**
 * Enhanced Excel Generator (Task 5.2)
 *
 * Professional Excel generation using ExcelJS for construction payment applications.
 * Supports template-based generation, advanced formatting, styling, and industry requirements.
 */

import ExcelJS from 'exceljs';
import {
  PaymentApplicationExportData,
  ExportTemplateConfig,
  ExportOptions,
  FieldMapping,
} from '../types';
import { downloadTemplate } from '../../../lib/storage';
import { GeneratorOutput } from '../types';

/**
 * Generate Excel file from payment application data
 */
export async function generateExcel(
  data: PaymentApplicationExportData,
  config: ExportTemplateConfig,
  options?: ExportOptions
): Promise<GeneratorOutput> {
  const workbook = new ExcelJS.Workbook();

  // Set workbook properties
  workbook.creator = 'ConstructERP';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Check if using a template file
  if (config.excel?.templateFile) {
    await populateTemplate(workbook, data, config);
  } else {
    // Generate from scratch
    await generateFromScratch(workbook, data, config);
  }

  // Apply watermark if requested
  if (options?.watermark) {
    applyWatermark(workbook, options.watermark);
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer: Buffer.from(buffer),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

/**
 * Populate an existing Excel template with data
 */
async function populateTemplate(
  workbook: ExcelJS.Workbook,
  data: PaymentApplicationExportData,
  config: ExportTemplateConfig
): Promise<void> {
  // Download template file
  const templateBuffer = await downloadTemplate(config.excel!.templateFile!);
  await workbook.xlsx.load(templateBuffer as any);

  // Get worksheet
  const sheetName = config.excel?.sheetName || workbook.worksheets[0]?.name;
  const worksheet = workbook.getWorksheet(sheetName);

  if (!worksheet) {
    throw new Error(`Worksheet "${sheetName}" not found in template`);
  }

  // Apply field mappings
  for (const mapping of config.fieldMappings) {
    const value = getNestedValue(data, mapping.sourceField);
    const transformedValue = transformValue(value, mapping);

    if (mapping.targetField.match(/^[A-Z]+\d+$/)) {
      // Cell reference like "B5"
      const cell = worksheet.getCell(mapping.targetField);
      cell.value = transformedValue;
    }
  }

  // Handle line items if specified
  if (config.sections.lines && config.excel?.lineItemsRange) {
    populateLineItems(worksheet, data.lines, config);
  }

  // Handle variations
  if (config.sections.variations && data.variations?.length) {
    populateVariations(worksheet, data.variations, config);
  }
}

/**
 * Generate Excel from scratch (no template)
 */
async function generateFromScratch(
  workbook: ExcelJS.Workbook,
  data: PaymentApplicationExportData,
  config: ExportTemplateConfig
): Promise<void> {
  const worksheet = workbook.addWorksheet(
    config.excel?.sheetName || 'Payment Application',
    {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.5,
          right: 0.5,
          top: 0.75,
          bottom: 0.75,
          header: 0.3,
          footer: 0.3,
        },
      },
    }
  );

  // Set column widths
  worksheet.columns = [
    { width: 5 },   // A - Line no
    { width: 12 },  // B - Reference
    { width: 40 },  // C - Description
    { width: 15 },  // D - Contract Value
    { width: 12 },  // E - Previous %
    { width: 15 },  // F - Previous Value
    { width: 12 },  // G - This Period %
    { width: 15 },  // H - This Period Value
    { width: 12 },  // I - Cumulative %
    { width: 15 },  // J - Cumulative Value
    { width: 15 },  // K - Remaining
  ];

  let currentRow = 1;

  // Title
  currentRow = addTitle(worksheet, data, currentRow, config);
  currentRow += 1;

  // Header information
  currentRow = addHeader(worksheet, data, currentRow, config);
  currentRow += 1;

  // Line items
  if (config.sections.lines) {
    currentRow = addLineItems(worksheet, data, currentRow, config);
    currentRow += 1;
  }

  // Variations
  if (config.sections.variations && data.variations?.length) {
    currentRow = addVariations(worksheet, data, currentRow, config);
    currentRow += 1;
  }

  // Summary
  if (config.sections.summary) {
    currentRow = addSummary(worksheet, data, currentRow, config);
  }

  // Certification (if exists)
  if (config.sections.certification && data.certification) {
    currentRow += 1;
    addCertification(worksheet, data, currentRow, config);
  }

  // Auto-fit columns if configured
  if (config.excel?.autoFit) {
    autoFitColumns(worksheet);
  }

  // Protect sheet if configured
  if (config.excel?.protectSheet) {
    await worksheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
    });
  }
}

/**
 * Add title section
 */
function addTitle(
  worksheet: ExcelJS.Worksheet,
  data: PaymentApplicationExportData,
  startRow: number,
  config: ExportTemplateConfig
): number {
  // Company name
  const titleCell = worksheet.getCell(`A${startRow}`);
  titleCell.value = data.header.contractor.name;
  titleCell.font = { size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.mergeCells(`A${startRow}:K${startRow}`);

  // Document title
  const subtitleRow = startRow + 1;
  const subtitleCell = worksheet.getCell(`A${subtitleRow}`);
  subtitleCell.value = `INTERIM PAYMENT APPLICATION No. ${data.header.applicationNumber}`;
  subtitleCell.font = { size: 14, bold: true };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.mergeCells(`A${subtitleRow}:K${subtitleRow}`);

  return subtitleRow + 1;
}

/**
 * Add header information
 */
function addHeader(
  worksheet: ExcelJS.Worksheet,
  data: PaymentApplicationExportData,
  startRow: number,
  config: ExportTemplateConfig
): number {
  const currencySymbol = config.excel?.currencySymbol || '£';

  const headerStyle: Partial<ExcelJS.Style> = {
    font: { bold: true },
    alignment: { vertical: 'middle' },
  };

  const valueStyle: Partial<ExcelJS.Style> = {
    alignment: { vertical: 'middle' },
  };

  const headers = [
    ['Project:', data.header.projectName],
    ['Project Ref:', data.header.projectRef],
    ['Contract Ref:', data.header.contractRef || '-'],
    ['Employer:', data.header.employer.name],
    ['Valuation Date:', formatDate(data.header.valuationDate)],
    ['Period:', `${formatDate(data.header.periodStart)} to ${formatDate(data.header.periodEnd)}`],
    ['Contract Value:', formatCurrency(data.header.contractValue, currencySymbol)],
  ];

  let row = startRow;
  for (const [label, value] of headers) {
    const labelCell = worksheet.getCell(`A${row}`);
    labelCell.value = label;
    Object.assign(labelCell, headerStyle);

    const valueCell = worksheet.getCell(`B${row}`);
    valueCell.value = value;
    Object.assign(valueCell, valueStyle);
    worksheet.mergeCells(`B${row}:D${row}`);

    row++;
  }

  // Add border around header section
  addBorder(worksheet, `A${startRow}`, `D${row - 1}`);

  return row;
}

/**
 * Add line items table
 */
function addLineItems(
  worksheet: ExcelJS.Worksheet,
  data: PaymentApplicationExportData,
  startRow: number,
  config: ExportTemplateConfig
): number {
  const currencySymbol = config.excel?.currencySymbol || '£';

  // Table header
  const headerRow = worksheet.getRow(startRow);
  const headers = [
    'No.',
    'Ref',
    'Description',
    'Contract Value',
    'Prev %',
    'Previous',
    'This %',
    'This Period',
    'Cum %',
    'Cumulative',
    'Remaining',
  ];

  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // Data rows
  let currentRow = startRow + 1;
  let currentSection = '';

  for (const line of data.lines) {
    // Section header if changed
    if (line.section && line.section !== currentSection) {
      currentSection = line.section;
      const sectionRow = worksheet.getRow(currentRow);
      sectionRow.getCell(1).value = line.section;
      sectionRow.font = { bold: true, italic: true };
      worksheet.mergeCells(`A${currentRow}:K${currentRow}`);
      sectionRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5F5F5' },
      };
      currentRow++;
    }

    const row = worksheet.getRow(currentRow);

    row.getCell(1).value = line.lineNumber;
    row.getCell(2).value = line.reference || '';
    row.getCell(3).value = line.description;
    row.getCell(4).value = line.contractValue;
    row.getCell(5).value = line.previousPercentage / 100;
    row.getCell(6).value = line.previousCumulative;
    row.getCell(7).value = line.thisPeriodPercentage / 100;
    row.getCell(8).value = line.thisPeriod;
    row.getCell(9).value = line.currentPercentage / 100;
    row.getCell(10).value = line.currentCumulative;
    row.getCell(11).value = line.remainingValue;

    // Format cells
    const currencyFormat = `${currencySymbol}#,##0.00`;
    row.getCell(4).numFmt = currencyFormat;
    row.getCell(5).numFmt = '0.00%';
    row.getCell(6).numFmt = currencyFormat;
    row.getCell(7).numFmt = '0.00%';
    row.getCell(8).numFmt = currencyFormat;
    row.getCell(9).numFmt = '0.00%';
    row.getCell(10).numFmt = currencyFormat;
    row.getCell(11).numFmt = currencyFormat;

    // Borders
    for (let col = 1; col <= 11; col++) {
      row.getCell(col).border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    }

    currentRow++;
  }

  // Totals row
  const totalsRow = worksheet.getRow(currentRow);
  totalsRow.getCell(3).value = 'TOTALS';
  totalsRow.getCell(3).font = { bold: true };

  const totals = calculateLineTotals(data.lines);
  totalsRow.getCell(4).value = totals.contractValue;
  totalsRow.getCell(6).value = totals.previousCumulative;
  totalsRow.getCell(8).value = totals.thisPeriod;
  totalsRow.getCell(10).value = totals.currentCumulative;
  totalsRow.getCell(11).value = totals.remaining;

  // Format totals
  const currencyFormat = `${currencySymbol}#,##0.00`;
  [4, 6, 8, 10, 11].forEach(col => {
    totalsRow.getCell(col).numFmt = currencyFormat;
    totalsRow.getCell(col).font = { bold: true };
    totalsRow.getCell(col).border = {
      top: { style: 'double' },
      bottom: { style: 'double' },
    };
  });

  return currentRow + 1;
}

/**
 * Add variations section
 */
function addVariations(
  worksheet: ExcelJS.Worksheet,
  data: PaymentApplicationExportData,
  startRow: number,
  config: ExportTemplateConfig
): number {
  const currencySymbol = config.excel?.currencySymbol || '£';

  // Section title
  const titleCell = worksheet.getCell(`A${startRow}`);
  titleCell.value = 'VARIATIONS';
  titleCell.font = { bold: true, size: 12 };
  worksheet.mergeCells(`A${startRow}:K${startRow}`);

  // Header row
  const headerRow = startRow + 1;
  const headers = ['No.', 'Ref', 'Description', 'Status', 'Value', '', 'Previous', '', 'This Period', '', 'Cumulative'];

  headers.forEach((header, index) => {
    const cell = worksheet.getCell(headerRow, index + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
  });

  // Data rows
  let currentRow = headerRow + 1;
  for (const variation of data.variations || []) {
    const row = worksheet.getRow(currentRow);
    row.getCell(1).value = variation.variationNumber;
    row.getCell(2).value = variation.reference;
    row.getCell(3).value = variation.description;
    row.getCell(4).value = variation.status;
    row.getCell(5).value = variation.value;
    row.getCell(7).value = variation.previousCumulative;
    row.getCell(9).value = variation.thisPeriod;
    row.getCell(11).value = variation.currentCumulative;

    const currencyFormat = `${currencySymbol}#,##0.00`;
    [5, 7, 9, 11].forEach(col => {
      row.getCell(col).numFmt = currencyFormat;
    });

    currentRow++;
  }

  // Totals
  const totalsRow = worksheet.getRow(currentRow);
  totalsRow.getCell(3).value = 'VARIATIONS TOTAL';
  totalsRow.getCell(3).font = { bold: true };

  const variationTotals = calculateVariationTotals(data.variations || []);
  totalsRow.getCell(5).value = variationTotals.value;
  totalsRow.getCell(7).value = variationTotals.previous;
  totalsRow.getCell(9).value = variationTotals.thisPeriod;
  totalsRow.getCell(11).value = variationTotals.cumulative;

  const currencyFormat = `${currencySymbol}#,##0.00`;
  [5, 7, 9, 11].forEach(col => {
    totalsRow.getCell(col).numFmt = currencyFormat;
    totalsRow.getCell(col).font = { bold: true };
  });

  return currentRow + 1;
}

/**
 * Add summary/valuation section
 */
function addSummary(
  worksheet: ExcelJS.Worksheet,
  data: PaymentApplicationExportData,
  startRow: number,
  config: ExportTemplateConfig
): number {
  const currencySymbol = config.excel?.currencySymbol || '£';

  // Section title
  const titleCell = worksheet.getCell(`A${startRow}`);
  titleCell.value = 'VALUATION SUMMARY';
  titleCell.font = { bold: true, size: 12 };
  worksheet.mergeCells(`A${startRow}:D${startRow}`);

  let currentRow = startRow + 1;

  const summaryLines: Array<[string, number, boolean?, boolean?]> = [
    ['Gross Valuation This Period', data.summary.grossThisPeriod],
    ['Materials on Site', data.summary.materialsOnSite],
    ['Total This Period', data.summary.totalThisPeriod, true],
    ['', 0],
    ['Less Retention', -data.summary.retentionThisPeriod],
  ];

  if (data.summary.mcdThisPeriod) {
    summaryLines.push(['Less Main Contractor Discount', -data.summary.mcdThisPeriod]);
  }
  if (data.summary.contracharges) {
    summaryLines.push(['Less Contracharges', -data.summary.contracharges]);
  }
  if (data.summary.otherDeductions) {
    summaryLines.push([`Less ${data.summary.otherDeductionsDesc || 'Other Deductions'}`, -data.summary.otherDeductions]);
  }

  summaryLines.push(
    ['', 0],
    ['Net Valuation This Period', data.summary.netThisPeriod, true],
    ['', 0],
    ['Less Previous Payments', -data.summary.previousPayments],
    ['', 0],
    ['Amount Due (Excl VAT)', data.summary.amountDue, true],
    [`VAT @ ${data.summary.vatRate}%`, data.summary.vatAmount],
    ['', 0],
    ['TOTAL AMOUNT DUE', data.summary.totalDue, true, true]
  );

  for (const [label, value, isBold, isTotal] of summaryLines) {
    if (label === '') {
      currentRow++;
      continue;
    }

    const labelCell = worksheet.getCell(`A${currentRow}`);
    labelCell.value = label;
    if (isBold) labelCell.font = { bold: true };
    worksheet.mergeCells(`A${currentRow}:C${currentRow}`);

    const valueCell = worksheet.getCell(`D${currentRow}`);
    valueCell.value = value as number;
    valueCell.numFmt = `${currencySymbol}#,##0.00`;
    valueCell.alignment = { horizontal: 'right' };
    if (isBold) valueCell.font = { bold: true };

    if (isTotal) {
      valueCell.font = { bold: true, size: 12 };
      valueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF0B3' },
      };
      valueCell.border = {
        top: { style: 'double' },
        bottom: { style: 'double' },
      };
    }

    currentRow++;
  }

  // Add border around summary
  addBorder(worksheet, `A${startRow}`, `D${currentRow - 1}`);

  return currentRow;
}

/**
 * Add certification section (if certificate exists)
 */
function addCertification(
  worksheet: ExcelJS.Worksheet,
  data: PaymentApplicationExportData,
  startRow: number,
  config: ExportTemplateConfig
): number {
  if (!data.certification) return startRow;

  const currencySymbol = config.excel?.currencySymbol || '£';

  const titleCell = worksheet.getCell(`A${startRow}`);
  titleCell.value = 'CERTIFICATION';
  titleCell.font = { bold: true, size: 12 };
  worksheet.mergeCells(`A${startRow}:D${startRow}`);

  let currentRow = startRow + 1;

  const certLines: Array<[string, any]> = [
    ['Certified Amount', data.certification.certifiedAmount],
  ];

  if (data.certification.certifiedDate) {
    certLines.push(['Certified Date', formatDate(data.certification.certifiedDate)]);
  }
  if (data.certification.certifiedBy) {
    certLines.push(['Certified By', data.certification.certifiedBy]);
  }

  for (const [label, value] of certLines) {
    const labelCell = worksheet.getCell(`A${currentRow}`);
    labelCell.value = label;
    labelCell.font = { bold: true };

    const valueCell = worksheet.getCell(`B${currentRow}`);
    if (typeof value === 'number') {
      valueCell.value = value;
      valueCell.numFmt = `${currencySymbol}#,##0.00`;
    } else {
      valueCell.value = value;
    }

    currentRow++;
  }

  if (data.certification.varianceNotes) {
    const notesLabel = worksheet.getCell(`A${currentRow}`);
    notesLabel.value = 'Notes:';
    notesLabel.font = { bold: true };

    currentRow++;
    const notesCell = worksheet.getCell(`A${currentRow}`);
    notesCell.value = data.certification.varianceNotes;
    worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  }

  return currentRow;
}

/**
 * Populate line items in template
 */
function populateLineItems(
  worksheet: ExcelJS.Worksheet,
  lines: PaymentApplicationExportData['lines'],
  config: ExportTemplateConfig
): void {
  const range = config.excel?.lineItemsRange;
  if (!range) return;

  // Parse range like "A15:K"
  const match = range.match(/([A-Z]+)(\d+):([A-Z]+)/);
  if (!match) return;

  const startCol = match[1];
  const startRow = parseInt(match[2]);
  const endCol = match[3];

  let currentRow = startRow;
  for (const line of lines) {
    // Map line data to columns based on field mappings
    const lineMappings = config.fieldMappings.filter(m =>
      m.sourceField.startsWith('lines.')
    );

    for (const mapping of lineMappings) {
      const field = mapping.sourceField.replace('lines.', '');
      const value = (line as any)[field];
      const transformedValue = transformValue(value, mapping);

      // Calculate target cell
      const targetCol = mapping.targetField.replace(/\d+/, '');
      const cell = worksheet.getCell(`${targetCol}${currentRow}`);
      cell.value = transformedValue;
    }

    currentRow++;
  }
}

/**
 * Populate variations in template
 */
function populateVariations(
  worksheet: ExcelJS.Worksheet,
  variations: NonNullable<PaymentApplicationExportData['variations']>,
  config: ExportTemplateConfig
): void {
  // Similar to populateLineItems
  const range = config.excel?.variationsRange;
  if (!range) return;

  const match = range.match(/([A-Z]+)(\d+):([A-Z]+)/);
  if (!match) return;

  const startRow = parseInt(match[2]);
  let currentRow = startRow;

  for (const variation of variations) {
    const variationMappings = config.fieldMappings.filter(m =>
      m.sourceField.startsWith('variations.')
    );

    for (const mapping of variationMappings) {
      const field = mapping.sourceField.replace('variations.', '');
      const value = (variation as any)[field];
      const transformedValue = transformValue(value, mapping);

      const targetCol = mapping.targetField.replace(/\d+/, '');
      const cell = worksheet.getCell(`${targetCol}${currentRow}`);
      cell.value = transformedValue;
    }

    currentRow++;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Transform value based on mapping configuration
 */
function transformValue(value: any, mapping: FieldMapping): any {
  if (value === null || value === undefined) {
    return mapping.defaultValue ?? '';
  }

  switch (mapping.transform) {
    case 'currency':
      return typeof value === 'number' ? value : parseFloat(String(value)) || 0;

    case 'percentage':
      const pct = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
      return pct / 100; // Excel expects decimals for percentage format

    case 'date':
      if (value instanceof Date) return value;
      return new Date(value);

    case 'number':
      return typeof value === 'number' ? value : parseFloat(String(value)) || 0;

    default:
      return value;
  }
}

/**
 * Format date for display
 */
function formatDate(date: Date | string | undefined): string {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Format currency for display
 */
function formatCurrency(value: number, symbol: string = '£'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: symbol === '£' ? 'GBP' : symbol === '$' ? 'USD' : symbol === '€' ? 'EUR' : 'GBP',
  }).format(value);
}

/**
 * Calculate line totals
 */
function calculateLineTotals(lines: PaymentApplicationExportData['lines']) {
  return lines.reduce(
    (acc, line) => ({
      contractValue: acc.contractValue + line.contractValue,
      previousCumulative: acc.previousCumulative + line.previousCumulative,
      thisPeriod: acc.thisPeriod + line.thisPeriod,
      currentCumulative: acc.currentCumulative + line.currentCumulative,
      remaining: acc.remaining + line.remainingValue,
    }),
    { contractValue: 0, previousCumulative: 0, thisPeriod: 0, currentCumulative: 0, remaining: 0 }
  );
}

/**
 * Calculate variation totals
 */
function calculateVariationTotals(variations: NonNullable<PaymentApplicationExportData['variations']>) {
  return variations.reduce(
    (acc, v) => ({
      value: acc.value + v.value,
      previous: acc.previous + v.previousCumulative,
      thisPeriod: acc.thisPeriod + v.thisPeriod,
      cumulative: acc.cumulative + v.currentCumulative,
    }),
    { value: 0, previous: 0, thisPeriod: 0, cumulative: 0 }
  );
}

/**
 * Add border around a range
 */
function addBorder(
  worksheet: ExcelJS.Worksheet,
  topLeft: string,
  bottomRight: string
): void {
  const [startCol, startRow] = parseCell(topLeft);
  const [endCol, endRow] = parseCell(bottomRight);

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const cell = worksheet.getCell(row, col);
      cell.border = {
        top: row === startRow ? { style: 'medium' } : { style: 'thin' },
        bottom: row === endRow ? { style: 'medium' } : { style: 'thin' },
        left: col === startCol ? { style: 'medium' } : { style: 'thin' },
        right: col === endCol ? { style: 'medium' } : { style: 'thin' },
      };
    }
  }
}

/**
 * Parse cell reference
 */
function parseCell(ref: string): [number, number] {
  const match = ref.match(/([A-Z]+)(\d+)/);
  if (!match) return [1, 1];

  const col = match[1].split('').reduce(
    (acc, char) => acc * 26 + char.charCodeAt(0) - 64,
    0
  );
  const row = parseInt(match[2]);

  return [col, row];
}

/**
 * Auto-fit column widths
 */
function autoFitColumns(worksheet: ExcelJS.Worksheet): void {
  worksheet.columns.forEach((column) => {
    let maxLength = 10;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const cellValue = cell.value?.toString() || '';
      maxLength = Math.max(maxLength, cellValue.length);
    });
    column.width = Math.min(maxLength + 2, 50);
  });
}

/**
 * Apply watermark (as header/footer text)
 */
function applyWatermark(workbook: ExcelJS.Workbook, watermark: string): void {
  workbook.worksheets.forEach((worksheet) => {
    worksheet.headerFooter.oddHeader = `&C&14&B${watermark}`;
    worksheet.headerFooter.oddFooter = `&C&10${watermark}`;
  });
}
