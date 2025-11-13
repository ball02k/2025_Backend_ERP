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

  // ==============================================================================
  // ENHANCED CVR ENDPOINTS - Forecast, Revenue, Profit/Loss (British English)
  // ==============================================================================

  /**
   * GET /cvr/summary-enhanced?projectId=123
   * Get enhanced CVR summary including forecast and profit/loss
   */
  router.get('/summary-enhanced', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = Number(req.query.projectId);

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      const summary = await cvrService.getCVRSummaryEnhanced(tenantId, projectId);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /cvr/forecast?budgetLineId=123
   * Get forecast final cost for a budget line
   */
  router.get('/forecast', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const budgetLineId = Number(req.query.budgetLineId);

      if (!budgetLineId) {
        return res.status(400).json({ error: 'budgetLineId is required' });
      }

      const forecast = await cvrService.calculateForecastFinalCost(tenantId, budgetLineId);
      res.json(forecast);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /cvr/profit-loss?projectId=123
   * Get profit/loss analysis for a project
   */
  router.get('/profit-loss', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = Number(req.query.projectId);

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      const profitLoss = await cvrService.calculateProfitLoss(tenantId, projectId);
      res.json(profitLoss);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /cvr/revenue?projectId=123
   * Get project revenue from contract valuations
   */
  router.get('/revenue', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = Number(req.query.projectId);

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      const revenue = await cvrService.calculateProjectRevenue(tenantId, projectId);
      res.json(revenue);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /cvr/costs?projectId=123
   * Get project costs breakdown
   */
  router.get('/costs', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = Number(req.query.projectId);

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      const costs = await cvrService.calculateProjectCosts(tenantId, projectId);
      res.json(costs);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /cvr/snapshot
   * Take a period snapshot for movement tracking
   */
  router.post('/snapshot', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const { projectId, periodEnd } = req.body;

      if (!projectId || !periodEnd) {
        return res.status(400).json({ error: 'projectId and periodEnd are required' });
      }

      const snapshot = await cvrService.takePeriodSnapshot(
        tenantId,
        Number(projectId),
        new Date(periodEnd),
        userId
      );

      res.status(201).json(snapshot);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /cvr/movement?projectId=123&fromPeriod=2025-01&toPeriod=2025-02
   * Get CVR movement between two periods
   */
  router.get('/movement', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = Number(req.query.projectId);
      const fromPeriod = new Date(req.query.fromPeriod);
      const toPeriod = new Date(req.query.toPeriod);

      if (!projectId || !fromPeriod || !toPeriod) {
        return res.status(400).json({
          error: 'projectId, fromPeriod, and toPeriod are required',
        });
      }

      const movement = await cvrService.getCVRMovement(tenantId, projectId, fromPeriod, toPeriod);
      res.json(movement);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
