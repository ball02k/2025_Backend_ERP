const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

// Safely create Decimal values; accepts number or string
const d = (v) => (v == null ? null : new Prisma.Decimal(v));

async function upsertMany(model, items) {
  await model.createMany({ data: items, skipDuplicates: true });
}

async function findOrCreate(model, where, data) {
  const existing = await model.findFirst({ where });
  return existing ?? model.create({ data });
}

async function run() {
  try {
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
        tenantId: 'demo',
        code: 'A001',
        name: 'A14 Junction Upgrade',
        clientId: client.id,
        statusId: active.id,
        typeId: civils.id,
        status: 'ACTIVE',
        type: 'CIVILS',
      },
    });

    const r101 = await prisma.project.upsert({
      where: { code: 'R101' },
      update: {},
      create: {
        tenantId: 'demo',
        code: 'R101',
        name: 'Ring Road Resurfacing',
        clientId: client.id,
        statusId: onHold.id,
        typeId: commercial.id,
        status: 'ON_HOLD',
        type: 'COMMERCIAL',
      },
    });

    const projects = await prisma.project.findMany({ select: { id: true, tenantId: true } });

    for (const p of projects) {
      await prisma.projectSnapshot.upsert({
        where: { projectId: p.id },
        update: {
          tenantId: p.tenantId,
          budget: 2500000,
          committed: 1900000,
          actual: 1420000,
          retentionHeld: 120000,
          forecastAtComplete: 2550000,
          variance: 50000,
          schedulePct: 47,
          criticalAtRisk: 3,
          variationsDraft: 2,
          variationsSubmitted: 3,
          variationsApproved: 5,
          variationsValueApproved: 180000,
          tasksOverdue: 7,
          tasksDueThisWeek: 15,
          rfisOpen: 6,
          rfisAvgAgeDays: 9,
          qaOpenNCR: 2,
          qaOpenPunch: 18,
          hsIncidentsThisMonth: 1,
          hsOpenPermits: 4,
          procurementCriticalLate: 2,
          procurementPOsOpen: 14,
          carbonTarget: 120,
          carbonToDate: 78,
          carbonUnit: "tCO2e",
          updatedAt: new Date(),
        },
        create: {
          projectId: p.id,
          tenantId: p.tenantId,
          budget: 2500000,
          committed: 1900000,
          actual: 1420000,
          retentionHeld: 120000,
          forecastAtComplete: 2550000,
          variance: 50000,
          schedulePct: 47,
          criticalAtRisk: 3,
          variationsDraft: 2,
          variationsSubmitted: 3,
          variationsApproved: 5,
          variationsValueApproved: 180000,
          tasksOverdue: 7,
          tasksDueThisWeek: 15,
          rfisOpen: 6,
          rfisAvgAgeDays: 9,
          qaOpenNCR: 2,
          qaOpenPunch: 18,
          hsIncidentsThisMonth: 1,
          hsOpenPermits: 4,
          procurementCriticalLate: 2,
          procurementPOsOpen: 14,
          carbonTarget: 120,
          carbonToDate: 78,
          carbonUnit: "tCO2e",
        },
      });
    }

    await prisma.task.createMany({
      data: [
        { projectId: a001.id, tenantId: 'demo', title: 'Site setup', statusId: done.id },
        { projectId: a001.id, tenantId: 'demo', title: 'Traffic management plan', statusId: inProgress.id },
        { projectId: a001.id, tenantId: 'demo', title: 'Utilities survey', statusId: open.id },
        { projectId: r101.id, tenantId: 'demo', title: 'Milling schedule', statusId: open.id },
        { projectId: r101.id, tenantId: 'demo', title: 'Asphalt supplier PO', statusId: blocked.id },
      ],
      skipDuplicates: true,
    });

    await seedVariations();
    await seedDocuments();

    console.log('Seed complete');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
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
          tenantId: 'demo',
          referenceCode: `${type}-${String(counter).padStart(4, '0')}`,
          title: `Site change #${counter}`,
          description: 'Seeded variation for demo',
          type,
          status,
          reason_code: ['client_change', 'latent_condition', 'design_development'][i % 3],
          estimated_cost: d(500 + i * 50),
          estimated_sell: d(800 + i * 60),
          notifiedDate: new Date(),
          lines: {
            create: [
              {
                cost_code: 'LAB',
                description: 'Joinery labour (extra)',
                qty: d(8 + i),
                unit: 'hr',
                unit_cost: d(35),
                unit_sell: d(55),
              },
              ...(i % 2 === 0
                ? [
                    {
                      cost_code: 'MAT',
                      description: 'Timber',
                      qty: d(12),
                      unit: 'item',
                      unit_cost: d(18.5),
                      unit_sell: d(28.0),
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

async function seedDocuments(){
  const projects = await prisma.project.findMany({ take: 2, orderBy: { id: 'asc' } });
  for (const p of projects) {
    await prisma.document.create({
      data: {
        fileName: `sample_${p.code || p.id}.pdf`,
        contentType: 'application/pdf',
        size: BigInt(12345),
        storageProvider: 'local',
        storageKey: `seed/${Date.now()}_${p.id}_sample.pdf`,
        uploadedBy: 'seed',
        links: { create: [{ projectId: p.id, note: 'seed link' }] },
      },
    });
  }
}

run();
