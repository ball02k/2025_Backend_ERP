/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const TENANT = process.env.TENANT_DEFAULT || 'demo';

  // Demo fixtures
  const DEMO_CLIENTS = [
    { name: 'Acme Developments',   companyRegNo: '01234567' },
    { name: 'The Crown Estate',    companyRegNo: '00000000' },
    { name: 'Orbit Housing',       companyRegNo: '09876543' },
    { name: 'G4S Facilities',      companyRegNo: '06543210' },
    { name: 'Canary Wharf Group',  companyRegNo: '11111111' },
  ];
  const DEMO_PROJECTS = [
    { code:'P-1001', name:'Canary Wharf Fit-out',  status:'Active',  type:'Fit-out',        clientName:'Canary Wharf Group' },
    { code:'P-1002', name:'NHS Clinic Refurb',     status:'Active',  type:'Healthcare',     clientName:'Acme Developments'  },
    { code:'P-1003', name:'Orbit Housing Block A', status:'Active',  type:'Residential',    clientName:'Orbit Housing'      },
    { code:'P-1004', name:'Crown Estate Lobby',    status:'Pending', type:'Commercial',     clientName:'The Crown Estate'   },
    { code:'P-1005', name:'G4S HQ M&E',            status:'Active',  type:'Infrastructure', clientName:'G4S Facilities'     },
    { code:'P-1006', name:'School Sports Hall',    status:'Active',  type:'Education',      clientName:'Acme Developments'  },
  ];
  const DEMO_TASKS = [
    { title:'RIBA Stage 3 sign-off', status:'done',         due:'2025-08-01', projectCode:'P-1001' },
    { title:'Steel delivery',        status:'overdue',      due:'2025-08-10', projectCode:'P-1002' },
    { title:'M&E design review',     status:'in_progress',  due:'2025-09-05', projectCode:'P-1005' },
    { title:'Planning condition 12', status:'in_progress',  due:'2025-09-12', projectCode:'P-1003' },
    { title:'Glazing package award', status:'overdue',      due:'2025-08-15', projectCode:'P-1001' },
    { title:'Asbestos survey',       status:'done',         due:'2025-07-25', projectCode:'P-1004' },
    { title:'Joinery shop drawings', status:'in_progress',  due:'2025-09-01', projectCode:'P-1006' },
    { title:'Fire stopping audit',   status:'overdue',      due:'2025-08-20', projectCode:'P-1003' },
  ];
  const iso = (d) => new Date(d).toISOString();

  // -------------------------------------------
  // 1) Targeted clean: remove old demo data
  // -------------------------------------------
  const demoCodes = DEMO_PROJECTS.map(p => p.code);
  const demoClientNames = DEMO_CLIENTS.map(c => c.name);

  // Find any existing demo projects by code
  const existingProjects = await prisma.project.findMany({
    where: { code: { in: demoCodes } },
    select: { id: true, code: true }
  });
  const existingProjectIds = existingProjects.map(p => p.id);

  // Delete tasks for those projects (ignore tenant scoping here to fully clear the demo set)
  if (existingProjectIds.length) {
    await prisma.task.deleteMany({ where: { projectId: { in: existingProjectIds } } });
  }
  // Delete projects by code (unique on code)
  await prisma.project.deleteMany({ where: { code: { in: demoCodes } } });

  // Optionally delete demo clients by name (only if now unreferenced)
  await prisma.client.deleteMany({ where: { name: { in: demoClientNames } } });

  // -------------------------------------------
  // 2) Recreate Clients (no tenantId on Client)
  // -------------------------------------------
  const createdClients = {};
  for (const c of DEMO_CLIENTS) {
    const client = await prisma.client.create({
      data: {
        name: c.name,
        companyRegNo: c.companyRegNo,
      }
    });
    createdClients[c.name] = client;
  }

  // -------------------------------------------
  // 3) Upsert Projects by unique `code`, set tenantId
  // -------------------------------------------
  const createdProjects = {};
  for (const p of DEMO_PROJECTS) {
    const client = createdClients[p.clientName];
    if (!client) throw new Error('Client missing for project: ' + p.clientName);

    const project = await prisma.project.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        status: p.status,
        type: p.type,
        clientId: client.id,
        tenantId: TENANT,
      },
      create: {
        code: p.code,
        name: p.name,
        status: p.status,
        type: p.type,
        clientId: client.id,
        tenantId: TENANT,
      }
    });
    createdProjects[p.code] = project;
  }

  // -------------------------------------------
  // 4) Create Tasks linked to Projects, set tenantId
  // -------------------------------------------
  for (const t of DEMO_TASKS) {
    const proj = createdProjects[t.projectCode];
    if (!proj) continue;
    await prisma.task.create({
      data: {
        projectId: proj.id,
        tenantId: TENANT,
        title: t.title,
        status: t.status,
        dueDate: iso(t.due),
      }
    });
  }

  // Summary
  const cc = await prisma.client.count({ where: { name: { in: demoClientNames } } });
  const pc = await prisma.project.count({ where: { code: { in: demoCodes } } });
  const pids = Object.values(createdProjects).map(p => p.id);
  const tc = await prisma.task.count({ where: { projectId: { in: pids } } });

  console.log('✅ Seed complete',
    '\n tenantId used for Project/Task =', TENANT,
    '\n clients:', cc, 'projects:', pc, 'tasks:', tc
  );
  process.exit(0);
})().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});

