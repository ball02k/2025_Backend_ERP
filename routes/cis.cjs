const express = require('express');
const router = express.Router();
const { calculateCIS, getCISRate, getLabourSplit } = require('../services/cisCalculator.cjs');
const requireAuth = require('../middleware/requireAuth.cjs') || {
  requireAuth: (_req, _res, next) => next(),
};

/**
 * POST /api/cis/calculate
 *
 * Calculate CIS deduction for a payment
 *
 * Request body:
 * {
 *   grossAmount: number,    // Total payment amount
 *   supplierId: number,     // Supplier ID
 *   contractId?: number     // Optional contract ID for labour split override
 * }
 *
 * Response:
 * {
 *   grossAmount: number,
 *   labourPercentage: number,
 *   labourElement: number,
 *   materialsElement: number,
 *   cisStatus: string,
 *   cisRate: number,
 *   cisDeduction: number,
 *   netPayment: number,
 *   warnings: string[]
 * }
 */
router.post('/calculate', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    const { grossAmount, supplierId, contractId } = req.body || {};

    // Validate required fields
    if (!tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (grossAmount == null) {
      return res.status(400).json({ error: 'grossAmount is required' });
    }

    if (!supplierId) {
      return res.status(400).json({ error: 'supplierId is required' });
    }

    // Calculate CIS
    const result = await calculateCIS({
      grossAmount: Number(grossAmount),
      supplierId: Number(supplierId),
      contractId: contractId ? Number(contractId) : null,
      tenantId,
    });

    res.json(result);
  } catch (err) {
    console.error('CIS calculation error:', err);
    next(err);
  }
});

/**
 * GET /api/cis/rates
 *
 * Get available CIS rates for reference
 *
 * Response:
 * {
 *   GROSS: 0,
 *   NET: 20,
 *   UNVERIFIED: 30
 * }
 */
router.get('/rates', (req, res) => {
  res.json({
    GROSS: getCISRate('GROSS'),
    NET: getCISRate('NET'),
    UNVERIFIED: getCISRate('UNVERIFIED'),
    NOT_APPLICABLE: 0,
  });
});

/**
 * GET /api/cis/labour-split/:supplierId
 *
 * Get effective labour split for a supplier (optionally with contract override)
 *
 * Query params:
 * - contractId?: number
 *
 * Response:
 * {
 *   supplierId: number,
 *   contractId: number | null,
 *   labourPercentage: number,
 *   source: 'contract' | 'supplier' | 'default'
 * }
 */
router.get('/labour-split/:supplierId', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    const supplierId = Number(req.params.supplierId);
    const contractId = req.query.contractId ? Number(req.query.contractId) : null;

    if (!tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!Number.isFinite(supplierId)) {
      return res.status(400).json({ error: 'Invalid supplierId' });
    }

    const labourPercentage = await getLabourSplit(supplierId, contractId, tenantId);

    // Determine source
    let source = 'default';
    if (contractId) {
      const { prisma } = require('../utils/prisma.cjs');
      const contract = await prisma.contract.findFirst({
        where: { id: contractId, tenantId, supplierId },
        select: { labourPercentage: true },
      });
      if (contract && contract.labourPercentage != null) {
        source = 'contract';
      } else {
        const supplier = await prisma.supplier.findFirst({
          where: { id: supplierId, tenantId },
          select: { defaultLabourPercentage: true },
        });
        if (supplier && supplier.defaultLabourPercentage != null) {
          source = 'supplier';
        }
      }
    } else {
      const { prisma } = require('../utils/prisma.cjs');
      const supplier = await prisma.supplier.findFirst({
        where: { id: supplierId, tenantId },
        select: { defaultLabourPercentage: true },
      });
      if (supplier && supplier.defaultLabourPercentage != null) {
        source = 'supplier';
      }
    }

    res.json({
      supplierId,
      contractId,
      labourPercentage,
      source,
    });
  } catch (err) {
    console.error('Labour split lookup error:', err);
    next(err);
  }
});

module.exports = router;
