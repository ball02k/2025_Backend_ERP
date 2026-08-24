/**
 * Add test payment applications with mixed directions
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addTestApplications() {
  console.log('💰 Adding test payment applications...\n');

  try {
    // Get first project
    const project = await prisma.project.findFirst({
      select: { id: true, name: true, tenantId: true }
    });

    if (!project) {
      console.error('No project found. Run seed script first.');
      return;
    }

    console.log(`Using project: ${project.name}\n`);

    // Get first contract
    const contract = await prisma.contract.findFirst({
      where: { projectId: project.id },
      select: { id: true, supplierId: true }
    });

    // Get upstream contract
    const upstreamContract = await prisma.upstreamContract.findFirst({
      where: { projectId: project.id }
    });

    // Create OUTBOUND applications (Raising to MC)
    console.log('Creating OUTBOUND applications (Raising)...');
    for (let i = 1; i <= 3; i++) {
      await prisma.applicationForPayment.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          contractId: contract?.id,
          supplierId: contract?.supplierId,
          upstreamContractId: upstreamContract?.id,
          applicationNumber: 900 + i,
          applicationNo: `PA-OUT-${Date.now()}-${i}`,
          applicationDate: new Date(),
          periodStart: new Date(2024, 10, 1),
          periodEnd: new Date(2024, 11, 30),
          claimedGrossValue: 50000 + (i * 10000),
          claimedNetValue: 45000 + (i * 9000),
          claimedThisPeriod: 45000 + (i * 9000),
          status: 'SUBMITTED',
          direction: 'OUTBOUND'
        }
      });
    }
    console.log('  ✅ Created 3 OUTBOUND applications');

    // Create INBOUND applications (Receiving from subs)
    console.log('Creating INBOUND applications (Receiving)...');
    for (let i = 1; i <= 3; i++) {
      await prisma.applicationForPayment.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          contractId: contract?.id,
          supplierId: contract?.supplierId,
          applicationNumber: 800 + i,
          applicationNo: `PA-IN-${Date.now()}-${i}`,
          applicationDate: new Date(),
          periodStart: new Date(2024, 10, 1),
          periodEnd: new Date(2024, 11, 30),
          claimedGrossValue: 30000 + (i * 5000),
          claimedNetValue: 27000 + (i * 4500),
          claimedThisPeriod: 27000 + (i * 4500),
          status: 'CERTIFIED',
          certifiedThisPeriod: 27000 + (i * 4500),
          certifiedNetValue: 27000 + (i * 4500),
          direction: 'INBOUND'
        }
      });
    }
    console.log('  ✅ Created 3 INBOUND applications');

    console.log('\n✨ Test data added successfully!');
    console.log('Navigate to Payment Applications and test the Raising/Receiving tabs.');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

addTestApplications().catch(console.error);