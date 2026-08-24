/**
 * Excel Generator (TypeScript Version)
 *
 * Generates Excel files from standardized PaymentApplicationExportData.
 * Uses the xlsx library for spreadsheet creation.
 */

import * as XLSX from 'xlsx';
import {
  PaymentApplicationExportData,
  ExportTemplateConfig,
  ExportOptions,
} from '../types';

import { GeneratorOutput } from '../types';

/**
 * Generate Excel file from payment application data
 *
 * @param data - Standardized payment application export data
 * @param config - Template configuration
 * @param options - Export options
 * @returns Buffer and MIME type
 */
export async function generateExcel(
  data: PaymentApplicationExportData,
  config: ExportTemplateConfig,
  options?: ExportOptions
): Promise<GeneratorOutput> {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summaryData = buildSummarySheet(data, config);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Sheet 2: Line Items (if included)
  if (config.sections.lines && data.lines.length > 0) {
    const linesData = buildLinesSheet(data.lines, config);
    const linesSheet = XLSX.utils.json_to_sheet(linesData);
    linesSheet['!cols'] = calculateColumnWidths(linesData);
    XLSX.utils.book_append_sheet(workbook, linesSheet, 'Line Items');
  }

  // Sheet 3: Variations (if included and present)
  if (config.sections.variations && data.variations && data.variations.length > 0) {
    const variationsData = buildVariationsSheet(data.variations, config);
    const variationsSheet = XLSX.utils.json_to_sheet(variationsData);
    variationsSheet['!cols'] = calculateColumnWidths(variationsData);
    XLSX.utils.book_append_sheet(workbook, variationsSheet, 'Variations');
  }

  // Generate buffer
  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;

  return {
    buffer,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

/**
 * Build summary sheet data
 */
function buildSummarySheet(
  data: PaymentApplicationExportData,
  config: ExportTemplateConfig
): any[][] {
  const { header, summary, certification } = data;
  const currencySymbol = config.excel?.currencySymbol || '£';

  const rows: any[][] = [];

  // Title
  rows.push(['PAYMENT APPLICATION']);
  rows.push([]);

  // Header section
  if (config.sections.header) {
    rows.push(['Application Number', header.applicationNumber]);
    rows.push(['Application Reference', header.applicationRef]);
    rows.push(['Project', header.projectName]);
    rows.push(['Project Reference', header.projectRef]);
    if (header.contractRef) {
      rows.push(['Contract Reference', header.contractRef]);
    }
    rows.push([]);

    rows.push(['Contractor', header.contractor.name]);
    if (header.contractor.address) {
      rows.push(['Address', header.contractor.address]);
    }
    rows.push([]);

    rows.push(['Employer/Main Contractor', header.employer.name]);
    if (header.employer.address) {
      rows.push(['Address', header.employer.address]);
    }
    rows.push([]);

    rows.push(['Period Start', formatDate(header.periodStart)]);
    rows.push(['Period End', formatDate(header.periodEnd)]);
    rows.push(['Valuation Date', formatDate(header.valuationDate)]);
    if (header.dueDate) {
      rows.push(['Payment Due Date', formatDate(header.dueDate)]);
    }
    rows.push([]);
  }

  // Summary section
  if (config.sections.summary) {
    rows.push(['FINANCIAL SUMMARY']);
    rows.push(['Gross Value This Period', formatCurrency(summary.grossThisPeriod, currencySymbol)]);
    rows.push(['Materials on Site', formatCurrency(summary.materialsOnSite, currencySymbol)]);
    rows.push(['Total This Period', formatCurrency(summary.totalThisPeriod, currencySymbol)]);
    rows.push([]);

    rows.push(['Previous Cumulative', formatCurrency(summary.previousCumulative, currencySymbol)]);
    rows.push(['Current Cumulative', formatCurrency(summary.currentCumulative, currencySymbol)]);
    rows.push([]);

    rows.push(['Retention This Period', formatCurrency(summary.retentionThisPeriod, currencySymbol)]);
    rows.push(['Retention Cumulative', formatCurrency(summary.retentionCumulative, currencySymbol)]);

    if (summary.mcdThisPeriod || summary.mcdCumulative) {
      rows.push([]);
      rows.push(['MC Discount This Period', formatCurrency(summary.mcdThisPeriod || 0, currencySymbol)]);
      rows.push(['MC Discount Cumulative', formatCurrency(summary.mcdCumulative || 0, currencySymbol)]);
    }

    if (summary.contracharges || summary.otherDeductions) {
      rows.push([]);
      if (summary.contracharges) {
        rows.push(['Contra Charges', formatCurrency(summary.contracharges, currencySymbol)]);
      }
      if (summary.otherDeductions) {
        rows.push(['Other Deductions', formatCurrency(summary.otherDeductions, currencySymbol)]);
        if (summary.otherDeductionsDesc) {
          rows.push(['Description', summary.otherDeductionsDesc]);
        }
      }
    }

    rows.push([]);
    rows.push(['Net This Period', formatCurrency(summary.netThisPeriod, currencySymbol)]);
    rows.push(['Net Cumulative', formatCurrency(summary.netCumulative, currencySymbol)]);
    rows.push([]);

    rows.push(['Previous Payments', formatCurrency(summary.previousPayments, currencySymbol)]);
    rows.push(['AMOUNT DUE', formatCurrency(summary.amountDue, currencySymbol)]);
    rows.push([]);

    rows.push(['VAT Rate', `${summary.vatRate}%`]);
    rows.push(['VAT Amount', formatCurrency(summary.vatAmount, currencySymbol)]);
    rows.push(['TOTAL DUE (INC VAT)', formatCurrency(summary.totalDue, currencySymbol)]);
  }

  // Certification section
  if (config.sections.certification && certification) {
    rows.push([]);
    rows.push(['CERTIFICATION']);
    rows.push(['Certified Amount', formatCurrency(certification.certifiedAmount, currencySymbol)]);
    if (certification.certifiedDate) {
      rows.push(['Certified Date', formatDate(certification.certifiedDate)]);
    }
    if (certification.certifiedBy) {
      rows.push(['Certified By', certification.certifiedBy]);
    }
    if (certification.varianceNotes) {
      rows.push(['Variance Notes', certification.varianceNotes]);
    }
  }

  return rows;
}

/**
 * Build line items sheet
 */
function buildLinesSheet(lines: PaymentApplicationExportData['lines'], config: ExportTemplateConfig): any[] {
  const currencySymbol = config.excel?.currencySymbol || '£';

  return lines.map((line) => ({
    'Line': line.lineNumber,
    'Reference': line.reference || '',
    'Description': line.description,
    'Contract Value': formatCurrency(line.contractValue, currencySymbol),
    'Previous %': `${line.previousPercentage.toFixed(2)}%`,
    'Previous Value': formatCurrency(line.previousCumulative, currencySymbol),
    'This Period %': `${line.thisPeriodPercentage.toFixed(2)}%`,
    'This Period Value': formatCurrency(line.thisPeriod, currencySymbol),
    'Cumulative %': `${line.currentPercentage.toFixed(2)}%`,
    'Cumulative Value': formatCurrency(line.currentCumulative, currencySymbol),
    'Remaining %': `${line.remainingPercentage.toFixed(2)}%`,
    'Remaining Value': formatCurrency(line.remainingValue, currencySymbol),
  }));
}

/**
 * Build variations sheet
 */
function buildVariationsSheet(
  variations: NonNullable<PaymentApplicationExportData['variations']>,
  config: ExportTemplateConfig
): any[] {
  const currencySymbol = config.excel?.currencySymbol || '£';

  return variations.map((variation) => ({
    'Number': variation.variationNumber,
    'Reference': variation.reference,
    'Description': variation.description,
    'Status': variation.status,
    'Value': formatCurrency(variation.value, currencySymbol),
    'Previous': formatCurrency(variation.previousCumulative, currencySymbol),
    'This Period': formatCurrency(variation.thisPeriod, currencySymbol),
    'Cumulative': formatCurrency(variation.currentCumulative, currencySymbol),
  }));
}

/**
 * Calculate optimal column widths
 */
function calculateColumnWidths(data: any[]): any[] {
  if (data.length === 0) return [];

  const headers = Object.keys(data[0]);
  const widths = headers.map((header) => header.length);

  data.forEach((row) => {
    headers.forEach((header, index) => {
      const value = row[header];
      const length = value ? String(value).length : 0;
      widths[index] = Math.max(widths[index], length);
    });
  });

  // Add padding and limit max width
  return widths.map((width) => ({
    wch: Math.min(Math.max(width + 2, 10), 50),
  }));
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number, symbol: string = '£'): string {
  return `${symbol}${amount.toFixed(2)}`;
}
