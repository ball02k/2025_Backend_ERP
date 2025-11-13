/**
 * Seed Budget Line Allocations for Demo Projects
 *
 * This script creates category allocations for existing budget lines,
 * splitting them across UK construction categories to demonstrate the
 * category CVR tracking feature.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Typical distribution patterns for different project types
const ALLOCATION_PATTERNS = {
  // Standard building project distribution
  standard: [
    { code: 'PREL', percent: 12 },  // Preliminaries
    { code: 'SUBS', percent: 15 },  // Substructure
    { code: 'SUPS', percent: 25 },  // Superstructure
    { code: 'INTW', percent: 10 },  // Internal Walls & Partitions
    { code: 'INTF', percent: 8 },   // Internal Finishes
    { code: 'FITT', percent: 5 },   // Fittings & Furniture
    { code: 'MECH', percent: 10 },  // Mechanical Services
    { code: 'ELEC', percent: 8 },   // Electrical Services
    { code: 'EXTW', percent: 5 },   // External Works
    { code: 'CONT', percent: 2 }    // Contingency
  ],

  // Infrastructure/civil engineering
  infrastructure: [
    { code: 'PREL', percent: 15 },
    { code: 'SUBS', percent: 30 },
    { code: 'SUPS', percent: 20 },
    { code: 'MECH', percent: 8 },
    { code: 'ELEC', percent: 10 },
    { code: 'EXTW', percent: 15 },
    { code: 'CONT', percent: 2 }
  ],

  // Fit-out/refurbishment
  fitout: [
    { code: 'PREL', percent: 8 },
    { code: 'INTW', percent: 20 },
    { code: 'INTF', percent: 25 },
    { code: 'FITT', percent: 15 },
    { code: 'MECH', percent: 12 },
    { code: 'ELEC', percent: 15 },
    { code: 'CONT', percent: 5 }
  ]
};

async function seedAllocations() {
  console.log('\n🌱 Seeding Budget Line Allocations for Demo Projects...\n');

  try {
    // Get all categories
    const categories = await prisma.allocationCategory.findMany({
      orderBy: { sortOrder: 'asc' }
    });

    if (categories.length === 0) {
      console.error('❌ No categories found. Run seed-categories.cjs first.');
      return;
    }

    const categoryMap = new Map(categories.map(cat => [cat.code, cat]));
    console.log(`✅ Found ${categories.length} categories\n`);

    // Get all tenants
    const uniqueTenants = await prisma.user.findMany({
      distinct: ['tenantId'],
      select: { tenantId: true }
    });

    for (const tenant of uniqueTenants) {
      console.log(`📊 Processing tenant: ${tenant.tenantId}`);

      // Get a user from this tenant
      const user = await prisma.user.findFirst({
        where: { tenantId: tenant.tenantId },
        select: { id: true }
      });

      if (!user) {
        console.log(`  ⚠️  No user found for tenant ${tenant.tenantId}, skipping\n`);
        continue;
      }

      // Get all projects for this tenant
      const projects = await prisma.project.findMany({
        where: { tenantId: tenant.tenantId },
        select: {
          id: true,
          name: true,
          type: true
        }
      });

      console.log(`  Found ${projects.length} project(s)\n`);

      for (const project of projects) {
        console.log(`  📁 Project: ${project.name} (ID: ${project.id})`);

        // Get budget lines for this project
        const budgetLines = await prisma.budgetLine.findMany({
          where: {
            projectId: project.id,
            tenantId: tenant.tenantId
          },
          select: {
            id: true,
            code: true,
            description: true,
            amount: true
          }
        });

        if (budgetLines.length === 0) {
          console.log(`    ⚠️  No budget lines found for this project\n`);
          continue;
        }

        console.log(`    Found ${budgetLines.length} budget line(s)`);

        // Determine allocation pattern based on project type or name
        let pattern = ALLOCATION_PATTERNS.standard;
        const projectName = project.name?.toLowerCase() || '';
        const projectType = project.type?.toLowerCase() || '';

        if (projectName.includes('infrastructure') || projectName.includes('civil') ||
            projectType.includes('infrastructure')) {
          pattern = ALLOCATION_PATTERNS.infrastructure;
        } else if (projectName.includes('fitout') || projectName.includes('refurb') ||
                   projectType.includes('fitout')) {
          pattern = ALLOCATION_PATTERNS.fitout;
        }

        let createdCount = 0;
        let skippedCount = 0;

        for (const budgetLine of budgetLines) {
          // Check if allocations already exist
          const existingAllocations = await prisma.budgetLineAllocation.findMany({
            where: {
              budgetLineId: budgetLine.id,
              tenantId: tenant.tenantId
            }
          });

          if (existingAllocations.length > 0) {
            console.log(`      ↷ Skipping ${budgetLine.code} - already has allocations`);
            skippedCount++;
            continue;
          }

          const budgetAmount = Number(budgetLine.amount);

          if (budgetAmount <= 0) {
            console.log(`      ↷ Skipping ${budgetLine.code} - zero or negative amount`);
            skippedCount++;
            continue;
          }

          // Create allocations based on pattern
          const allocations = [];
          let runningTotal = 0;

          for (let i = 0; i < pattern.length; i++) {
            const patternItem = pattern[i];
            const category = categoryMap.get(patternItem.code);

            if (!category) {
              console.log(`      ⚠️  Category ${patternItem.code} not found`);
              continue;
            }

            // Calculate amount, ensuring the last item gets the remainder to avoid rounding errors
            let amount;
            if (i === pattern.length - 1) {
              amount = budgetAmount - runningTotal;
            } else {
              amount = Math.round((budgetAmount * patternItem.percent / 100) * 100) / 100;
              runningTotal += amount;
            }

            if (amount > 0) {
              allocations.push({
                tenantId: tenant.tenantId,
                budgetLineId: budgetLine.id,
                categoryId: category.id,
                allocatedAmount: amount,
                currency: 'GBP',
                status: 'ACTIVE',
                notes: `Auto-allocated: ${patternItem.percent}% of budget`,
                createdBy: user.id.toString()
              });
            }
          }

          // Create allocations in transaction
          if (allocations.length > 0) {
            await prisma.$transaction(
              allocations.map(alloc =>
                prisma.budgetLineAllocation.create({ data: alloc })
              )
            );

            const totalAllocated = allocations.reduce((sum, a) => sum + Number(a.allocatedAmount), 0);
            const diff = Math.abs(budgetAmount - totalAllocated);

            console.log(`      ✅ ${budgetLine.code}: ${allocations.length} categories, ${budgetAmount.toFixed(2)} (diff: ${diff.toFixed(2)})`);
            createdCount++;
          }
        }

        console.log(`    📊 Summary: ${createdCount} budget lines allocated, ${skippedCount} skipped\n`);
      }
    }

    console.log('✨ Allocation seeding complete!\n');

    // Show summary statistics
    const totalAllocations = await prisma.budgetLineAllocation.count();
    const totalBudgetLines = await prisma.budgetLine.count();
    const linesWithAllocations = await prisma.budgetLine.count({
      where: {
        allocations: {
          some: {}
        }
      }
    });

    console.log('📈 Overall Statistics:');
    console.log(`   Total Budget Lines: ${totalBudgetLines}`);
    console.log(`   Lines with Allocations: ${linesWithAllocations}`);
    console.log(`   Total Allocations Created: ${totalAllocations}`);
    console.log(`   Coverage: ${totalBudgetLines > 0 ? ((linesWithAllocations / totalBudgetLines) * 100).toFixed(1) : 0}%\n`);

  } catch (error) {
    console.error('\n❌ Error seeding allocations:', error.message);
    console.error(error);
    throw error;
  }
}

// Main execution
async function main() {
  await seedAllocations();
}

main()
  .catch((e) => {
    console.error('❌ FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
