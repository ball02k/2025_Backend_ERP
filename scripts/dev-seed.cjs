/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const TENANT = process.env.TENANT_DEFAULT || 'demo';

  const DEMO_CLIENTS = [
    { name: 'Acme Developments',  companyRegNo: '01234567' },
    { name: 'The Crown Estate',    companyRegNo: '00000000' },
    { name: 'Orbit Housing',       companyRegNo: '09876543' },
    { name: 'G4S Facilities',      companyRegNo: '06543210' },
    { name: 'Canary Wharf Group',  companyRegNo: '11111111' },
  ];

  const DEMO_PROJECTS = [
    { code:'P-1001', name:'Canary Wharf Fit‑out',   status:'Active',  type:'Fit‑out',        clientName:'Canary Wharf Group' },
    { code:'P-1002', name:'NHS Clinic Refurb',      status:'Active',  type:'Healthcare',     clientName:'Acme Developments'  },
    { code:'P-1003', name:'Orbit Housing Block A',  status:'Active',  type:'Residential',    clientName:'Orbit Housing'      },
    { code:'P-1004', name:'Crown Estate Lobby',     status:'Pending', type:'Commercial',     clientName:'The Crown Estate'   },
    { code:'P-1005', name:'G4S HQ M&E',             status:'Active',  type:'Infrastructure', clientName:'G4S Facilities'     },
    { code:'P-1006', name:'School Sports Hall',     status:'Active',  type:'Education',      clientName:'Acme Developments'  },
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

  const iso = (d) => new Date(d).toISOString();

  // 1. Remove existing demo data (by codes/names)
  const projectCodes = DEMO_PROJECTS.map(p => p.code);
  const clientNames  = DEMO_CLIENTS.map(c => c.name);

  const existingProjects = await prisma.project.findMany({
    where: { code: { in: projectCodes } },
    select: { id: true }
  });
  const ids = existingProjects.map(p => p.id);
  if (ids.length) await prisma.task.deleteMany({ where: { projectId: { in: ids } } });
  await prisma.project.deleteMany({ where: { code: { in: projectCodes } } });
  await prisma.client.deleteMany({ where: { name: { in: clientNames } } });

  // 2. Create clients
  const createdClients = {};
  for (const c of DEMO_CLIENTS) {
    const client = await prisma.client.create({
      data: { name: c.name, companyRegNo: c.companyRegNo }
    });
    createdClients[c.name] = client;
  }

  // 3. Create/lookup task statuses and store their ids
  const uniqueStatuses = [...new Set(DEMO_TASKS.map(t => t.status))];
  const statusIds = {};
  for (const st of uniqueStatuses) {
    const s = await prisma.taskStatus.upsert({
      where: { key: st },
      update: {},
      create: { key: st, label: st }
    });
    statusIds[st] = s.id;
  }

  // 4. Upsert projects by code and assign tenantId
  const createdProjects = {};
  for (const p of DEMO_PROJECTS) {
    const client = createdClients[p.clientName];
    const project = await prisma.project.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        status: p.status,
        type: p.type,
        client: { connect: { id: client.id } },
        tenantId: TENANT,
      },
      create: {
        code: p.code,
        name: p.name,
        status: p.status,
        type: p.type,
        client: { connect: { id: client.id } },
        tenantId: TENANT,
      }
    });
    createdProjects[p.code] = project;
  }

  // 5. Create tasks with statusId and relation to project
  for (const t of DEMO_TASKS) {
    const proj = createdProjects[t.projectCode];
    await prisma.task.create({
      data: {
        project: { connect: { id: proj.id } },
        tenantId: TENANT,
        title: t.title,
        status: t.status,
        statusId: statusIds[t.status],
        dueDate: iso(t.due),
      }
    });
  }

  console.log('✅ Seed complete');
})();
