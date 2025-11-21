/**
 * Invoice-PO Matching Routes
 *
 * Three-way matching: Invoice <-> PO <-> Goods Receipt
 */

const router = require('express').Router();
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');
const cvrService = require('../services/cvr.cjs');

/**
 * POST /invoices/:id/match-po
 * Perform three-way matching of invoice to PO
 */
router.post('/invoices/:id/match-po', requireAuth, async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { purchaseOrderId, tolerance = 0.02 } = req.body; // 2% default tolerance

    if (!tenantId || !Number.isFinite(invoiceId)) {
      return res.status(400).json({ error: 'BAD_REQUEST' });
    }

    // Fetch invoice
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'INVOICE_NOT_FOUND' });
    }

    // Fetch PO
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id: Number(purchaseOrderId), tenantId },
      include: {
        lines: true,
      },
    });

    if (!purchaseOrder) {
      return res.status(404).json({ error: 'PO_NOT_FOUND' });
    }

    // Perform matching
    const invoiceAmount = Number(invoice.gross || invoice.net || 0);
    const poAmount = Number(purchaseOrder.total || 0);
    const amountDifference = Math.abs(invoiceAmount - poAmount);
    const percentageDifference = poAmount > 0 ? amountDifference / poAmount : 1;

    const matchResult = {
      invoice: {
        id: invoice.id,
        number: invoice.number,
        amount: invoiceAmount,
        supplierId: invoice.supplierId,
      },
      purchaseOrder: {
        id: purchaseOrder.id,
        code: purchaseOrder.code,
        amount: poAmount,
        supplierId: purchaseOrder.supplierId,
      },
      matching: {
        supplierMatch: invoice.supplierId === purchaseOrder.supplierId,
        amountMatch: amountDifference === 0,
        withinTolerance: percentageDifference <= tolerance,
        percentageDifference: (percentageDifference * 100).toFixed(2) + '%',
      },
    };

    // Overall match status
    const isMatched = matchResult.matching.supplierMatch &&
      (matchResult.matching.amountMatch || matchResult.matching.withinTolerance);

    matchResult.overallStatus = isMatched ? 'MATCHED' : 'EXCEPTION';

    if (isMatched) {
      // Update invoice with PO link
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          purchaseOrderId: purchaseOrder.id,
          status: 'Matched',
        },
      });

      // Create CVR actual if budget line exists
      if (purchaseOrder.budgetLineId) {
        try {
          await cvrService.createActual({
            tenantId,
            projectId: invoice.projectId,
            budgetLineId: purchaseOrder.budgetLineId,
            sourceType: 'INVOICE',
            sourceId: invoiceId,
            amount: invoiceAmount,
            description: `Invoice ${invoice.number} matched to PO ${purchaseOrder.code}`,
            reference: invoice.number,
            incurredDate: invoice.issueDate || new Date(),
            createdBy: userId,
          });
        } catch (cvrError) {
          console.error('Error creating CVR actual:', cvrError);
        }
      }

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId,
          entity: 'InvoiceMatching',
          entityId: String(invoiceId),
          action: 'matched',
          changes: {
            invoiceId,
            purchaseOrderId: purchaseOrder.id,
            status: 'MATCHED',
          },
        },
      });
    } else {
      // Log exception
      await prisma.auditLog.create({
        data: {
          userId,
          entity: 'InvoiceMatching',
          entityId: String(invoiceId),
          action: 'exception',
          changes: {
            invoiceId,
            purchaseOrderId: purchaseOrder.id,
            status: 'EXCEPTION',
            reason: !matchResult.matching.supplierMatch
              ? 'SUPPLIER_MISMATCH'
              : 'AMOUNT_VARIANCE',
          },
        },
      });
    }

    return res.json(matchResult);
  } catch (error) {
    console.error('Invoice matching error:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /invoices/:id/match-suggestions
 * Get suggested POs for matching
 */
router.get('/invoices/:id/match-suggestions', requireAuth, async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);
    const tenantId = req.user?.tenantId;

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'INVOICE_NOT_FOUND' });
    }

    // Find matching POs by supplier and project
    const suggestions = await prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        projectId: invoice.projectId,
        supplierId: invoice.supplierId,
        status: { in: ['APPROVED', 'ISSUED'] },
      },
      select: {
        id: true,
        code: true,
        total: true,
        status: true,
        supplier: true,
        orderDate: true,
        contract: { select: { id: true, contractRef: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Calculate match scores
    const invoiceAmount = Number(invoice.gross || invoice.net || 0);
    const scoredSuggestions = suggestions.map(po => {
      const poAmount = Number(po.total || 0);
      const amountDiff = Math.abs(invoiceAmount - poAmount);
      const matchScore = poAmount > 0 ? Math.max(0, 100 - (amountDiff / poAmount) * 100) : 0;

      return {
        ...po,
        matchScore: Math.round(matchScore),
        amountDifference: amountDiff,
      };
    }).sort((a, b) => b.matchScore - a.matchScore);

    return res.json({ suggestions: scoredSuggestions });
  } catch (error) {
    console.error('Match suggestions error:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /matching/exceptions
 * List all matching exceptions pending review
 */
router.get('/matching/exceptions', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { projectId, limit = 50, offset = 0 } = req.query;

    const where = {
      tenantId,
      status: { in: ['Open', 'Exception'] },
      purchaseOrderId: null, // Not yet matched
    };

    if (projectId) {
      where.projectId = Number(projectId);
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          project: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.invoice.count({ where }),
    ]);

    return res.json({ invoices, total });
  } catch (error) {
    console.error('Matching exceptions error:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /contracts/:id/calloff
 * Generate call-off PO from framework contract
 */
router.post('/contracts/:id/calloff', requireAuth, async (req, res) => {
  try {
    const contractId = Number(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { amount, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'AMOUNT_REQUIRED' });
    }

    const poGeneration = require('../services/poGeneration.cjs');
    const result = await poGeneration.generateCallOffPO({
      contractId,
      amount: Number(amount),
      description,
      userId,
      tenantId,
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error('Call-off generation error:', error);
    return res.status(400).json({ error: error.message || 'CALLOFF_ERROR' });
  }
});

/**
 * GET /contracts/:id/calloff-status
 * Get call-off framework status
 */
router.get('/contracts/:id/calloff-status', requireAuth, async (req, res) => {
  try {
    const contractId = Number(req.params.id);
    const tenantId = req.user?.tenantId;

    const poGeneration = require('../services/poGeneration.cjs');
    const status = await poGeneration.getCallOffStatus(contractId, tenantId);

    return res.json(status);
  } catch (error) {
    console.error('Call-off status error:', error);
    return res.status(400).json({ error: error.message || 'STATUS_ERROR' });
  }
});

module.exports = router;
