/**
 * BACKFILL SCRIPT: CVR Entries from Payment Applications
 *
 * This script creates CVRActual entries for payment applications that were
 * certified or paid before the CVR integration was implemented.
 *
 * Run: node scripts/backfill-cvr-from-payments.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillCVR() {
  console.log('=== CVR BACKFILL SCRIPT ===\n');

  try {
    // Get all certified/paid payment applications
    const applications = await prisma.applicationForPayment.findMany({
      where: {
        status: { in: ['CERTIFIED', 'PAYMENT_NOTICE_SENT', 'APPROVED', 'PAID', 'PARTIALLY_PAID'] },
        certifiedNetValue: { gt: 0 }
      },
      include: {
        contract: true,
        project: true
      }
    });

    console.log(`Found ${applications.length} certified/paid applications to process\n`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const app of applications) {
      const appRef = app.reference || app.applicationNo || `PA-${app.id}`;

      try {
        // Check if CVR entry already exists for this payment application
        const existing = await prisma.cVRActual.findFirst({
          where: {
            sourceType: 'PAYMENT_APPLICATION',
            sourceId: app.id
          }
        });

        if (existing) {
          console.log(`⏭️  SKIP: ${appRef} - CVR entry already exists (ID: ${existing.id})`);
          skipped++;
          continue;
        }

        // Check if application has required fields
        if (!app.projectId) {
          console.log(`⚠️  SKIP: ${appRef} - No projectId`);
          skipped++;
          continue;
        }

        if (!app.budgetLineId) {
          console.log(`⚠️  SKIP: ${appRef} - No budgetLineId (cannot allocate to budget)`);
          skipped++;
          continue;
        }

        // Create CVR Actual entry
        const certifiedAmount = parseFloat(app.certifiedNetValue || 0);
        const status = app.status === 'PAID' || app.status === 'PARTIALLY_PAID' ? 'PAID' : 'CERTIFIED';

        await prisma.cVRActual.create({
          data: {
            tenantId: app.tenantId,
            projectId: app.projectId,
            budgetLineId: app.budgetLineId,
            description: `Certified - ${appRef}`,
            amount: certifiedAmount,
            sourceType: 'PAYMENT_APPLICATION',
            sourceId: app.id,
            status: status,
            incurredDate: app.certifiedDate || app.createdAt,
            certifiedDate: app.certifiedDate || app.createdAt,
            paidDate: app.status === 'PAID' ? app.updatedAt : null,
          }
        });

        console.log(`✅ CREATE: ${appRef} - £${certifiedAmount.toFixed(2)} (status: ${status}, budgetLineId: ${app.budgetLineId})`);
        created++;

      } catch (err) {
        console.error(`❌ ERROR: ${appRef} - ${err.message}`);
        errors++;
      }
    }

    console.log('\n=== BACKFILL SUMMARY ===');
    console.log(`Total Applications: ${applications.length}`);
    console.log(`✅ Created: ${created}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log('\nBackfill complete!\n');

  } catch (error) {
    console.error('Fatal error during backfill:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the backfill
backfillCVR()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
