const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const tId = process.env.TENANT_DEFAULT || 'demo';

  const user = await prisma.user.upsert({
    where: { email: 'dev@demo.local' },
    update: { name: 'Dev User', tenantId: tId },
    create: { email: 'dev@demo.local', name: 'Dev User', tenantId: tId, passwordSHA: '' },
  });

  const client = await prisma.client.upsert({
    where: { id: 1 },
    update: {
      name: 'Acme Construction Ltd',
      companyRegNo: '12345678',
      vatNo: 'GB123456789',
    },
    create: {
      id: 1,
      name: 'Acme Construction Ltd',
      companyRegNo: '12345678',
      vatNo: 'GB123456789',
    },
  });

  await prisma.projectStatus.createMany({
    data: [
      { key: 'ACTIVE', label: 'Active' },
      { key: 'CLOSED', label: 'Closed' },
    ],
    skipDuplicates: true,
  });
  const [activeStatus, closedStatus] = await Promise.all([
    prisma.projectStatus.findFirst({ where: { key: 'ACTIVE' } }),
    prisma.projectStatus.findFirst({ where: { key: 'CLOSED' } }),
  ]);

  await prisma.taskStatus.createMany({
    data: [{ key: 'OPEN', label: 'Open' }],
    skipDuplicates: true,
  });
  const openStatus = await prisma.taskStatus.findFirst({ where: { key: 'OPEN' } });

  const activeProject = await prisma.project.upsert({
    where: { code: 'DEMO-ACTIVE' },
    update: {},
    create: {
      code: 'DEMO-ACTIVE',
      name: 'Active Demo Project',
      tenantId: tId,
      clientId: client.id,
      statusId: activeStatus?.id,
      status: 'Active',
    },
  });

  // Ensure dev user is member of active project
  await prisma.projectMembership.upsert({
    where: { tenantId_projectId_userId: { tenantId: tId, projectId: activeProject.id, userId: user.id } },
    update: {},
    create: { tenantId: tId, projectId: activeProject.id, userId: user.id, role: 'Member' },
  });

  // Seed a variation (new schema)
  await prisma.variation.upsert({
    where: { id: 1 },
    update: {},
    create: {
      tenantId: tId,
      projectId: activeProject.id,
      reference: 'CE-100',
      title: 'Seeded change',
      contractType: 'NEC4',
      type: 'compensation_event',
      status: 'proposed',
      value: 10000,
      costImpact: 8500,
      notes: 'Seed generated',
      lines: { create: [{ tenantId: tId, description: 'Seed line', qty: 1, rate: 10000, value: 10000, sort: 1 }] },
    },
  });

  // Minimal financial/procurement data
  await prisma.budgetLine.upsert({
    where: { id: 1 },
    update: {},
    create: { tenantId: tId, projectId: activeProject.id, code: 'BL-001', category: 'General', description: 'Seed budget', amount: 50000 },
  });
  const po = await prisma.purchaseOrder.upsert({
    where: { id: 1 },
    update: {},
    create: { tenantId: tId, projectId: activeProject.id, code: 'PO-SEED-1', supplier: 'Seed Supplier', status: 'Open', total: 2500 },
  });
  await prisma.pOLine.upsert({
    where: { id: 1 },
    update: {},
    create: { tenantId: tId, poId: po.id, item: 'Seed item', qty: 10, unit: 'ea', unitCost: 250, lineTotal: 2500 },
  });
  await prisma.delivery.upsert({
    where: { id: 1 },
    update: {},
    create: { tenantId: tId, poId: po.id, expectedAt: new Date() },
  });

  // Seed supplier capabilities
  const capabilitySupplier = await prisma.supplier.upsert({
    where: { name: 'Capability Supplier' },
    update: {},
    create: { tenantId: tId, name: 'Capability Supplier', status: 'approved' },
  });
  await prisma.supplierCapability.createMany({
    data: [
      { tenantId: tId, supplierId: capabilitySupplier.id, tag: 'Civils' },
      { tenantId: tId, supplierId: capabilitySupplier.id, tag: 'M&E' },
    ],
    skipDuplicates: true,
  });

  await prisma.project.upsert({
    where: { code: 'DEMO-CLOSED' },
    update: {},
    create: {
      code: 'DEMO-CLOSED',
      name: 'Closed Demo Project',
      tenantId: tId,
      clientId: client.id,
      statusId: closedStatus?.id,
      status: 'Closed',
    },
  });

  const now = new Date();
  const msDay = 24 * 60 * 60 * 1000;
  const tasks = [
    { title: 'Overdue task 1', dueDate: new Date(now.getTime() - 2 * msDay) },
    { title: 'Overdue task 2', dueDate: new Date(now.getTime() - msDay) },
    { title: 'Upcoming task', dueDate: new Date(now.getTime() + 7 * msDay) },
  ];
  for (const t of tasks) {
    const existing = await prisma.task.findFirst({
      where: {
        tenantId: tId,
        projectId: activeProject.id,
        title: t.title,
      },
    });
    if (!existing) {
      await prisma.task.create({
        data: {
          tenantId: tId,
          projectId: activeProject.id,
          title: t.title,
          dueDate: t.dueDate,
          statusId: openStatus?.id,
          status: 'Open',
        },
      });
    }
  }

  const [users, clients, projects, tasksCount] = await Promise.all([
    prisma.user.count({ where: { tenantId: tId } }),
    prisma.client.count(),
    prisma.project.count({ where: { tenantId: tId } }),
    prisma.task.count({ where: { tenantId: tId } }),
  ]);

  console.log(`Seeded ${users} users, ${clients} clients, ${projects} projects, ${tasksCount} tasks for tenant ${tId}`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
