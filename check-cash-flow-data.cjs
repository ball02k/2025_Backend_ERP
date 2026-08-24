/**
 * Diagnostic script to check cash flow data for project 37
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCashFlowData() {
  const projectId = 37;

  console.log('\n=== CASH FLOW DATA CHECK FOR PROJECT 37 ===\n');

  try {
    // Check Payment Applications
    const paymentApps = await prisma.paymentApplication.findMany({
      where: { projectId },
      select: {
        id: true,
        applicationNumber: true,
        grossValue: true,
        status: true,
        valuation: true,
      },
    });

    console.log(`📋 Payment Applications: ${paymentApps.length}`);
    if (paymentApps.length > 0) {
      console.log('   Sample:', paymentApps.slice(0, 3).map(app => ({
        id: app.id,
        appNo: app.applicationNumber,
        gross: Number(app.grossValue || 0),
        status: app.status,
      })));
    }

    // Check Payment Certificates (INBOUND = received from client)
    const certificates = await prisma.paymentCertificate.findMany({
      where: {
        projectId,
        direction: 'INBOUND',
      },
      select: {
        id: true,
        certificateNumber: true,
        direction: true,
        netCertified: true,
        paymentStatus: true,
        paymentDueDate: true,
      },
    });

    console.log(`\n💰 Payment Certificates (INBOUND from client): ${certificates.length}`);
    if (certificates.length > 0) {
      console.log('   Sample:', certificates.slice(0, 3).map(cert => ({
        id: cert.id,
        certNo: cert.certificateNumber,
        direction: cert.direction,
        netCertified: Number(cert.netCertified || 0),
        status: cert.paymentStatus,
      })));
    }

    // Check all Payment Certificates (any direction)
    const allCertificates = await prisma.paymentCertificate.findMany({
      where: { projectId },
      select: {
        id: true,
        certificateNumber: true,
        direction: true,
        netCertified: true,
        paymentStatus: true,
      },
    });

    console.log(`\n📜 All Payment Certificates (any direction): ${allCertificates.length}`);
    if (allCertificates.length > 0) {
      console.log('   Sample:', allCertificates.slice(0, 3).map(cert => ({
        id: cert.id,
        certNo: cert.certificateNumber,
        direction: cert.direction,
        netCertified: Number(cert.netCertified || 0),
      })));
    }

    // Check Invoices (INBOUND = received from suppliers)
    const invoices = await prisma.invoice.findMany({
      where: {
        projectId,
        direction: 'INBOUND',
      },
      select: {
        id: true,
        number: true,
        direction: true,
        gross: true,
        status: true,
        dueDate: true,
        supplier: {
          select: { name: true }
        }
      },
    });

    console.log(`\n🧾 Invoices (INBOUND from suppliers): ${invoices.length}`);
    if (invoices.length > 0) {
      console.log('   Sample:', invoices.slice(0, 3).map(inv => ({
        id: inv.id,
        number: inv.number,
        direction: inv.direction,
        gross: Number(inv.gross || 0),
        status: inv.status,
        supplier: inv.supplier?.name,
      })));
    }

    // Check all Invoices (any direction)
    const allInvoices = await prisma.invoice.findMany({
      where: { projectId },
      select: {
        id: true,
        number: true,
        direction: true,
        gross: true,
        status: true,
      },
    });

    console.log(`\n📑 All Invoices (any direction): ${allInvoices.length}`);
    if (allInvoices.length > 0) {
      console.log('   Sample:', allInvoices.slice(0, 3).map(inv => ({
        id: inv.id,
        number: inv.number,
        direction: inv.direction,
        gross: Number(inv.gross || 0),
      })));
    }

    // Check Payments
    const payments = await prisma.payment.findMany({
      where: {
        paymentCertificate: {
          projectId,
        }
      },
      select: {
        id: true,
        paymentAmount: true,
        paymentDate: true,
        paymentCertificateId: true,
      },
    });

    console.log(`\n💵 Payments: ${payments.length}`);
    if (payments.length > 0) {
      console.log('   Sample:', payments.slice(0, 3).map(pay => ({
        id: pay.id,
        amount: Number(pay.paymentAmount || 0),
        date: pay.paymentDate,
        certId: pay.paymentCertificateId,
      })));
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`✓ Payment Applications: ${paymentApps.length}`);
    console.log(`✓ Payment Certificates (INBOUND): ${certificates.length}`);
    console.log(`✓ All Certificates (any direction): ${allCertificates.length}`);
    console.log(`✓ Invoices (INBOUND): ${invoices.length}`);
    console.log(`✓ All Invoices (any direction): ${allInvoices.length}`);
    console.log(`✓ Payments: ${payments.length}`);

    if (paymentApps.length === 0 && allCertificates.length === 0 && allInvoices.length === 0) {
      console.log('\n⚠️  NO FINANCIAL DATA FOUND FOR PROJECT 37');
      console.log('   Cash flow will show £0 until you have:');
      console.log('   - Payment Applications submitted to client');
      console.log('   - Payment Certificates received from client');
      console.log('   - Invoices received from suppliers');
    } else if (certificates.length === 0 && invoices.length === 0) {
      console.log('\n⚠️  NO INBOUND FINANCIAL DATA FOUND');
      console.log('   Cash flow looks for:');
      console.log('   - Certificates with direction="INBOUND" (from client)');
      console.log('   - Invoices with direction="INBOUND" (from suppliers)');
      console.log('   Check if your data has the correct direction values.');
    }

    console.log('\n');

  } catch (error) {
    console.error('Error checking cash flow data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCashFlowData();
