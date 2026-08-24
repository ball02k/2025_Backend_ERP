/**
 * Convenience Export Endpoints for Applications (Task 5.1 - Part 6)
 *
 * Quick export endpoints nested under projects/applications for easier frontend integration.
 * Provides direct access to export functionality without needing to construct full export requests.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { ExportEngine } from '../services/export/exportEngine';
import { ExportCategory, ExportFormat } from '@prisma/client';

const router = Router({ mergeParams: true });

// Extend Express Request type to include user
interface AuthRequest extends Request {
  user?: {
    id: number;
    email?: string;
    tenantId: string;
    role?: string;
    roles?: string[];
  };
  membership?: {
    id: number;
    role: string;
  };
}

/**
 * GET /api/projects/:projectId/applications/:applicationId/export
 * Quick export endpoint for applications
 *
 * Query parameters:
 * - format: Export format (XLSX, PDF, CSV) - default: XLSX
 * - templateId: Optional template ID
 */
router.get(
  '/:applicationId/export',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { applicationId } = req.params;
      const { format = 'XLSX', templateId } = req.query;
      const { tenantId, id: userId } = req.user;

      // Validate application exists and belongs to tenant
      const application = await prisma.applicationForPayment.findFirst({
        where: {
          id: parseInt(applicationId),
          tenantId,
        },
        select: { id: true, projectId: true },
      });

      if (!application) {
        return res.status(404).json({ error: 'Application not found' });
      }

      const engine = new ExportEngine(tenantId, String(userId));
      const result = await engine.export({
        category: ExportCategory.PAYMENT_APPLICATION,
        sourceId: applicationId,
        format: format as ExportFormat,
        templateId: templateId as string | undefined,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/projects/:projectId/applications/:applicationId/export/download
 * Direct download - immediately redirects to file URL
 *
 * Query parameters:
 * - format: Export format (XLSX, PDF, CSV) - default: XLSX
 * - templateId: Optional template ID
 */
router.get(
  '/:applicationId/export/download',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { applicationId } = req.params;
      const { format = 'XLSX', templateId } = req.query;
      const { tenantId, id: userId } = req.user;

      // Validate application exists and belongs to tenant
      const application = await prisma.applicationForPayment.findFirst({
        where: {
          id: parseInt(applicationId),
          tenantId,
        },
        select: { id: true, projectId: true },
      });

      if (!application) {
        return res.status(404).json({ error: 'Application not found' });
      }

      const engine = new ExportEngine(tenantId, String(userId));
      const result = await engine.export({
        category: ExportCategory.PAYMENT_APPLICATION,
        sourceId: applicationId,
        format: format as ExportFormat,
        templateId: templateId as string | undefined,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      if (!result.fileUrl) {
        return res.status(500).json({ error: 'File URL not available' });
      }

      res.redirect(result.fileUrl);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/projects/:projectId/applications/:applicationId/export/templates
 * Get available templates for this application
 *
 * Returns templates that are:
 * - Active
 * - Category PAYMENT_APPLICATION
 * - SYSTEM scope (available to all)
 * - TENANT scope (tenant-specific)
 * - Main Contractor specific (if project has upstream contract)
 */
router.get(
  '/:applicationId/export/templates',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { tenantId } = req.user;
      const { projectId, applicationId } = req.params;

      // Validate application exists and get project info
      const application = await prisma.applicationForPayment.findFirst({
        where: {
          id: parseInt(applicationId),
          tenantId,
          projectId: parseInt(projectId),
        },
        select: {
          id: true,
          project: {
            select: {
              id: true,
              upstreamContractRef: true,
              upstreamContract: {
                select: {
                  id: true,
                  mainContractorId: true,
                },
              },
            },
          },
        },
      });

      if (!application) {
        return res.status(404).json({ error: 'Application not found' });
      }

      // Build where clause for templates
      const whereConditions: any[] = [
        { tenantId, scope: 'TENANT' },
        { tenantId: null, scope: 'SYSTEM' },
      ];

      // Include Main Contractor specific templates if applicable
      const mainContractorId =
        application.project?.upstreamContract?.mainContractorId;
      if (mainContractorId) {
        whereConditions.push({
          mainContractorId,
        });
      }

      const templates = await prisma.exportTemplate.findMany({
        where: {
          isActive: true,
          category: 'PAYMENT_APPLICATION',
          OR: whereConditions,
        },
        orderBy: [
          { isDefault: 'desc' },
          { scope: 'asc' },
          { name: 'asc' },
        ],
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          category: true,
          format: true,
          scope: true,
          isDefault: true,
          mainContractorId: true,
          mainContractorName: true,
          createdAt: true,
          updatedAt: true,
        },
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

export default router;
