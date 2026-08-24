/**
 * Add mixed direction finance data to existing projects
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addFinanceData() {
  console.log('💰 Adding mixed direction finance data...\n');

  try {
    // Get first project from demo tenant
    const project = await prisma.project.findFirst({
      where: { tenantId: 'demo' },
      select: { id: true, name: true, tenantId: true }
    });

    if (!project) {
      console.error('❌ No project found. Run seed:e2e first.');
      return;
    }

    console.log(`📁 Using project: ${project.name}\n`);

    // Get or create upstream contract
    let upstreamContract = await prisma.upstreamContract.findFirst({
      where: { projectId: project.id }
    });

    if (!upstreamContract) {
      // Get a company to be MC
      const company = await prisma.company.findFirst({
        where: { tenantId: project.tenantId }
      });

      if (company) {
        upstreamContract = await prisma.upstreamContract.create({
          data: {
            tenantId: project.tenantId,
            projectId: project.id,
            mainContractorId: company.id,
            contractValue: 5000000,
            retentionPercentage: 5,
            mcdPercentage: 2.5,
            paymentTermsDays: 30
          }
        });
      }
    }

    // 1. Payment Applications with mixed directions
    console.log('📝 Adding Payment Applications...');

    // OUTBOUND - Raising to MC
    await prisma.applicationForPayment.create({
      data: {
        tenantId: project.tenantId,
        projectId: project.id,
        upstreamContractId: upstreamContract?.id,
        applicationNumber: 501,
        applicationDate: new Date(),
        periodFrom: new Date(2024, 9, 1),
        periodTo: new Date(2024, 10, 30),
        claimedGrossValue: 75000,
        claimedNetValue: 67500,
        status: 'SUBMITTED',
        direction: 'OUTBOUND'
      }
    });

    await prisma.applicationForPayment.create({
      data: {
        tenantId: project.tenantId,
        projectId: project.id,
        upstreamContractId: upstreamContract?.id,
        applicationNumber: 502,
        applicationDate: new Date(),
        periodFrom: new Date(2024, 10, 1),
        periodTo: new Date(2024, 11, 30),
        claimedGrossValue: 85000,
        claimedNetValue: 76500,
        status: 'DRAFT',
        direction: 'OUTBOUND'
      }
    });

    // INBOUND - Receiving from subs
    await prisma.applicationForPayment.create({
      data: {
        tenantId: project.tenantId,
        projectId: project.id,
        applicationNumber: 601,
        applicationDate: new Date(),
        periodFrom: new Date(2024, 9, 1),
        periodTo: new Date(2024, 10, 30),
        claimedGrossValue: 45000,
        claimedNetValue: 40500,
        status: 'RECEIVED',
        direction: 'INBOUND'
      }
    });

    console.log('  ✅ Added 2 OUTBOUND + 1 INBOUND applications');

    // 2. Payment Certificates with mixed directions
    console.log('📜 Adding Payment Certificates...');

    // INBOUND - Received from MC
    await prisma.paymentCertificate.create({
      data: {
        tenantId: project.tenantId,
        projectId: project.id,
        upstreamContractId: upstreamContract?.id,
        certificateNumber: 101,
        certificateDate: new Date(),
        certifiedGross: 70000,
        netCertified: 63000,
        paymentStatus: 'AWAITING',
        paymentDueDate: new Date(2025, 0, 15),
        status: 'RECEIVED',
        direction: 'INBOUND'
      }
    });

    // OUTBOUND - Issued to subs (rare)
    await prisma.paymentCertificate.create({
      data: {
        tenantId: project.tenantId,
        projectId: project.id,
        certificateNumber: 201,
        certificateDate: new Date(),
        certifiedGross: 40000,
        netCertified: 36000,
        paymentStatus: 'AWAITING',
        paymentDueDate: new Date(2025, 0, 20),
        status: 'ISSUED',
        direction: 'OUTBOUND'
      }
    });

    console.log('  ✅ Added 1 INBOUND + 1 OUTBOUND certificates');

    // 3. Purchase Orders with mixed directions
    console.log('📦 Adding Purchase Orders...');

    const supplier = await prisma.supplier.findFirst({
      where: { tenantId: project.tenantId }
    });

    if (supplier) {
      // OUTBOUND - Placed with suppliers
      await prisma.purchaseOrder.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          supplierId: supplier.id,
          poNumber: `PO-${Date.now()}-OUT`,
          orderDate: new Date(),
          totalValue: 25000,
          currency: 'GBP',
          status: 'APPROVED',
          direction: 'OUTBOUND'
        }
      });

      // INBOUND - Received from clients
      await prisma.purchaseOrder.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          supplierId: supplier.id,
          poNumber: `PO-${Date.now()}-IN`,
          orderDate: new Date(),
          totalValue: 35000,
          currency: 'GBP',
          status: 'RECEIVED',
          direction: 'INBOUND'
        }
      });

      console.log('  ✅ Added 1 OUTBOUND + 1 INBOUND purchase orders');
    }

    // 4. Invoices with mixed directions
    console.log('💰 Adding Invoices...');

    // OUTBOUND - Raised to clients
    await prisma.invoice.create({
      data: {
        tenantId: project.tenantId,
        projectId: project.id,
        invoiceNumber: `INV-${Date.now()}-OUT`,
        invoiceDate: new Date(),
        dueDate: new Date(2025, 0, 30),
        grossAmount: 30000,
        netAmount: 27000,
        status: 'SENT',
        type: 'PROJECT',
        direction: 'OUTBOUND'
      }
    });

    // INBOUND - Received from suppliers
    await prisma.invoice.create({
      data: {
        tenantId: project.tenantId,
        projectId: project.id,
        invoiceNumber: `INV-${Date.now()}-IN`,
        invoiceDate: new Date(),
        dueDate: new Date(2025, 0, 25),
        grossAmount: 18000,
        netAmount: 16200,
        status: 'RECEIVED',
        type: 'SUPPLIER',
        direction: 'INBOUND'
      }
    });

    console.log('  ✅ Added 1 OUTBOUND + 1 INBOUND invoices');

    console.log('\n✨ Finance data added successfully!');
    console.log('\n🎯 You can now test the finance sub-navigation filtering:');
    console.log('  • Payment Applications → Raising vs Receiving');
    console.log('  • Certificates → Received vs Issued');
    console.log('  • Purchase Orders → Placed vs Received');
    console.log('  • Invoices → Raised vs Received');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

addFinanceData().catch(console.error);