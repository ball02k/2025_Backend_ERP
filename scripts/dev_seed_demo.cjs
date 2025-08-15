#!/usr/bin/env node
/* eslint-disable */
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const tId = 'demo';
  const hash = crypto.createHash('sha256').update('demo123!').digest('hex');

  const { user, client, project } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: 'demo@erp.local' },
      update: { name: 'Demo User', passwordSHA: hash, tenantId: tId },
      create: {
        tenantId: tId,
        email: 'demo@erp.local',
        name: 'Demo User',
        passwordSHA: hash,
      },
    });

    const client = await tx.client.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        name: 'Acme Construction Ltd',
      },
    });

    const project = await tx.project.upsert({
      where: { code: 'PRJ-001' },
      update: {
        name: 'HQ Fit-Out',
        status: 'active',
        type: 'fit-out',
        tenantId: tId,
        clientId: client.id,
      },
      create: {
        tenantId: tId,
        code: 'PRJ-001',
        name: 'HQ Fit-Out',
        status: 'active',
        type: 'fit-out',
        clientId: client.id,
      },
    });

    try {
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
    } catch (e) {
      if (!/ProjectSnapshot/i.test(String(e))) throw e;
    }

    await tx.projectMembership.upsert({
      where: {
        tenantId_projectId_userId: {
          tenantId: tId,
          projectId: project.id,
          userId: user.id,
        },
      },
      update: { role: 'owner' },
      create: {
        tenantId: tId,
        projectId: project.id,
        userId: user.id,
        role: 'owner',
      },
    });

    return { user, client, project };
  });

  console.log('✔ Seeded demo tenant with user/client/project(+snapshot/membership)');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

