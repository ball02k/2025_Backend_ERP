/**
 * Excel Style Utilities (Task 5.2 - Part 5)
 *
 * Provides reusable style definitions and utility functions for Excel generation.
 * Ensures consistent, professional formatting across all exports.
 *
 * Features:
 * - Standard style definitions
 * - Style application helpers
 * - Column configuration templates
 * - Branded header generation
 * - Range styling utilities
 */

import ExcelJS from 'exceljs';

/**
 * Standard style definitions for consistent formatting
 *
 * Use these predefined styles throughout Excel generation to ensure
 * consistent, professional appearance across all exports.
 */
export const STYLES = {
  // Headers
  title: {
    font: { size: 16, bold: true },
    alignment: { horizontal: 'center', vertical: 'middle' },
  } as Partial<ExcelJS.Style>,

  subtitle: {
    font: { size: 14, bold: true },
    alignment: { horizontal: 'center', vertical: 'middle' },
  } as Partial<ExcelJS.Style>,

  sectionHeader: {
    font: { size: 12, bold: true },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    },
  } as Partial<ExcelJS.Style>,

  // Table styles
  tableHeader: {
    font: { bold: true },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' },
    },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    },
  } as Partial<ExcelJS.Style>,

  tableCell: {
    alignment: { vertical: 'middle' },
    border: {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    },
  } as Partial<ExcelJS.Style>,

  tableTotals: {
    font: { bold: true },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' },
    },
    border: {
      top: { style: 'double' },
      bottom: { style: 'double' },
    },
  } as Partial<ExcelJS.Style>,

  // Number formats
  currency: {
    numFmt: '£#,##0.00',
    alignment: { horizontal: 'right' },
  } as Partial<ExcelJS.Style>,

  percentage: {
    numFmt: '0.00%',
    alignment: { horizontal: 'center' },
  } as Partial<ExcelJS.Style>,

  date: {
    numFmt: 'dd/mm/yyyy',
    alignment: { horizontal: 'center' },
  } as Partial<ExcelJS.Style>,

  // Highlight styles
  highlightYellow: {
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF0B3' },
    },
  } as Partial<ExcelJS.Style>,

  highlightGreen: {
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD5F5E3' },
    },
  } as Partial<ExcelJS.Style>,

  highlightRed: {
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFADBD8' },
    },
  } as Partial<ExcelJS.Style>,

  // Special styles
  finalTotal: {
    font: { size: 12, bold: true },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF0B3' },
    },
    border: {
      top: { style: 'double' },
      bottom: { style: 'double' },
    },
    numFmt: '£#,##0.00',
    alignment: { horizontal: 'right' },
  } as Partial<ExcelJS.Style>,

  label: {
    font: { bold: true },
    alignment: { horizontal: 'left', vertical: 'middle' },
  } as Partial<ExcelJS.Style>,

  value: {
    alignment: { horizontal: 'right', vertical: 'middle' },
  } as Partial<ExcelJS.Style>,
};

/**
 * Apply style to a single cell
 *
 * @param cell - ExcelJS cell to style
 * @param style - Partial style object
 *
 * @example
 * applyStyle(cell, STYLES.currency);
 * applyStyle(cell, { font: { bold: true }, fill: { ... } });
 */
export function applyStyle(cell: ExcelJS.Cell, style: Partial<ExcelJS.Style>): void {
  if (style.font) cell.font = style.font;
  if (style.fill) cell.fill = style.fill as ExcelJS.Fill;
  if (style.alignment) cell.alignment = style.alignment;
  if (style.border) cell.border = style.border;
  if (style.numFmt) cell.numFmt = style.numFmt;
}

/**
 * Apply styles to all cells in a row
 *
 * @param row - ExcelJS row to style
 * @param style - Partial style object
 *
 * @example
 * applyRowStyle(row, STYLES.tableHeader);
 */
export function applyRowStyle(row: ExcelJS.Row, style: Partial<ExcelJS.Style>): void {
  row.eachCell({ includeEmpty: false }, (cell) => {
    applyStyle(cell, style);
  });
}

/**
 * Apply styles to a range of cells
 *
 * @param worksheet - ExcelJS worksheet
 * @param startRow - Starting row number (1-indexed)
 * @param endRow - Ending row number (1-indexed)
 * @param startCol - Starting column number (1-indexed)
 * @param endCol - Ending column number (1-indexed)
 * @param style - Partial style object
 *
 * @example
 * // Style cells A5:K10
 * applyRangeStyle(worksheet, 5, 10, 1, 11, STYLES.tableCell);
 */
