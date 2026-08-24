/**
 * Template Registration Service (Task 5.2 - Part 3)
 *
 * Manages export templates in the database:
 * - Seeds built-in templates
 * - Retrieves templates by category/format
 * - Creates tenant-specific templates
 * - Duplicates templates for customization
 */

import { prisma } from '../../lib/prisma';
import { ExportCategory, ExportFormat, TemplateScope, ExportTemplate } from '@prisma/client';
import { ExportTemplateConfig } from './types';
import {
  defaultApplicationTemplate,
  compactApplicationTemplate,
  detailedApplicationTemplate,
  subcontractorApplicationTemplate,
} from './templates/defaultApplicationTemplate';

/**
 * Built-in templates that ship with the system
 *
 * These templates are automatically registered as SYSTEM-scoped templates
 * available to all tenants. They can be used as-is or duplicated for customization.
 */
const BUILT_IN_TEMPLATES: Array<{
  code: string;
  name: string;
  description: string;
  category: ExportCategory;
  format: ExportFormat;
  config: ExportTemplateConfig;
  isDefault: boolean;
  sortOrder: number;
}> = [
  {
    code: 'STD_APP_XLSX',
    name: 'Standard Payment Application',
    description: 'Full-featured payment application with header, line items, variations, and summary',
    category: 'PAYMENT_APPLICATION',
    format: 'XLSX',
    config: defaultApplicationTemplate,
    isDefault: true,
    sortOrder: 1,
  },
  {
    code: 'COMPACT_APP_XLSX',
    name: 'Compact Payment Application',
    description: 'Simplified application for smaller valuations with essential sections only',
    category: 'PAYMENT_APPLICATION',
    format: 'XLSX',
    config: compactApplicationTemplate,
    isDefault: false,
    sortOrder: 2,
  },
  {
    code: 'DETAILED_APP_XLSX',
    name: 'Detailed Payment Application',
    description: 'Comprehensive application with all sections including dayworks and certification',
    category: 'PAYMENT_APPLICATION',
    format: 'XLSX',
    config: detailedApplicationTemplate,
    isDefault: false,
    sortOrder: 3,
  },
  {
    code: 'SUBCON_APP_XLSX',
    name: 'Subcontractor Payment Application',
    description: 'Optimized for subcontractor applications with simplified header and MCD support',
    category: 'PAYMENT_APPLICATION',
    format: 'XLSX',
    config: subcontractorApplicationTemplate,
    isDefault: false,
    sortOrder: 4,
  },
  // PDF versions
  {
    code: 'STD_APP_PDF',
    name: 'Standard Payment Application (PDF)',
    description: 'Full-featured payment application in PDF format',
    category: 'PAYMENT_APPLICATION',
    format: 'PDF',
    config: defaultApplicationTemplate,
    isDefault: true,
    sortOrder: 10,
  },
  {
    code: 'COMPACT_APP_PDF',
    name: 'Compact Payment Application (PDF)',
    description: 'Simplified application in PDF format',
    category: 'PAYMENT_APPLICATION',
    format: 'PDF',
    config: compactApplicationTemplate,
    isDefault: false,
    sortOrder: 11,
  },
];

/**
 * Seed built-in templates to database
 *
 * Uses upsert to update existing templates or create new ones.
 * This function is idempotent and safe to run multiple times.
 *
 * @returns Number of templates seeded
 */
export async function seedBuiltInTemplates(): Promise<number> {
  console.log('Seeding built-in export templates...');
  let count = 0;

  for (const template of BUILT_IN_TEMPLATES) {
    try {
      // Check if template already exists (system templates have tenantId = null)
      const existing = await prisma.exportTemplate.findFirst({
        where: {
          tenantId: null,
          code: template.code,
          scope: 'SYSTEM',
        },
      });

      if (existing) {
        // Update existing template
        await prisma.exportTemplate.update({
          where: { id: existing.id },
          data: {
            name: template.name,
            description: template.description,
            config: template.config as any,
            fieldMappings: template.config.fieldMappings as any,
            sortOrder: template.sortOrder,
            isActive: true,
          },
        });
        console.log(`✓ Updated template: ${template.name}`);
      } else {
        // Create new template
        await prisma.exportTemplate.create({
          data: {
            code: template.code,
            name: template.name,
            description: template.description,
            category: template.category,
            format: template.format,
            scope: 'SYSTEM',
            config: template.config as any,
            fieldMappings: template.config.fieldMappings as any,
            isDefault: template.isDefault,
            isActive: true,
            sortOrder: template.sortOrder,
          },
        });
        console.log(`✓ Created template: ${template.name}`);
      }
      count++;
    } catch (error) {
      console.error(`✗ Failed to seed template ${template.code}:`, error);
    }
  }

  console.log(`Seeded ${count} built-in templates`);
  return count;
}

