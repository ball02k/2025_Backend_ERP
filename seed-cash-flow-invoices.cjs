const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedInvoices() {
  const projectId = 37;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true }
  });

  if (!project) {
    console.error('Project 37 not found');
    process.exit(1);
  }

  const tenantId = project.tenantId;
  console.log('\n🌱 Seeding Invoices for Project 37...\n');

  // Get or create suppliers
  let supplier1 = await prisma.supplier.findFirst({
    where: { tenantId, name: 'ABC Building Supplies Ltd' }
  });

  if (!supplier1) {
    supplier1 = await prisma.supplier.create({
      data: {
        tenantId,
        name: 'ABC Building Supplies Ltd',
        status: 'ACTIVE',
      }
    });
  }

  let supplier2 = await prisma.supplier.findFirst({
    where: { tenantId, name: 'XYZ Electrical Services' }
  });

  if (!supplier2) {
    supplier2 = await prisma.supplier.create({
      data: {
        tenantId,
        name: 'XYZ Electrical Services',
        status: 'ACTIVE',
      }
    });
  }

  const invoices = [
    {
      supplierId: supplier1.id,
      number: 'INV-2025-001',
      supplierInvoiceRef: 'ABC-12345',
      issueDate: new Date('2025-10-01'),
      dueDate: new Date('2025-10-31'),
      net: 15000,
      vat: 3000,
      gross: 18000,
      status: 'APPROVED',
    },
    {
      supplierId: supplier2.id,
      number: 'INV-2025-002',
      supplierInvoiceRef: 'XYZ-67890',
      issueDate: new Date('2025-11-01'),
      dueDate: new Date('2025-11-30'),
      net: 8000,
      vat: 1600,
      gross: 9600,
      status: 'RECEIVED',
    },
    {
      supplierId: supplier1.id,
      number: 'INV-2025-003',
      supplierInvoiceRef: 'ABC-12346',
      issueDate: new Date('2025-09-15'),
      dueDate: new Date('2025-10-15'),
      net: 12000,
      vat: 2400,
      gross: 14400,
      status: 'PAID',
    },
  ];

  for (const inv of invoices) {
    const existing = await prisma.invoice.findFirst({
      where: {
        tenantId,
        projectId,
        number: inv.number,
      }
    });

    if (!existing) {
      await prisma.invoice.create({
        data: {
          tenantId,
          projectId,
          direction: 'INBOUND',
          ...inv,
        }
      });

      console.log(`  ✓ Invoice ${inv.number}: £${inv.gross} - ${inv.status}`);
    } else {
      console.log(`  - Invoice ${inv.number} already exists`);
    }
  }

  console.log('\n✅ Invoices seeded successfully!\n');
  await prisma.$disconnect();
}

seedInvoices().catch((error) => {
  console.error('Error:', error);
  prisma.$disconnect();
  process.exit(1);
});
