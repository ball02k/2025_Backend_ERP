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
