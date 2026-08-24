/**
 * Pre-built Excel Template Configurations (Task 5.2 - Part 2)
 *
 * Provides ready-to-use template configurations for payment application exports.
 * These are TypeScript configuration objects (not Excel files) that define how
 * payment applications should be formatted and exported.
 */

import { ExportTemplateConfig } from '../types';

/**
 * Standard payment application template
 *
 * Full-featured template including all sections:
 * - Header information
 * - Line items with progress tracking
 * - Variations
 * - Financial summary with deductions
 *
 * Suitable for:
 * - Standard UK construction payment applications
 * - JCT contracts
 * - NEC contracts
 * - General contractor applications
 */
export const defaultApplicationTemplate: ExportTemplateConfig = {
  name: 'Standard Payment Application',
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
    sheetName: 'Payment Application',
    startRow: 1,
    autoFit: true,
    protectSheet: false,
    currencySymbol: '£',
  },

  fieldMappings: [
    // Header mappings (for template-based exports)
    { sourceField: 'header.applicationNumber', targetField: 'B3', transform: 'number' },
    { sourceField: 'header.applicationRef', targetField: 'D3' },
    { sourceField: 'header.projectName', targetField: 'B4' },
    { sourceField: 'header.projectRef', targetField: 'B5' },
    { sourceField: 'header.contractRef', targetField: 'B6' },
    { sourceField: 'header.contractor.name', targetField: 'B7' },
    { sourceField: 'header.employer.name', targetField: 'B8' },
    { sourceField: 'header.periodStart', targetField: 'B9', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.periodEnd', targetField: 'D9', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.valuationDate', targetField: 'B10', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.contractValue', targetField: 'B11', transform: 'currency' },

    // Line item mappings (column references without row numbers)
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

    // Summary mappings (logical names for from-scratch generation)
    { sourceField: 'summary.grossThisPeriod', targetField: 'summary.gross', transform: 'currency' },
    { sourceField: 'summary.retentionThisPeriod', targetField: 'summary.retention', transform: 'currency' },
    { sourceField: 'summary.netThisPeriod', targetField: 'summary.net', transform: 'currency' },
    { sourceField: 'summary.vatAmount', targetField: 'summary.vat', transform: 'currency' },
    { sourceField: 'summary.totalDue', targetField: 'summary.total', transform: 'currency' },
  ],

  branding: {
    primaryColor: '#1e40af',
    fontFamily: 'Calibri',
  },
};

/**
 * Compact payment application template
 *
 * Simplified template for smaller applications:
 * - Essential header information
 * - Line items only
 * - Summary totals
 * - No variations or dayworks
 *
 * Suitable for:
 * - Simple subcontractor applications
 * - Small value works
 * - Quick valuations
 * - Internal progress reports
 */
export const compactApplicationTemplate: ExportTemplateConfig = {
  name: 'Compact Payment Application',
  version: '1.0',

  sections: {
    header: true,
    lines: true,
    variations: false,
    dayworks: false,
    summary: true,
    certification: false,
  },

  excel: {
    sheetName: 'Application',
    autoFit: true,
    currencySymbol: '£',
  },

  fieldMappings: [
    // Simplified mappings for compact format
    { sourceField: 'header.applicationNumber', targetField: 'B1', transform: 'number' },
    { sourceField: 'header.projectName', targetField: 'B2' },
    { sourceField: 'header.periodEnd', targetField: 'B3', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'summary.totalDue', targetField: 'B4', transform: 'currency' },
  ],

  branding: undefined,
};

/**
 * Detailed payment application template
 *
 * Comprehensive template with all sections enabled:
 * - Full header details
 * - Line items with sections
 * - Variations tracking
 * - Dayworks sheet
 * - Detailed summary with all deductions
 * - Certification section
 *
 * Suitable for:
 * - Main contractor applications
 * - Large value projects
 * - Complex valuations with multiple deductions
 * - Applications requiring certification
 */
