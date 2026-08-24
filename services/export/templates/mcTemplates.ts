/**
 * Main Contractor Specific Templates (Task 5.2 - Part 4)
 *
 * Pre-configured templates for specific Main Contractors (MCs).
 * These templates match the exact format requirements of major UK contractors.
 *
 * Each MC template includes:
 * - Excel template file reference
 * - Cell mappings specific to their format
 * - Brand colors
 * - Specific section requirements
 */

import { ExportTemplateConfig } from '../types';

/**
 * Balfour Beatty template configuration
 *
 * Based on Balfour Beatty's standard valuation format.
 * - Uses their branded Excel template
 * - Includes dayworks section
 * - Fixed column widths (no auto-fit)
 * - Protected worksheet to prevent formula changes
 *
 * Suitable for:
 * - Subcontractor applications to Balfour Beatty
 * - Package valuations
 * - Monthly progress applications
 */
export const balfourBeattyTemplate: ExportTemplateConfig = {
  name: 'Balfour Beatty Application',
  version: '1.0',

  sections: {
    header: true,
    lines: true,
    variations: true,
    dayworks: true,
    summary: true,
    certification: false,
  },

  excel: {
    templateFile: 'templates/balfour_beatty_app.xlsx',
    sheetName: 'Application',
    startRow: 15,
    lineItemsRange: 'A15:L',
    autoFit: false, // Template has fixed widths
    protectSheet: true,
    currencySymbol: '£',
  },

  fieldMappings: [
    // BB-specific header cell mappings
    { sourceField: 'header.applicationNumber', targetField: 'G3', transform: 'number' },
    { sourceField: 'header.applicationRef', targetField: 'G4' },
    { sourceField: 'header.projectName', targetField: 'C4' },
    { sourceField: 'header.projectRef', targetField: 'C5' },
    { sourceField: 'header.contractRef', targetField: 'C6' },
    { sourceField: 'header.contractor.name', targetField: 'C7' },
    { sourceField: 'header.contractor.address', targetField: 'C8' },
    { sourceField: 'header.contractor.cisNumber', targetField: 'C9' },
    { sourceField: 'header.employer.name', targetField: 'C10' },
    { sourceField: 'header.periodStart', targetField: 'C11', transform: 'date', format: 'dd-MMM-yy' },
    { sourceField: 'header.periodEnd', targetField: 'G5', transform: 'date', format: 'dd-MMM-yy' },
    { sourceField: 'header.valuationDate', targetField: 'G6', transform: 'date', format: 'dd-MMM-yy' },
    { sourceField: 'header.submittedDate', targetField: 'G7', transform: 'date', format: 'dd-MMM-yy' },
    { sourceField: 'header.contractValue', targetField: 'G8', transform: 'currency' },
    { sourceField: 'header.retentionPercentage', targetField: 'G9', transform: 'percentage' },

    // Line item mappings (columns without row numbers)
    { sourceField: 'lines.lineNumber', targetField: 'A', transform: 'number' },
    { sourceField: 'lines.reference', targetField: 'B' },
    { sourceField: 'lines.description', targetField: 'C' },
    { sourceField: 'lines.contractValue', targetField: 'D', transform: 'currency' },
    { sourceField: 'lines.previousPercentage', targetField: 'E', transform: 'percentage' },
    { sourceField: 'lines.previousCumulative', targetField: 'F', transform: 'currency' },
    { sourceField: 'lines.thisPeriodPercentage', targetField: 'G', transform: 'percentage' },
    { sourceField: 'lines.thisPeriod', targetField: 'H', transform: 'currency' },
    { sourceField: 'lines.currentPercentage', targetField: 'I', transform: 'percentage' },
    { sourceField: 'lines.currentCumulative', targetField: 'J', transform: 'currency' },
    { sourceField: 'lines.remainingValue', targetField: 'K', transform: 'currency' },

    // Summary mappings (BB uses G column for amounts)
    { sourceField: 'summary.grossThisPeriod', targetField: 'G45', transform: 'currency' },
    { sourceField: 'summary.materialsOnSite', targetField: 'G46', transform: 'currency' },
    { sourceField: 'summary.retentionThisPeriod', targetField: 'G47', transform: 'currency' },
    { sourceField: 'summary.mcdThisPeriod', targetField: 'G48', transform: 'currency' },
    { sourceField: 'summary.contracharges', targetField: 'G49', transform: 'currency' },
    { sourceField: 'summary.netThisPeriod', targetField: 'G50', transform: 'currency' },
    { sourceField: 'summary.previousPayments', targetField: 'G51', transform: 'currency' },
    { sourceField: 'summary.amountDue', targetField: 'G52', transform: 'currency' },
    { sourceField: 'summary.vatAmount', targetField: 'G53', transform: 'currency' },
    { sourceField: 'summary.totalDue', targetField: 'G54', transform: 'currency' },
  ],

  branding: {
    primaryColor: '#003366', // BB blue
    fontFamily: 'Arial',
  },
};

