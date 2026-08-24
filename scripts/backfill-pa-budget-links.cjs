/**
 * Backfill Budget Line Links for Payment Application Line Items
 *
 * This script links existing Payment Application line items to budget lines
 * based on matching descriptions or references. Run once to migrate historical data.
 *
 * Usage: node scripts/backfill-pa-budget-links.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillBudgetLinks() {
  console.log('=== CVR Phase A: Backfill Budget Line Links ===\n');

  const tenantId = 'demo'; // Change as needed
  const projectId = 37; // Change as needed

  console.log(`Processing Payment Applications for project ${projectId}...\n`);

  // Find all PA line items without budgetLineId
  const lineItemsWithoutLink = await prisma.paymentApplicationLineItem.findMany({
    where: {
      tenantId,
      budgetLineId: null,
      application: {
        projectId,
        status: { in: ['CERTIFIED', 'PAID', 'PART_PAID'] }
      }
    },
    include: {
      application: {
        select: {
          id: true,
          applicationNo: true,
          status: true
        }
      }
    }
  });

  console.log(`Found ${lineItemsWithoutLink.length} line items without budget line links\n`);

  if (lineItemsWithoutLink.length === 0) {
    console.log('✅ All line items already have budget line links!');
    await prisma.$disconnect();
    return;
  }

  // Get all budget lines for this project
  const budgetLines = await prisma.budgetLine.findMany({
    where: { tenantId, projectId },
    select: { id: true, code: true, description: true }
  });

  console.log(`Project has ${budgetLines.length} budget lines available\n`);

  let linked = 0;
  let skipped = 0;

  for (const lineItem of lineItemsWithoutLink) {
    // Try to match by reference/code
    let matchedBudgetLine = null;

    if (lineItem.reference) {
      matchedBudgetLine = budgetLines.find(
        bl => bl.code && bl.code.toLowerCase() === lineItem.reference.toLowerCase()
      );
    }

    // Try to match by description similarity
    if (!matchedBudgetLine && lineItem.description) {
      matchedBudgetLine = budgetLines.find(
        bl => bl.description &&
             lineItem.description.toLowerCase().includes(bl.description.toLowerCase().substring(0, 20))
      );
    }

    if (matchedBudgetLine) {
      await prisma.paymentApplicationLineItem.update({
        where: { id: lineItem.id },
        data: { budgetLineId: matchedBudgetLine.id }
      });

      console.log(`✓ Linked line item ${lineItem.id} (${lineItem.description?.substring(0, 40)}...) → Budget Line ${matchedBudgetLine.code}`);
      linked++;
    } else {
      console.log(`⚠ Could not find match for line item ${lineItem.id}: "${lineItem.description?.substring(0, 40)}..."`);
      skipped++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Linked: ${linked}`);
  console.log(`Skipped (no match): ${skipped}`);
  console.log(`Total processed: ${lineItemsWithoutLink.length}`);

  if (skipped > 0) {
    console.log('\n⚠️  Some line items could not be automatically linked.');
    console.log('You may need to manually set budgetLineId for these records.');
  }

  console.log('\n✅ Backfill complete! Run CVR refresh to update actuals.');

  await prisma.$disconnect();
}

backfillBudgetLinks()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