export const detailedApplicationTemplate: ExportTemplateConfig = {
  name: 'Detailed Payment Application',
  version: '1.0',

  sections: {
    header: true,
    lines: true,
    variations: true,
    dayworks: true,
    summary: true,
    certification: true,
  },

  excel: {
    sheetName: 'Payment Application',
    startRow: 1,
    autoFit: true,
    protectSheet: false,
    currencySymbol: '£',
  },

  fieldMappings: [
    // Complete header mappings
    { sourceField: 'header.applicationNumber', targetField: 'B3', transform: 'number' },
    { sourceField: 'header.applicationRef', targetField: 'D3' },
    { sourceField: 'header.projectName', targetField: 'B4' },
    { sourceField: 'header.projectRef', targetField: 'B5' },
    { sourceField: 'header.contractRef', targetField: 'B6' },
    { sourceField: 'header.contractor.name', targetField: 'B7' },
    { sourceField: 'header.contractor.address', targetField: 'B8' },
    { sourceField: 'header.contractor.vatNumber', targetField: 'B9' },
    { sourceField: 'header.contractor.cisNumber', targetField: 'B10' },
    { sourceField: 'header.employer.name', targetField: 'B11' },
    { sourceField: 'header.employer.address', targetField: 'B12' },
    { sourceField: 'header.periodStart', targetField: 'B13', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.periodEnd', targetField: 'D13', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.valuationDate', targetField: 'B14', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.submittedDate', targetField: 'B15', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.dueDate', targetField: 'B16', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.contractValue', targetField: 'B17', transform: 'currency' },
    { sourceField: 'header.retentionPercentage', targetField: 'B18', transform: 'percentage' },
    { sourceField: 'header.mcdPercentage', targetField: 'B19', transform: 'percentage' },

    // Line items
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

    // Variations
    { sourceField: 'variations.variationNumber', targetField: 'A', transform: 'number' },
    { sourceField: 'variations.reference', targetField: 'B' },
    { sourceField: 'variations.description', targetField: 'C' },
    { sourceField: 'variations.status', targetField: 'D' },
    { sourceField: 'variations.value', targetField: 'E', transform: 'currency' },
    { sourceField: 'variations.previousCumulative', targetField: 'F', transform: 'currency' },
    { sourceField: 'variations.thisPeriod', targetField: 'G', transform: 'currency' },
    { sourceField: 'variations.currentCumulative', targetField: 'H', transform: 'currency' },

    // Detailed summary with all deductions
    { sourceField: 'summary.grossThisPeriod', targetField: 'summary.gross', transform: 'currency' },
    { sourceField: 'summary.materialsOnSite', targetField: 'summary.materials', transform: 'currency' },
    { sourceField: 'summary.totalThisPeriod', targetField: 'summary.total', transform: 'currency' },
    { sourceField: 'summary.previousCumulative', targetField: 'summary.prevCum', transform: 'currency' },
    { sourceField: 'summary.currentCumulative', targetField: 'summary.currCum', transform: 'currency' },
    { sourceField: 'summary.retentionThisPeriod', targetField: 'summary.retention', transform: 'currency' },
    { sourceField: 'summary.retentionCumulative', targetField: 'summary.retentionCum', transform: 'currency' },
    { sourceField: 'summary.retentionReleaseDue', targetField: 'summary.retentionRelease', transform: 'currency' },
    { sourceField: 'summary.mcdThisPeriod', targetField: 'summary.mcd', transform: 'currency' },
    { sourceField: 'summary.mcdCumulative', targetField: 'summary.mcdCum', transform: 'currency' },
    { sourceField: 'summary.contracharges', targetField: 'summary.contra', transform: 'currency' },
    { sourceField: 'summary.otherDeductions', targetField: 'summary.otherDed', transform: 'currency' },
    { sourceField: 'summary.netThisPeriod', targetField: 'summary.net', transform: 'currency' },
    { sourceField: 'summary.netCumulative', targetField: 'summary.netCum', transform: 'currency' },
    { sourceField: 'summary.previousPayments', targetField: 'summary.prevPay', transform: 'currency' },
    { sourceField: 'summary.amountDue', targetField: 'summary.due', transform: 'currency' },
    { sourceField: 'summary.vatRate', targetField: 'summary.vatRate', transform: 'percentage' },
    { sourceField: 'summary.vatAmount', targetField: 'summary.vat', transform: 'currency' },
    { sourceField: 'summary.totalDue', targetField: 'summary.totalDue', transform: 'currency' },

    // Certification
    { sourceField: 'certification.certifiedAmount', targetField: 'cert.amount', transform: 'currency' },
    { sourceField: 'certification.certifiedDate', targetField: 'cert.date', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'certification.certifiedBy', targetField: 'cert.by' },
    { sourceField: 'certification.varianceNotes', targetField: 'cert.notes' },
  ],

  branding: {
    primaryColor: '#1e40af',
    fontFamily: 'Calibri',
  },
};

/**
 * Subcontractor payment application template
 *
 * Template optimized for subcontractor applications:
 * - Simplified header
 * - Trade-focused line items
 * - Summary with retention and MCD
 * - No variations or certification
 *
 * Suitable for:
 * - Specialist trade contractors
 * - M&E contractors
 * - Package subcontractors
 * - Tier 2/3 applications
 */
export const subcontractorApplicationTemplate: ExportTemplateConfig = {
  name: 'Subcontractor Payment Application',
  version: '1.0',

  sections: {
    header: true,
    lines: true,
    variations: false,
    dayworks: false,
    summary: true,
    certification: false,
  },

  excel: {
    sheetName: 'Payment Application',
    autoFit: true,
    protectSheet: false,
    currencySymbol: '£',
  },

  fieldMappings: [
    // Essential header
    { sourceField: 'header.applicationNumber', targetField: 'B3', transform: 'number' },
    { sourceField: 'header.projectName', targetField: 'B4' },
    { sourceField: 'header.contractor.name', targetField: 'B5' },
    { sourceField: 'header.employer.name', targetField: 'B6' },
    { sourceField: 'header.periodEnd', targetField: 'B7', transform: 'date', format: 'dd/MM/yyyy' },
    { sourceField: 'header.contractValue', targetField: 'B8', transform: 'currency' },

    // Line items
    { sourceField: 'lines.lineNumber', targetField: 'A', transform: 'number' },
    { sourceField: 'lines.description', targetField: 'B' },
    { sourceField: 'lines.contractValue', targetField: 'C', transform: 'currency' },
    { sourceField: 'lines.previousCumulative', targetField: 'D', transform: 'currency' },
    { sourceField: 'lines.thisPeriod', targetField: 'E', transform: 'currency' },
    { sourceField: 'lines.currentCumulative', targetField: 'F', transform: 'currency' },

    // Summary with MCD
    { sourceField: 'summary.grossThisPeriod', targetField: 'summary.gross', transform: 'currency' },
    { sourceField: 'summary.retentionThisPeriod', targetField: 'summary.retention', transform: 'currency' },
    { sourceField: 'summary.mcdThisPeriod', targetField: 'summary.mcd', transform: 'currency' },
    { sourceField: 'summary.netThisPeriod', targetField: 'summary.net', transform: 'currency' },
    { sourceField: 'summary.previousPayments', targetField: 'summary.prevPay', transform: 'currency' },
    { sourceField: 'summary.amountDue', targetField: 'summary.due', transform: 'currency' },
    { sourceField: 'summary.totalDue', targetField: 'summary.total', transform: 'currency' },
  ],

  branding: undefined,
};

/**
 * Get template by name
 *
 * Convenience function to retrieve a pre-built template by its name
 *
 * @param name - Template name
 * @returns Template configuration or undefined
 */
export function getTemplateByName(name: string): ExportTemplateConfig | undefined {
  const templates: Record<string, ExportTemplateConfig> = {
    'Standard Payment Application': defaultApplicationTemplate,
    'Compact Payment Application': compactApplicationTemplate,
    'Detailed Payment Application': detailedApplicationTemplate,
    'Subcontractor Payment Application': subcontractorApplicationTemplate,
  };

  return templates[name];
}

/**
 * Get all available templates
 *
 * Returns all pre-built template configurations
 *
 * @returns Array of template configurations
 */
export function getAllTemplates(): ExportTemplateConfig[] {
  return [
    defaultApplicationTemplate,
    compactApplicationTemplate,
    detailedApplicationTemplate,
    subcontractorApplicationTemplate,
  ];
}

/**
 * Get template names
 *
 * Returns list of available template names
 *
 * @returns Array of template names
 */
export function getTemplateNames(): string[] {
  return getAllTemplates().map(t => t.name);
}
