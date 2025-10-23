const { prisma, Prisma } = require('../utils/prisma.cjs');

async function main() {
  const tenantId = 'demo';
  const projectId = 3;

  console.log('Seeding contracts for project 3...');

  // Get packages and suppliers
  const packages = await prisma.package.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });

  const suppliers = await prisma.supplier.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });

  if (!packages.length || !suppliers.length) {
    console.error('No packages or suppliers found');
    process.exit(1);
  }

  const contracts = [
    {
      packageId: packages[0].id, // Groundworks
      supplierId: suppliers[1].id, // Concrete Co
      title: 'Groundworks Package Award',
      contractNumber: 'GW-2025-001',
      status: 'Signed',
      value: new Prisma.Decimal(125000),
      net: new Prisma.Decimal(125000),
      gross: new Prisma.Decimal(150000),
      vatRate: new Prisma.Decimal(0.2),
      retentionPct: 5,
      currency: 'GBP',
      awardDate: new Date('2025-01-15'),
      issuedAt: new Date('2025-01-16'),
      sentForSignatureAt: new Date('2025-01-17'),
      signedAt: new Date('2025-01-20'),
      startDate: new Date('2025-02-01'),
      endDate: new Date('2025-06-30'),
      notes: 'Initial groundworks contract - foundations and drainage',
    },
    {
      packageId: packages[1].id, // Fit-Out
      supplierId: suppliers[2].id, // Finishes & Interiors Co
      title: 'Fit-Out Package',
      contractNumber: 'FO-2025-002',
      status: 'Issued',
      value: new Prisma.Decimal(85000),
      net: new Prisma.Decimal(85000),
      gross: new Prisma.Decimal(102000),
      vatRate: new Prisma.Decimal(0.2),
      retentionPct: 5,
      currency: 'GBP',
      awardDate: new Date('2025-02-10'),
      issuedAt: new Date('2025-02-11'),
      startDate: new Date('2025-03-01'),
      endDate: new Date('2025-08-31'),
      notes: 'Interior fit-out and finishes',
    },
    {
      packageId: packages[2].id, // Envelope
      supplierId: suppliers[0].id, // City MEP Services
      title: 'Building Envelope - Draft',
      contractNumber: 'ENV-2025-003',
      status: 'Draft',
      value: new Prisma.Decimal(95000),
      net: new Prisma.Decimal(95000),
      gross: new Prisma.Decimal(114000),
      vatRate: new Prisma.Decimal(0.2),
      retentionPct: 5,
      currency: 'GBP',
      notes: 'Awaiting final approval - envelope and cladding works',
    },
  ];

  for (const contract of contracts) {
    const existing = await prisma.contract.findFirst({
      where: {
        tenantId,
        packageId: contract.packageId,
      },
    });

    if (existing) {
      console.log(`✓ Contract already exists for package ${contract.packageId}`);
      continue;
    }

    const created = await prisma.contract.create({
      data: {
        tenantId,
        projectId,
        ...contract,
      },
    });

    console.log(`✓ Created contract ${created.contractNumber} (${created.status})`);

    // Create some contract lines for the signed contract
    if (contract.status === 'Signed' && created.id) {
      const lines = [
        {
          description: 'Site preparation and excavation',
          qty: new Prisma.Decimal(1),
          rate: new Prisma.Decimal(45000),
          total: new Prisma.Decimal(45000),
        },
        {
          description: 'Foundation concrete works',
          qty: new Prisma.Decimal(250),
          rate: new Prisma.Decimal(200),
          total: new Prisma.Decimal(50000),
        },
        {
          description: 'Drainage installation',
          qty: new Prisma.Decimal(1),
          rate: new Prisma.Decimal(30000),
          total: new Prisma.Decimal(30000),
        },
      ];

      for (const line of lines) {
        await prisma.contractLineItem.create({
          data: {
            tenantId,
            contractId: created.id,
            ...line,
          },
        });
      }

      console.log(`  ✓ Created ${lines.length} contract lines`);
    }
  }

  console.log('\nContract seeding complete!');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
