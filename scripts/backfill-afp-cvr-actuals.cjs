/**
 * Backfill CVR Actuals for existing certified Payment Applications
 *
 * This script creates CVRActual records for Payment Applications that were
 * certified before the CVR integration was added.
 *
 * Usage: node scripts/backfill-afp-cvr-actuals.cjs
 */

const { PrismaClient } = require('@prisma/client');
const { onPaymentApplicationCertified, onPaymentApplicationPaid } = require('../services/cvr.hooks.cjs');

const prisma = new PrismaClient();

const TENANT_ID = 'demo'; // Change to your tenant ID

async function backfillAfpCvrActuals() {
  console.log('\n=================================');
  console.log('BACKFILL AFP CVR ACTUALS');
  console.log('=================================\n');

  try {
    // Find all certified/paid AfPs
    const applications = await prisma.applicationForPayment.findMany({
      where: {
        tenantId: TENANT_ID,
        status: {
          in: ['CERTIFIED', 'PAYMENT_NOTICE_SENT', 'PAY_LESS_ISSUED', 'AWAITING_PAYMENT', 'PAID'],
        },
      },
      orderBy: { applicationDate: 'asc' },
    });

    console.log(`Found ${applications.length} certified/paid payment applications\n`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const application of applications) {
      // Check if CVRActual already exists
      const existing = await prisma.cVRActual.findFirst({
        where: {
          tenantId: TENANT_ID,
          sourceType: 'PAYMENT_APPLICATION',
          sourceId: application.id,
        },
      });

      if (existing) {
        console.log(`⏭️  AfP ${application.applicationNo}: CVRActual already exists (${existing.status})`);

        // Update to PAID if application is paid but CVRActual is not
        if (application.status === 'PAID' && existing.status !== 'PAID') {
          await onPaymentApplicationPaid(application, TENANT_ID);
          console.log(`   ✅ Updated CVRActual to PAID`);
          updated++;
        } else {
          skipped++;
        }
      } else {
        // Create CVRActual
        const amount = application.certifiedThisPeriod || application.claimedThisPeriod;

        if (!amount || Number(amount) === 0) {
          console.log(`⏭️  AfP ${application.applicationNo}: No amount to record`);
          skipped++;
          continue;
        }

        await onPaymentApplicationCertified(application, TENANT_ID, null);
        console.log(`✅ AfP ${application.applicationNo}: Created CVRActual for £${Number(amount).toLocaleString('en-GB')}`);

        // If already paid, update status
        if (application.status === 'PAID') {
          await onPaymentApplicationPaid(application, TENANT_ID);
          console.log(`   ✅ Updated CVRActual to PAID`);
        }

        created++;
      }
    }

    console.log('\n=================================');
    console.log('BACKFILL COMPLETE');
    console.log('=================================');
    console.log(`✅ Created: ${created}`);
    console.log(`🔄 Updated: ${updated}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`📊 Total processed: ${applications.length}\n`);

  } catch (error) {
    console.error('\n❌ BACKFILL FAILED:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the backfill
backfillAfpCvrActuals();
