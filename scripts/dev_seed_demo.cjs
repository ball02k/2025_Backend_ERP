const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();
const tId = 'demo';
const passwordSHA = crypto.createHash('sha256').update('demo123!').digest('hex');

async function main() {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: 'demo@example.com' },
      update: { name: 'Demo User', tenantId: tId, passwordSHA },
      create: {
        tenantId: tId,
        email: 'demo@example.com',
        name: 'Demo User',
        passwordSHA,
      },
    });

    let client = await tx.client.findFirst({ where: { name: 'Demo Client' } });
    if (!client) {
      client = await tx.client.create({
        data: {
          name: 'Demo Client',
          companyRegNo: 'DEMO-REG',
          vatNo: 'DEMO-VAT',
          address1: '1 Demo Street',
          city: 'Demoville',
          postcode: 'DE1 1AA',
        },
      });
    }

    const project = await tx.project.upsert({
      where: { code: 'DEMO' },
      update: { name: 'Demo Project', tenantId: tId, clientId: client.id },
      create: {
        tenantId: tId,
        code: 'DEMO',
        name: 'Demo Project',
        clientId: client.id,
      },
    });

    await tx.projectSnapshot.upsert({
      where: { projectId: project.id },
      update: { tenantId: tId },
      create: {
        projectId: project.id,
        tenantId: tId,
        financialBudget: 0,
        financialCommitted: 0,
        financialActual: 0,
        financialForecast: 0,
      },
    });

    await tx.projectMembership.upsert({
      where: {
        tenantId_projectId_userId: {
          tenantId: tId,
          projectId: project.id,
          userId: user.id,
        },
      },
      update: { role: 'Owner' },
      create: {
        tenantId: tId,
        projectId: project.id,
        userId: user.id,
        role: 'Owner',
      },
    });
  });
  console.log('Demo seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
