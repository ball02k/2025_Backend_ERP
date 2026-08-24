/**
 * CSV Generator (TypeScript Version)
 *
 * Generates CSV files from standardized PaymentApplicationExportData.
 * Simple, lightweight format suitable for data import/export.
 */

import {
  PaymentApplicationExportData,
  ExportTemplateConfig,
  ExportOptions,
} from '../types';

import { GeneratorOutput } from '../types';

/**
 * Generate CSV from payment application data
 *
 * @param data - Standardized payment application export data
 * @param config - Template configuration
 * @param options - Export options
 * @returns Buffer and MIME type
 */
export async function generateCsv(
  data: PaymentApplicationExportData,
  config: ExportTemplateConfig,
  options?: ExportOptions
): Promise<GeneratorOutput> {
  const delimiter = config.csv?.delimiter || ',';
  const lines: string[] = [];

  // Header information
  if (config.sections.header) {
    lines.push('PAYMENT APPLICATION DETAILS');
    lines.push('');
    lines.push(`Application Number${delimiter}${data.header.applicationNumber}`);
    lines.push(`Application Reference${delimiter}${data.header.applicationRef}`);
    lines.push(`Project${delimiter}${data.header.projectName}`);
    lines.push(`Project Reference${delimiter}${data.header.projectRef}`);
    if (data.header.contractRef) {
      lines.push(`Contract Reference${delimiter}${data.header.contractRef}`);
    }
    lines.push(`Period Start${delimiter}${formatDate(data.header.periodStart)}`);
    lines.push(`Period End${delimiter}${formatDate(data.header.periodEnd)}`);
    lines.push(`Valuation Date${delimiter}${formatDate(data.header.valuationDate)}`);
    lines.push('');
    lines.push(`Contractor${delimiter}${data.header.contractor.name}`);
    lines.push(`Employer${delimiter}${data.header.employer.name}`);
    lines.push('');
  }

  // Summary
  if (config.sections.summary) {
    lines.push('FINANCIAL SUMMARY');
    lines.push('');
    lines.push(`Gross Value This Period${delimiter}${data.summary.grossThisPeriod}`);
    lines.push(`Materials on Site${delimiter}${data.summary.materialsOnSite}`);
    lines.push(`Total This Period${delimiter}${data.summary.totalThisPeriod}`);
    lines.push(`Previous Cumulative${delimiter}${data.summary.previousCumulative}`);
    lines.push(`Current Cumulative${delimiter}${data.summary.currentCumulative}`);
    lines.push(`Retention This Period${delimiter}${data.summary.retentionThisPeriod}`);
    lines.push(`Retention Cumulative${delimiter}${data.summary.retentionCumulative}`);
    if (data.summary.mcdThisPeriod || data.summary.mcdCumulative) {
      lines.push(`MC Discount This Period${delimiter}${data.summary.mcdThisPeriod || 0}`);
      lines.push(`MC Discount Cumulative${delimiter}${data.summary.mcdCumulative || 0}`);
    }
    lines.push(`Net This Period${delimiter}${data.summary.netThisPeriod}`);
    lines.push(`Previous Payments${delimiter}${data.summary.previousPayments}`);
    lines.push(`Amount Due${delimiter}${data.summary.amountDue}`);
    lines.push(`VAT Rate${delimiter}${data.summary.vatRate}%`);
    lines.push(`VAT Amount${delimiter}${data.summary.vatAmount}`);
    lines.push(`Total Due${delimiter}${data.summary.totalDue}`);
    lines.push('');
  }

  // Line items
  if (config.sections.lines && data.lines.length > 0) {
    lines.push('LINE ITEMS');
    lines.push('');

    // Headers
    const lineHeaders = [
      'Line',
      'Reference',
      'Description',
      'Contract Value',
      'Previous %',
      'Previous Value',
      'This Period %',
      'This Period Value',
      'Cumulative %',
      'Cumulative Value',
      'Remaining %',
      'Remaining Value',
    ];
    lines.push(lineHeaders.join(delimiter));

    // Data rows
    data.lines.forEach((line) => {
      const row = [
        line.lineNumber.toString(),
        escapeCSV(line.reference || '', delimiter),
        escapeCSV(line.description, delimiter),
        line.contractValue.toString(),
        line.previousPercentage.toFixed(2),
        line.previousCumulative.toString(),
        line.thisPeriodPercentage.toFixed(2),
        line.thisPeriod.toString(),
        line.currentPercentage.toFixed(2),
        line.currentCumulative.toString(),
        line.remainingPercentage.toFixed(2),
        line.remainingValue.toString(),
      ];
      lines.push(row.join(delimiter));
    });
    lines.push('');
  }

  // Variations
  if (config.sections.variations && data.variations && data.variations.length > 0) {
    lines.push('VARIATIONS');
    lines.push('');

    const variationHeaders = [
      'Number',
      'Reference',
      'Description',
      'Status',
      'Value',
      'Previous',
      'This Period',
      'Cumulative',
    ];
    lines.push(variationHeaders.join(delimiter));

    data.variations.forEach((variation) => {
      const row = [
        variation.variationNumber.toString(),
        escapeCSV(variation.reference, delimiter),
        escapeCSV(variation.description, delimiter),
        variation.status,
        variation.value.toString(),
        variation.previousCumulative.toString(),
        variation.thisPeriod.toString(),
        variation.currentCumulative.toString(),
      ];
      lines.push(row.join(delimiter));
    });
    lines.push('');
  }

  // Dayworks
  if (config.sections.dayworks && data.dayworks && data.dayworks.length > 0) {
    lines.push('DAYWORKS');
    lines.push('');

    const dayworkHeaders = [
      'Reference',
      'Description',
      'Date',
      'Labour Hours',
      'Labour Rate',
      'Labour Total',
      'Materials Total',
      'Plant Total',
      'Total',
    ];
    lines.push(dayworkHeaders.join(delimiter));

    data.dayworks.forEach((daywork) => {
      const row = [
        escapeCSV(daywork.reference, delimiter),
        escapeCSV(daywork.description, delimiter),
        formatDate(daywork.date),
        daywork.labourHours.toString(),
        daywork.labourRate.toString(),
        daywork.labourTotal.toString(),
        daywork.materialsTotal.toString(),
        daywork.plantTotal.toString(),
        daywork.total.toString(),
      ];
      lines.push(row.join(delimiter));
    });
    lines.push('');
  }

  // Certification
  if (config.sections.certification && data.certification) {
    lines.push('CERTIFICATION');
    lines.push('');
    lines.push(`Certified Amount${delimiter}${data.certification.certifiedAmount}`);
    if (data.certification.certifiedDate) {
      lines.push(`Certified Date${delimiter}${formatDate(data.certification.certifiedDate)}`);
    }
    if (data.certification.certifiedBy) {
      lines.push(`Certified By${delimiter}${escapeCSV(data.certification.certifiedBy, delimiter)}`);
    }
    if (data.certification.varianceNotes) {
      lines.push(`Variance Notes${delimiter}${escapeCSV(data.certification.varianceNotes, delimiter)}`);
    }
  }

  // Convert to buffer
  const csvContent = lines.join('\n');
  const buffer = Buffer.from(csvContent, 'utf8');

  return {
    buffer,
    mimeType: 'text/csv',
  };
}

/**
 * Escape CSV value
 *
 * Wraps value in quotes if it contains delimiter, quotes, or newlines
 */
function escapeCSV(value: string, delimiter: string = ','): string {
  if (!value) return '';

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
 * Format date for CSV
 */
function formatDate(date: Date): string {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${year}-${month}-${day}`; // ISO format for CSV
}
