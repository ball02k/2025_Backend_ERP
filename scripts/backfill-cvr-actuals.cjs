/**
 * Backfill CVRActual records for existing PAID payment applications
 *
 * This script:
 * 1. Finds all PAID payment applications
 * 2. Checks if CVRActual records exist for them
 * 3. Creates missing CVRActual records with status='PAID'
 * 4. Recalculates Package.actualCost from all PAID applications
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillCVRActuals() {
  console.log('🔍 Starting CVR Actuals backfill...\n');

  try {
    // Find all PAID payment applications
    const paidApplications = await prisma.applicationForPayment.findMany({
      where: {
        status: 'PAID',
        amountPaid: { gt: 0 },
      },
      include: {
        contract: {
          select: { id: true, packageId: true, projectId: true },
        },
      },
      orderBy: { id: 'asc' },
    });

    console.log(`📊 Found ${paidApplications.length} PAID payment applications\n`);

    if (paidApplications.length === 0) {
      console.log('✅ No PAID applications found. Nothing to backfill.');
      return;
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const app of paidApplications) {
      try {
        // Check if CVRActual record already exists
        const existing = await prisma.cVRActual.findFirst({
          where: {
            sourceType: 'PAYMENT_APPLICATION',
            sourceId: app.id,
          },
        });

        if (existing) {
          // Check if status needs updating
          if (existing.status !== 'PAID') {
            await prisma.cVRActual.update({
              where: { id: existing.id },
              data: { status: 'PAID' },
            });
            console.log(`🔄 Updated status for APP-${app.id} (${app.applicationNo}): ${existing.status} → PAID`);
          } else {
            console.log(`⏭️  Skipped APP-${app.id} (${app.applicationNo}): CVRActual already exists`);
          }
          skipped++;
          continue;
        }

        // Create CVRActual record
        const tenantId = app.tenantId || 'demo';
        const projectId = app.contract?.projectId || app.projectId;

        if (!projectId) {
          console.log(`⚠️  Skipped APP-${app.id} (${app.applicationNo}): No project linked`);
          skipped++;
          continue;
        }

        await prisma.cVRActual.create({
          data: {
            tenantId,
            projectId,
            budgetLineId: null,
            allocationId: null,
            sourceType: 'PAYMENT_APPLICATION',
            sourceId: app.id,
            amount: Number(app.amountPaid),
            currency: 'GBP',
            status: 'PAID',
            description: `Backfilled from ${app.applicationNo}`,
            reference: app.applicationNo,
            incurredDate: app.paidDate || app.valuationDate || new Date(),
            paidDate: app.paidDate || new Date(),
          },
        });

        console.log(`✅ Created CVRActual for APP-${app.id} (${app.applicationNo}): £${Number(app.amountPaid).toFixed(2)}`);
        created++;
      } catch (err) {
        console.error(`❌ Error processing APP-${app.id}:`, err.message);
        errors++;
      }
    }

    console.log('\n📈 Backfill Summary:');
    console.log(`   ✅ Created: ${created}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);

    // Recalculate Package.actualCost for all packages
    console.log('\n🔄 Recalculating Package actualCost...');
    const packages = await prisma.package.findMany({
      select: { id: true, name: true },
    });

    let packagesUpdated = 0;
    for (const pkg of packages) {
      try {
        // Get all PAID applications for this package
        const paidApps = await prisma.applicationForPayment.findMany({
          where: {
            status: 'PAID',
            contract: {
              packageId: pkg.id,
            },
          },
          select: { amountPaid: true },
        });

        const totalActual = paidApps.reduce((sum, app) => sum + Number(app.amountPaid || 0), 0);

        await prisma.package.update({
          where: { id: pkg.id },
          data: { actualCost: totalActual },
        });

        console.log(`✅ Updated ${pkg.name || `PKG-${pkg.id}`}: actualCost = £${totalActual.toFixed(2)} (${paidApps.length} payments)`);
        packagesUpdated++;
      } catch (err) {
        console.error(`❌ Error updating package ${pkg.id}:`, err.message);
      }
    }

    console.log(`\n✅ Updated ${packagesUpdated} packages\n`);
    console.log('🎉 Backfill complete!\n');
  } catch (error) {
    console.error('❌ Fatal error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the backfill
backfillCVRActuals()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
