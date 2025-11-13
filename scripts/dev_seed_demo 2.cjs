#!/usr/bin/env node
/* eslint-disable */
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const tId = 'demo';
  const hash = crypto.createHash('sha256').update('demo123!').digest('hex');
  const now = new Date();

  await prisma.$transaction(async (tx) => {
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

    let client = await tx.client.findFirst({ where: { name: 'Acme Construction Ltd' } });
    if (client) {
      client = await tx.client.update({
        where: { id: client.id },
        data: { name: 'Acme Construction Ltd', companyRegNo: 'ACME-001', vatNo: 'GB123456789' },
      });
    } else {
      client = await tx.client.create({
        data: {
          name: 'Acme Construction Ltd',
          companyRegNo: 'ACME-001',
          vatNo: 'GB123456789',
        },
      });
    }

    const project1 = await tx.project.upsert({
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

    const project2 = await tx.project.upsert({
      where: { code: 'PRJ-002' },
      update: {
        name: 'New Warehouse Build',
        status: 'planned',
        type: 'new-build',
        tenantId: tId,
        clientId: client.id,
      },
      create: {
        tenantId: tId,
        code: 'PRJ-002',
        name: 'New Warehouse Build',
        status: 'planned',
        type: 'new-build',
        clientId: client.id,
      },
    });

    try {
      await tx.projectSnapshot.upsert({
        where: { projectId: project1.id },
        update: { tenantId: tId },
        create: {
          projectId: project1.id,
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
          projectId: project1.id,
          userId: user.id,
        },
      },
      update: { role: 'owner' },
      create: {
        tenantId: tId,
        projectId: project1.id,
        userId: user.id,
        role: 'owner',
      },
    });

    // seed tasks for project1
    const openStatus = await tx.taskStatus.upsert({
      where: { id: 1 },
      update: { key: 'OPEN', label: 'Open' },
      create: { id: 1, key: 'OPEN', label: 'Open' },
    });

    const taskDefs = [
      { title: 'Site survey', dueDate: new Date(now.getTime() - 7 * 86400000) }, // overdue
      { title: 'Design review', dueDate: new Date(now.getTime() - 2 * 86400000) }, // overdue
      { title: 'Kick-off meeting', dueDate: new Date(now.getTime() + 5 * 86400000) }, // upcoming
    ];

    for (const t of taskDefs) {
      const existing = await tx.task.findFirst({
        where: { tenantId: tId, projectId: project1.id, title: t.title },
      });
      const data = {
        tenantId: tId,
        projectId: project1.id,
        title: t.title,
        dueDate: t.dueDate,
        statusId: openStatus.id,
        status: 'Open',
      };
      if (existing) {
        await tx.task.update({ where: { id: existing.id }, data });
      } else {
        await tx.task.create({ data });
      }
    }
  });

  console.log('✔ Seeded demo tenant with client, projects and tasks');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