export function applyRangeStyle(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  style: Partial<ExcelJS.Style>
): void {
  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      applyStyle(worksheet.getCell(row, col), style);
    }
  }
}

/**
 * Apply style to a named range (e.g., "A5:K10")
 *
 * @param worksheet - ExcelJS worksheet
 * @param range - Range string (e.g., "A5:K10")
 * @param style - Partial style object
 *
 * @example
 * applyRangeStyleByName(worksheet, 'A5:K10', STYLES.tableCell);
 */
export function applyRangeStyleByName(
  worksheet: ExcelJS.Worksheet,
  range: string,
  style: Partial<ExcelJS.Style>
): void {
  // Parse range like "A5:K10"
  const [start, end] = range.split(':');

  if (!end) {
    // Single cell
    applyStyle(worksheet.getCell(start), style);
    return;
  }

  const startCell = worksheet.getCell(start);
  const endCell = worksheet.getCell(end);

  // Get row and column numbers
  const startRow = typeof startCell.row === 'number' ? startCell.row : parseInt(String(startCell.row));
  const endRow = typeof endCell.row === 'number' ? endCell.row : parseInt(String(endCell.row));
  const startCol = typeof startCell.col === 'number' ? startCell.col : columnLetterToNumber(String(startCell.col));
  const endCol = typeof endCell.col === 'number' ? endCell.col : columnLetterToNumber(String(endCell.col));

  applyRangeStyle(
    worksheet,
    startRow,
    endRow,
    startCol,
    endCol,
    style
  );
}

/**
 * Helper function to convert column letter to number
 * A = 1, B = 2, ..., Z = 26, AA = 27, etc.
 */
function columnLetterToNumber(letter: string): number {
  let column = 0;
  for (let i = 0; i < letter.length; i++) {
    column = column * 26 + letter.charCodeAt(i) - 64;
  }
  return column;
}

/**
 * Apply alternating row colors (zebra striping)
 *
 * @param worksheet - ExcelJS worksheet
 * @param startRow - Starting row number
 * @param endRow - Ending row number
 * @param startCol - Starting column number
 * @param endCol - Ending column number
 * @param evenColor - Color for even rows (ARGB format)
 * @param oddColor - Color for odd rows (ARGB format)
 *
 * @example
 * // White and light gray alternating rows
 * applyAlternatingRows(worksheet, 5, 20, 1, 11, 'FFFFFFFF', 'FFF5F5F5');
 */
export function applyAlternatingRows(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  evenColor: string = 'FFFFFFFF',
  oddColor: string = 'FFF5F5F5'
): void {
  for (let row = startRow; row <= endRow; row++) {
    const isEven = (row - startRow) % 2 === 0;
    const fillColor = isEven ? evenColor : oddColor;

    for (let col = startCol; col <= endCol; col++) {
      const cell = worksheet.getCell(row, col);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: fillColor },
      } as ExcelJS.Fill;
    }
  }
}

/**
 * Create branded header with company name and optional logo
 *
 * @param worksheet - ExcelJS worksheet
 * @param branding - Branding configuration
 * @param startRow - Starting row for header (default: 1)
 * @returns Next available row after header
 *
 * @example
 * const nextRow = await addBrandedHeader(worksheet, {
 *   companyName: 'Acme Construction',
 *   primaryColor: '#1E40AF',
 *   logoUrl: 'https://...',
 * }, 1);
 */
export async function addBrandedHeader(
  worksheet: ExcelJS.Worksheet,
  branding: { logoUrl?: string; primaryColor?: string; companyName?: string },
  startRow: number = 1
): Promise<number> {
  // Company name with primary color
  const titleCell = worksheet.getCell(`A${startRow}`);
  titleCell.value = branding.companyName || '';
  titleCell.font = {
    size: 18,
    bold: true,
    color: { argb: branding.primaryColor?.replace('#', 'FF') || 'FF000000' },
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.mergeCells(`A${startRow}:K${startRow}`);

  // Add logo if provided
  if (branding.logoUrl) {
    // Note: Logo implementation would require downloading the image
    // and adding it using worksheet.addImage()
    // For now, we skip the logo implementation
  }

  // Return next available row (with spacing)
  return startRow + 2;
}

/**
 * Set column widths for a worksheet
 *
 * @param worksheet - ExcelJS worksheet
 * @param columnWidths - Array of widths (in characters)
 *
 * @example
 * setColumnWidths(worksheet, [5, 12, 40, 15, 15, 15]);
 */
export function setColumnWidths(worksheet: ExcelJS.Worksheet, columnWidths: number[]): void {
  columnWidths.forEach((width, index) => {
    const column = worksheet.getColumn(index + 1);
    column.width = width;
  });
}

/**
 * Auto-fit columns based on content
 *
 * @param worksheet - ExcelJS worksheet
 * @param minWidth - Minimum column width (default: 10)
 * @param maxWidth - Maximum column width (default: 50)
 *
 * @example
 * autoFitColumns(worksheet, 10, 50);
 */
export function autoFitColumns(
  worksheet: ExcelJS.Worksheet,
  minWidth: number = 10,
  maxWidth: number = 50
): void {
  worksheet.columns.forEach((column) => {
    if (!column.eachCell) return;

    let maxLength = minWidth;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const cellValue = cell.value ? cell.value.toString() : '';
      maxLength = Math.max(maxLength, cellValue.length);
    });

    column.width = Math.min(maxLength + 2, maxWidth);
  });
}

