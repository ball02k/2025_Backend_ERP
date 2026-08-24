/**
 * Export Routes (Task 5.1)
 *
 * API endpoints for the export layer.
 * Handles template management and data export in various formats.
 *
 * @typedef {import('../services/export/types').ExportRequest} ExportRequest
 * @typedef {import('../services/export/types').ExportResult} ExportResult
 * @typedef {import('../services/export/types').ExportOptions} ExportOptions
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Services
const exportService = require('../services/exportService.cjs');
const templateRegistry = require('../services/templateRegistry.cjs');
const { generateExcel, generatePaymentApplicationExcel, generateCVRReportExcel } = require('../services/generators/excelGenerator.cjs');
const { generatePDF, generatePaymentApplicationPDF } = require('../services/generators/pdfGenerator.cjs');
const { generateCSV, generatePaymentApplicationCSV } = require('../services/generators/csvGenerator.cjs');

/**
 * GET /api/exports/templates
 * Get all export templates
 */
router.get('/templates', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || 'demo';
    const { category, format, isActive } = req.query;

    const templates = await exportService.getTemplates(tenantId, {
      category,
      format,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    next(error);
  }
});

/**
 * GET /api/exports/templates/:templateId
 * Get a specific template
 */
router.get('/templates/:templateId', async (req, res, next) => {
  try {
    const { templateId } = req.params;

    const template = await exportService.getTemplate(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    next(error);
  }
});

/**
 * POST /api/exports/templates
 * Create a new export template
 */
router.post('/templates', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id || '1';

    const template = await exportService.createTemplate({
      ...req.body,
      tenantId,
      createdBy: userId,
    });

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error creating template:', error);
    next(error);
  }
});

/**
 * PATCH /api/exports/templates/:templateId
 * Update an export template
 */
router.patch('/templates/:templateId', async (req, res, next) => {
  try {
    const { templateId } = req.params;

    const template = await exportService.updateTemplate(templateId, req.body);

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error updating template:', error);
    next(error);
  }
});

/**
 * DELETE /api/exports/templates/:templateId
 * Delete an export template
 */
router.delete('/templates/:templateId', async (req, res, next) => {
  try {
    const { templateId } = req.params;

    await exportService.deleteTemplate(templateId);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting template:', error);
    next(error);
  }
});

/**
 * POST /api/exports/templates/register-system
 * Register all system templates (admin only)
 */
router.post('/templates/register-system', async (req, res, next) => {
  try {
    const results = await templateRegistry.registerAllSystemTemplates();

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Error registering system templates:', error);
    next(error);
  }
});

/**
 * POST /api/exports/payment-applications/:applicationId
 * Export a payment application
 */
router.post('/payment-applications/:applicationId', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id || '1';
    const { applicationId } = req.params;
    const { format = 'XLSX', templateId, templateCode } = req.body;

    // Fetch application data
    const application = await prisma.applicationForPayment.findFirst({
      where: {
        id: parseInt(applicationId),
        tenantId,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            reference: true,
          },
        },
        contract: {
          select: {
            id: true,
            contractRef: true,
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        lines: true,
      },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Payment application not found',
      });
    }

    // Get template
    let template;
    if (templateId) {
      template = await exportService.getTemplate(templateId);
    } else if (templateCode) {
      template = await exportService.getTemplateByCode(tenantId, templateCode);
    } else {
      template = await exportService.getDefaultTemplate(tenantId, 'PAYMENT_APPLICATION', format);
    }

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Transform data
    const transformedData = exportService.transformData(application, template.fieldMappings);
    const finalData = exportService.applyTemplateConfig(transformedData, template.config);

    // Generate export file based on format
    let buffer;
    let contentType;
    let fileExtension;

    switch (template.format) {
      case 'XLSX':
        buffer = await generatePaymentApplicationExcel(application, template);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        fileExtension = 'xlsx';
        break;

      case 'PDF':
        buffer = await generatePaymentApplicationPDF(application, template);
        contentType = 'application/pdf';
        fileExtension = 'pdf';
        break;

      case 'CSV':
        buffer = await generatePaymentApplicationCSV(application, template);
        contentType = 'text/csv';
        fileExtension = 'csv';
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unsupported format: ${template.format}`,
        });
    }

    // Generate filename
    const fileName = `PaymentApplication_${application.applicationNo || applicationId}.${fileExtension}`;

    // Log export
    await exportService.logExport({
      tenantId,
      category: 'PAYMENT_APPLICATION',
      sourceId: applicationId,
      sourceRef: application.applicationNo,
      templateId: template.id,
      format: template.format,
      fileName,
      fileSize: buffer.length,
      status: 'COMPLETED',
      exportedBy: userId,
    });

    // Send file
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting payment application:', error);
    next(error);
  }
});

/**
 * POST /api/exports/cvr-reports/:projectId
 * Export a CVR report
 */
router.post('/cvr-reports/:projectId', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user?.id || '1';
    const { projectId } = req.params;
    const { format = 'XLSX', templateId, asOfDate } = req.body;

    // Fetch CVR data (simplified - in real implementation, call CVR service)
    const cvrData = {
      projectId: parseInt(projectId),
      reportDate: new Date().toISOString(),
      periodEnd: asOfDate || new Date().toISOString(),
      value: {
        totalValue: 1000000,
        cumulativeCertified: 800000,
        pendingCertification: 200000,
        retentionHeld: 50000,
      },
      cost: {
        labour: 300000,
        materials: 250000,
        subcontractors: 200000,
        plant: 50000,
        overheads: 100000,
        other: 50000,
        totalCost: 950000,
      },
      results: {
        grossMargin: 50000,
        grossMarginPercentage: 5.26,
      },
    };

    // Get template
    let template;
    if (templateId) {
      template = await exportService.getTemplate(templateId);
    } else {
      template = await exportService.getDefaultTemplate(tenantId, 'CVR_REPORT', format);
    }

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Generate export file
    let buffer;
    let contentType;
    let fileExtension;

    switch (template.format) {
      case 'XLSX':
        buffer = await generateCVRReportExcel(cvrData, template);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        fileExtension = 'xlsx';
        break;

      case 'PDF':
        buffer = await generatePDF(cvrData, template);
        contentType = 'application/pdf';
        fileExtension = 'pdf';
        break;

      case 'CSV':
        buffer = await generateCSV(cvrData, template);
        contentType = 'text/csv';
        fileExtension = 'csv';
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unsupported format: ${template.format}`,
        });
    }

    // Generate filename
    const fileName = `CVR_Report_Project${projectId}.${fileExtension}`;

    // Log export
    await exportService.logExport({
      tenantId,
      category: 'CVR_REPORT',
      sourceId: projectId,
      sourceRef: `Project ${projectId}`,
      templateId: template.id,
      format: template.format,
      fileName,
      fileSize: buffer.length,
      status: 'COMPLETED',
      exportedBy: userId,
    });

    // Send file
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting CVR report:', error);
    next(error);
  }
});

/**
 * GET /api/exports/logs
 * Get export logs
 */
router.get('/logs', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || 'demo';
    const { category, sourceId, limit, offset } = req.query;

    const logs = await exportService.getExportLogs(tenantId, {
      category,
      sourceId,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('Error fetching export logs:', error);
    next(error);
  }
});

module.exports = router;
