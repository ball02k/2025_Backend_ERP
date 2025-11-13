/**
 * Purchase Orders API Routes
 *
 * Provides CRUD operations and workflow management for Purchase Orders
 * Integrates with CVR system for commitment tracking
 */

const express = require('express');
const poService = require('../services/purchaseOrder.cjs');

module.exports = function purchaseOrdersRouter(prisma) {
  const router = express.Router();

  function getTenantId(req) {
    return req.user && req.user.tenantId;
  }

  function getUserId(req) {
    return req.user && req.user.id;
  }

  /**
   * GET /api/purchase-orders?projectId=123&status=DRAFT&limit=50&offset=0
   * List purchase orders with filters
   */
  router.get('/', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const filters = {
        projectId: req.query.projectId ? Number(req.query.projectId) : undefined,
        status: req.query.status,
        supplierId: req.query.supplierId ? Number(req.query.supplierId) : undefined,
        budgetLineId: req.query.budgetLineId ? Number(req.query.budgetLineId) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 50,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      };

      const result = await poService.getPurchaseOrders(tenantId, filters);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/purchase-orders/:id
   * Get single purchase order by ID
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);

      const po = await poService.getPurchaseOrderById(id, tenantId);
      if (!po) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      res.json(po);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/purchase-orders
   * Create new purchase order (Draft status)
   */
  router.post('/', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      const po = await poService.createPurchaseOrder({
        tenantId,
        ...req.body,
        createdBy: userId,
      });

      res.status(201).json(po);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /api/purchase-orders/:id
   * Update purchase order
   */
  router.patch('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);

      const po = await poService.updatePurchaseOrder(id, tenantId, req.body);
      res.json(po);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/purchase-orders/:id/submit
   * Submit PO for approval (DRAFT → SUBMITTED)
   */
  router.post('/:id/submit', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const id = Number(req.params.id);

      const po = await poService.submitPurchaseOrder(id, tenantId, userId);
      res.json(po);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/purchase-orders/:id/approve
   * Approve PO (SUBMITTED → APPROVED)
   * Creates CVR commitment
   */
  router.post('/:id/approve', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const id = Number(req.params.id);

      const po = await poService.approvePurchaseOrder(id, tenantId, userId);
      res.json(po);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/purchase-orders/:id/issue
   * Issue PO to supplier (APPROVED → ISSUED)
   */
  router.post('/:id/issue', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);

      const po = await poService.issuePurchaseOrder(id, tenantId);
      res.json(po);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/purchase-orders/:id/cancel
   * Cancel PO (updates CVR commitment status)
   */
  router.post('/:id/cancel', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const id = Number(req.params.id);
      const { cancelReason } = req.body;

      const po = await poService.cancelPurchaseOrder(id, tenantId, cancelReason, userId);
      res.json(po);
    } catch (err) {
      next(err);
    }
  });

  /**
   * DELETE /api/purchase-orders/:id
   * Delete purchase order (and CVR commitment if exists)
   */
  router.delete('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);

      await poService.deletePurchaseOrder(id, tenantId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