/**
 * Standard column configurations for common report types
 */
export const COLUMN_CONFIGS = {
  /**
   * Payment Application column configuration
   * 11 columns: No., Ref, Description, Contract Value, Prev %, Previous, This %, This Period, Cum %, Cumulative, Remaining
   */
  paymentApplication: [
    { key: 'lineNo', width: 5, header: 'No.' },
    { key: 'ref', width: 12, header: 'Ref' },
    { key: 'description', width: 40, header: 'Description' },
    { key: 'contractValue', width: 15, header: 'Contract Value', style: 'currency' },
    { key: 'prevPct', width: 10, header: 'Prev %', style: 'percentage' },
    { key: 'prevValue', width: 15, header: 'Previous', style: 'currency' },
    { key: 'thisPct', width: 10, header: 'This %', style: 'percentage' },
    { key: 'thisValue', width: 15, header: 'This Period', style: 'currency' },
    { key: 'cumPct', width: 10, header: 'Cum %', style: 'percentage' },
    { key: 'cumValue', width: 15, header: 'Cumulative', style: 'currency' },
    { key: 'remaining', width: 15, header: 'Remaining', style: 'currency' },
  ],

  /**
   * Variations column configuration
   * 8 columns: No., Ref, Description, Status, Value, Previous, This Period, Cumulative
   */
  variations: [
    { key: 'varNo', width: 5, header: 'No.' },
    { key: 'ref', width: 12, header: 'Ref' },
    { key: 'description', width: 40, header: 'Description' },
    { key: 'status', width: 12, header: 'Status' },
    { key: 'value', width: 15, header: 'Value', style: 'currency' },
    { key: 'prevValue', width: 15, header: 'Previous', style: 'currency' },
    { key: 'thisValue', width: 15, header: 'This Period', style: 'currency' },
    { key: 'cumValue', width: 15, header: 'Cumulative', style: 'currency' },
  ],

  /**
   * Dayworks column configuration
   * 8 columns: Ref, Description, Date, Labour Hours, Labour Rate, Labour Total, Materials, Plant, Total
   */
  dayworks: [
    { key: 'ref', width: 12, header: 'Ref' },
    { key: 'description', width: 30, header: 'Description' },
    { key: 'date', width: 12, header: 'Date', style: 'date' },
    { key: 'labourHours', width: 12, header: 'Hours' },
    { key: 'labourRate', width: 12, header: 'Rate', style: 'currency' },
    { key: 'labourTotal', width: 15, header: 'Labour', style: 'currency' },
    { key: 'materials', width: 15, header: 'Materials', style: 'currency' },
    { key: 'plant', width: 15, header: 'Plant', style: 'currency' },
    { key: 'total', width: 15, header: 'Total', style: 'currency' },
  ],

  /**
   * Compact payment application (simplified)
   * 6 columns: No., Description, Contract Value, Previous, This Period, Cumulative
   */
  compact: [
    { key: 'lineNo', width: 5, header: 'No.' },
    { key: 'description', width: 40, header: 'Description' },
    { key: 'contractValue', width: 15, header: 'Contract Value', style: 'currency' },
    { key: 'prevValue', width: 15, header: 'Previous', style: 'currency' },
    { key: 'thisValue', width: 15, header: 'This Period', style: 'currency' },
    { key: 'cumValue', width: 15, header: 'Cumulative', style: 'currency' },
  ],
};

