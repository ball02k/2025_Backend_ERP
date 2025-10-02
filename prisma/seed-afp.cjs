const { PrismaClient, Prisma } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const tenantId = process.env.TENANT_DEFAULT || 'demo';
    const project = await prisma.project.findFirst({ where: { tenantId } });
    if (!project) {
      console.log('[seed-afp] No project found for tenant', tenantId);
      return;
    }
    const supplier = await prisma.supplier.findFirst({ where: { tenantId } });

    const year = new Date().getUTCFullYear();
    const seq = await prisma.applicationForPayment.count({ where: { tenantId } });
    const applicationNo = `AFP-${year}-${String(seq + 1).padStart(5, '0')}`;

    const created = await prisma.applicationForPayment.create({
      data: {
        tenantId,
        projectId: project.id,
        supplierId: supplier?.id ?? null,
        applicationNo,
        applicationDate: new Date(),
        periodStart: new Date(Date.UTC(year, 7, 1)), // Aug 1
        periodEnd: new Date(Date.UTC(year, 7, 31)),
        currency: 'GBP',
        grossToDate: new Prisma.Decimal(1000000),
        variationsValue: new Prisma.Decimal(125000),
        prelimsValue: new Prisma.Decimal(50000),
        retentionValue: new Prisma.Decimal(20000),
        mosValue: new Prisma.Decimal(35000),
        offsiteValue: new Prisma.Decimal(0),
        deductionsValue: new Prisma.Decimal(10000),
        netClaimed: new Prisma.Decimal(1185000),
        status: 'submitted',
      }
    });
    console.log('[seed-afp] Created AfP', created.id, created.applicationNo, 'for project', created.projectId);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

