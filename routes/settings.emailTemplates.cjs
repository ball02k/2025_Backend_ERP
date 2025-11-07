const express = require('express');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

/**
 * Email Templates - Settings Routes
 * Allows tenant admins to create and manage reusable email templates
 * for automated communications (e.g., tender invites).
 */

// Helper to check if user is admin
function requireTenantAdmin(req, res, next) {
  const roles = Array.isArray(req.user?.roles)
    ? req.user.roles
    : req.user?.role
    ? [req.user.role]
    : [];
  const isAdmin = roles.includes('admin');

  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// GET /api/settings/email-templates
// List all templates for the tenant, optionally filtered by type
router.get('/', requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { type } = req.query;

    const where = { tenantId: BigInt(tenantId) };
    if (type && type.trim()) {
      where.type = type.trim();
    }

    const templates = await prisma.emailTemplate.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' },
        { type: 'asc' },
        { name: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        type: true,
        isDefault: true,
        lastUsedAt: true,
        timesUsed: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Convert BigInt to Number for JSON serialization
    const summary = templates.map(t => ({
      id: Number(t.id),
      name: t.name,
      type: t.type,
      isDefault: t.isDefault,
      lastUsedAt: t.lastUsedAt,
      timesUsed: t.timesUsed,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return res.json({ templates: summary });
  } catch (error) {
    console.error('[email-templates] GET error:', error);
    return res.status(500).json({ error: 'Failed to load templates' });
  }
});

// GET /api/settings/email-templates/:id
// Get full template with subject and body
router.get('/:id', requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const templateId = BigInt(req.params.id);

    const template = await prisma.emailTemplate.findFirst({
      where: {
        id: templateId,
        tenantId: BigInt(tenantId),
      },
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Convert BigInt to Number
    const result = {
      id: Number(template.id),
      tenantId: Number(template.tenantId),
      name: template.name,
      type: template.type,
      subjectTemplate: template.subjectTemplate,
      bodyTemplate: template.bodyTemplate,
      isDefault: template.isDefault,
      createdByUserId: template.createdByUserId ? Number(template.createdByUserId) : null,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      lastUsedAt: template.lastUsedAt,
      timesUsed: template.timesUsed,
    };

    return res.json({ template: result });
  } catch (error) {
    console.error('[email-templates] GET/:id error:', error);
    return res.status(500).json({ error: 'Failed to load template' });
  }
});

// POST /api/settings/email-templates
// Create a new template
router.post('/', requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const { name, type, subjectTemplate, bodyTemplate, isDefault } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    if (!type || !type.trim()) {
      return res.status(400).json({ error: 'Template type is required' });
    }

    if (!subjectTemplate || !subjectTemplate.trim()) {
      return res.status(400).json({ error: 'Subject template is required' });
    }

    if (!bodyTemplate || !bodyTemplate.trim()) {
      return res.status(400).json({ error: 'Body template is required' });
    }

    // Create template in a transaction to handle isDefault logic
    const template = await prisma.$transaction(async (tx) => {
      // If this is being set as default, unset other defaults for same tenant+type
      if (isDefault === true) {
        await tx.emailTemplate.updateMany({
          where: {
            tenantId: BigInt(tenantId),
            type: type.trim(),
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      // Create new template
      const newTemplate = await tx.emailTemplate.create({
        data: {
          tenantId: BigInt(tenantId),
          name: name.trim(),
          type: type.trim(),
          subjectTemplate: subjectTemplate.trim(),
          bodyTemplate: bodyTemplate.trim(),
          isDefault: isDefault === true,
          createdByUserId: userId ? BigInt(userId) : null,
        },
      });

      return newTemplate;
    });

    // Convert BigInt to Number
    const result = {
      id: Number(template.id),
      tenantId: Number(template.tenantId),
      name: template.name,
      type: template.type,
      subjectTemplate: template.subjectTemplate,
      bodyTemplate: template.bodyTemplate,
      isDefault: template.isDefault,
      createdByUserId: template.createdByUserId ? Number(template.createdByUserId) : null,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      lastUsedAt: template.lastUsedAt,
      timesUsed: template.timesUsed,
    };

    return res.status(201).json({ template: result });
  } catch (error) {
    console.error('[email-templates] POST error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create template' });
  }
});

// PATCH /api/settings/email-templates/:id
// Update an existing template
router.patch('/:id', requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const templateId = BigInt(req.params.id);
    const { name, type, subjectTemplate, bodyTemplate, isDefault } = req.body;

    // Verify template exists and belongs to tenant
    const existing = await prisma.emailTemplate.findFirst({
      where: {
        id: templateId,
        tenantId: BigInt(tenantId),
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Update in transaction to handle isDefault logic
    const template = await prisma.$transaction(async (tx) => {
      // Prepare update data
      const updateData = {
        updatedAt: new Date(),
      };

      if (name !== undefined && name.trim()) {
        updateData.name = name.trim();
      }

      if (type !== undefined && type.trim()) {
        updateData.type = type.trim();
      }

      if (subjectTemplate !== undefined && subjectTemplate.trim()) {
        updateData.subjectTemplate = subjectTemplate.trim();
      }

      if (bodyTemplate !== undefined && bodyTemplate.trim()) {
        updateData.bodyTemplate = bodyTemplate.trim();
      }

      if (isDefault !== undefined) {
        updateData.isDefault = isDefault === true;

        // If setting as default, unset other defaults for same tenant+type
        if (isDefault === true) {
          const effectiveType = type !== undefined ? type.trim() : existing.type;
          await tx.emailTemplate.updateMany({
            where: {
              tenantId: BigInt(tenantId),
              type: effectiveType,
              isDefault: true,
              id: { not: templateId },
            },
            data: {
              isDefault: false,
            },
          });
        }
      }

      // Update template
      const updated = await tx.emailTemplate.update({
        where: { id: templateId },
        data: updateData,
      });

      return updated;
    });

    // Convert BigInt to Number
    const result = {
      id: Number(template.id),
      tenantId: Number(template.tenantId),
      name: template.name,
      type: template.type,
      subjectTemplate: template.subjectTemplate,
      bodyTemplate: template.bodyTemplate,
      isDefault: template.isDefault,
      createdByUserId: template.createdByUserId ? Number(template.createdByUserId) : null,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      lastUsedAt: template.lastUsedAt,
      timesUsed: template.timesUsed,
    };

    return res.json({ template: result });
  } catch (error) {
    console.error('[email-templates] PATCH/:id error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update template' });
  }
});

// DELETE /api/settings/email-templates/:id
// Delete a template
router.delete('/:id', requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const templateId = BigInt(req.params.id);

    // Verify template exists and belongs to tenant
    const existing = await prisma.emailTemplate.findFirst({
      where: {
        id: templateId,
        tenantId: BigInt(tenantId),
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Delete template
    await prisma.emailTemplate.delete({
      where: { id: templateId },
    });

    return res.json({ ok: true, message: 'Template deleted successfully' });
  } catch (error) {
    console.error('[email-templates] DELETE/:id error:', error);
    return res.status(500).json({ error: 'Failed to delete template' });
  }
});

module.exports = router;