/**
 * Apply column configuration to worksheet
 *
 * @param worksheet - ExcelJS worksheet
 * @param config - Column configuration array
 * @param startCol - Starting column number (default: 1)
 *
 * @example
 * applyColumnConfig(worksheet, COLUMN_CONFIGS.paymentApplication, 1);
 */
export function applyColumnConfig(
  worksheet: ExcelJS.Worksheet,
  config: Array<{ key: string; width: number; header: string; style?: string }>,
  startCol: number = 1
): void {
  config.forEach((col, index) => {
    const column = worksheet.getColumn(startCol + index);
    column.width = col.width;
    column.key = col.key;
  });
}

/**
 * Create header row from column configuration
 *
 * @param worksheet - ExcelJS worksheet
 * @param config - Column configuration array
 * @param row - Row number for header
 * @param startCol - Starting column number (default: 1)
 *
 * @example
 * createHeaderRow(worksheet, COLUMN_CONFIGS.paymentApplication, 10, 1);
 */
export function createHeaderRow(
  worksheet: ExcelJS.Worksheet,
  config: Array<{ key: string; width: number; header: string; style?: string }>,
  row: number,
  startCol: number = 1
): void {
  config.forEach((col, index) => {
    const cell = worksheet.getCell(row, startCol + index);
    cell.value = col.header;
    applyStyle(cell, STYLES.tableHeader);
  });
}

/**
 * Get style by name
 *
 * @param styleName - Name of the style (e.g., 'currency', 'percentage')
 * @returns Style object or undefined
 *
 * @example
 * const style = getStyleByName('currency');
 * applyStyle(cell, style);
 */
export function getStyleByName(styleName: string): Partial<ExcelJS.Style> | undefined {
  return (STYLES as any)[styleName];
}

/**
 * Apply currency formatting to a column
 *
 * @param worksheet - ExcelJS worksheet
 * @param colNumber - Column number (1-indexed)
 * @param startRow - Starting row
 * @param endRow - Ending row
 * @param currencySymbol - Currency symbol (default: '£')
 *
 * @example
 * applyCurrencyColumn(worksheet, 4, 10, 50, '£');
 */
export function applyCurrencyColumn(
  worksheet: ExcelJS.Worksheet,
  colNumber: number,
  startRow: number,
  endRow: number,
  currencySymbol: string = '£'
): void {
  for (let row = startRow; row <= endRow; row++) {
    const cell = worksheet.getCell(row, colNumber);
    cell.numFmt = `${currencySymbol}#,##0.00`;
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
  }
}

/**
 * Apply percentage formatting to a column
 *
 * @param worksheet - ExcelJS worksheet
 * @param colNumber - Column number (1-indexed)
 * @param startRow - Starting row
 * @param endRow - Ending row
 *
 * @example
 * applyPercentageColumn(worksheet, 5, 10, 50);
 */
export function applyPercentageColumn(
  worksheet: ExcelJS.Worksheet,
  colNumber: number,
  startRow: number,
  endRow: number
): void {
  for (let row = startRow; row <= endRow; row++) {
    const cell = worksheet.getCell(row, colNumber);
    cell.numFmt = '0.00%';
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
}

/**
 * Create a summary section with label-value pairs
 *
 * @param worksheet - ExcelJS worksheet
 * @param startRow - Starting row
 * @param labelCol - Column for labels
 * @param valueCol - Column for values
 * @param items - Array of {label, value, highlight?} objects
 * @returns Next available row
 *
 * @example
 * const nextRow = createSummarySection(worksheet, 50, 1, 2, [
 *   { label: 'Gross Value', value: 100000 },
 *   { label: 'Retention', value: -5000 },
 *   { label: 'Net Value', value: 95000, highlight: true },
 * ]);
 */
export function createSummarySection(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  labelCol: number,
  valueCol: number,
  items: Array<{ label: string; value: number | string; highlight?: boolean; isCurrency?: boolean }>
): number {
  let currentRow = startRow;

  items.forEach((item) => {
    // Label cell
    const labelCell = worksheet.getCell(currentRow, labelCol);
    labelCell.value = item.label;
    applyStyle(labelCell, STYLES.label);

    // Value cell
    const valueCell = worksheet.getCell(currentRow, valueCol);
    valueCell.value = item.value;

    if (item.highlight) {
      applyStyle(valueCell, STYLES.finalTotal);
    } else if (item.isCurrency !== false && typeof item.value === 'number') {
      applyStyle(valueCell, STYLES.currency);
    } else {
      applyStyle(valueCell, STYLES.value);
    }

    currentRow++;
  });

  return currentRow;
}
