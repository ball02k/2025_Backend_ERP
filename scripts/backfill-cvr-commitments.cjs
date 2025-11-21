/**
 * Backfill CVRCommitment records for existing signed contracts
 *
 * This script:
 * 1. Finds all signed contracts
 * 2. Checks if CVRCommitment records exist for them
 * 3. Creates missing CVRCommitment records with status='COMMITTED'
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillCVRCommitments() {
  console.log('🔍 Starting CVR Commitments backfill...\n');

  try {
    // Find all signed contracts
    const signedContracts = await prisma.contract.findMany({
      where: {
        status: 'signed',
        value: { gt: 0 },
      },
      select: {
        id: true,
        tenantId: true,
        projectId: true,
        contractRef: true,
        title: true,
        value: true,
        currency: true,
        signedDate: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' },
    });

    console.log(`📊 Found ${signedContracts.length} signed contracts\n`);

    if (signedContracts.length === 0) {
      console.log('✅ No signed contracts found. Nothing to backfill.');
      return;
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const contract of signedContracts) {
      try {
        // Check if CVRCommitment record already exists
        const existing = await prisma.cVRCommitment.findFirst({
          where: {
            sourceType: 'CONTRACT',
            sourceId: contract.id,
          },
        });

        if (existing) {
          // Check if status needs updating
          if (existing.status !== 'COMMITTED') {
            await prisma.cVRCommitment.update({
              where: { id: existing.id },
              data: { status: 'COMMITTED' },
            });
            console.log(`🔄 Updated status for CONTRACT-${contract.id} (${contract.contractRef}): ${existing.status} → COMMITTED`);
          } else {
            console.log(`⏭️  Skipped CONTRACT-${contract.id} (${contract.contractRef}): CVRCommitment already exists`);
          }
          skipped++;
          continue;
        }

        // Create CVRCommitment record
        const tenantId = contract.tenantId || 'demo';

        await prisma.cVRCommitment.create({
          data: {
            tenantId,
            projectId: contract.projectId,
            budgetLineId: null,
            allocationId: null,
            sourceType: 'CONTRACT',
            sourceId: contract.id,
            amount: Number(contract.value),
            currency: contract.currency || 'GBP',
            status: 'COMMITTED',
            description: `Backfilled from ${contract.contractRef || contract.title}`,
            reference: contract.contractRef,
            committedDate: contract.signedDate || contract.createdAt || new Date(),
          },
        });

        console.log(`✅ Created CVRCommitment for CONTRACT-${contract.id} (${contract.contractRef}): £${Number(contract.value).toFixed(2)}`);
        created++;
      } catch (err) {
        console.error(`❌ Error processing CONTRACT-${contract.id}:`, err.message);
        errors++;
      }
    }

    console.log('\n📈 Backfill Summary:');
    console.log(`   ✅ Created: ${created}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);

    console.log('\n🎉 Backfill complete!\n');
  } catch (error) {
    console.error('❌ Fatal error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the backfill
backfillCVRCommitments()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
