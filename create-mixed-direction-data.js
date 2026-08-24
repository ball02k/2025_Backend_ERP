const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createMixedData() {
  try {
    // Create an INBOUND PO (received from client - rare but valid)
    const inboundPO = await prisma.purchaseOrder.create({
      data: {
        tenantId: 'demo',
        projectId: 1,
        code: 'PO-CLIENT-001',
        supplier: 'Main Contractor ABC',
        status: 'ISSUED',
        orderDate: new Date(),
        total: 50000,
        direction: 'INBOUND', // PO from client to us
      }
    });
    console.log('Created INBOUND PO:', inboundPO.code);

    // Create an OUTBOUND invoice (raised to client)
    const outboundInvoice = await prisma.invoice.create({
      data: {
        tenantId: 'demo',
        projectId: 1,
        number: 'INV-OUT-001',
        status: 'RAISED',
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        net: 25000,
        vat: 5000,
        gross: 30000,
        direction: 'OUTBOUND', // Invoice we raised to client
        source: 'MANUAL',
      }
    });
    console.log('Created OUTBOUND Invoice:', outboundInvoice.number);

    console.log('Mixed direction data created successfully!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createMixedData();
