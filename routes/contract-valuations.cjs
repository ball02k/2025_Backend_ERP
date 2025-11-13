/**
 * Contract Valuation API Routes
 *
 * Provides endpoints for contract valuation management and revenue tracking.
 * British English: "valuation" throughout
 */

const express = require('express');
const valuationService = require('../services/contract-valuation.cjs');

module.exports = function contractValuationRouter(prisma) {
  const router = express.Router();

  function getTenantId(req) {
    return req.user && req.user.tenantId;
  }

  function getUserId(req) {
    return req.user && req.user.id;
  }

  /**
   * POST /contract-valuations
   * Create a new contract valuation
   */
  router.post('/', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      const {
        contractId,
        budgetLineId,
        valuationNumber,
        valuationDate,
        grossValuation,
        retention,
        previouslyValued,
        thisValuation,
        materialsOnSite,
        description,
        notes,
      } = req.body;

      if (!contractId || !valuationNumber || !valuationDate || grossValuation === undefined) {
        return res.status(400).json({
          error: 'contractId, valuationNumber, valuationDate, and grossValuation are required',
        });
      }

      const valuation = await valuationService.createValuation({
        tenantId,
        contractId: Number(contractId),
        budgetLineId: budgetLineId ? Number(budgetLineId) : null,
        valuationNumber: Number(valuationNumber),
        valuationDate,
        grossValuation: Number(grossValuation),
        retention: retention ? Number(retention) : 0,
        previouslyValued: previouslyValued ? Number(previouslyValued) : 0,
        thisValuation: Number(thisValuation),
        materialsOnSite: materialsOnSite ? Number(materialsOnSite) : 0,
        description: description || '',
        notes: notes || '',
        createdBy: userId,
      });

      res.status(201).json(valuation);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /contract-valuations/:id
   * Get a single valuation by ID
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const valuationId = Number(req.params.id);

      const valuation = await valuationService.getValuationById(tenantId, valuationId);
      res.json(valuation);
    } catch (err) {
      if (err.message === 'Contract valuation not found') {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  });

  /**
   * GET /contract-valuations
   * List valuations for a contract or project
   * Query params: contractId, projectId, status, limit, offset
   */
  router.get('/', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const contractId = req.query.contractId ? Number(req.query.contractId) : null;
      const projectId = req.query.projectId ? Number(req.query.projectId) : null;
      const status = req.query.status || null;
      const limit = Number(req.query.limit) || 100;
      const offset = Number(req.query.offset) || 0;

      if (!contractId && !projectId) {
        return res.status(400).json({
          error: 'Either contractId or projectId is required',
        });
      }

      const result = await valuationService.listValuations({
        tenantId,
        contractId,
        projectId,
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
   * PATCH /contract-valuations/:id
   * Update a valuation (only if status is DRAFT)
   */
  router.patch('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const valuationId = Number(req.params.id);

      const allowedUpdates = [
        'valuationNumber',
        'valuationDate',
        'grossValuation',
        'retention',
        'previouslyValued',
        'thisValuation',
        'materialsOnSite',
        'description',
        'notes',
      ];

      const updates = {};
      for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
          // Convert numeric fields
          if (['valuationNumber', 'grossValuation', 'retention', 'previouslyValued', 'thisValuation', 'materialsOnSite'].includes(key)) {
            updates[key] = Number(req.body[key]);
          } else if (key === 'valuationDate') {
            updates[key] = new Date(req.body[key]);
          } else {
            updates[key] = req.body[key];
          }
        }
      }

      const valuation = await valuationService.updateValuation(tenantId, valuationId, updates);
      res.json(valuation);
    } catch (err) {
      if (err.message === 'Contract valuation not found') {
        return res.status(404).json({ error: err.message });
      }
      if (err.message === 'Can only update valuations in DRAFT status') {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });

  /**
   * PATCH /contract-valuations/:id/status
   * Update valuation status
   * Body: { status: 'SUBMITTED' | 'CERTIFIED' | 'INVOICED' | 'DRAFT', notes?: string }
   */
  router.patch('/:id/status', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const valuationId = Number(req.params.id);
      const { status, notes } = req.body;

      if (!status) {
        return res.status(400).json({ error: 'status is required' });
      }

      const validStatuses = ['DRAFT', 'SUBMITTED', 'CERTIFIED', 'INVOICED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      const valuation = await valuationService.updateValuationStatus(
        tenantId,
        valuationId,
        status,
        userId,
        notes || ''
      );

      res.json(valuation);
    } catch (err) {
      if (err.message === 'Contract valuation not found') {
        return res.status(404).json({ error: err.message });
      }
      if (err.message.startsWith('Invalid status transition')) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });

  /**
   * DELETE /contract-valuations/:id
   * Delete a valuation (soft delete, only if DRAFT)
   */
  router.delete('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const valuationId = Number(req.params.id);

      await valuationService.deleteValuation(tenantId, valuationId);
      res.json({ ok: true });
    } catch (err) {
      if (err.message === 'Contract valuation not found') {
        return res.status(404).json({ error: err.message });
      }
      if (err.message === 'Can only delete valuations in DRAFT status') {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });

  /**
   * GET /contract-valuations/contract/:contractId/summary
   * Get valuation summary for a contract
   */
  router.get('/contract/:contractId/summary', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const contractId = Number(req.params.contractId);

      const summary = await valuationService.getContractValuationSummary(tenantId, contractId);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
