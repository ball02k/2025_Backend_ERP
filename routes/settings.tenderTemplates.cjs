const express = require('express');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

/**
 * Tender Question Templates - Settings Routes
 * Allows tenant admins to create and manage reusable question templates.
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

// GET /api/settings/tender-templates
// List all templates for the tenant
router.get('/', requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const templates = await prisma.tenderTemplate.findMany({
      where: { tenantId },
      include: {
        sections: {
          include: {
            questions: true,
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Return with summary info
    const summary = templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      sectionCount: t.sections.length,
      questionCount: t.sections.reduce((sum, s) => sum + s.questions.length, 0),
      lastUsedAt: t.lastUsedAt,
      timesUsed: t.timesUsed,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return res.json({ templates: summary });
  } catch (error) {
    console.error('[tender-templates] GET error:', error);
    return res.status(500).json({ error: 'Failed to load templates' });
  }
});

// GET /api/settings/tender-templates/:id
// Get full template with sections and questions
router.get('/:id', requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const templateId = Number(req.params.id);

    if (!Number.isFinite(templateId)) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    const template = await prisma.tenderTemplate.findFirst({
      where: { id: templateId, tenantId },
      include: {
        sections: {
          include: {
            questions: {
              orderBy: { orderIndex: 'asc' },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    return res.json({ template });
  } catch (error) {
    console.error('[tender-templates] GET/:id error:', error);
    return res.status(500).json({ error: 'Failed to load template' });
  }
});

// POST /api/settings/tender-templates
// Create a new template with sections and questions
router.post('/', requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const { name, description, sections } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    if (!Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({ error: 'At least one section is required' });
    }

    // Create template with sections and questions in a transaction
    const template = await prisma.$transaction(async (tx) => {
      // Create template
      const newTemplate = await tx.tenderTemplate.create({
        data: {
          tenantId,
          name: name.trim(),
          description: description?.trim() || null,
          createdByUserId: userId,
        },
      });

      // Create sections and questions
      for (const section of sections) {
        if (!section.title || !section.title.trim()) {
          throw new Error('Section title is required');
        }

        const newSection = await tx.tenderTemplateSection.create({
          data: {
            tenantId,
            templateId: newTemplate.id,
            title: section.title.trim(),
            orderIndex: section.orderIndex ?? 0,
          },
        });

        // Create questions for this section
        if (Array.isArray(section.questions)) {
          for (const question of section.questions) {
            if (!question.text || !question.text.trim()) {
              throw new Error('Question text is required');
            }

            await tx.tenderTemplateQuestion.create({
              data: {
                tenantId,
                templateSectionId: newSection.id,
                text: question.text.trim(),
                helpText: question.helpText?.trim() || null,
                responseType: question.responseType || 'text',
                weighting: question.weighting != null ? Number(question.weighting) : null,
                isMandatory: question.isMandatory ?? false,
                orderIndex: question.orderIndex ?? 0,
              },
            });
          }
        }
      }

      // Return full template with sections and questions
      return tx.tenderTemplate.findUnique({
        where: { id: newTemplate.id },
        include: {
          sections: {
            include: {
              questions: {
                orderBy: { orderIndex: 'asc' },
              },
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      });
    });

    return res.status(201).json({ template });
  } catch (error) {
    console.error('[tender-templates] POST error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create template' });
  }
});

// PATCH /api/settings/tender-templates/:id
// Update template, sections, and questions
router.patch('/:id', requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const templateId = Number(req.params.id);
    const { name, description, sections } = req.body;

    if (!Number.isFinite(templateId)) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    // Verify template exists and belongs to tenant
    const existing = await prisma.tenderTemplate.findFirst({
      where: { id: templateId, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Update in transaction
    const template = await prisma.$transaction(async (tx) => {
      // Update template metadata
      await tx.tenderTemplate.update({
        where: { id: templateId },
        data: {
          name: name?.trim() || existing.name,
          description: description !== undefined ? (description?.trim() || null) : existing.description,
          updatedAt: new Date(),
        },
      });

      // If sections provided, delete old sections/questions and recreate
      if (Array.isArray(sections)) {
        // Delete existing sections (cascade will delete questions)
        await tx.tenderTemplateSection.deleteMany({
          where: { templateId, tenantId },
        });

        // Create new sections and questions
        for (const section of sections) {
          if (!section.title || !section.title.trim()) {
            throw new Error('Section title is required');
          }

          const newSection = await tx.tenderTemplateSection.create({
            data: {
              tenantId,
              templateId,
              title: section.title.trim(),
              orderIndex: section.orderIndex ?? 0,
            },
          });

          // Create questions
          if (Array.isArray(section.questions)) {
            for (const question of section.questions) {
              if (!question.text || !question.text.trim()) {
                throw new Error('Question text is required');
              }

              await tx.tenderTemplateQuestion.create({
                data: {
                  tenantId,
                  templateSectionId: newSection.id,
                  text: question.text.trim(),
                  helpText: question.helpText?.trim() || null,
                  responseType: question.responseType || 'text',
                  weighting: question.weighting != null ? Number(question.weighting) : null,
                  isMandatory: question.isMandatory ?? false,
                  orderIndex: question.orderIndex ?? 0,
                },
              });
            }
          }
        }
      }

      // Return full updated template
      return tx.tenderTemplate.findUnique({
        where: { id: templateId },
        include: {
          sections: {
            include: {
              questions: {
                orderBy: { orderIndex: 'asc' },
              },
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      });
    });

    return res.json({ template });
  } catch (error) {
    console.error('[tender-templates] PATCH/:id error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update template' });
  }
});

// DELETE /api/settings/tender-templates/:id
// Delete a template
router.delete('/:id', requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const templateId = Number(req.params.id);

    if (!Number.isFinite(templateId)) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    // Verify template exists and belongs to tenant
    const existing = await prisma.tenderTemplate.findFirst({
      where: { id: templateId, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Delete template (cascade will delete sections and questions)
    await prisma.tenderTemplate.delete({
      where: { id: templateId },
    });

    return res.json({ ok: true, message: 'Template deleted successfully' });
  } catch (error) {
    console.error('[tender-templates] DELETE/:id error:', error);
    return res.status(500).json({ error: 'Failed to delete template' });
  }
});

module.exports = router;