/**
 * Get available templates for a category
 *
 * Returns both SYSTEM templates (available to all) and tenant-specific templates.
 * Results are ordered by default status, scope, and name.
 *
 * @param tenantId - Tenant ID
 * @param category - Export category to filter by
 * @param format - Optional format to filter by
 * @returns Array of templates
 */
export async function getTemplatesForCategory(
  tenantId: string,
  category: ExportCategory,
  format?: ExportFormat
): Promise<ExportTemplate[]> {
  const where: any = {
    isActive: true,
    category,
    OR: [
      { tenantId, scope: 'TENANT' },
      { tenantId: null, scope: 'SYSTEM' },
    ],
  };

  if (format) {
    where.format = format;
  }

  return prisma.exportTemplate.findMany({
    where,
    orderBy: [
      { isDefault: 'desc' },
      { scope: 'asc' },
      { sortOrder: 'asc' },
      { name: 'asc' },
    ],
  });
}

/**
 * Get default template for category and format
 *
 * Resolution order:
 * 1. Tenant-specific default
 * 2. System default
 * 3. null if none found
 *
 * @param tenantId - Tenant ID
 * @param category - Export category
 * @param format - Export format
 * @returns Default template or null
 */
export async function getDefaultTemplate(
  tenantId: string,
  category: ExportCategory,
  format: ExportFormat
): Promise<ExportTemplate | null> {
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

  if (template) {
    console.log(`Found tenant-specific default template: ${template.name}`);
    return template;
  }

  // Fall back to system default
  template = await prisma.exportTemplate.findFirst({
    where: {
      tenantId: null,
      scope: 'SYSTEM',
      category,
      format,
      isDefault: true,
      isActive: true,
    },
  });

  if (template) {
    console.log(`Found system default template: ${template.name}`);
  }

  return template;
}

/**
 * Create tenant-specific template
 *
 * Creates a custom template for a specific tenant. Tenant templates
 * can override or supplement system templates.
 *
 * @param tenantId - Tenant ID
 * @param userId - User creating the template
 * @param data - Template data
 * @returns Created template
 */
export async function createTenantTemplate(
  tenantId: string,
  userId: string,
  data: {
    code: string;
    name: string;
    description?: string;
    category: ExportCategory;
    format: ExportFormat;
    config: ExportTemplateConfig;
    templateFileUrl?: string;
    mainContractorId?: string;
    mainContractorName?: string;
    isDefault?: boolean;
    sortOrder?: number;
  }
): Promise<ExportTemplate> {
  // If setting as default, unset other defaults for this tenant/category/format
  if (data.isDefault) {
    await prisma.exportTemplate.updateMany({
      where: {
        tenantId,
        category: data.category,
        format: data.format,
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    });
  }

  return prisma.exportTemplate.create({
    data: {
      tenantId,
      createdBy: userId,
      scope: 'TENANT',
      code: data.code,
      name: data.name,
      description: data.description,
      category: data.category,
      format: data.format,
      config: data.config as any,
      fieldMappings: data.config.fieldMappings as any,
      templateFileUrl: data.templateFileUrl,
      mainContractorId: data.mainContractorId,
      mainContractorName: data.mainContractorName,
      isDefault: data.isDefault || false,
      isActive: true,
      sortOrder: data.sortOrder || 0,
    },
  });
}

/**
 * Update tenant template
 *
 * @param templateId - Template ID
 * @param tenantId - Tenant ID (for authorization check)
 * @param data - Updated template data
 * @returns Updated template
 */
export async function updateTenantTemplate(
  templateId: string,
  tenantId: string,
  data: Partial<{
    name: string;
    description: string;
    config: ExportTemplateConfig;
    templateFileUrl: string;
    isDefault: boolean;
    isActive: boolean;
    sortOrder: number;
  }>
): Promise<ExportTemplate> {
  // Verify template belongs to tenant
  const existing = await prisma.exportTemplate.findFirst({
    where: {
      id: templateId,
      tenantId,
      scope: 'TENANT',
    },
  });

  if (!existing) {
    throw new Error('Template not found or does not belong to tenant');
  }

  // If setting as default, unset other defaults
  if (data.isDefault) {
    await prisma.exportTemplate.updateMany({
      where: {
        tenantId,
        category: existing.category,
        format: existing.format,
        isDefault: true,
        id: { not: templateId },
      },
      data: {
        isDefault: false,
      },
    });
  }

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.config !== undefined) {
    updateData.config = data.config as any;
    updateData.fieldMappings = data.config.fieldMappings as any;
  }
  if (data.templateFileUrl !== undefined) updateData.templateFileUrl = data.templateFileUrl;
  if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

  return prisma.exportTemplate.update({
    where: { id: templateId },
    data: updateData,
  });
}

/**
 * Duplicate a template (for customization)
 *
 * Creates a copy of an existing template (system or tenant) as a new tenant template.
 * Useful for customizing system templates.
 *
 * @param templateId - Source template ID
 * @param tenantId - Tenant ID for the new template
 * @param userId - User creating the duplicate
 * @param newName - Name for the new template
 * @param newCode - Optional code for the new template
 * @returns Duplicated template
 */
