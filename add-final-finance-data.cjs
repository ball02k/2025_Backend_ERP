/**
 * Add Final Finance Data
 * Adds Payment Certificates, CVR data, and more financial transactions
 * to complete the workflow demonstration
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const toDecimal = (value) => {
  if (value === null || value === undefined) return null;
  return parseFloat(value.toString());
};

async function addFinalFinanceData() {
  console.log('💰 Adding final finance data to complete workflow...\n');

  try {
    // Get a project with contracts
    const project = await prisma.project.findFirst({
      where: {
        tenantId: 'demo',
        contracts: { some: {} }
      },
      include: {
        contracts: { take: 2 },
        upstreamContract: true
      }
    });

    if (!project) {
      console.log('No project with contracts found. Run seed scripts first.');
      return;
    }

    console.log(`Using project: ${project.name}\n`);

    // Get or create upstream contract
    let upstreamContract = project.upstreamContract;
    if (!upstreamContract) {
      // Get a client to be the upstream party
      const client = await prisma.client.findFirst();
      if (client) {
        upstreamContract = await prisma.upstreamContract.create({
          data: {
            tenantId: project.tenantId,
            projectId: project.id,
            mainContractorId: client.id,
            contractValue: toDecimal(5000000),
            retentionPercentage: toDecimal(5),
            paymentTermsDays: 30
          }
        });
        console.log('✅ Created upstream contract');
      }
    }

    // 1. CREATE PAYMENT CERTIFICATES
    console.log('\n📜 Creating Payment Certificates...');

    // Get recent OUTBOUND applications (we raised to client)
    const outboundApps = await prisma.applicationForPayment.findMany({
      where: {
        projectId: project.id,
        direction: 'OUTBOUND',
        status: { in: ['SUBMITTED', 'CERTIFIED'] }
      },
      take: 2
    });

    for (const app of outboundApps) {
      // Check if certificate already exists
      const existingCert = await prisma.paymentCertificate.findFirst({
        where: {
          paymentApplicationId: app.id
        }
      });

      if (!existingCert) {
        const cert = await prisma.paymentCertificate.create({
          data: {
            tenantId: project.tenantId,
            projectId: project.id,
            upstreamContractId: upstreamContract?.id,
            paymentApplicationId: app.id,
            certificateNumber: app.applicationNumber,
            certificateDate: new Date(),
            certifiedGross: app.certifiedGrossValue || app.claimedGrossValue,
            retentionPercentage: toDecimal(5),
            retentionAmount: toDecimal((app.certifiedGrossValue || app.claimedGrossValue) * 0.05),
            netCertified: toDecimal((app.certifiedNetValue || app.claimedNetValue) * 0.95),
            paymentDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            paymentStatus: 'AWAITING',
            status: 'RECEIVED',
            direction: 'INBOUND'
          }
        });
        console.log(`  ✅ Created certificate #${cert.certificateNumber}`);
      }
    }

    // 2. CREATE PURCHASE ORDERS
    console.log('\n📦 Creating Purchase Orders...');

    const suppliers = await prisma.supplier.findMany({
      where: { tenantId: project.tenantId },
      take: 3
    });

    for (let i = 0; i < Math.min(3, suppliers.length); i++) {
      const supplier = suppliers[i];

      // OUTBOUND PO - We're placing order with supplier
      const poCode = `PO-OUT-${Date.now()}-${i}`;
      await prisma.purchaseOrder.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          supplierId: supplier.id,
          supplier: supplier.name,  // Add supplier name
          code: poCode,
          orderDate: new Date(),
          total: toDecimal(50000 + (i * 10000)),  // Use 'total' instead of 'totalValue'
          status: i === 0 ? 'DELIVERED' : 'APPROVED'
          // Removed: poNumber, currency, direction (not in schema)
        }
      });

      // INBOUND PO - We're receiving order from client
      if (i === 0) {
        const inPoCode = `PO-IN-${Date.now()}`;
        await prisma.purchaseOrder.create({
          data: {
            tenantId: project.tenantId,
            projectId: project.id,
            supplierId: supplier.id,
            supplier: supplier.name,  // Add supplier name
            code: inPoCode,
            orderDate: new Date(),
            total: toDecimal(150000),  // Use 'total' instead of 'totalValue'
            status: 'RECEIVED'
            // Removed: poNumber, currency, direction (not in schema)
          }
        });
      }
    }
    console.log('  ✅ Created purchase orders (placed & received)');

    // 3. CREATE INVOICES
    console.log('\n💵 Creating Invoices...');

    // OUTBOUND invoices - We're raising to clients
    const certificates = await prisma.paymentCertificate.findMany({
      where: {
        projectId: project.id,
        direction: 'INBOUND'
      },
      take: 2
    });

    for (const cert of certificates) {
      await prisma.invoice.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          invoiceNumber: `INV-${cert.certificateNumber}-${Date.now()}`,
          invoiceDate: cert.certificateDate,
          dueDate: cert.paymentDueDate,
          grossAmount: cert.certifiedGross,
          netAmount: cert.netCertified,
          status: 'SENT',
          type: 'PROJECT',
          direction: 'OUTBOUND',
          paymentCertificateId: cert.id
        }
      });
    }
    console.log('  ✅ Created OUTBOUND invoices (raised to clients)');

    // INBOUND invoices - We're receiving from suppliers
    const inboundApps = await prisma.applicationForPayment.findMany({
      where: {
        projectId: project.id,
        direction: 'INBOUND',
        supplierId: { not: null }
      },
      take: 2
    });

    for (const app of inboundApps) {
      await prisma.invoice.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          supplierId: app.supplierId,
          invoiceNumber: `SINV-${app.applicationNumber}-${Date.now()}`,
          invoiceDate: app.applicationDate,
          dueDate: new Date(app.applicationDate.getTime() + 30 * 24 * 60 * 60 * 1000),
          grossAmount: app.certifiedGrossValue || app.claimedGrossValue,
          netAmount: app.certifiedNetValue || app.claimedNetValue,
          status: 'RECEIVED',
          type: 'SUPPLIER',
          direction: 'INBOUND',
          paymentApplicationId: app.id
        }
      });
    }
    console.log('  ✅ Created INBOUND invoices (received from suppliers)');

    // 4. CREATE CVR DATA
    console.log('\n📈 Creating CVR Data...');

    // Create monthly CVR records for the last 3 months
    const today = new Date();
    const projectBudget = project.contractValue || 5000000;

    for (let monthsAgo = 2; monthsAgo >= 0; monthsAgo--) {
      const date = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1);
      const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      // Check if CVR record already exists for this period
      let cvrHeader = await prisma.costValueReconciliation.findFirst({
        where: {
          tenantId: project.tenantId,
          projectId: project.id,
          period: period
        }
      });

      if (!cvrHeader) {
        // Create CVR header
        cvrHeader = await prisma.costValueReconciliation.create({
          data: {
            tenantId: project.tenantId,
            projectId: project.id,
            period: period
          }
        });

        // Create CVR lines for different cost categories
        const monthlyBudget = projectBudget / 36; // 3 year project
        const actualSpend = monthlyBudget * (0.85 + Math.random() * 0.3); // 85-115% of budget
        const committed = actualSpend * 1.2; // 20% more committed than spent

        // Create main CVR line
        await prisma.cVRLine.create({
          data: {
            tenantId: project.tenantId,
            cvrId: cvrHeader.id,
            packageId: null,  // Can link to a package if needed
            costCode: null,
            budget: toDecimal(monthlyBudget),
            committed: toDecimal(committed),
            actual: toDecimal(actualSpend),
            earnedValue: toDecimal(actualSpend * 0.9), // 90% earned
            variance: toDecimal(monthlyBudget - actualSpend),
            adjustment: toDecimal(0)
          }
        });

        console.log(`  ✅ Created CVR data for ${period}`);
      }
    }

    // 5. ADD SOME PAYMENTS
    console.log('\n💳 Recording Some Payments...');

    // Record payment for first certificate
    const firstCert = certificates[0];
    if (firstCert) {
      const existingPayment = await prisma.certificatePayment.findFirst({
        where: { paymentCertificateId: firstCert.id }
      });

      if (!existingPayment) {
        await prisma.certificatePayment.create({
          data: {
            tenantId: project.tenantId,
            paymentCertificateId: firstCert.id,
            paymentDate: new Date(),
            paymentAmount: firstCert.netCertified,
            paymentReference: `PAY-${firstCert.certificateNumber}`,
            paymentMethod: 'BANK_TRANSFER',
            isPartialPayment: false
          }
        });

        // Update certificate status
        await prisma.paymentCertificate.update({
          where: { id: firstCert.id },
          data: {
            paymentStatus: 'PAID',
            paidDate: new Date()
          }
        });
        console.log(`  ✅ Recorded payment for certificate #${firstCert.certificateNumber}`);
      }
    }

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('\n' + '━'.repeat(60));
    console.log('✨ FINANCE DATA COMPLETE!');
    console.log('━'.repeat(60));
    console.log('\n📊 What you can now see in the system:');
    console.log('  ✅ Projects with full details and correct info');
    console.log('  ✅ Budget lines properly structured');
    console.log('  ✅ Packages created from budget lines');
    console.log('  ✅ Complete tender process with submissions');
    console.log('  ✅ Awards and contracts from tenders');
    console.log('  ✅ Payment Applications (Raising & Receiving)');
    console.log('  ✅ Payment Certificates from client');
    console.log('  ✅ Purchase Orders (Placed & Received)');
    console.log('  ✅ Invoices (Raised & Received)');
    console.log('  ✅ CVR data showing budget vs actual');
    console.log('  ✅ Cash flow building up');
    console.log('  ✅ Retention amounts tracked');
    console.log('  ✅ Some payments recorded');

    console.log('\n🎯 Navigate through the system to see:');
    console.log('  • Project Overview with all details');
    console.log('  • Budget & Packages properly linked');
    console.log('  • Tender evaluations and awards');
    console.log('  • Finance tabs with proper filtering');
    console.log('  • CVR showing cost tracking');
    console.log('  • Cash Flow with money in/out');
    console.log('  • Complete construction workflow');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addFinalFinanceData().catch(console.error);