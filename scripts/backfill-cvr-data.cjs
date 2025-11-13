/**
 * Backfill CVR Data from Existing Contracts and Invoices
 *
 * This script populates cvr_commitments and cvr_actuals tables with:
 * - Existing signed/active contracts → CVRCommitment
 * - Existing approved variations → CVRCommitment
 * - Existing invoices → CVRActual
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillContracts(tenantId, projectId) {
  console.log(`\n=== Backfilling Contracts for Project ${projectId} ===`);

  // Get all signed/active contracts
  const contracts = await prisma.contract.findMany({
    where: {
      tenantId,
      projectId,
      status: {
        in: ['signed', 'active']
      }
    }
  });

  console.log(`Found ${contracts.length} signed/active contracts`);

  let created = 0;
  for (const contract of contracts) {
    // Check if commitment already exists
    const existing = await prisma.cVRCommitment.findFirst({
      where: {
        tenantId,
        sourceType: 'CONTRACT',
        sourceId: contract.id
      }
    });

    if (existing) {
      console.log(`  ⏭️  Contract ${contract.contractRef} already has CVR commitment`);
      continue;
    }

    // Create commitment
    await prisma.cVRCommitment.create({
      data: {
        tenantId,
        projectId,
        budgetLineId: contract.packageId, // Assuming packageId maps to budgetLineId
        sourceType: 'CONTRACT',
        sourceId: contract.id,
        amount: contract.value,
        currency: contract.currency || 'GBP',
        status: 'COMMITTED',
        description: contract.title,
        reference: contract.contractRef,
        commitmentDate: contract.signedAt || contract.createdAt,
        effectiveDate: contract.startDate || contract.signedAt,
        createdBy: contract.managedByUserId || null
      }
    });

    created++;
    console.log(`  ✅ Created commitment for Contract ${contract.contractRef}: £${contract.value}`);
  }

  console.log(`✅ Created ${created} contract commitments`);
  return created;
}

async function backfillVariations(tenantId, projectId) {
  console.log(`\n=== Backfilling Variations for Project ${projectId} ===`);

  // Get all approved variations
  const variations = await prisma.variation.findMany({
    where: {
      tenantId,
      projectId,
      status: 'approved'
    }
  });

  console.log(`Found ${variations.length} approved variations`);

  let created = 0;
  for (const variation of variations) {
    // Check if commitment already exists
    const existing = await prisma.cVRCommitment.findFirst({
      where: {
        tenantId,
        sourceType: 'VARIATION',
        sourceId: variation.id
      }
    });

    if (existing) {
      console.log(`  ⏭️  Variation ${variation.variationNumber} already has CVR commitment`);
      continue;
    }

    // Use approved value if available, otherwise estimated value
    const amount = variation.approvedValue || variation.estimatedValue || variation.amount;

    // Create commitment
    await prisma.cVRCommitment.create({
      data: {
        tenantId,
        projectId,
        budgetLineId: variation.budgetLineId,
        sourceType: 'VARIATION',
        sourceId: variation.id,
        amount,
        currency: 'GBP',
        status: 'COMMITTED',
        description: variation.title,
        reference: variation.variationNumber || variation.reference,
        costCode: variation.reference,
        commitmentDate: variation.approvedDate || variation.createdAt,
        effectiveDate: variation.approvedDate,
        createdBy: variation.createdBy || null
      }
    });

    created++;
    console.log(`  ✅ Created commitment for Variation ${variation.variationNumber}: £${amount}`);
  }

  console.log(`✅ Created ${created} variation commitments`);
  return created;
}

async function backfillInvoices(tenantId, projectId) {
  console.log(`\n=== Backfilling Invoices for Project ${projectId} ===`);

  // Get all invoices for this project
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      projectId
    }
  });

  console.log(`Found ${invoices.length} invoices`);

  let created = 0;
  for (const invoice of invoices) {
    // Check if actual already exists
    const existing = await prisma.cVRActual.findFirst({
      where: {
        tenantId,
        sourceType: 'INVOICE',
        sourceId: invoice.id
      }
    });

    if (existing) {
      console.log(`  ⏭️  Invoice ${invoice.number} already has CVR actual`);
      continue;
    }

    // Determine status based on invoice status
    let cvrStatus = 'RECORDED';
    let certifiedDate = null;
    let paidDate = null;

    if (invoice.status === 'paid') {
      cvrStatus = 'PAID';
      paidDate = invoice.paidDate || invoice.updatedAt;
      certifiedDate = invoice.approvedDate || invoice.updatedAt;
    } else if (invoice.status === 'approved') {
      cvrStatus = 'CERTIFIED';
      certifiedDate = invoice.approvedDate || invoice.updatedAt;
    }

    // Create actual
    await prisma.cVRActual.create({
      data: {
        tenantId,
        projectId,
        budgetLineId: invoice.budgetLineId,
        sourceType: 'INVOICE',
        sourceId: invoice.id,
        amount: invoice.net || invoice.gross,
        currency: invoice.currency || 'GBP',
        status: cvrStatus,
        description: invoice.description || `Invoice ${invoice.number}`,
        reference: invoice.number,
        incurredDate: invoice.receivedDate || invoice.createdAt,
        certifiedDate,
        paidDate,
        createdBy: invoice.createdBy || null
      }
    });

    created++;
    console.log(`  ✅ Created actual for Invoice ${invoice.number}: £${invoice.net || invoice.gross} (${cvrStatus})`);
  }

  console.log(`✅ Created ${created} invoice actuals`);
  return created;
}

async function backfillProject(tenantId, projectId) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`BACKFILLING CVR DATA FOR PROJECT ${projectId}`);
  console.log(`${'='.repeat(60)}`);

  const stats = {
    contracts: 0,
    variations: 0,
    invoices: 0
  };

  try {
    stats.contracts = await backfillContracts(tenantId, projectId);
    stats.variations = await backfillVariations(tenantId, projectId);
    stats.invoices = await backfillInvoices(tenantId, projectId);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`BACKFILL COMPLETE!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`✅ ${stats.contracts} contract commitments created`);
    console.log(`✅ ${stats.variations} variation commitments created`);
    console.log(`✅ ${stats.invoices} invoice actuals created`);
    console.log(`✅ Total: ${stats.contracts + stats.variations + stats.invoices} CVR records created`);

    // Show CVR summary
    console.log(`\n--- CVR Summary for Project ${projectId} ---`);
    const commitments = await prisma.cVRCommitment.aggregate({
      where: { tenantId, projectId, status: 'COMMITTED' },
      _sum: { amount: true }
    });

    const actuals = await prisma.cVRActual.aggregate({
      where: { tenantId, projectId, status: { in: ['CERTIFIED', 'PAID'] } },
      _sum: { amount: true }
    });

    console.log(`💰 Total Committed: £${Number(commitments._sum.amount || 0).toLocaleString()}`);
    console.log(`💸 Total Actual: £${Number(actuals._sum.amount || 0).toLocaleString()}`);

  } catch (error) {
    console.error(`❌ Error backfilling project ${projectId}:`, error.message);
    throw error;
  }
}

async function backfillAllProjects(tenantId) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`BACKFILLING ALL PROJECTS FOR TENANT: ${tenantId}`);
  console.log(`${'='.repeat(60)}`);

  const projects = await prisma.project.findMany({
    where: { tenantId },
    select: { id: true, name: true }
  });

  console.log(`Found ${projects.length} projects\n`);

  for (const project of projects) {
    console.log(`\nProcessing: ${project.name} (ID: ${project.id})`);
    await backfillProject(tenantId, project.id);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`ALL PROJECTS BACKFILLED!`);
  console.log(`${'='.repeat(60)}`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('❌ Usage: node scripts/backfill-cvr-data.cjs <tenantId> [projectId]');
    console.error('');
    console.error('Examples:');
    console.error('  node scripts/backfill-cvr-data.cjs demo 3          # Backfill Project 3');
    console.error('  node scripts/backfill-cvr-data.cjs demo            # Backfill all projects');
    process.exit(1);
  }

  const tenantId = args[0];
  const projectId = args[1] ? Number(args[1]) : null;

  try {
    if (projectId) {
      await backfillProject(tenantId, projectId);
    } else {
      await backfillAllProjects(tenantId);
    }

    console.log('\n✅ SUCCESS! CVR data backfilled.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
