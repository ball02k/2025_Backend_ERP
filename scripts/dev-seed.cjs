/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  // use TENANT_DEFAULT if present; default to 'demo'
  const TENANT = process.env.TENANT_DEFAULT || 'demo';

  // Demo fixture data
  const DEMO_CLIENTS = [
    { name: 'Acme Developments',  companyRegNo: '01234567' },
    { name: 'The Crown Estate',    companyRegNo: '00000000' },
    { name: 'Orbit Housing',       companyRegNo: '09876543' },
    { name: 'G4S Facilities',      companyRegNo: '06543210' },
    { name: 'Canary Wharf Group',  companyRegNo: '11111111' },
  ];

  const DEMO_PROJECTS = [
    { code: 'P-1001', name: 'Canary Wharf Fit‑out',   status: 'Active',  type: 'Fit‑out',        clientName: 'Canary Wharf Group' },
    { code: 'P-1002', name: 'NHS Clinic Refurb',      status: 'Active',  type: 'Healthcare',     clientName: 'Acme Developments'  },
    { code: 'P-1003', name: 'Orbit Housing Block A',  status: 'Active',  type: 'Residential',    clientName: 'Orbit Housing'      },
    { code: 'P-1004', name: 'Crown Estate Lobby',     status: 'Pending', type: 'Commercial',     clientName: 'The Crown Estate'   },
    { code: 'P-1005', name: 'G4S HQ M&E',             status: 'Active',  type: 'Infrastructure', clientName: 'G4S Facilities'     },
    { code: 'P-1006', name: 'School Sports Hall',     status: 'Active',  type: 'Education',      clientName: 'Acme Developments'  },
  ];

  const DEMO_TASKS = [
    { title:'RIBA Stage 3 sign‑off', status:'done',        due:'2025-08-01', projectCode:'P-1001' },
    { title:'Steel delivery',        status:'overdue',     due:'2025-08-10', projectCode:'P-1002' },
    { title:'M&E design review',     status:'in_progress', due:'2025-09-05', projectCode:'P-1005' },
    { title:'Planning condition 12', status:'in_progress', due:'2025-09-12', projectCode:'P-1003' },
    { title:'Glazing package award', status:'overdue',     due:'2025-08-15', projectCode:'P-1001' },
    { title:'Asbestos survey',       status:'done',        due:'2025-07-25', projectCode:'P-1004' },
    { title:'Joinery shop drawings', status:'in_progress', due:'2025-09-01', projectCode:'P-1006' },
    { title:'Fire stopping audit',   status:'overdue',     due:'2025-08-20', projectCode:'P-1003' },
  ];

  // Convert string date to ISO
  const iso = (d) => new Date(d).toISOString();

  // 1. Wipe any existing demo data
  const projectCodes = DEMO_PROJECTS.map(p => p.code);
  const clientNames  = DEMO_CLIENTS.map(c => c.name);

  // Delete tasks whose project code matches our demo set
  const existingProjects = await prisma.project.findMany({
    where: { code: { in: projectCodes } },
    select: { id: true }
  });
  const idsToDelete = existingProjects.map(p => p.id);
  if (idsToDelete.length) {
    await prisma.task.deleteMany({ where: { projectId: { in: idsToDelete } } });
  }
  await prisma.project.deleteMany({ where: { code: { in: projectCodes } } });
  await prisma.client.deleteMany({ where: { name: { in: clientNames } } });

  // 2. Insert clients (no tenantId on Client)
  const createdClients = {};
  for (const c of DEMO_CLIENTS) {
    const client = await prisma.client.create({
      data: {
        name: c.name,
        companyRegNo: c.companyRegNo,
        // add other fields (vatNo, address, etc.) if you want
      }
    });
    createdClients[c.name] = client;
  }

  // 3. Upsert projects by unique code, link to client via relation, set project.tenantId
  const createdProjects = {};
  for (const p of DEMO_PROJECTS) {
    const client = createdClients[p.clientName];
    const project = await prisma.project.upsert({
      where: { code: p.code },
      update: {
        name:    p.name,
        status:  p.status,
        type:    p.type,
        client:  { connect: { id: client.id } },
        tenantId: TENANT,
      },
      create: {
        code:    p.code,
        name:    p.name,
        status:  p.status,
        type:    p.type,
        client:  { connect: { id: client.id } },
        tenantId: TENANT,
      }
    });
    createdProjects[p.code] = project;
  }

  // 4. Create tasks linked by relation (task.project) and set task.tenantId
  for (const t of DEMO_TASKS) {
    const proj = createdProjects[t.projectCode];
    if (!proj) continue;
    await prisma.task.create({
      data: {
        project:  { connect: { id: proj.id } }, // This satisfies the required relation
        tenantId: TENANT,
        title:    t.title,
        status:   t.status,
        dueDate:  iso(t.due),
      }
    });
  }

  console.log('✅ Demo data seeded: tenants=', TENANT);
  const cc = await prisma.client.count({ where: { name: { in: clientNames } } });
  const pc = await prisma.project.count({ where: { code: { in: projectCodes } } });
  const tIds = Object.values(createdProjects).map(p => p.id);
  const tc = await prisma.task.count({ where: { projectId: { in: tIds } } });
  console.log(`clients: ${cc}, projects: ${pc}, tasks: ${tc}`);

  process.exit(0);
})().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
