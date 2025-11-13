const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const packages = await prisma.package.findMany({
    where: { projectId: { in: [1, 2, 3] } },
    take: 10
  });

  console.log('Creating tenders for', packages.length, 'packages');

  const suppliers = await prisma.supplier.findMany({ take: 5 });
  console.log('Found', suppliers.length, 'suppliers for invitations');

  for (const pkg of packages.slice(0, 8)) {
    // Use correct Request model fields: deadline (not deadlineAt), packageId (not nested), no description
    const tender = await prisma.request.create({
      data: {
        tenantId: 'demo',
        packageId: pkg.id,
        title: pkg.name + ' - RFQ',
        status: 'issued',
        type: 'RFQ',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        issuedAt: new Date(),
        stage: 1,
        totalStages: 1
      }
    });

    console.log('✓ Created tender:', tender.id, tender.title);

    // Create invitations
    for (const supplier of suppliers.slice(0, 3)) {
      await prisma.tenderInvitation.create({
        data: {
          tenantId: 'demo',
          requestId: tender.id,
          supplierId: supplier.id,
          status: 'invited',
          invitedAt: new Date()
        }
      });
    }
  }

  const count = await prisma.request.count({ where: { tenantId: 'demo' } });
  console.log('\n✅ Total tenders now:', count);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