/**
 * Kier Group template configuration
 *
 * Based on Kier's standard payment application format.
 * - Uses their branded Excel template
 * - No dayworks section
 * - Variations tracked separately
 *
 * Suitable for:
 * - Subcontractor applications to Kier
 * - Trade package valuations
 * - Progress payments
 */
export const kierTemplate: ExportTemplateConfig = {
  name: 'Kier Payment Application',
  version: '1.0',

  sections: {
    header: true,
    lines: true,
    variations: true,
    dayworks: false,
    summary: true,
    certification: false,
  },

  excel: {
    templateFile: 'templates/kier_app.xlsx',
    sheetName: 'Valuation',
    startRow: 12,
    lineItemsRange: 'A12:J',
    variationsRange: 'A50:F',
    autoFit: false,
    protectSheet: true,
    currencySymbol: '£',
  },

  fieldMappings: [
    // Kier-specific header mappings
    { sourceField: 'header.applicationNumber', targetField: 'F2', transform: 'number' },
    { sourceField: 'header.applicationRef', targetField: 'F3' },
    { sourceField: 'header.projectName', targetField: 'B4' },
    { sourceField: 'header.projectRef', targetField: 'B5' },
    { sourceField: 'header.contractor.name', targetField: 'B6' },
    { sourceField: 'header.contractor.cisNumber', targetField: 'B7' },
    { sourceField: 'header.employer.name', targetField: 'B8' },
    { sourceField: 'header.periodEnd', targetField: 'F4', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.valuationDate', targetField: 'F5', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.contractValue', targetField: 'F6', transform: 'currency' },
    { sourceField: 'header.retentionPercentage', targetField: 'F7', transform: 'percentage' },

    // Line items (Kier uses 10 columns)
    { sourceField: 'lines.lineNumber', targetField: 'A', transform: 'number' },
    { sourceField: 'lines.reference', targetField: 'B' },
    { sourceField: 'lines.description', targetField: 'C' },
    { sourceField: 'lines.contractValue', targetField: 'D', transform: 'currency' },
    { sourceField: 'lines.previousCumulative', targetField: 'E', transform: 'currency' },
    { sourceField: 'lines.thisPeriod', targetField: 'F', transform: 'currency' },
    { sourceField: 'lines.currentCumulative', targetField: 'G', transform: 'currency' },
    { sourceField: 'lines.currentPercentage', targetField: 'H', transform: 'percentage' },
    { sourceField: 'lines.remainingValue', targetField: 'I', transform: 'currency' },

    // Variations
    { sourceField: 'variations.variationNumber', targetField: 'A', transform: 'number' },
    { sourceField: 'variations.reference', targetField: 'B' },
    { sourceField: 'variations.description', targetField: 'C' },
    { sourceField: 'variations.status', targetField: 'D' },
    { sourceField: 'variations.value', targetField: 'E', transform: 'currency' },
    { sourceField: 'variations.currentCumulative', targetField: 'F', transform: 'currency' },

    // Summary (Kier uses H column for amounts)
    { sourceField: 'summary.grossThisPeriod', targetField: 'H70', transform: 'currency' },
    { sourceField: 'summary.retentionThisPeriod', targetField: 'H71', transform: 'currency' },
    { sourceField: 'summary.mcdThisPeriod', targetField: 'H72', transform: 'currency' },
    { sourceField: 'summary.netThisPeriod', targetField: 'H73', transform: 'currency' },
    { sourceField: 'summary.previousPayments', targetField: 'H74', transform: 'currency' },
    { sourceField: 'summary.amountDue', targetField: 'H75', transform: 'currency' },
    { sourceField: 'summary.vatAmount', targetField: 'H76', transform: 'currency' },
    { sourceField: 'summary.totalDue', targetField: 'H77', transform: 'currency' },
  ],

  branding: {
    primaryColor: '#E31837', // Kier red
    fontFamily: 'Calibri',
  },
};

