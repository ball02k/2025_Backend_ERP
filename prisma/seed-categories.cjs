/**
 * Seed UK Standard Construction Categories
 *
 * Populates the AllocationCategory table with standard UK construction categories
 * based on industry best practices (similar to NRM, RICS classifications).
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const UK_STANDARD_CATEGORIES = [
  {
    code: 'PREL',
    name: 'Preliminaries',
    description: 'Site setup, welfare facilities, site management, temporary works, site facilities, project team costs',
    sortOrder: 1
  },
  {
    code: 'SUBS',
    name: 'Substructure',
    description: 'Foundations, basements, ground works, piling, retaining walls, ground beams, underpinning',
    sortOrder: 2
  },
  {
    code: 'SUPS',
    name: 'Superstructure',
    description: 'Frame, upper floors, roof structure, stairs, external walls, structural steelwork, concrete frame',
    sortOrder: 3
  },
  {
    code: 'INTW',
    name: 'Internal Walls & Partitions',
    description: 'Blockwork, stud walls, glazed partitions, doors, door furniture, screens, movable partitions',
    sortOrder: 4
  },
  {
    code: 'INTF',
    name: 'Internal Finishes',
    description: 'Plaster, decoration, floor finishes, wall finishes, suspended ceilings, wall tiling, floor tiling',
    sortOrder: 5
  },
  {
    code: 'FITT',
    name: 'Fittings & Furniture',
    description: 'Built-in furniture, fixtures, joinery, signage, blinds, curtain rails, kitchens, bathroom fittings',
    sortOrder: 6
  },
  {
    code: 'MECH',
    name: 'Mechanical Services',
    description: 'Heating, ventilation, air conditioning, plumbing, drainage, fire protection, sprinklers, BMS',
    sortOrder: 7
  },
  {
    code: 'ELEC',
    name: 'Electrical Services',
    description: 'Power distribution, lighting, data systems, fire alarms, security systems, access control, CCTV',
    sortOrder: 8
  },
  {
    code: 'EXTW',
    name: 'External Works',
    description: 'Landscaping, paving, external drainage, fencing, gates, site preparation, car parking, roads',
    sortOrder: 9
  },
  {
    code: 'CONT',
    name: 'Contingency',
    description: 'Risk allowance, provisional sums, design development reserve, unforeseen works allowance',
    sortOrder: 10
  }
];

async function seedCategories() {
  console.log('\n🌱 Seeding UK Standard Construction Categories...\n');

  try {
    // In this system, tenantId is just a string (default is "demo")
    // We'll seed for all unique tenantIds found in the User table
    const uniqueTenants = await prisma.user.findMany({
      distinct: ['tenantId'],
      select: { tenantId: true }
    });

    if (uniqueTenants.length === 0) {
      console.error('❌ No tenants found. Run main seed script first.');
      return;
    }

    console.log(`Found ${uniqueTenants.length} tenant(s) to seed categories for\n`);

    // Seed categories for each tenant
    for (const tenant of uniqueTenants) {
      console.log(`Seeding for tenant: ${tenant.tenantId}`);

      // Get a user from this tenant to use as createdBy
      const user = await prisma.user.findFirst({
        where: { tenantId: tenant.tenantId },
        select: { id: true }
      });

      if (!user) {
        console.log(`  ⚠️  No user found for tenant ${tenant.tenantId}, skipping`);
        continue;
      }

      let created = 0;
      let skipped = 0;

      for (const cat of UK_STANDARD_CATEGORIES) {
        const existing = await prisma.allocationCategory.findUnique({
          where: {
            tenantId_code: {
              tenantId: tenant.tenantId,
              code: cat.code
            }
          }
        });

        if (!existing) {
          await prisma.allocationCategory.create({
            data: {
              tenantId: tenant.tenantId,
              code: cat.code,
              name: cat.name,
              description: cat.description,
              sortOrder: cat.sortOrder,
              isActive: true,
              isDefault: true,
              createdBy: user.id.toString()
            }
          });
          created++;
          console.log(`  ✅ Created: ${cat.code} - ${cat.name}`);
        } else {
          skipped++;
        }
      }

      console.log(`  📊 Summary: ${created} created, ${skipped} skipped\n`);
    }

    console.log('✨ Category seeding complete!\n');

    // Show summary of all categories
    const allCategories = await prisma.allocationCategory.findMany({
      orderBy: { sortOrder: 'asc' }
    });

    console.log('📋 All Categories:');
    allCategories.forEach(cat => {
      console.log(`   ${cat.code} - ${cat.name} (${cat.isDefault ? 'System' : 'Custom'})`);
    });

  } catch (error) {
    console.error('\n❌ Error seeding categories:', error.message);
    throw error;
  }
}

// Main execution
async function main() {
  await seedCategories();
}

main()
  .catch((e) => {
    console.error('❌ FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
