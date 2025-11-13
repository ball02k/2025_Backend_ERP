/**
 * Diagnostic script to check payment applications and suppliers
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkApplications() {
  console.log('\n=== Checking Payment Applications ===\n');

  // Get recent applications
  const applications = await prisma.applicationForPayment.findMany({
    where: {
      tenantId: 'demo',
    },
    include: {
      supplier: true,
      contract: {
        include: {
          supplier: true,
        },
      },
      project: true,
    },
    orderBy: {
      id: 'desc',
    },
    take: 5,
  });

  console.log(`Found ${applications.length} recent applications:\n`);

  applications.forEach((app) => {
    console.log(`Application #${app.id} (${app.applicationNo})`);
    console.log(`  Project: ${app.project?.name || 'N/A'}`);
    console.log(`  Contract: ${app.contract?.title || 'N/A'}`);
    console.log(`  Contract Supplier ID: ${app.contract?.supplierId || 'NULL'}`);
    console.log(`  Contract Supplier Name: ${app.contract?.supplier?.name || 'N/A'}`);
    console.log(`  Application Supplier ID: ${app.supplierId || 'NULL'}`);
    console.log(`  Application Supplier Name: ${app.supplier?.name || 'N/A'}`);
    console.log(`  Status: ${app.status}`);
    console.log(`  Claimed This Period: £${app.claimedThisPeriod}`);
    console.log('');
  });

  // Check contracts without suppliers
  const contractsWithoutSuppliers = await prisma.contract.findMany({
    where: {
      tenantId: 'demo',
      supplierId: null,
    },
    select: {
      id: true,
      title: true,
      contractRef: true,
    },
  });

  if (contractsWithoutSuppliers.length > 0) {
    console.log(`\n⚠️  Found ${contractsWithoutSuppliers.length} contracts WITHOUT suppliers:\n`);
    contractsWithoutSuppliers.forEach(c => {
      console.log(`  - Contract #${c.id}: ${c.title} (${c.contractRef || 'No ref'})`);
    });
  } else {
    console.log('\n✅ All contracts have suppliers linked');
  }

  await prisma.$disconnect();
}

checkApplications().catch(console.error);