/**
 * Skanska template configuration
 *
 * Based on Skanska's payment application format.
 * - Detailed header with contract information
 * - Includes dayworks and variations
 * - Comprehensive summary section
 *
 * Suitable for:
 * - Subcontractor applications to Skanska
 * - Package contractors
 * - Large value works
 */
export const skanskaTemplate: ExportTemplateConfig = {
  name: 'Skanska Payment Application',
  version: '1.0',

  sections: {
    header: true,
    lines: true,
    variations: true,
    dayworks: true,
    summary: true,
    certification: false,
  },

  excel: {
    templateFile: 'templates/skanska_app.xlsx',
    sheetName: 'Application',
    startRow: 18,
    lineItemsRange: 'A18:K',
    variationsRange: 'A65:H',
    autoFit: false,
    protectSheet: true,
    currencySymbol: '£',
  },

  fieldMappings: [
    // Skanska header
    { sourceField: 'header.applicationNumber', targetField: 'H3', transform: 'number' },
    { sourceField: 'header.projectName', targetField: 'B5' },
    { sourceField: 'header.projectRef', targetField: 'B6' },
    { sourceField: 'header.contractRef', targetField: 'B7' },
    { sourceField: 'header.contractor.name', targetField: 'B8' },
    { sourceField: 'header.contractor.address', targetField: 'B9' },
    { sourceField: 'header.periodEnd', targetField: 'H5', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.valuationDate', targetField: 'H6', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.contractValue', targetField: 'H7', transform: 'currency' },

    // Line items
    { sourceField: 'lines.lineNumber', targetField: 'A', transform: 'number' },
    { sourceField: 'lines.reference', targetField: 'B' },
    { sourceField: 'lines.description', targetField: 'C' },
    { sourceField: 'lines.contractValue', targetField: 'D', transform: 'currency' },
    { sourceField: 'lines.previousCumulative', targetField: 'E', transform: 'currency' },
    { sourceField: 'lines.thisPeriod', targetField: 'F', transform: 'currency' },
    { sourceField: 'lines.currentCumulative', targetField: 'G', transform: 'currency' },
    { sourceField: 'lines.currentPercentage', targetField: 'H', transform: 'percentage' },
    { sourceField: 'lines.remainingValue', targetField: 'I', transform: 'currency' },

    // Summary
    { sourceField: 'summary.grossThisPeriod', targetField: 'H80', transform: 'currency' },
    { sourceField: 'summary.retentionThisPeriod', targetField: 'H81', transform: 'currency' },
    { sourceField: 'summary.netThisPeriod', targetField: 'H82', transform: 'currency' },
    { sourceField: 'summary.previousPayments', targetField: 'H83', transform: 'currency' },
    { sourceField: 'summary.amountDue', targetField: 'H84', transform: 'currency' },
    { sourceField: 'summary.totalDue', targetField: 'H85', transform: 'currency' },
  ],

  branding: {
    primaryColor: '#00A758', // Skanska green
    fontFamily: 'Arial',
  },
};

/**
 * Morgan Sindall template configuration
 *
 * Based on Morgan Sindall's payment application format.
 * - Standard layout with variations
 * - Retention and MCD tracking
 * - Clean, professional format
 *
 * Suitable for:
 * - Subcontractor applications to Morgan Sindall
 * - Trade packages
 * - Monthly valuations
 */
