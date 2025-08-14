const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function upsertMany(model, items) {
  await model.createMany({ data: items, skipDuplicates: true });
}

async function findOrCreate(model, where, data) {
  const existing = await model.findFirst({ where });
  return existing ?? model.create({ data });
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

  await findOrCreate(prisma.contact, { clientId: client.id, email: 'pm@acme.com' }, {
    clientId: client.id,
    firstName: 'Paula',
    lastName: 'Manager',
    email: 'pm@acme.com',
    phone: '+44 20 7946 0000',
    role: 'Project Manager',
    isPrimary: true,
  });

  await findOrCreate(prisma.contact, { clientId: client.id, email: 'qs@acme.com' }, {
    clientId: client.id,
    firstName: 'Quentin',
    lastName: 'Surveyor',
    email: 'qs@acme.com',
    phone: '+44 20 7946 0001',
    role: 'QS',
    isPrimary: false,
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

  await seedVariations();

  console.log('Seed complete');
}

async function seedVariations() {
  const projects = await prisma.project.findMany({ take: 3, orderBy: { id: 'asc' } });
  if (!projects.length) return;

  let counter = 1;
  for (const p of projects) {
    const toMake = 6;
    for (let i = 0; i < toMake; i++) {
      const type = i % 3 === 0 ? 'CE' : i % 3 === 1 ? 'VARIATION' : 'VO';
      const statusPool = [
        'draft',
        'submitted',
        'under_review',
        'approved',
        'instructed',
        'priced',
        'agreed',
        'vo_issued',
        'vo_accepted',
      ];
      const status = statusPool[i % statusPool.length];

      await prisma.variation.create({
        data: {
          projectId: p.id,
          referenceCode: `${type}-${String(counter).padStart(4, '0')}`,
          title: `Site change #${counter}`,
          description: 'Seeded variation for demo',
          type,
          status,
          reason_code: ['client_change', 'latent_condition', 'design_development'][i % 3],
          estimated_cost: new prisma.Prisma.Decimal(500 + i * 50),
          estimated_sell: new prisma.Prisma.Decimal(800 + i * 60),
          notifiedDate: new Date(),
          lines: {
            create: [
              {
                cost_code: 'LAB',
                description: 'Joinery labour (extra)',
                qty: new prisma.Prisma.Decimal(8 + i),
                unit: 'hr',
                unit_cost: new prisma.Prisma.Decimal(35),
                unit_sell: new prisma.Prisma.Decimal(55),
              },
              ...(i % 2 === 0
                ? [
                    {
                      cost_code: 'MAT',
                      description: 'Timber',
                      qty: new prisma.Prisma.Decimal(12),
                      unit: 'item',
                      unit_cost: new prisma.Prisma.Decimal(18.5),
                      unit_sell: new prisma.Prisma.Decimal(28.0),
                    },
                  ]
                : []),
            ],
          },
          statusHistory: { create: [{ fromStatus: null, toStatus: status, note: 'seed' }] },
        },
      });

      counter++;
    }
  }
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
