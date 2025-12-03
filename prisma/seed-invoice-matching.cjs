/**
 * Seed data for testing Invoice-PO Matching
 * Creates POs and Invoices with various matching scenarios
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 [Seed] Starting Invoice-PO Matching seed...');

  // Use default tenant ID
  const tenantId = 'demo';
  console.log(`✅ Using tenant: ${tenantId}`);

  // Get or create a project
  let project = await prisma.project.findFirst({ where: { tenantId } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        tenantId,
        name: 'Test Project for Invoice Matching',
        code: 'INV-TEST',
        status: 'ACTIVE',
        budget: 500000,
      },
    });
    console.log(`✅ Created project: ${project.name}`);
  } else {
    console.log(`✅ Using existing project: ${project.name}`);
  }

  // Delete existing test suppliers
  await prisma.supplier.deleteMany({
    where: {
      tenantId,
      name: { in: ['Acme Building Supplies', 'Beta Construction Materials', 'Gamma Electrical Ltd'] },
    },
  });

  // Create suppliers
  const suppliers = await Promise.all([
    prisma.supplier.create({
      data: {
        tenantId,
        name: 'Acme Building Supplies',
        email: 'john@acme.com',
        phone: '555-0001',
        status: 'active',
      },
    }),
    prisma.supplier.create({
      data: {
        tenantId,
        name: 'Beta Construction Materials',
        email: 'jane@beta.com',
        phone: '555-0002',
        status: 'active',
      },
    }),
    prisma.supplier.create({
      data: {
        tenantId,
        name: 'Gamma Electrical Ltd',
        email: 'bob@gamma.com',
        phone: '555-0003',
        status: 'active',
      },
    }),
  ]);

  console.log(`✅ Created ${suppliers.length} suppliers`);

  // Delete existing test data
  await prisma.invoice.deleteMany({
    where: { number: { startsWith: 'TEST-INV-' } },
  });
  await prisma.purchaseOrder.deleteMany({
    where: { code: { startsWith: 'TEST-PO-' } },
  });

  console.log('🗑️  Cleared existing test data');

  // Create Purchase Orders
  const pos = [];

  // PO 1: Acme Building Supplies - £10,000
  const po1 = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      projectId: project.id,
      supplier: suppliers[0].name,
      supplierId: suppliers[0].id,
      code: 'TEST-PO-001',
      internalNotes: 'Timber and construction materials',
      orderDate: new Date('2025-01-10'),
      expectedDeliveryDate: new Date('2025-02-01'),
      status: 'SENT',
      total: 10000,
    },
  });
  pos.push(po1);

  // PO 2: Beta Construction - £25,000
  const po2 = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      projectId: project.id,
      supplier: suppliers[1].name,
      supplierId: suppliers[1].id,
      code: 'TEST-PO-002',
      internalNotes: 'Concrete and aggregate supply',
      orderDate: new Date('2025-01-15'),
      expectedDeliveryDate: new Date('2025-02-15'),
      status: 'SENT',
      total: 25000,
    },
  });
  pos.push(po2);

  // PO 3: Gamma Electrical - £5,500
  const po3 = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      projectId: project.id,
      supplier: suppliers[2].name,
      supplierId: suppliers[2].id,
      code: 'TEST-PO-003',
      internalNotes: 'Electrical wiring and fixtures',
      orderDate: new Date('2025-01-20'),
      expectedDeliveryDate: new Date('2025-03-01'),
      status: 'APPROVED',
      total: 5500,
    },
  });
  pos.push(po3);

  // PO 4: Acme Building - £15,000 (for testing near-match)
  const po4 = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      projectId: project.id,
      supplier: suppliers[0].name,
      supplierId: suppliers[0].id,
      code: 'TEST-PO-004',
      internalNotes: 'Plasterboard and insulation',
      orderDate: new Date('2025-01-25'),
      expectedDeliveryDate: new Date('2025-02-20'),
      status: 'SENT',
      total: 15000,
    },
  });
  pos.push(po4);

  console.log(`✅ Created ${pos.length} Purchase Orders`);

  // Create Invoices with various matching scenarios

  // SCENARIO 1: Perfect Direct Match
  // Invoice with PO reference, exact supplier, exact amount
  const inv1 = await prisma.invoice.create({
    data: {
      tenantId,
      projectId: project.id,
      supplierId: suppliers[0].id,
      number: 'TEST-INV-001',
      supplierInvoiceRef: 'ACME-12345',
      issueDate: new Date('2025-01-20'),
      dueDate: new Date('2025-02-20'),
      receivedDate: new Date('2025-01-21'),
      net: 8333.33,
      vat: 1666.67,
      gross: 10000,
      status: 'RECEIVED',
      source: 'PDF_OCR',
      matchStatus: 'UNMATCHED',
      poNumberRef: 'TEST-PO-001', // Direct PO reference
      ocrStatus: 'COMPLETED',
      ocrConfidence: 0.95,
    },
  });

  // SCENARIO 2: High Confidence Fuzzy Match
  // Same supplier, amount within 5%, similar date
  const inv2 = await prisma.invoice.create({
    data: {
      tenantId,
      projectId: project.id,
      supplierId: suppliers[1].id,
      number: 'TEST-INV-002',
      supplierInvoiceRef: 'BETA-67890',
      issueDate: new Date('2025-01-25'),
      dueDate: new Date('2025-02-25'),
      receivedDate: new Date('2025-01-26'),
      net: 21000,
      vat: 4200,
      gross: 25200, // Within 5% of PO-002 (£25,000)
      status: 'RECEIVED',
      source: 'PDF_OCR',
      matchStatus: 'UNMATCHED',
      // No PO reference - will use fuzzy matching
      ocrStatus: 'COMPLETED',
      ocrConfidence: 0.88,
      ocrRawText: 'Invoice for concrete and aggregate supply',
    },
  });

  // SCENARIO 3: Medium Confidence Match
  // Same supplier, amount within 10%, date within 60 days
  const inv3 = await prisma.invoice.create({
    data: {
      tenantId,
      projectId: project.id,
      supplierId: suppliers[2].id,
      number: 'TEST-INV-003',
      supplierInvoiceRef: 'GAMMA-11223',
      issueDate: new Date('2025-02-05'),
      dueDate: new Date('2025-03-05'),
      receivedDate: new Date('2025-02-06'),
      net: 4800,
      vat: 960,
      gross: 5760, // About 5% more than PO-003 (£5,500)
      status: 'RECEIVED',
      source: 'PDF_OCR',
      matchStatus: 'UNMATCHED',
      ocrStatus: 'COMPLETED',
      ocrConfidence: 0.75,
      ocrRawText: 'Electrical wiring cable and LED lighting fixtures',
    },
  });

  // SCENARIO 4: Low Confidence Match
  // Same supplier but amount differs by >20%
  const inv4 = await prisma.invoice.create({
    data: {
      tenantId,
      projectId: project.id,
      supplierId: suppliers[0].id,
      number: 'TEST-INV-004',
      supplierInvoiceRef: 'ACME-99999',
      issueDate: new Date('2025-02-10'),
      dueDate: new Date('2025-03-10'),
      receivedDate: new Date('2025-02-11'),
      net: 12000,
      vat: 2400,
      gross: 14400, // 20% less than PO-004 (£15,000)
      status: 'RECEIVED',
      source: 'CSV_IMPORT',
      matchStatus: 'UNMATCHED',
      ocrStatus: 'COMPLETED',
      ocrConfidence: 1.0,
    },
  });

  // SCENARIO 5: No Match
  // Different supplier, no matching PO
  const inv5 = await prisma.invoice.create({
    data: {
      tenantId,
      projectId: project.id,
      supplierId: suppliers[1].id,
      number: 'TEST-INV-005',
      supplierInvoiceRef: 'BETA-55555',
      issueDate: new Date('2025-02-15'),
      dueDate: new Date('2025-03-15'),
      receivedDate: new Date('2025-02-16'),
      net: 3500,
      vat: 700,
      gross: 4200, // No matching PO
      status: 'RECEIVED',
      source: 'PDF_OCR',
      matchStatus: 'UNMATCHED',
      ocrStatus: 'COMPLETED',
      ocrConfidence: 0.65,
      ocrRawText: 'Emergency repair materials',
    },
  });

  console.log('✅ Created 5 test invoices with various matching scenarios:');
  console.log('   - INV-001: Perfect direct match (PO-001)');
  console.log('   - INV-002: High confidence fuzzy match ~95% (PO-002)');
  console.log('   - INV-003: Medium confidence match ~75% (PO-003)');
  console.log('   - INV-004: Low confidence match ~45% (PO-004)');
  console.log('   - INV-005: No matching PO');

  console.log('\n📊 Summary:');
  console.log(`   Suppliers: ${suppliers.length}`);
  console.log(`   Purchase Orders: ${pos.length}`);
  console.log(`   Invoices: 5`);
  console.log('\n✅ Seed completed successfully!');
  console.log('\n🧪 To test the matching:');
  console.log('   POST /api/invoices/:id/find-matching-pos');
  console.log('   POST /api/invoices/:id/confirm-match');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