export const morganSindallTemplate: ExportTemplateConfig = {
  name: 'Morgan Sindall Application',
  version: '1.0',

  sections: {
    header: true,
    lines: true,
    variations: true,
    dayworks: false,
    summary: true,
    certification: false,
  },

  excel: {
    templateFile: 'templates/morgan_sindall_app.xlsx',
    sheetName: 'Payment Application',
    startRow: 14,
    lineItemsRange: 'A14:J',
    variationsRange: 'A55:F',
    autoFit: false,
    protectSheet: true,
    currencySymbol: '£',
  },

  fieldMappings: [
    // Morgan Sindall header
    { sourceField: 'header.applicationNumber', targetField: 'G3', transform: 'number' },
    { sourceField: 'header.projectName', targetField: 'B5' },
    { sourceField: 'header.projectRef', targetField: 'B6' },
    { sourceField: 'header.contractor.name', targetField: 'B7' },
    { sourceField: 'header.periodEnd', targetField: 'G5', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.valuationDate', targetField: 'G6', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.contractValue', targetField: 'G7', transform: 'currency' },
    { sourceField: 'header.retentionPercentage', targetField: 'G8', transform: 'percentage' },
    { sourceField: 'header.mcdPercentage', targetField: 'G9', transform: 'percentage' },

    // Line items
    { sourceField: 'lines.lineNumber', targetField: 'A', transform: 'number' },
    { sourceField: 'lines.reference', targetField: 'B' },
    { sourceField: 'lines.description', targetField: 'C' },
    { sourceField: 'lines.contractValue', targetField: 'D', transform: 'currency' },
    { sourceField: 'lines.previousCumulative', targetField: 'E', transform: 'currency' },
    { sourceField: 'lines.thisPeriod', targetField: 'F', transform: 'currency' },
    { sourceField: 'lines.currentCumulative', targetField: 'G', transform: 'currency' },
    { sourceField: 'lines.currentPercentage', targetField: 'H', transform: 'percentage' },
    { sourceField: 'lines.remainingValue', targetField: 'I', transform: 'currency' },

    // Summary
    { sourceField: 'summary.grossThisPeriod', targetField: 'G68', transform: 'currency' },
    { sourceField: 'summary.retentionThisPeriod', targetField: 'G69', transform: 'currency' },
    { sourceField: 'summary.mcdThisPeriod', targetField: 'G70', transform: 'currency' },
    { sourceField: 'summary.netThisPeriod', targetField: 'G71', transform: 'currency' },
    { sourceField: 'summary.previousPayments', targetField: 'G72', transform: 'currency' },
    { sourceField: 'summary.amountDue', targetField: 'G73', transform: 'currency' },
    { sourceField: 'summary.vatAmount', targetField: 'G74', transform: 'currency' },
    { sourceField: 'summary.totalDue', targetField: 'G75', transform: 'currency' },
  ],

  branding: {
    primaryColor: '#005EB8', // Morgan Sindall blue
    fontFamily: 'Calibri',
  },
};

/**
 * Generic MC template for unknown contractors
 *
 * A flexible template that works for most Main Contractors when a specific
 * template is not available. Uses standard UK construction application layout.
 *
 * Suitable for:
 * - Smaller main contractors
 * - Regional contractors
 * - Contractors without specific template requirements
 * - Fallback when MC-specific template is unavailable
 */