export async function duplicateTemplate(
  templateId: string,
  tenantId: string,
  userId: string,
  newName: string,
  newCode?: string
): Promise<ExportTemplate> {
  const source = await prisma.exportTemplate.findUnique({
    where: { id: templateId },
  });

  if (!source) {
    throw new Error('Template not found');
  }

  // Generate unique code if not provided
  const code = newCode || `${source.code}_COPY_${Date.now()}`;

  // Check if code already exists for this tenant
  const existing = await prisma.exportTemplate.findUnique({
    where: {
      tenantId_code: {
        tenantId,
        code,
      },
    },
  });

  if (existing) {
    throw new Error(`Template with code '${code}' already exists for this tenant`);
  }

  return prisma.exportTemplate.create({
    data: {
      tenantId,
      createdBy: userId,
      scope: 'TENANT',
      code,
      name: newName,
      description: `Copy of ${source.name}`,
      category: source.category,
      format: source.format,
      config: source.config as any,
      fieldMappings: source.fieldMappings as any,
      templateFileUrl: source.templateFileUrl,
      mainContractorId: source.mainContractorId,
      mainContractorName: source.mainContractorName,
      isDefault: false,
      isActive: true,
      sortOrder: source.sortOrder,
    },
  });
}

/**
 * Delete (soft delete) a tenant template
 *
 * Sets isActive to false. System templates cannot be deleted.
 *
 * @param templateId - Template ID
 * @param tenantId - Tenant ID (for authorization check)
 * @returns Updated template
 */
export async function deleteTenantTemplate(
  templateId: string,
  tenantId: string
): Promise<ExportTemplate> {
  // Verify template belongs to tenant
  const existing = await prisma.exportTemplate.findFirst({
    where: {
      id: templateId,
      tenantId,
      scope: 'TENANT',
    },
  });

  if (!existing) {
    throw new Error('Template not found or does not belong to tenant');
  }

  return prisma.exportTemplate.update({
    where: { id: templateId },
    data: { isActive: false },
  });
}

/**
 * Get template by ID
 *
 * @param templateId - Template ID
 * @param tenantId - Optional tenant ID for access check
 * @returns Template or null
 */
export async function getTemplateById(
  templateId: string,
  tenantId?: string
): Promise<ExportTemplate | null> {
  const where: any = { id: templateId };

  // If tenantId provided, ensure template is accessible
  if (tenantId) {
    where.OR = [
      { tenantId },
      { scope: 'SYSTEM' },
    ];
  }

  return prisma.exportTemplate.findFirst({ where });
}

/**
 * Get all Main Contractor specific templates
 *
 * @param mainContractorId - Main Contractor ID
 * @param category - Optional category filter
 * @returns Array of templates
 */
export async function getMainContractorTemplates(
  mainContractorId: string,
  category?: ExportCategory
): Promise<ExportTemplate[]> {
  const where: any = {
    mainContractorId,
    isActive: true,
  };

  if (category) {
    where.category = category;
  }

  return prisma.exportTemplate.findMany({
    where,
    orderBy: [
      { isDefault: 'desc' },
      { name: 'asc' },
    ],
  });
}

/**
 * Check if a template code is available for a tenant
 *
 * @param tenantId - Tenant ID
 * @param code - Template code
 * @returns True if available, false if already exists
 */
export async function isTemplateCodeAvailable(
  tenantId: string,
  code: string
): Promise<boolean> {
  const existing = await prisma.exportTemplate.findUnique({
    where: {
      tenantId_code: {
        tenantId,
        code,
      },
    },
  });

  return !existing;
}

/**
 * Get template statistics
 *
 * @param tenantId - Optional tenant ID for tenant-specific stats
 * @returns Statistics object
 */
export async function getTemplateStatistics(tenantId?: string) {
  const where: any = { isActive: true };

  if (tenantId) {
    where.OR = [
      { tenantId },
      { scope: 'SYSTEM' },
    ];
  }

  const total = await prisma.exportTemplate.count({ where });

  const byCategory = await prisma.exportTemplate.groupBy({
    by: ['category'],
    where,
    _count: true,
  });

  const byFormat = await prisma.exportTemplate.groupBy({
    by: ['format'],
    where,
    _count: true,
  });

  const byScope = await prisma.exportTemplate.groupBy({
    by: ['scope'],
    where,
    _count: true,
  });

  return {
    total,
    byCategory: byCategory.reduce((acc: any, item) => {
      acc[item.category] = item._count;
      return acc;
    }, {}),
    byFormat: byFormat.reduce((acc: any, item) => {
      acc[item.format] = item._count;
      return acc;
    }, {}),
    byScope: byScope.reduce((acc: any, item) => {
      acc[item.scope] = item._count;
      return acc;
    }, {}),
  };
}
