/**
 * Export Layer Type Definitions (Task 5.1 - Part 2)
 *
 * Comprehensive type system for the flexible export layer.
 * Defines standardized internal data structures and configuration interfaces
 * for transforming payment applications into various external formats.
 */

import { ExportFormat, ExportCategory } from '@prisma/client';

/**
 * Standardized internal data structure for payment applications
 * This is the canonical format that all templates transform from
 */
export interface PaymentApplicationExportData {
  // Header information
  header: {
    applicationNumber: number;
    applicationRef: string;
    projectName: string;
    projectRef: string;
    contractRef?: string;

    // Parties
    contractor: {
      name: string;
      address?: string;
      vatNumber?: string;
      cisNumber?: string;
    };
    employer: {
      name: string;
      address?: string;
    };

    // Dates
    periodStart: Date;
    periodEnd: Date;
    valuationDate: Date;
    submittedDate?: Date;
    dueDate?: Date;

    // Contract info
    contractValue: number;
    retentionPercentage: number;
    mcdPercentage?: number;
  };

  // Line items / work breakdown
  lines: PaymentApplicationLineExport[];

  // Summary values
  summary: {
    // This period
    grossThisPeriod: number;
    materialsOnSite: number;
    totalThisPeriod: number;

    // Cumulative
    previousCumulative: number;
    currentCumulative: number;

    // Deductions
    retentionThisPeriod: number;
    retentionCumulative: number;
    retentionReleaseDue?: number;

    mcdThisPeriod?: number;
    mcdCumulative?: number;

    contracharges?: number;
    otherDeductions?: number;
    otherDeductionsDesc?: string;

    // Calculated
    netThisPeriod: number;
    netCumulative: number;

    // Previous payments
    previousPayments: number;
    amountDue: number;

    // VAT
    vatRate: number;
    vatAmount: number;
    totalDue: number;
  };

  // Additional sections
  variations?: VariationExport[];
  dayworks?: DayworkExport[];

  // Attachments/supporting docs
  attachments?: AttachmentExport[];

  // Certification (if certified)
  certification?: {
    certifiedAmount: number;
    certifiedDate?: Date;
    certifiedBy?: string;
    varianceNotes?: string;
  };
}

export interface PaymentApplicationLineExport {
  lineNumber: number;
  reference?: string;
  description: string;

  // Contract/budget values
  contractValue: number;

  // Progress
  previousCumulative: number;
  previousPercentage: number;
  thisPeriod: number;
  thisPeriodPercentage: number;
  currentCumulative: number;
  currentPercentage: number;

  // Remaining
  remainingValue: number;
  remainingPercentage: number;

  // Grouping
  section?: string;
  category?: string;
  sortOrder: number;
}

export interface VariationExport {
  variationNumber: number;
  reference: string;
  description: string;
  status: string;
  value: number;
  previousCumulative: number;
  thisPeriod: number;
  currentCumulative: number;
}

export interface DayworkExport {
  reference: string;
  description: string;
  date: Date;
  labourHours: number;
  labourRate: number;
  labourTotal: number;
  materialsTotal: number;
  plantTotal: number;
  total: number;
}

export interface AttachmentExport {
  name: string;
  type: string;
  url: string;
}

/**
 * Template field mapping configuration
 */
export interface FieldMapping {
  sourceField: string;      // Path in internal data e.g., "header.applicationNumber"
  targetField: string;      // Path/cell in output e.g., "B5" for Excel
  transform?: string;       // Optional transformation e.g., "currency", "date", "percentage"
  format?: string;          // Format string e.g., "dd/MM/yyyy" for dates
  defaultValue?: any;       // Default if source is null/undefined
}

/**
 * Template configuration
 */
export interface ExportTemplateConfig {
  // General settings
  name: string;
  version: string;

  // Format-specific settings
  excel?: ExcelTemplateConfig;
  pdf?: PdfTemplateConfig;
  csv?: CsvTemplateConfig;

  // Field mappings
  fieldMappings: FieldMapping[];

  // Sections to include
  sections: {
    header: boolean;
    lines: boolean;
    variations: boolean;
    dayworks: boolean;
    summary: boolean;
    certification: boolean;
  };

  // Styling/branding
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    fontFamily?: string;
  };
}

export interface ExcelTemplateConfig {
  templateFile?: string;    // Path to template file
  sheetName?: string;       // Sheet to write to
  startRow?: number;        // First data row
  lineItemsRange?: string;  // Range for line items e.g., "A15:K"
  variationsRange?: string; // Range for variations e.g., "A50:F"
  autoFit?: boolean;        // Auto-fit column widths
  protectSheet?: boolean;   // Protect formulas
  currencySymbol?: string;  // Currency symbol e.g., "£", "$", "€"
}

export interface PdfTemplateConfig {
  pageSize?: 'A4' | 'LETTER';
  orientation?: 'portrait' | 'landscape';
  margins?: { top: number; right: number; bottom: number; left: number };
  headerTemplate?: string;
  footerTemplate?: string;
  footerText?: string;      // Footer text to display
  currencySymbol?: string;  // Currency symbol e.g., "£", "$", "€"
}

export interface CsvTemplateConfig {
  delimiter?: string;
  includeHeaders?: boolean;
  columns: string[];        // Column order
  dateFormat?: string;
  numberFormat?: string;
}

/**
 * Export request
 */
export interface ExportRequest {
  category: ExportCategory;
  sourceId: string;         // ID of record to export
  templateId?: string;      // Specific template, or use default
  format?: ExportFormat;    // Override template format
  options?: ExportOptions;
}

export interface ExportOptions {
  filename?: string;
  includeAttachments?: boolean;
  includeSupportingDocs?: boolean;
  watermark?: string;
  password?: string;        // For protected exports
}

/**
 * Export result
 */
export interface ExportResult {
  success: boolean;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  error?: string;
  exportLogId?: string;
}

/**
 * Generator output
 */
export interface GeneratorOutput {
  buffer: Buffer;
  mimeType: string;
}
