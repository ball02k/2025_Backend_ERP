/**
 * Test Finance Filtering Script
 * Creates mixed direction data for all finance sections to test filtering
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTestData() {
  console.log('🚀 Creating test data for finance filtering...\n');

  try {
    // Get or create a test project
    let project = await prisma.project.findFirst({
      where: { tenantId: 'main' },
      select: { id: true, name: true, tenantId: true }
    });

    if (!project) {
      console.log('📝 Creating test project...');

      // Create a test company first
      let company = await prisma.company.findFirst({
        where: { tenantId: 'main' }
      });

      if (!company) {
        company = await prisma.company.create({
          data: {
            tenantId: 'main',
            name: 'Main Contractor Ltd',
            companyType: 'MAIN_CONTRACTOR',
            status: 'ACTIVE'
          }
        });
      }

      // Create test project
      project = await prisma.project.create({
        data: {
          tenantId: 'main',
          name: 'Test Finance Filtering Project',
          projectCode: 'TEST-FIN-001',
          status: 'ACTIVE',
          startDate: new Date(2024, 0, 1),
          endDate: new Date(2024, 11, 31),
          contractValue: 5000000,
          clientId: company.id,
          procurementMode: 'hybrid'
        }
      });

      console.log('✅ Created test project\n');
    }

    console.log(`📁 Using project: ${project.name} (ID: ${project.id})\n`);

    // Get or create upstream contract
    let upstreamContract = await prisma.upstreamContract.findFirst({
      where: { projectId: project.id }
    });

    if (!upstreamContract) {
      const mc = await prisma.company.findFirst({
        where: { tenantId: project.tenantId }
      });

      if (mc) {
        upstreamContract = await prisma.upstreamContract.create({
          data: {
            tenantId: project.tenantId,
            projectId: project.id,
            mainContractorId: mc.id,
            contractValue: 1000000,
            retentionPercentage: 5,
            mcdPercentage: 2.5,
            paymentTermsDays: 30
          }
        });
        console.log('✅ Created upstream contract\n');
      }
    }

    // 1. PAYMENT APPLICATIONS - Create mixed directions
    console.log('📝 Creating Payment Applications...');

    // OUTBOUND - Raising to MC
    for (let i = 1; i <= 3; i++) {
      await prisma.applicationForPayment.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          upstreamContractId: upstreamContract?.id,
          applicationNumber: 100 + i,
          applicationDate: new Date(2024, 10, i * 7),
          periodFrom: new Date(2024, 9, 1),
          periodTo: new Date(2024, 10, i * 7),
          claimedGrossValue: 50000 + (i * 10000),
          claimedNetValue: 45000 + (i * 9000),
          status: 'SUBMITTED',
          direction: 'OUTBOUND' // Raising to MC
        }
      });
    }
    console.log('  ✅ Created 3 OUTBOUND applications (Raising to MC)');

    // INBOUND - Receiving from subcontractors
    for (let i = 1; i <= 3; i++) {
      await prisma.applicationForPayment.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          applicationNumber: 200 + i,
          applicationDate: new Date(2024, 10, i * 7),
          periodFrom: new Date(2024, 9, 1),
          periodTo: new Date(2024, 10, i * 7),
          claimedGrossValue: 30000 + (i * 5000),
          claimedNetValue: 27000 + (i * 4500),
          status: 'RECEIVED',
          direction: 'INBOUND' // Receiving from subs
        }
      });
    }
    console.log('  ✅ Created 3 INBOUND applications (Receiving from subs)\n');

    // 2. PAYMENT CERTIFICATES - Create mixed directions
    console.log('📜 Creating Payment Certificates...');

    // INBOUND - Received from MC
    for (let i = 1; i <= 3; i++) {
      await prisma.paymentCertificate.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          upstreamContractId: upstreamContract?.id,
          certificateNumber: i,
          certificateDate: new Date(2024, 10, i * 8),
          certifiedGross: 45000 + (i * 10000),
          netCertified: 40500 + (i * 9000),
          paymentStatus: 'AWAITING',
          paymentDueDate: new Date(2024, 11, i * 8),
          status: 'RECEIVED',
          direction: 'INBOUND' // Received from MC
        }
      });
    }
    console.log('  ✅ Created 3 INBOUND certificates (Received from MC)');

    // OUTBOUND - Issued to subcontractors (rare)
    for (let i = 1; i <= 2; i++) {
      await prisma.paymentCertificate.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          certificateNumber: 10 + i,
          certificateDate: new Date(2024, 10, i * 8),
          certifiedGross: 25000 + (i * 5000),
          netCertified: 22500 + (i * 4500),
          paymentStatus: 'AWAITING',
          paymentDueDate: new Date(2024, 11, i * 8),
          status: 'ISSUED',
          direction: 'OUTBOUND' // Issued to subs
        }
      });
    }
    console.log('  ✅ Created 2 OUTBOUND certificates (Issued to subs)\n');

    // 3. PURCHASE ORDERS - Create mixed directions
    console.log('📦 Creating Purchase Orders...');

    // Get or create a supplier
    let supplier = await prisma.supplier.findFirst({
      where: { tenantId: project.tenantId }
    });

    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          tenantId: project.tenantId,
          name: 'Test Supplier Ltd',
          type: 'MATERIAL',
          status: 'ACTIVE'
        }
      });
    }

    // OUTBOUND - Placed with suppliers
    for (let i = 1; i <= 3; i++) {
      await prisma.purchaseOrder.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          supplierId: supplier.id,
          poNumber: `PO-OUT-${1000 + i}`,
          orderDate: new Date(2024, 10, i * 5),
          totalValue: 15000 + (i * 2000),
          currency: 'GBP',
          status: 'APPROVED',
          direction: 'OUTBOUND' // Placed with suppliers
        }
      });
    }
    console.log('  ✅ Created 3 OUTBOUND purchase orders (Placed with suppliers)');

    // INBOUND - Received from clients/MC
    for (let i = 1; i <= 2; i++) {
      await prisma.purchaseOrder.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          supplierId: supplier.id,
          poNumber: `PO-IN-${2000 + i}`,
          orderDate: new Date(2024, 10, i * 5),
          totalValue: 25000 + (i * 3000),
          currency: 'GBP',
          status: 'RECEIVED',
          direction: 'INBOUND' // Received from clients
        }
      });
    }
    console.log('  ✅ Created 2 INBOUND purchase orders (Received from clients)\n');

    // 4. INVOICES - Create mixed directions
    console.log('💰 Creating Invoices...');

    // OUTBOUND - Raised to clients
    for (let i = 1; i <= 3; i++) {
      await prisma.invoice.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          invoiceNumber: `INV-OUT-${3000 + i}`,
          invoiceDate: new Date(2024, 10, i * 6),
          dueDate: new Date(2024, 11, i * 6),
          grossAmount: 20000 + (i * 3000),
          netAmount: 18000 + (i * 2700),
          status: 'SENT',
          type: 'PROJECT',
          direction: 'OUTBOUND' // Raised to clients
        }
      });
    }
    console.log('  ✅ Created 3 OUTBOUND invoices (Raised to clients)');

    // INBOUND - Received from suppliers
    for (let i = 1; i <= 3; i++) {
      await prisma.invoice.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          invoiceNumber: `INV-IN-${4000 + i}`,
          invoiceDate: new Date(2024, 10, i * 6),
          dueDate: new Date(2024, 11, i * 6),
          grossAmount: 12000 + (i * 2000),
          netAmount: 10800 + (i * 1800),
          status: 'RECEIVED',
          type: 'SUPPLIER',
          direction: 'INBOUND' // Received from suppliers
        }
      });
    }
    console.log('  ✅ Created 3 INBOUND invoices (Received from suppliers)\n');

    console.log('✨ Test data created successfully!\n');
    console.log('📊 Summary:');
    console.log('  - Payment Applications: 3 OUTBOUND (Raising), 3 INBOUND (Receiving)');
    console.log('  - Certificates: 3 INBOUND (Received), 2 OUTBOUND (Issued)');
    console.log('  - Purchase Orders: 3 OUTBOUND (Placed), 2 INBOUND (Received)');
    console.log('  - Invoices: 3 OUTBOUND (Raised), 3 INBOUND (Received)');
    console.log('\n🎯 Navigate to the Finance sections in the UI to test filtering!');

  } catch (error) {
    console.error('❌ Error creating test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createTestData().catch(console.error);