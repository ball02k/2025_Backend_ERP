/**
 * Seed Cash Flow Data for Project 37
 *
 * Creates test Payment Certificates (INBOUND from client) and Invoices (INBOUND from suppliers)
 * to populate the Cash Flow page with realistic data.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedCashFlowData() {
  const projectId = 37;

  // Get tenant from project
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true }
  });

  if (!project) {
    console.error('Project 37 not found');
    process.exit(1);
  }

  const tenantId = project.tenantId;

  console.log(`\n🌱 Seeding Cash Flow data for Project ${projectId}...\n`);

  // Get or create upstream contract (needed for certificates)
  let upstreamContract = await prisma.upstreamContract.findFirst({
    where: { projectId, tenantId }
  });

  if (!upstreamContract) {
    console.log('Creating upstream contract...');
    upstreamContract = await prisma.upstreamContract.create({
      data: {
        tenantId,
        projectId,
        contractRef: 'MC-2025-001',
        contractValue: 500000,
        paymentTermsDays: 30,
      }
    });
  }

  // Create Payment Certificates (INBOUND - money coming IN from client)
  console.log('Creating Payment Certificates (INBOUND from client)...');

  const certificates = [
    {
      certificateNumber: 1,
      certificateDate: new Date('2025-10-15'),
      paymentDueDate: new Date('2025-11-01'),
      certifiedGross: 50000,
      netCertified: 50000,
      retentionAmount: 0,
      mcdAmount: 0,
      cisAmount: 0,
      otherDeductions: 0,
      paymentStatus: 'AWAITING',
    },
    {
      certificateNumber: 2,
      certificateDate: new Date('2025-11-15'),
      paymentDueDate: new Date('2025-12-01'),
      certifiedGross: 45000,
      netCertified: 45000,
      retentionAmount: 0,
      mcdAmount: 0,
      cisAmount: 0,
      otherDeductions: 0,
      paymentStatus: 'AWAITING',
    },
    {
      certificateNumber: 3,
      certificateDate: new Date('2025-09-15'),
      paymentDueDate: new Date('2025-10-01'),
      certifiedGross: 32000,
      netCertified: 32000,
      retentionAmount: 0,
      mcdAmount: 0,
      cisAmount: 0,
      otherDeductions: 0,
      paymentStatus: 'PAID',
    },
  ];

  for (const cert of certificates) {
    const existing = await prisma.paymentCertificate.findFirst({
      where: {
        tenantId,
        projectId,
        certificateNumber: cert.certificateNumber,
        direction: 'INBOUND',
      }
    });

    if (!existing) {
      const created = await prisma.paymentCertificate.create({
        data: {
          tenantId,
          projectId,
          upstreamContractId: upstreamContract.id,
          direction: 'INBOUND',
          ...cert,
        }
      });

      console.log(`  ✓ Certificate #${cert.certificateNumber}: £${cert.netCertified} - ${cert.paymentStatus}`);

      // Add payment for paid certificate
      if (cert.paymentStatus === 'PAID') {
        await prisma.payment.create({
          data: {
            tenantId,
            paymentCertificateId: created.id,
            paymentAmount: cert.netCertified,
            paymentDate: new Date('2025-10-05'),
            paymentReference: `PAY-${cert.certificateNumber}`,
            paymentMethod: 'BACS',
          }
        });
        console.log(`    💰 Payment recorded: £${cert.netCertified}`);
      }
    }
  }

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

  // Create Invoices (INBOUND - money going OUT to suppliers)
  console.log('\nCreating Invoices (INBOUND from suppliers)...');

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
    }
  }

  console.log('\n✅ Cash Flow data seeded successfully!\n');
  console.log('Summary:');
  console.log(`  Money IN (Certificates): £${certificates.reduce((sum, c) => sum + c.netCertified, 0)}`);
  console.log(`  Money OUT (Invoices): £${invoices.reduce((sum, i) => sum + i.gross, 0)}`);
  console.log(`  Net Position: £${certificates.reduce((sum, c) => sum + c.netCertified, 0) - invoices.reduce((sum, i) => sum + i.gross, 0)}`);
  console.log('\nRefresh the Cash Flow page to see the data.\n');

  await prisma.$disconnect();
}

seedCashFlowData().catch((error) => {
  console.error('Error seeding cash flow data:', error);
  prisma.$disconnect();
  process.exit(1);
});
