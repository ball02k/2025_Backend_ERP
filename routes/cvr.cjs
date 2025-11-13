/**
 * CVR (Cost Value Reconciliation) API Routes
 *
 * Provides endpoints for CVR reporting and tracking
 */

const express = require('express');
const cvrService = require('../services/cvr.cjs');

module.exports = function cvrRouter(prisma) {
  const router = express.Router();

  function getTenantId(req) {
    return req.user && req.user.tenantId;
  }

  function getUserId(req) {
    return req.user && req.user.id;
  }

  /**
   * GET /cvr/summary?projectId=123&budgetLineId=456
   * Get CVR summary for a project or specific budget line
   */
  router.get('/summary', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = Number(req.query.projectId);
      const budgetLineId = req.query.budgetLineId ? Number(req.query.budgetLineId) : null;

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      const summary = await cvrService.getCVRSummary(tenantId, projectId, budgetLineId);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /cvr/by-budget-line?projectId=123
   * Get CVR data broken down by budget line
   */
  router.get('/by-budget-line', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = Number(req.query.projectId);

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      const data = await cvrService.getCVRByBudgetLine(tenantId, projectId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /cvr/commitment-breakdown?projectId=123
   * Get commitment breakdown by source type (CONTRACT, VARIATION, PURCHASE_ORDER)
   */
  router.get('/commitment-breakdown', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = Number(req.query.projectId);

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      const breakdown = await cvrService.getCommitmentBreakdown(tenantId, projectId);
      res.json(breakdown);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /cvr/actual-breakdown?projectId=123
   * Get actual breakdown by source type (INVOICE, PAYMENT_APPLICATION, DIRECT_COST)
   */
  router.get('/actual-breakdown', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = Number(req.query.projectId);

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      const breakdown = await cvrService.getActualBreakdown(tenantId, projectId);
      res.json(breakdown);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /cvr/commitment
   * Create a new CVR commitment (usually called by other services)
   */
  router.post('/commitment', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      const commitment = await cvrService.createCommitment({
        tenantId,
        ...req.body,
        createdBy: userId,
      });

      res.status(201).json(commitment);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /cvr/commitment/:id
   * Update commitment status
   */
  router.patch('/commitment/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { status, cancelledDate } = req.body;

      const commitment = await cvrService.updateCommitmentStatus(id, status, cancelledDate);
      res.json(commitment);
    } catch (err) {
      next(err);
    }
  });

  /**
   * DELETE /cvr/commitment/:id
   * Delete a commitment
   */
  router.delete('/commitment/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      await cvrService.deleteCommitment(id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /cvr/actual
   * Create a new CVR actual (usually called by other services)
   */
  router.post('/actual', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      const actual = await cvrService.createActual({
        tenantId,
        ...req.body,
        createdBy: userId,
      });

      res.status(201).json(actual);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /cvr/actual/:id
   * Update actual status
   */
  router.patch('/actual/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { status, certifiedDate, paidDate } = req.body;

      const actual = await cvrService.updateActualStatus(id, status, certifiedDate, paidDate);
      res.json(actual);
    } catch (err) {
      next(err);
    }
  });

  /**
   * DELETE /cvr/actual/:id
   * Delete an actual
   */
  router.delete('/actual/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      await cvrService.deleteActual(id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
