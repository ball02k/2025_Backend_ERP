/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { recomputeProjectSnapshot } = require('../services/projectSnapshot');

(async () => {
  const TENANT = process.env.DEMO_TENANT_ID || process.env.TENANT_DEFAULT || 'demo';
  const crypto = require('crypto');
  const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const STATUS_TENANT_ID = 1;

  // Cleanup existing demo data
  await prisma.project.deleteMany({ where: { tenantId: TENANT, code: { in: ['P-001','P-002'] } } });
  await prisma.client.deleteMany({ where: { name: 'Demo Client' } });

  // Upsert lookup values
  await prisma.taskStatus.upsert({
    where: { tenantId_key: { tenantId: STATUS_TENANT_ID, key: 'open' } },
    update: {},
    create: { tenantId: STATUS_TENANT_ID, key: 'open', label: 'Open', isActive: true },
  });
  const statusActive = await prisma.projectStatus.upsert({
    where: { tenantId_key: { tenantId: STATUS_TENANT_ID, key: 'Active' } },
    update: {},
    create: { tenantId: STATUS_TENANT_ID, key: 'Active', label: 'Active', isActive: true },
  });
  const typeDemo = await prisma.projectType.upsert({
    where: { tenantId_key: { tenantId: STATUS_TENANT_ID, key: 'Demo' } },
    update: {},
    create: { tenantId: STATUS_TENANT_ID, key: 'Demo', label: 'Demo', isActive: true },
  });

  // Client
  const client = await prisma.client.create({
    data: { name: 'Demo Client', companyRegNo: '12345678', vatNo: 'GB123456789' },
  });

  // Users & roles
  const adminEmail = process.env.DEMO_USER_EMAIL || 'admin@demo.local';
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { tenantId: TENANT, name: 'Demo Admin', passwordSHA: sha256('demo1234') },
    create: { email: adminEmail, name: 'Demo Admin', tenantId: TENANT, passwordSHA: sha256('demo1234') },
  });
  const adminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TENANT, name: 'admin' } },
    update: {},
    create: { tenantId: TENANT, name: 'admin' },
  });
  await prisma.userRole.upsert({
    where: { tenantId_userId_roleId: { tenantId: TENANT, userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { tenantId: TENANT, userId: adminUser.id, roleId: adminRole.id },
  });

  const pmUser = await prisma.user.upsert({
    where: { email: 'pm@demo.local' },
    update: { tenantId: TENANT, name: 'Demo PM', passwordSHA: sha256('demo1234') },
    create: { email: 'pm@demo.local', name: 'Demo PM', tenantId: TENANT, passwordSHA: sha256('demo1234') },
  });
  const pmRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TENANT, name: 'pm' } },
    update: {},
    create: { tenantId: TENANT, name: 'pm' },
  });
  await prisma.userRole.upsert({
    where: { tenantId_userId_roleId: { tenantId: TENANT, userId: pmUser.id, roleId: pmRole.id } },
    update: {},
    create: { tenantId: TENANT, userId: pmUser.id, roleId: pmRole.id },
  });

  // Projects
  const proj1 = await prisma.project.create({
    data: {
      code: 'P-001',
      name: 'Alpha Build',
      tenantId: TENANT,
      clientId: client.id,
      status: 'Active',
      type: 'Demo',
      statusId: statusActive.id,
      typeId: typeDemo.id,
      projectManagerId: pmUser.id,
      budget: 100000,
      actualSpend: 120000,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
    },
  });
  const proj2 = await prisma.project.create({
    data: {
      code: 'P-002',
      name: 'Beta Hub',
      tenantId: TENANT,
      clientId: client.id,
      status: 'Active',
      type: 'Demo',
      statusId: statusActive.id,
      typeId: typeDemo.id,
      projectManagerId: pmUser.id,
      budget: 200000,
      actualSpend: 50000,
      startDate: new Date('2025-02-01'),
      endDate: new Date('2025-11-30'),
    },
  });

  // Memberships
  for (const proj of [proj1, proj2]) {
    await prisma.projectMembership.create({ data: { tenantId: TENANT, projectId: proj.id, userId: adminUser.id, role: 'admin' } });
    await prisma.projectMembership.create({ data: { tenantId: TENANT, projectId: proj.id, userId: pmUser.id, role: 'pm' } });
  }

  // Tasks
  const taskStatus = await prisma.taskStatus.findFirst({ where: { tenantId: STATUS_TENANT_ID, key: 'open' } });
  const now = new Date();
  for (let i = 0; i < 4; i++) {
    await prisma.task.create({ data: { tenantId: TENANT, projectId: proj1.id, title: `Overdue ${i+1}`, status: 'Open', statusId: taskStatus.id, dueDate: new Date(now.getTime() - (i+1)*86400000) } });
  }
  for (let i = 0; i < 4; i++) {
    await prisma.task.create({ data: { tenantId: TENANT, projectId: proj1.id, title: `Due Soon ${i+1}`, status: 'Open', statusId: taskStatus.id, dueDate: new Date(now.getTime() + (i+1)*86400000) } });
  }
  for (let i = 0; i < 4; i++) {
    await prisma.task.create({ data: { tenantId: TENANT, projectId: proj2.id, title: `Future ${i+1}`, status: 'Open', statusId: taskStatus.id, dueDate: new Date(now.getTime() + (i+8)*86400000) } });
  }

  // Variations
  await prisma.variation.create({ data: { tenantId: TENANT, projectId: proj1.id, reference: 'VAR-1', title: 'Draft change', contractType: 'NEC4', type: 'ce', status: 'draft', value: 0, costImpact: 0 } });
  await prisma.variation.create({ data: { tenantId: TENANT, projectId: proj1.id, reference: 'VAR-2', title: 'Submitted change', contractType: 'NEC4', type: 'ce', status: 'submitted', value: 10000, costImpact: 8000 } });
  await prisma.variation.create({ data: { tenantId: TENANT, projectId: proj1.id, reference: 'VAR-3', title: 'Approved change', contractType: 'NEC4', type: 'ce', status: 'approved', value: 5000, costImpact: 4000 } });

  // Purchase orders
  for (let i = 1; i <= 2; i++) {
    const po = await prisma.purchaseOrder.create({
      data: {
        tenantId: TENANT,
        projectId: proj1.id,
        code: `PO-${i}`,
        supplier: `Supplier ${i}`,
        status: 'Open',
        orderDate: new Date(),
        total: 5000 * i,
        lines: { create: [{ tenantId: TENANT, item: `Item ${i}`, qty: 5, unit: 'ea', unitCost: 1000 * i, lineTotal: 5000 * i }] },
      },
    });
    await prisma.delivery.create({ data: { tenantId: TENANT, poId: po.id, expectedAt: new Date(), note: 'Demo delivery' } });
  }

  // Documents
  await prisma.document.createMany({ data: [
    { tenantId: TENANT, filename: 'spec1.pdf', storageKey: 'uploads/spec1.pdf', size: 1000, mimeType: 'application/pdf', uploadedById: 'system' },
    { tenantId: TENANT, filename: 'spec2.pdf', storageKey: 'uploads/spec2.pdf', size: 2000, mimeType: 'application/pdf', uploadedById: 'system' },
  ] });

  // Recompute snapshots
  await recomputeProjectSnapshot(prisma, { projectId: proj1.id });
  await recomputeProjectSnapshot(prisma, { projectId: proj2.id });

  console.log('Seed complete');
  process.exit(0);
})().catch((e) => { console.error('Seed error', e); process.exit(1); });
