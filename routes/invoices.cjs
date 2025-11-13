/**
 * Invoices API Routes
 *
 * Provides CRUD operations and workflow management for Invoices
 * Integrates with CVR system for actual cost tracking
 */

const express = require('express');
const invoiceService = require('../services/invoice.cjs');

module.exports = function invoicesRouter(prisma) {
  const router = express.Router();

  function getTenantId(req) {
    return req.user && req.user.tenantId;
  }

  function getUserId(req) {
    return req.user && req.user.id;
  }

  /**
   * GET /api/invoices?projectId=123&status=RECEIVED&limit=50&offset=0
   * List invoices with filters
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

      const result = await invoiceService.getInvoices(tenantId, filters);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/invoices/awaiting-approval?projectId=123
   * Get invoices awaiting approval
   */
  router.get('/awaiting-approval', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = req.query.projectId ? Number(req.query.projectId) : null;

      const invoices = await invoiceService.getInvoicesAwaitingApproval(tenantId, projectId);
      res.json(invoices);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/invoices/overdue?projectId=123
   * Get overdue invoices
   */
  router.get('/overdue', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = req.query.projectId ? Number(req.query.projectId) : null;

      const invoices = await invoiceService.getOverdueInvoices(tenantId, projectId);
      res.json(invoices);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/invoices/:id
   * Get single invoice by ID
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);

      const invoice = await invoiceService.getInvoiceById(id, tenantId);
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/invoices
   * Create new invoice (RECEIVED status)
   * Creates CVR actual record
   */
  router.post('/', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      const invoice = await invoiceService.createInvoice({
        tenantId,
        ...req.body,
        createdBy: userId,
      });

      res.status(201).json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /api/invoices/:id
   * Update invoice
   */
  router.patch('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);

      const invoice = await invoiceService.updateInvoice(id, tenantId, req.body);
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/invoices/:id/match
   * Match invoice to purchase order (RECEIVED → MATCHED)
   */
  router.post('/:id/match', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const id = Number(req.params.id);
      const { poId } = req.body;

      if (!poId) {
        return res.status(400).json({ error: 'poId is required' });
      }

      const invoice = await invoiceService.matchInvoiceToPO(id, poId, tenantId, userId);
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/invoices/:id/approve
   * Approve invoice (MATCHED → APPROVED)
   * Updates CVR actual status to CERTIFIED
   */
  router.post('/:id/approve', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const id = Number(req.params.id);

      const invoice = await invoiceService.approveInvoice(id, tenantId, userId);
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/invoices/:id/pay
   * Mark invoice as paid (APPROVED → PAID)
   * Updates CVR actual status to PAID
   */
  router.post('/:id/pay', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);
      const { paidAmount, paidDate, paymentRef } = req.body;

      if (!paidAmount) {
        return res.status(400).json({ error: 'paidAmount is required' });
      }

      const invoice = await invoiceService.markInvoicePaid(
        id,
        tenantId,
        paidAmount,
        paidDate ? new Date(paidDate) : undefined,
        paymentRef
      );
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/invoices/:id/dispute
   * Dispute invoice
   */
  router.post('/:id/dispute', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);
      const { disputeReason } = req.body;

      if (!disputeReason) {
        return res.status(400).json({ error: 'disputeReason is required' });
      }

      const invoice = await invoiceService.disputeInvoice(id, tenantId, disputeReason);
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/invoices/:id/cancel
   * Cancel invoice (reverses CVR actual)
   */
  router.post('/:id/cancel', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);
      const { cancelReason } = req.body;

      const invoice = await invoiceService.cancelInvoice(id, tenantId, cancelReason);
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  /**
   * DELETE /api/invoices/:id
   * Delete invoice (and CVR actual if exists)
   */
  router.delete('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);

      await invoiceService.deleteInvoice(id, tenantId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
