const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { requireAuth } = require('../lib/auth.cjs');

router.use(requireAuth);

const tenantIdOf = (req) => req.user && req.user.tenantId;

// ==========================================
// PACKAGE PRICING ROUTES
// ==========================================

// GET /api/packages/:packageId - Get package with line items
router.get('/:packageId', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const packageId = Number(req.params.packageId);

    const pkg = await prisma.package.findFirst({
      where: {
        id: packageId,
        // Verify tenant access via project
        project: {
          tenantId
        }
      },
      include: {
        lineItems: {
          orderBy: { displayOrder: 'asc' }
        },
        project: {
          select: { name: true }
        },
        _count: {
          select: { lineItems: true }
        }
      }
    });

    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }

    res.json(pkg);
  } catch (e) {
    console.error('[Package Pricing] GET package error:', e);
    next(e);
  }
});

// POST /api/packages/create - Create package with pricing mode
router.post('/create', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const userId = req.user?.id;
    const {
      projectId,
      tenderId,
      name,
      trade,
      pricingMode,
      breakdownMandatory,
      description,
      estimatedValue,
      budgetValue,
      lineItems
    } = req.body;

    console.log('[Package Pricing] Creating package:', { name, trade, pricingMode, lineItemCount: lineItems?.length || 0 });

    // Validation
    if (!name || !trade || !pricingMode) {
      return res.status(400).json({
        error: 'Missing required fields: name, trade, pricingMode'
      });
    }

    if (pricingMode === 'MEASURED' && (!lineItems || lineItems.length === 0)) {
      return res.status(400).json({
        error: 'MEASURED pricing mode requires at least one line item'
      });
    }

    // Verify project access
    const project = await prisma.project.findFirst({
      where: {
        id: Number(projectId),
        tenantId
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Create package with line items
    const pkg = await prisma.package.create({
      data: {
        projectId: Number(projectId),
        name,
        trade,
        pricingMode,
        breakdownMandatory: breakdownMandatory || false,
        scopeSummary: description || null,
        estimatedValue: estimatedValue ? parseFloat(estimatedValue) : null,
        budgetValue: budgetValue ? parseFloat(budgetValue) : null,
        status: 'Draft',
        createdBy: userId || null,

        // Create line items if provided
        ...(lineItems && lineItems.length > 0 && {
          lineItems: {
            create: lineItems.map((item, idx) => ({
              tenantId,
              itemNumber: item.itemNumber,
              section: item.section || null,
              description: item.description,
              specification: item.specification || null,
              qty: parseFloat(item.quantity || 0),
              quantity: parseFloat(item.quantity || 0),
              unit: item.unit,
              rate: item.estimatedRate ? parseFloat(item.estimatedRate) : 0,
              total: item.estimatedTotal ? parseFloat(item.estimatedTotal) : 0,
              estimatedRate: item.estimatedRate ? parseFloat(item.estimatedRate) : null,
              estimatedTotal: item.estimatedTotal ? parseFloat(item.estimatedTotal) : null,
              displayOrder: item.displayOrder !== undefined ? item.displayOrder : idx,
              isMandatory: item.isMandatory !== undefined ? item.isMandatory : true,
              allowAlternative: item.allowAlternative || false,
              referenceDrawing: item.referenceDrawing || null,
              referenceSpec: item.referenceSpec || null,
              createdBy: userId || null
            }))
          }
        })
      },
      include: {
        lineItems: {
          orderBy: { displayOrder: 'asc' }
        }
      }
    });

    console.log('[Package Pricing] Package created:', pkg.id);
    res.status(201).json(pkg);
  } catch (e) {
    console.error('[Package Pricing] POST create error:', e);
    next(e);
  }
});

// GET /api/packages - List packages for a tender
router.get('/', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const { tenderId, projectId } = req.query;

    let whereClause = {
      project: {
        tenantId
      }
    };

    if (projectId) {
      whereClause.projectId = Number(projectId);
    }

    const packages = await prisma.package.findMany({
      where: whereClause,
      include: {
        lineItems: {
          orderBy: { displayOrder: 'asc' }
        },
        _count: {
          select: { lineItems: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(packages);
  } catch (e) {
    console.error('[Package Pricing] GET packages error:', e);
    next(e);
  }
});

module.exports = router;