export const genericMCTemplate: ExportTemplateConfig = {
  name: 'Generic MC Application',
  version: '1.0',

  sections: {
    header: true,
    lines: true,
    variations: true,
    dayworks: true,
    summary: true,
    certification: false,
  },

  excel: {
    sheetName: 'Payment Application',
    autoFit: true,
    currencySymbol: '£',
  },

  fieldMappings: [
    // Standard mappings that work for most MCs
    { sourceField: 'header.applicationNumber', targetField: 'B3', transform: 'number' },
    { sourceField: 'header.applicationRef', targetField: 'D3' },
    { sourceField: 'header.projectName', targetField: 'B4' },
    { sourceField: 'header.projectRef', targetField: 'B5' },
    { sourceField: 'header.contractRef', targetField: 'B6' },
    { sourceField: 'header.contractor.name', targetField: 'B7' },
    { sourceField: 'header.employer.name', targetField: 'B8' },
    { sourceField: 'header.periodEnd', targetField: 'B9', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.valuationDate', targetField: 'B10', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.contractValue', targetField: 'B11', transform: 'currency' },
    { sourceField: 'header.retentionPercentage', targetField: 'B12', transform: 'percentage' },

    // Line items
    { sourceField: 'lines.lineNumber', targetField: 'A', transform: 'number' },
    { sourceField: 'lines.reference', targetField: 'B' },
    { sourceField: 'lines.description', targetField: 'C' },
    { sourceField: 'lines.contractValue', targetField: 'D', transform: 'currency' },
    { sourceField: 'lines.previousCumulative', targetField: 'E', transform: 'currency' },
    { sourceField: 'lines.thisPeriod', targetField: 'F', transform: 'currency' },
    { sourceField: 'lines.currentCumulative', targetField: 'G', transform: 'currency' },
    { sourceField: 'lines.currentPercentage', targetField: 'H', transform: 'percentage' },
    { sourceField: 'lines.remainingValue', targetField: 'I', transform: 'currency' },

    // Summary
    { sourceField: 'summary.grossThisPeriod', targetField: 'summary.gross', transform: 'currency' },
    { sourceField: 'summary.retentionThisPeriod', targetField: 'summary.retention', transform: 'currency' },
    { sourceField: 'summary.mcdThisPeriod', targetField: 'summary.mcd', transform: 'currency' },
    { sourceField: 'summary.netThisPeriod', targetField: 'summary.net', transform: 'currency' },
    { sourceField: 'summary.previousPayments', targetField: 'summary.prevPay', transform: 'currency' },
    { sourceField: 'summary.amountDue', targetField: 'summary.due', transform: 'currency' },
    { sourceField: 'summary.vatAmount', targetField: 'summary.vat', transform: 'currency' },
    { sourceField: 'summary.totalDue', targetField: 'summary.total', transform: 'currency' },
  ],

  branding: undefined,
};

/**
 * Register MC templates
 *
 * Maps Main Contractor identifiers to their template configurations.
 * Keys should match the mainContractorId field in contracts.
 */
export const MC_TEMPLATES: Record<string, ExportTemplateConfig> = {
  'balfour-beatty': balfourBeattyTemplate,
  'kier-group': kierTemplate,
  'skanska': skanskaTemplate,
  'morgan-sindall': morganSindallTemplate,
  'generic': genericMCTemplate,
};

/**
 * Get MC template by ID
 *
 * Returns the appropriate template for a Main Contractor, falling back to
 * the generic template if no specific template is found.
 *
 * @param mainContractorId - Main Contractor identifier
 * @returns Template configuration
 */
export function getMCTemplate(mainContractorId: string): ExportTemplateConfig {
  // Normalize ID to lowercase with hyphens
  const normalizedId = mainContractorId.toLowerCase().replace(/\s+/g, '-');

  // Return specific template or generic fallback
  return MC_TEMPLATES[normalizedId] || MC_TEMPLATES['generic'];
}

/**
 * Get all available MC template names
 *
 * @returns Array of MC template names
 */
export function getMCTemplateNames(): string[] {
  return Object.keys(MC_TEMPLATES)
    .filter(key => key !== 'generic')
    .map(key => MC_TEMPLATES[key].name);
}

/**
 * Check if a specific MC template exists
 *
 * @param mainContractorId - Main Contractor identifier
 * @returns True if specific template exists
 */
export function hasMCTemplate(mainContractorId: string): boolean {
  const normalizedId = mainContractorId.toLowerCase().replace(/\s+/g, '-');
  return normalizedId in MC_TEMPLATES && normalizedId !== 'generic';
}
