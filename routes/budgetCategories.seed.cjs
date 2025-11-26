const router = require('express').Router();
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');

const DEFAULT_CATEGORIES = [
  {
    code: 'PRELIM',
    name: 'Preliminaries',
    description: 'Site setup, welfare, management, and enabling works',
    color: '#8b5cf6',
    sortOrder: 1,
  },
  {
    code: 'SUBST',
    name: 'Substructure',
    description: 'Foundations, basements, and ground works',
    color: '#3b82f6',
    sortOrder: 2,
  },
  {
    code: 'SUPST',
    name: 'Superstructure',
    description: 'Frame, upper floors, roof, stairs, external walls',
    color: '#10b981',
    sortOrder: 3,
  },
  {
    code: 'INT-FIN',
    name: 'Internal Finishes',
    description: 'Wall, floor, and ceiling finishes',
    color: '#f59e0b',
    sortOrder: 4,
  },
  {
    code: 'FITTINGS',
    name: 'Fittings & Furnishings',
    description: 'Built-in furniture, fittings, and equipment',
    color: '#ec4899',
    sortOrder: 5,
  },
  {
    code: 'SERVICES',
    name: 'Building Services',
    description: 'Mechanical, electrical, plumbing, HVAC',
    color: '#ef4444',
    sortOrder: 6,
  },
  {
    code: 'EXTERNAL',
    name: 'External Works',
    description: 'Landscaping, drainage, external paving',
    color: '#14b8a6',
    sortOrder: 7,
  },
  {
    code: 'CONT',
    name: 'Contingency',
    description: 'Risk allowance and contingency funds',
    color: '#64748b',
    sortOrder: 8,
  },
];

/**
 * POST /api/budget-categories/seed
 * Seeds default budget categories for the authenticated user's tenant
 */
router.post('/budget-categories/seed', requireAuth, async (req, res) => {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(400).json({ error: 'TENANT_ID_REQUIRED' });
  }

  try {
    const created = [];
    const skipped = [];

    for (const category of DEFAULT_CATEGORIES) {
      try {
        const result = await prisma.budgetCategory.upsert({
          where: {
            tenantId_code: {
              tenantId,
              code: category.code,
            },
          },
          update: {
            name: category.name,
            description: category.description,
            color: category.color,
            sortOrder: category.sortOrder,
          },
          create: {
            tenantId,
            code: category.code,
            name: category.name,
            description: category.description,
            color: category.color,
            sortOrder: category.sortOrder,
            isActive: true,
            isDefault: true,
            createdBy: String(req.user?.id || 'system'),
          },
        });
        created.push(result);
      } catch (error) {
        console.error(`Failed to seed ${category.code}:`, error.message);
        skipped.push({ code: category.code, error: error.message });
      }
    }

    return res.status(200).json({
      success: true,
      tenantId,
      created: created.length,
      skipped: skipped.length,
      categories: created.map(c => ({
        id: c.id,
        code: c.code,
        name: c.name,
      })),
      errors: skipped,
    });
  } catch (error) {
    console.error('Seed budget categories error:', error);
    return res.status(500).json({ error: 'SEED_FAILED', message: error.message });
  }
});

module.exports = router;
