const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function upsertMany(model, items) {
  for (const item of items) {
    await model.upsert({
      where: { key: item.key },
      update: {},
      create: item,
    });
  }
}

async function run() {
  console.log('Seeding lookups and sample data...');

  await upsertMany(prisma.projectStatus, [
    { key: 'PLANNED', label: 'Planned' },
    { key: 'ACTIVE', label: 'Active' },
    { key: 'ON_HOLD', label: 'On Hold' },
    { key: 'COMPLETED', label: 'Completed' },
  ]);

  await upsertMany(prisma.projectType, [
    { key: 'RESIDENTIAL', label: 'Residential' },
    { key: 'COMMERCIAL', label: 'Commercial' },
    { key: 'CIVILS', label: 'Civils' },
    { key: 'INDUSTRIAL', label: 'Industrial' },
  ]);

  await upsertMany(prisma.taskStatus, [
    { key: 'OPEN', label: 'Open' },
    { key: 'IN_PROGRESS', label: 'In Progress' },
    { key: 'BLOCKED', label: 'Blocked' },
    { key: 'DONE', label: 'Done' },
  ]);

  const [active, onHold] = await Promise.all([
    prisma.projectStatus.findUnique({ where: { key: 'ACTIVE' } }),
    prisma.projectStatus.findUnique({ where: { key: 'ON_HOLD' } }),
  ]);
  const [commercial, civils] = await Promise.all([
    prisma.projectType.findUnique({ where: { key: 'COMMERCIAL' } }),
    prisma.projectType.findUnique({ where: { key: 'CIVILS' } }),
  ]);
  const [open, inProgress, blocked, done] = await Promise.all([
    prisma.taskStatus.findUnique({ where: { key: 'OPEN' } }),
    prisma.taskStatus.findUnique({ where: { key: 'IN_PROGRESS' } }),
    prisma.taskStatus.findUnique({ where: { key: 'BLOCKED' } }),
    prisma.taskStatus.findUnique({ where: { key: 'DONE' } }),
  ]);

  const client = await prisma.client.upsert({
    where: { id: 1 },
    update: { name: 'Acme Civils' },
    create: { name: 'Acme Civils' },
  });

  const a001 = await prisma.project.upsert({
    where: { code: 'A001' },
    update: {},
    create: {
      code: 'A001',
      name: 'A14 Junction Upgrade',
      clientId: client.id,
      statusId: active.id,
      typeId: civils.id,
    },
  });

  const r101 = await prisma.project.upsert({
    where: { code: 'R101' },
    update: {},
    create: {
      code: 'R101',
      name: 'Ring Road Resurfacing',
      clientId: client.id,
      statusId: onHold.id,
      typeId: commercial.id,
    },
  });

  await prisma.task.createMany({
    data: [
      { projectId: a001.id, title: 'Site setup', statusId: done.id },
      { projectId: a001.id, title: 'Traffic management plan', statusId: inProgress.id },
      { projectId: a001.id, title: 'Utilities survey', statusId: open.id },
      { projectId: r101.id, title: 'Milling schedule', statusId: open.id },
      { projectId: r101.id, title: 'Asphalt supplier PO', statusId: blocked.id },
    ],
    skipDuplicates: true,
  });

  console.log('Seed complete');
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
