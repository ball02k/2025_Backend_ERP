/**
 * Export Service (Task 5.1)
 *
 * Core service for the export layer architecture.
 * Handles export template management, data transformation, and format generation.
 *
 * @typedef {import('./export/types').ExportRequest} ExportRequest
 * @typedef {import('./export/types').ExportResult} ExportResult
 * @typedef {import('./export/types').ExportOptions} ExportOptions
 * @typedef {import('./export/types').FieldMapping} FieldMapping
 * @typedef {import('./export/types').PaymentApplicationExportData} PaymentApplicationExportData
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Get all export templates for a tenant
 *
 * @param {string} tenantId - Tenant identifier
 * @param {Object} options - Filter options
 * @param {string} [options.category] - Filter by export category
 * @param {string} [options.format] - Filter by export format
 * @param {boolean} [options.isActive] - Filter by active status
 * @returns {Promise<Array>} List of export templates
 */
async function getTemplates(tenantId, options = {}) {
  const { category, format, isActive = true } = options;

  const where = {
    OR: [
      { tenantId, scope: { in: ['TENANT', 'PROJECT'] } },
      { tenantId: null, scope: 'SYSTEM' }, // System templates
    ],
  };

  if (category) where.category = category;
  if (format) where.format = format;
  if (isActive !== undefined) where.isActive = isActive;

  return prisma.exportTemplate.findMany({
    where,
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/**
 * Get a specific template by ID
 */
async function getTemplate(templateId) {
  return prisma.exportTemplate.findUnique({
    where: { id: templateId },
  });
}

/**
 * Get a template by code
 */
async function getTemplateByCode(tenantId, code) {
  return prisma.exportTemplate.findUnique({
    where: {
      tenantId_code: {
        tenantId,
        code,
      },
    },
  });
}

/**
 * Get default template for a category and format
 */
async function getDefaultTemplate(tenantId, category, format) {
  // First try tenant-specific default
  let template = await prisma.exportTemplate.findFirst({
    where: {
      tenantId,
      category,
      format,
      isDefault: true,
      isActive: true,
    },
  });

  // Fall back to system default
  if (!template) {
    template = await prisma.exportTemplate.findFirst({
      where: {
        tenantId: null,
        category,
        format,
        isDefault: true,
        isActive: true,
        scope: 'SYSTEM',
      },
    });
  }

  return template;
}

/**
 * Create a new export template
 */
async function createTemplate(data) {
  const { tenantId, name, code, description, category, format, scope, config, fieldMappings, ...rest } = data;

  // Validate required fields
  if (!name || !code || !category || !format) {
    throw new Error('Missing required template fields: name, code, category, format');
  }

  // Check for duplicate code
  const existing = await prisma.exportTemplate.findUnique({
    where: {
      tenantId_code: {
        tenantId: tenantId || null,
        code,
      },
    },
  });

  if (existing) {
    throw new Error(`Template with code "${code}" already exists`);
  }

  return prisma.exportTemplate.create({
    data: {
      tenantId: tenantId || null,
      name,
      code,
      description,
      category,
      format,
      scope: scope || (tenantId ? 'TENANT' : 'SYSTEM'),
      config: config || {},
      fieldMappings: fieldMappings || {},
      ...rest,
    },
  });
}

/**
 * Update an export template
 */
async function updateTemplate(templateId, data) {
  return prisma.exportTemplate.update({
    where: { id: templateId },
    data,
  });
}

/**
 * Delete an export template
 */
async function deleteTemplate(templateId) {
  return prisma.exportTemplate.delete({
    where: { id: templateId },
  });
}

/**
 * Log an export operation
 *
 * @param {Object} data - Export log data
 * @param {string} data.tenantId - Tenant ID
 * @param {string} data.category - Export category
 * @param {string} data.sourceId - Source record ID
 * @param {string} [data.sourceRef] - Human-readable reference
 * @param {string} [data.templateId] - Template ID used
 * @param {string} data.format - Export format
 * @param {string} [data.fileUrl] - URL to generated file
 * @param {string} data.fileName - Generated file name
 * @param {number} [data.fileSize] - File size in bytes
 * @param {string} [data.status] - Export status (default: COMPLETED)
 * @param {string} [data.errorMessage] - Error message if failed
 * @param {string} data.exportedBy - User ID who exported
 * @returns {Promise<Object>} Created export log record
 */
async function logExport(data) {
  const {
    tenantId,
    category,
    sourceId,
    sourceRef,
    templateId,
    format,
    fileUrl,
    fileName,
    fileSize,
    status = 'COMPLETED',
    errorMessage,
    exportedBy,
  } = data;

  return prisma.exportLog.create({
    data: {
      tenantId,
      category,
      sourceId,
      sourceRef,
      templateId,
      format,
      fileUrl,
      fileName,
      fileSize,
      status,
      errorMessage,
      exportedBy,
    },
  });
}

/**
 * Get export logs for a tenant
 */
async function getExportLogs(tenantId, options = {}) {
  const { category, sourceId, limit = 50, offset = 0 } = options;

  const where = { tenantId };
  if (category) where.category = category;
  if (sourceId) where.sourceId = sourceId;

  return prisma.exportLog.findMany({
    where,
    include: {
      template: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
    orderBy: { exportedAt: 'desc' },
    take: limit,
    skip: offset,
  });
}

/**
 * Transform internal data to export format
 *
 * This function maps internal data structure to the template's field mappings.
 * Uses dot notation to extract nested values and map them to output fields.
 *
 * @param {Object} data - Source data to transform
 * @param {Object<string, string>} fieldMappings - Field mapping configuration
 *   Key: output field name, Value: input field path (dot notation)
 * @returns {Object} Transformed data according to field mappings
 *
 * @example
 * transformData(
 *   { header: { applicationNumber: 123 } },
 *   { 'Application Number': 'header.applicationNumber' }
 * )
 * // Returns: { 'Application Number': 123 }
 */
function transformData(data, fieldMappings) {
  if (!fieldMappings || Object.keys(fieldMappings).length === 0) {
    return data; // No mapping, return as-is
  }

  const transformed = {};

  for (const [outputField, inputPath] of Object.entries(fieldMappings)) {
    // Support nested paths like "application.applicationNumber"
    const value = getNestedValue(data, inputPath);
    setNestedValue(transformed, outputField, value);
  }

  return transformed;
}

/**
 * Get nested value from object using dot notation path
 */
function getNestedValue(obj, path) {
  if (!path) return undefined;

  const keys = path.split('.');
  let value = obj;

  for (const key of keys) {
    if (value === null || value === undefined) return undefined;
    value = value[key];
  }

  return value;
}

/**
 * Set nested value in object using dot notation path
 */
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  let current = obj;

  for (const key of keys) {
    if (!current[key]) current[key] = {};
    current = current[key];
  }

  current[lastKey] = value;
}

/**
 * Apply template configuration to data
 */
function applyTemplateConfig(data, config) {
  const result = { ...data };

  // Apply any template-specific transformations based on config
  if (config.dateFormat) {
    // Apply date formatting
    for (const key in result) {
      if (result[key] instanceof Date) {
        result[key] = formatDate(result[key], config.dateFormat);
      }
    }
  }

  if (config.currencyFormat) {
    // Apply currency formatting
    for (const key in result) {
      if (typeof result[key] === 'number' && key.toLowerCase().includes('amount')) {
        result[key] = formatCurrency(result[key], config.currencyFormat);
      }
    }
  }

  return result;
}

/**
 * Format date according to template config
 */
function formatDate(date, format) {
  if (!date) return '';
  const d = new Date(date);

  switch (format) {
    case 'DD/MM/YYYY':
      return `${padZero(d.getDate())}/${padZero(d.getMonth() + 1)}/${d.getFullYear()}`;
    case 'MM/DD/YYYY':
      return `${padZero(d.getMonth() + 1)}/${padZero(d.getDate())}/${d.getFullYear()}`;
    case 'YYYY-MM-DD':
      return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
    default:
      return d.toISOString();
  }
}

/**
 * Format currency according to template config
 */
function formatCurrency(amount, format) {
  if (amount === null || amount === undefined) return '';

  const { currency = 'GBP', decimals = 2, symbol = '£' } = format || {};

  const formatted = amount.toFixed(decimals);
  return `${symbol}${formatted}`;
}

/**
 * Pad number with leading zero
 */
function padZero(num) {
  return num.toString().padStart(2, '0');
}

module.exports = {
  getTemplates,
  getTemplate,
  getTemplateByCode,
  getDefaultTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  logExport,
  getExportLogs,
  transformData,
  applyTemplateConfig,
};
