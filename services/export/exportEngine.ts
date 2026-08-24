/**
 * Export Engine (Task 5.1 - Part 4)
 *
 * Main export orchestration layer that ties together:
 * - Template management
 * - Data extraction
 * - Format generation
 * - Storage upload
 * - Audit logging
 */

import { prisma } from '../../lib/prisma';
import { ExportFormat, ExportCategory } from '@prisma/client';
import {
  ExportRequest,
  ExportResult,
  ExportTemplateConfig,
  ExportOptions,
  FieldMapping,
} from './types';
import {
  extractPaymentApplicationData,
  extractCertificateData,
  extractCVRData,
} from './dataExtractor';
import { generateExcel } from './generators/excelGenerator';
import { generatePdf } from './generators/pdfGenerator';
import { generateCsv } from './generators/csvGenerator';
import { uploadToStorage } from '../../lib/storage';
import { defaultApplicationTemplate, detailedApplicationTemplate } from './templates/defaultApplicationTemplate';

/**
 * Main export engine - orchestrates the export process
 */
export class ExportEngine {
  private tenantId: string;
  private userId: string;

  constructor(tenantId: string, userId: string) {
    this.tenantId = tenantId;
    this.userId = userId;
  }

  /**
   * Execute an export request
   *
   * @param request - Export request details
   * @returns Export result with file URL or error
   */
  async export(request: ExportRequest): Promise<ExportResult> {
    try {
      // 1. Get template (or default)
      const template = await this.getTemplate(request);

      // 2. Extract source data
      const data = await this.extractData(request.category, request.sourceId);

      // 3. Generate output
      const format = request.format || template.format;
      const output = await this.generateOutput(format, data, template.config, request.options);

      // 4. Upload to storage
      const fileName = this.generateFileName(request, format);
      const uploadResult = await uploadToStorage(output.buffer, fileName, output.mimeType);

      // 5. Log export
      const exportLog = await this.logExport({
        category: request.category,
        sourceId: request.sourceId,
        sourceRef: 'header' in data ? data.header?.applicationRef : undefined,
        templateId: template.id?.startsWith('builtin-') ? undefined : template.id,
        format,
        fileUrl: uploadResult.url,
        fileName: uploadResult.filename,
        fileSize: output.buffer.length,
      });

      return {
        success: true,
        fileUrl: uploadResult.url,
        fileName: uploadResult.filename,
        fileSize: output.buffer.length,
        mimeType: output.mimeType,
        exportLogId: exportLog.id,
      };
    } catch (error) {
      // Log failed export
      await this.logExport({
        category: request.category,
        sourceId: request.sourceId,
        format: request.format || ExportFormat.XLSX,
        fileName: 'failed_export',
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Export failed',
      };
    }
  }

  /**
   * Get template for export
   *
   * Tries to find:
   * 1. Specific template by ID (if provided)
   * 2. Default tenant template for category/format
   * 3. Default system template for category/format
   * 4. Built-in fallback template
   */
  private async getTemplate(request: ExportRequest) {
    if (request.templateId) {
      const template = await prisma.exportTemplate.findUnique({
        where: { id: request.templateId },
      });
      if (!template) {
        throw new Error(`Template ${request.templateId} not found`);
      }
      return {
        ...template,
        config: template.config as unknown as ExportTemplateConfig,
      };
    }

    // Find default template for category/format
    const format = request.format || ExportFormat.XLSX;

    const defaultTemplate = await prisma.exportTemplate.findFirst({
      where: {
        OR: [
          { tenantId: this.tenantId, scope: 'TENANT' },
          { tenantId: null, scope: 'SYSTEM' },
        ],
        category: request.category,
        format: format,
        isDefault: true,
        isActive: true,
      },
      orderBy: [
        { scope: 'asc' }, // TENANT (if tenantId set) comes before SYSTEM
      ],
    });

    if (defaultTemplate) {
      return {
        ...defaultTemplate,
        config: defaultTemplate.config as unknown as ExportTemplateConfig,
      };
    }

    // Return built-in default
    return this.getBuiltInTemplate(request.category, format);
  }

  /**
   * Get built-in template when no custom template exists
   *
   * Uses pre-built templates from templates/defaultApplicationTemplate
   */
  private getBuiltInTemplate(category: ExportCategory, format: ExportFormat) {
    // Use pre-built templates for payment applications
    const builtInConfigs: Partial<Record<ExportCategory, ExportTemplateConfig>> = {
      PAYMENT_APPLICATION: defaultApplicationTemplate,
      CVR_REPORT: {
        name: 'Standard CVR Report',
        version: '1.0',
        fieldMappings: [],
        sections: {
          header: true,
          lines: false,
          variations: false,
          dayworks: false,
          summary: true,
          certification: false,
        },
        excel: {
          sheetName: 'CVR Report',
          autoFit: true,
          currencySymbol: '£',
        },
        pdf: {
          pageSize: 'A4',
          orientation: 'landscape',
          currencySymbol: '£',
          footerText: 'Generated by ERP System',
        },
        csv: {
          delimiter: ',',
          includeHeaders: true,
          columns: [],
          dateFormat: 'YYYY-MM-DD',
        },
      },
    };

    const config = builtInConfigs[category] || builtInConfigs.PAYMENT_APPLICATION!;

    return {
      id: `builtin-${category}-${format}`,
      name: `Built-in ${category}`,
      category,
      format,
      config,
    };
  }

  /**
   * Extract data based on category
   *
   * Routes to appropriate data extractor based on export category
   */
  private async extractData(category: ExportCategory, sourceId: string) {
    const sourceIdNum = parseInt(sourceId, 10);

    switch (category) {
      case 'PAYMENT_APPLICATION':
        return extractPaymentApplicationData(sourceIdNum);

      case 'PAYMENT_CERTIFICATE':
        return extractCertificateData(sourceId); // Certificate uses string ID (cuid)

      case 'CVR_REPORT':
        return extractCVRData(sourceIdNum, new Date());

      case 'VALUATION':
      case 'INVOICE':
      case 'RETENTION_STATEMENT':
      case 'AGED_RECEIVABLES':
        throw new Error(`Export category ${category} not yet implemented`);

      default:
        throw new Error(`Unsupported export category: ${category}`);
    }
  }

  /**
   * Generate output in specified format
   *
   * Routes to appropriate format generator
   */
  private async generateOutput(
    format: ExportFormat,
    data: any,
    config: ExportTemplateConfig,
    options?: ExportOptions
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    switch (format) {
      case 'XLSX':
        return generateExcel(data, config, options);

      case 'PDF':
        return generatePdf(data, config, options);

      case 'CSV':
        return generateCsv(data, config, options);

      case 'JSON':
        return {
          buffer: Buffer.from(JSON.stringify(data, null, 2), 'utf8'),
          mimeType: 'application/json',
        };

      case 'DOCX':
      case 'XML':
        throw new Error(`Export format ${format} not yet implemented`);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Generate filename for export
   *
   * Creates descriptive filename with timestamp
   */
  private generateFileName(request: ExportRequest, format: ExportFormat): string {
    const extensions: Record<ExportFormat, string> = {
      XLSX: 'xlsx',
      PDF: 'pdf',
      CSV: 'csv',
      DOCX: 'docx',
      JSON: 'json',
      XML: 'xml',
    };

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const ext = extensions[format];

    return (
      request.options?.filename ||
      `${request.category.toLowerCase()}_${request.sourceId}_${timestamp}.${ext}`
    );
  }

  /**
   * Log export to database
   *
   * Creates audit record of export operation
   */
  private async logExport(data: {
    category: ExportCategory;
    sourceId: string;
    sourceRef?: string;
    templateId?: string;
    format: ExportFormat;
    fileUrl?: string;
    fileName: string;
    fileSize?: number;
    status?: string;
    errorMessage?: string;
  }) {
    return prisma.exportLog.create({
      data: {
        tenantId: this.tenantId,
        exportedBy: this.userId,
        ...data,
        status: data.status || 'COMPLETED',
      },
    });
  }
}

/**
 * Convenience function to create and execute an export
 *
 * @param tenantId - Tenant ID
 * @param userId - User ID performing export
 * @param request - Export request
 * @returns Export result
 */
export async function executeExport(
  tenantId: string,
  userId: string,
  request: ExportRequest
): Promise<ExportResult> {
  const engine = new ExportEngine(tenantId, userId);
  return engine.export(request);
}
