/**
 * Export API Routes (Task 5.1 - Part 5)
 *
 * TypeScript API endpoints for the export layer.
 * Uses the ExportEngine orchestration layer.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ExportEngine, executeExport } from '../services/export/exportEngine';
import { ExportCategory, ExportFormat } from '@prisma/client';

const router = Router();

// Extend Express Request type to include user
interface AuthRequest extends Request {
  user?: {
    id: number;
    email?: string;
    tenantId: string;
    role?: string;
    roles?: string[];
  };
}

// Validation schemas
const exportRequestSchema = z.object({
  category: z.nativeEnum(ExportCategory),
  sourceId: z.string(),
  templateId: z.string().optional(),
  format: z.nativeEnum(ExportFormat).optional(),
  options: z
    .object({
      filename: z.string().optional(),
      includeAttachments: z.boolean().optional(),
      includeSupportingDocs: z.boolean().optional(),
      watermark: z.string().optional(),
      password: z.string().optional(),
    })
    .optional(),
});

const templateCreateSchema = z.object({
  name: z.string(),
  code: z.string(),
  description: z.string().optional(),
  category: z.nativeEnum(ExportCategory),
  format: z.nativeEnum(ExportFormat),
  scope: z.enum(['SYSTEM', 'TENANT', 'PROJECT']).default('TENANT'),
  config: z.record(z.any()),
  fieldMappings: z.record(z.any()),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().default(0),
  mainContractorId: z.string().optional(),
  mainContractorName: z.string().optional(),
});

/**
 * POST /api/export
 * Execute an export
 */
router.post(
  '/',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { tenantId, id: userId } = req.user;
      const request = exportRequestSchema.parse(req.body);

      const result = await executeExport(tenantId, String(userId), request);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
      }
      next(error);
    }
  }
);

/**
 * POST /api/export/download
 * Export and return file directly (for immediate download)
 */
router.post(
  '/download',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { tenantId, id: userId } = req.user;
      const request = exportRequestSchema.parse(req.body);

      const result = await executeExport(tenantId, String(userId), request);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Redirect to file URL for download
      if (result.fileUrl) {
        res.redirect(result.fileUrl);
      } else {
        res.status(500).json({ error: 'File URL not available' });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
      }
      next(error);
    }
  }
);

/**
 * GET /api/export/templates
 * Get available export templates
 */
router.get(
  '/templates',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { tenantId } = req.user;
      const { category, format, isActive } = req.query;

      const where: any = {
        OR: [
          { tenantId, scope: { in: ['TENANT', 'PROJECT'] } },
          { tenantId: null, scope: 'SYSTEM' },
        ],
      };

      if (category) where.category = category as ExportCategory;
      if (format) where.format = format as ExportFormat;
      if (isActive !== undefined) where.isActive = isActive === 'true';

      const templates = await prisma.exportTemplate.findMany({
        where,
        orderBy: [
          { scope: 'asc' },
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      });

      res.json({
        success: true,
        data: templates,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/export/templates/:id
 * Get single template
 */
router.get(
  '/templates/:id',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const template = await prisma.exportTemplate.findUnique({
        where: { id: req.params.id },
      });

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
      next(error);
    }
  }
);

/**
 * POST /api/export/templates
 * Create custom template
 */
router.post(
  '/templates',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { tenantId, id: userId } = req.user;
      const data = templateCreateSchema.parse(req.body);

      const template = await prisma.exportTemplate.create({
        data: {
          tenantId,
          createdBy: String(userId),
          ...data,
        },
      });

      res.status(201).json({
        success: true,
        data: template,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
      }
      next(error);
    }
  }
);

/**
 * PATCH /api/export/templates/:id
 * Update template
 */
router.patch(
  '/templates/:id',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      const updates = req.body;

      // Remove fields that shouldn't be updated
      delete updates.id;
      delete updates.tenantId;
      delete updates.createdBy;
      delete updates.createdAt;

      const template = await prisma.exportTemplate.update({
        where: { id },
        data: updates,
      });

      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/export/templates/:id
 * Delete template (soft delete by setting isActive = false)
 */
router.delete(
  '/templates/:id',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;

      // Soft delete by setting isActive to false
      await prisma.exportTemplate.update({
        where: { id },
        data: { isActive: false },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/export/history
 * Get export history
 */
router.get(
  '/history',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { tenantId } = req.user;
      const { category, sourceId, limit = '50', offset = '0' } = req.query;

      const where: any = { tenantId };
      if (category) where.category = category as ExportCategory;
      if (sourceId) where.sourceId = sourceId as string;

      const logs = await prisma.exportLog.findMany({
        where,
        orderBy: { exportedAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
        include: {
          template: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });

      const total = await prisma.exportLog.count({ where });

      res.json({
        success: true,
        data: logs,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + logs.length < total,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/export/history/:id
 * Get single export log
 */
router.get(
  '/history/:id',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { tenantId } = req.user;
      const { id } = req.params;

      const log = await prisma.exportLog.findFirst({
        where: {
          id,
          tenantId,
        },
        include: {
          template: true,
        },
      });

      if (!log) {
        return res.status(404).json({
          success: false,
          error: 'Export log not found',
        });
      }

      res.json({
        success: true,
        data: log,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/export/templates/register-system
 * Seed all built-in system templates (admin only)
 *
 * This endpoint seeds the 6 built-in templates into the database:
 * - Standard Payment Application (XLSX & PDF)
 * - Compact Payment Application (XLSX & PDF)
 * - Detailed Payment Application (XLSX)
 * - Subcontractor Payment Application (XLSX)
 *
 * This operation is idempotent - running multiple times will update existing templates.
 */
router.post(
  '/templates/register-system',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check if user has admin role
      const isAdmin =
        req.user.role === 'ADMIN' ||
        req.user.roles?.includes('ADMIN') ||
        req.user.roles?.includes('SUPER_ADMIN');

      if (!isAdmin) {
        return res.status(403).json({
          error: 'Forbidden - Admin access required',
        });
      }

      // Import and seed built-in templates
      const { seedBuiltInTemplates } = require('../dist/services/export/templateRegistry');
      const count = await seedBuiltInTemplates();

      // Get the newly seeded templates for response
      const templates = await prisma.exportTemplate.findMany({
        where: { scope: 'SYSTEM', isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          category: true,
          format: true,
          isDefault: true,
        },
        orderBy: { sortOrder: 'asc' },
      });

      res.json({
        success: true,
        data: templates,
        message: `Successfully seeded ${count} built-in system templates`,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
