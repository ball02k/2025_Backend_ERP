/**
 * Seed Budget Categories for All Tenants
 *
 * This script creates UK standard construction categories
 * for all existing tenants in the system.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const UK_BUDGET_CATEGORIES = [
  { code: 'PREL', name: 'Preliminaries', description: 'Site setup, welfare, management, temporary works', color: '#64748b', sortOrder: 1 },
  { code: 'SUBS', name: 'Substructure', description: 'Foundations, basements, ground works, piling', color: '#92400e', sortOrder: 2 },
  { code: 'SUPS', name: 'Superstructure', description: 'Frame, upper floors, roof structure, stairs', color: '#ea580c', sortOrder: 3 },
  { code: 'INTW', name: 'Internal Walls & Partitions', description: 'Blockwork, stud walls, glazed partitions', color: '#d97706', sortOrder: 4 },
  { code: 'INTF', name: 'Internal Finishes', description: 'Plaster, decoration, floor finishes, wall finishes', color: '#65a30d', sortOrder: 5 },
  { code: 'FITT', name: 'Fittings & Furniture', description: 'Built-in furniture, fixtures, joinery, signage', color: '#0891b2', sortOrder: 6 },
  { code: 'MECH', name: 'Mechanical Services', description: 'Heating, ventilation, plumbing, drainage', color: '#7c3aed', sortOrder: 7 },
  { code: 'ELEC', name: 'Electrical Services', description: 'Power distribution, lighting, data, fire alarms', color: '#c026d3', sortOrder: 8 },
  { code: 'EXTW', name: 'External Works', description: 'Landscaping, paving, external drainage, fencing', color: '#059669', sortOrder: 9 },
  { code: 'CONT', name: 'Contingency', description: 'Risk allowance, provisional sums', color: '#dc2626', sortOrder: 10 }
];

async function seedBudgetCategories() {
  console.log('\n🌱 Seeding UK budget categories for all tenants...\n');

  try {
    // Get all unique tenants from users table
    const tenants = await prisma.user.findMany({
      distinct: ['tenantId'],
      select: {
        tenantId: true,
        id: true
      }
    });

    if (tenants.length === 0) {
      console.error('❌ No tenants found');
      return;
    }

    console.log(`Found ${tenants.length} tenant(s)\n`);

    for (const tenant of tenants) {
      console.log(`📊 Processing tenant: ${tenant.tenantId}`);

      let created = 0;
      let skipped = 0;

      for (const cat of UK_BUDGET_CATEGORIES) {
        const existing = await prisma.budgetCategory.findUnique({
          where: {
            tenantId_code: {
              tenantId: tenant.tenantId,
              code: cat.code
            }
          }
        });

        if (!existing) {
          await prisma.budgetCategory.create({
            data: {
              tenantId: tenant.tenantId,
              code: cat.code,
              name: cat.name,
              description: cat.description,
              color: cat.color,
              sortOrder: cat.sortOrder,
              isActive: true,
              isDefault: true,
              createdBy: tenant.id.toString()
            }
          });
          created++;
          console.log(`  ✅ Created: ${cat.code} - ${cat.name}`);
        } else {
          skipped++;
          console.log(`  ↷ Skipped: ${cat.code} - ${cat.name} (already exists)`);
        }
      }

      console.log(`  📊 Summary: ${created} created, ${skipped} skipped\n`);
    }

    // Show final statistics
    const totalCategories = await prisma.budgetCategory.count();
    console.log('✨ Done!');
    console.log(`\n📈 Total budget categories in system: ${totalCategories}`);
    console.log(`   Tenants processed: ${tenants.length}`);
    console.log(`   Expected total: ${tenants.length * UK_BUDGET_CATEGORIES.length}\n`);

  } catch (error) {
    console.error('\n❌ Error seeding budget categories:', error.message);
    console.error(error);
    throw error;
  }
}

// Main execution
async function main() {
  await seedBudgetCategories();
}

main()
  .catch((e) => {
    console.error('❌ FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
