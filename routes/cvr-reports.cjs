/**
 * CVR Report API Routes
 *
 * Provides endpoints for CVR period report management and approvals.
 * British English throughout
 */

const express = require('express');
const cvrReportService = require('../services/cvr-reports.cjs');

module.exports = function cvrReportRouter(prisma) {
  const router = express.Router();

  function getTenantId(req) {
    return req.user && req.user.tenantId;
  }

  function getUserId(req) {
    return req.user && req.user.id;
  }

  /**
   * POST /cvr-reports
   * Create a new CVR report
   */
  router.post('/', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      const { projectId, reportDate, periodEnd, reportType } = req.body;

      if (!projectId || !reportDate || !periodEnd || !reportType) {
        return res.status(400).json({
          error: 'projectId, reportDate, periodEnd, and reportType are required',
        });
      }

      const validTypes = ['MONTHLY', 'QUARTERLY', 'YEAR_END', 'AD_HOC'];
      if (!validTypes.includes(reportType)) {
        return res.status(400).json({
          error: `Invalid reportType. Must be one of: ${validTypes.join(', ')}`,
        });
      }

      const report = await cvrReportService.createReport({
        tenantId,
        projectId: Number(projectId),
        reportDate,
        periodEnd,
        reportType,
        createdBy: userId,
      });

      res.status(201).json(report);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /cvr-reports/:id
   * Get a single report by ID
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const reportId = req.params.id;

      const report = await cvrReportService.getReportById(tenantId, reportId);
      res.json(report);
    } catch (err) {
      if (err.message === 'CVR report not found') {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  });

  /**
   * GET /cvr-reports
   * List reports for a project
   * Query params: projectId, reportType, status, limit, offset
   */
  router.get('/', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = req.query.projectId ? Number(req.query.projectId) : null;
      const reportType = req.query.reportType || null;
      const status = req.query.status || null;
      const limit = Number(req.query.limit) || 100;
      const offset = Number(req.query.offset) || 0;

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      const result = await cvrReportService.listReports({
        tenantId,
        projectId,
        reportType,
        status,
        limit,
        offset,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /cvr-reports/:id
   * Update a report (only if status is IN_PROGRESS)
   */
  router.patch('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const reportId = req.params.id;

      const allowedUpdates = [
        'reportDate',
        'periodEnd',
        'reportType',
        'comments',
        'refreshSnapshot', // Special flag to refresh CVR data
      ];

      const updates = {};
      for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
          if (['reportDate', 'periodEnd'].includes(key)) {
            updates[key] = new Date(req.body[key]);
          } else {
            updates[key] = req.body[key];
          }
        }
      }

      const report = await cvrReportService.updateReport(tenantId, reportId, updates);
      res.json(report);
    } catch (err) {
      if (err.message === 'CVR report not found') {
        return res.status(404).json({ error: err.message });
      }
      if (err.message === 'Can only update reports in IN_PROGRESS status') {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });

  /**
   * PATCH /cvr-reports/:id/status
   * Update report status
   * Body: { status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS', comments?: string }
   */
  router.patch('/:id/status', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const reportId = req.params.id;
      const { status, comments } = req.body;

      if (!status) {
        return res.status(400).json({ error: 'status is required' });
      }

      const validStatuses = ['IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      const report = await cvrReportService.updateReportStatus(
        tenantId,
        reportId,
        status,
        userId,
        comments || ''
      );

      res.json(report);
    } catch (err) {
      if (err.message === 'CVR report not found') {
        return res.status(404).json({ error: err.message });
      }
      if (err.message.startsWith('Invalid status transition')) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });

  /**
   * DELETE /cvr-reports/:id
   * Delete a report (soft delete, only if IN_PROGRESS)
   */
  router.delete('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const reportId = req.params.id;

      await cvrReportService.deleteReport(tenantId, reportId);
      res.json({ ok: true });
    } catch (err) {
      if (err.message === 'CVR report not found') {
        return res.status(404).json({ error: err.message });
      }
      if (err.message === 'Can only delete reports in IN_PROGRESS status') {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });

  /**
   * GET /cvr-reports/project/:projectId/summary
   * Get report summary for a project
   */
  router.get('/project/:projectId/summary', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = Number(req.params.projectId);

      const summary = await cvrReportService.getProjectReportSummary(tenantId, projectId);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /cvr-reports/compare?from=:fromReportId&to=:toReportId
   * Compare two approved reports to show movement
   */
  router.get('/compare', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const fromReportId = req.query.from;
      const toReportId = req.query.to;

      if (!fromReportId || !toReportId) {
        return res.status(400).json({
          error: 'Both from and to report IDs are required',
        });
      }

      const comparison = await cvrReportService.compareReports(
        tenantId,
        fromReportId,
        toReportId
      );

      res.json(comparison);
    } catch (err) {
      if (err.message === 'CVR report not found') {
        return res.status(404).json({ error: err.message });
      }
      if (err.message === 'Reports must be from the same project') {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });

  return router;
};
