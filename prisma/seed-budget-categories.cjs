#!/usr/bin/env node
/**
 * Seed default budget categories for all tenants
 * Run with: node prisma/seed-budget-categories.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  {
    id: 'cat-prelim',
    code: 'PRELIM',
    name: 'Preliminaries',
    description: 'Site setup, welfare, management, and enabling works',
    color: '#8b5cf6',
    sortOrder: 1,
  },
  {
    id: 'cat-subst',
    code: 'SUBST',
    name: 'Substructure',
    description: 'Foundations, basements, and ground works',
    color: '#3b82f6',
    sortOrder: 2,
  },
  {
    id: 'cat-supst',
    code: 'SUPST',
    name: 'Superstructure',
    description: 'Frame, upper floors, roof, stairs, external walls',
    color: '#10b981',
    sortOrder: 3,
  },
  {
    id: 'cat-int-fin',
    code: 'INT-FIN',
    name: 'Internal Finishes',
    description: 'Wall, floor, and ceiling finishes',
    color: '#f59e0b',
    sortOrder: 4,
  },
  {
    id: 'cat-fittings',
    code: 'FITTINGS',
    name: 'Fittings & Furnishings',
    description: 'Built-in furniture, fittings, and equipment',
    color: '#ec4899',
    sortOrder: 5,
  },
  {
    id: 'cat-services',
    code: 'SERVICES',
    name: 'Building Services',
    description: 'Mechanical, electrical, plumbing, HVAC',
    color: '#ef4444',
    sortOrder: 6,
  },
  {
    id: 'cat-external',
    code: 'EXTERNAL',
    name: 'External Works',
    description: 'Landscaping, drainage, external paving',
    color: '#14b8a6',
    sortOrder: 7,
  },
  {
    id: 'cat-cont',
    code: 'CONT',
    name: 'Contingency',
    description: 'Risk allowance and contingency funds',
    color: '#64748b',
    sortOrder: 8,
  },
];

async function seedBudgetCategories() {
  console.log('🌱 Seeding budget categories...');

  try {
    // Get all unique tenants
    const tenants = await prisma.project.findMany({
      select: { tenantId: true },
      distinct: ['tenantId'],
    });

    if (tenants.length === 0) {
      console.log('⚠️  No tenants found. Seeding for demo tenant only.');
      const demoTenant = 'demo';
      await seedForTenant(demoTenant);
    } else {
      console.log(`Found ${tenants.length} tenant(s)`);
      for (const { tenantId } of tenants) {
        if (tenantId) {
          await seedForTenant(tenantId);
        }
      }
    }

    console.log('✅ Budget categories seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding budget categories:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function seedForTenant(tenantId) {
  console.log(`   Seeding categories for tenant: ${tenantId}`);

  for (const category of DEFAULT_CATEGORIES) {
    try {
      await prisma.budgetCategory.upsert({
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
          id: `${category.id}-${tenantId}`,
          tenantId,
          code: category.code,
          name: category.name,
          description: category.description,
          color: category.color,
          sortOrder: category.sortOrder,
          isActive: true,
          isDefault: true,
          createdBy: 'system',
        },
      });
      console.log(`      ✓ ${category.code} - ${category.name}`);
    } catch (error) {
      console.log(`      ✗ Failed to seed ${category.code}: ${error.message}`);
    }
  }
}

// Run the seeder
if (require.main === module) {
  seedBudgetCategories()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { seedBudgetCategories, DEFAULT_CATEGORIES };
