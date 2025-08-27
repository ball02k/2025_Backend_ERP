/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  // Projects/Tasks use string tenant IDs; TaskStatus uses INT.
  const TENANT_STR = process.env.TENANT_DEFAULT || 'demo';  // for Project/Task
  const STATUS_TENANT_ID = Number(process.env.STATUS_TENANT_ID || 1); // for TaskStatus

  // ---- Demo fixtures ----
  const DEMO_CLIENTS = [
    { name: 'Acme Developments',  companyRegNo: '01234567' },
    { name: 'The Crown Estate',   companyRegNo: '00000000' },
    { name: 'Orbit Housing',      companyRegNo: '09876543' },
    { name: 'G4S Facilities',     companyRegNo: '06543210' },
    { name: 'Canary Wharf Group', companyRegNo: '11111111' },
  ];

  const DEMO_PROJECTS = [
    { code:'P-1001', name:'Canary Wharf Fit-out',   status:'Active',  type:'Fit-out',        clientName:'Canary Wharf Group' },
    { code:'P-1002', name:'NHS Clinic Refurb',      status:'Active',  type:'Healthcare',     clientName:'Acme Developments'  },
    { code:'P-1003', name:'Orbit Housing Block A',  status:'Active',  type:'Residential',    clientName:'Orbit Housing'      },
    { code:'P-1004', name:'Crown Estate Lobby',     status:'Pending', type:'Commercial',     clientName:'The Crown Estate'   },
    { code:'P-1005', name:'G4S HQ M&E',             status:'Active',  type:'Infrastructure', clientName:'G4S Facilities'     },
    { code:'P-1006', name:'School Sports Hall',     status:'Active',  type:'Education',      clientName:'Acme Developments'  },
  ];

  const DEMO_TASKS = [
    { title:'RIBA Stage 3 sign-off', status:'done',        due:'2025-08-01', projectCode:'P-1001' },
    { title:'Steel delivery',        status:'overdue',     due:'2025-08-10', projectCode:'P-1002' },
    { title:'M&E design review',     status:'in_progress', due:'2025-09-05', projectCode:'P-1005' },
    { title:'Planning condition 12', status:'in_progress', due:'2025-09-12', projectCode:'P-1003' },
    { title:'Glazing package award', status:'overdue',     due:'2025-08-15', projectCode:'P-1001' },
    { title:'Asbestos survey',       status:'done',        due:'2025-07-25', projectCode:'P-1004' },
    { title:'Joinery shop drawings', status:'in_progress', due:'2025-09-01', projectCode:'P-1006' },
    { title:'Fire stopping audit',   status:'overdue',     due:'2025-08-20', projectCode:'P-1003' },
  ];

  // Optional: give your statuses nice labels/colors
  const STATUS_META = {
    done:         { label: 'Done',         colorHex: '#10b981', sortOrder: 90,  isActive: true },
    overdue:      { label: 'Overdue',      colorHex: '#ef4444', sortOrder: 80,  isActive: true },
    in_progress:  { label: 'In Progress',  colorHex: '#3b82f6', sortOrder: 70,  isActive: true },
    open:         { label: 'Open',         colorHex: '#64748b', sortOrder: 60,  isActive: true },
  };

  const toISO = (d) => new Date(d).toISOString();

  // ---- 1) Clean previous demo data (only our demo entities) ----
  const projectCodes = DEMO_PROJECTS.map(p => p.code);
  const clientNames  = DEMO_CLIENTS.map(c => c.name);

  const existing = await prisma.project.findMany({
    where: { code: { in: projectCodes } },
    select: { id: true }
  });
  const projectIds = existing.map(p => p.id);

  if (projectIds.length) {
    await prisma.task.deleteMany({ where: { projectId: { in: projectIds } } });
  }
  await prisma.project.deleteMany({ where: { code: { in: projectCodes } } });
  await prisma.client.deleteMany({ where: { name: { in: clientNames } } });

  // ---- 2) Create clients (Client has no tenantId) ----
  const clientsByName = {};
  for (const c of DEMO_CLIENTS) {
    const created = await prisma.client.create({
      data: { name: c.name, companyRegNo: c.companyRegNo }
    });
    clientsByName[c.name] = created;
  }

  // ---- 3) Ensure TaskStatus rows exist (compound unique: tenantId + key) ----
  const neededKeys = Array.from(new Set(DEMO_TASKS.map(t => t.status)));
  const statusIds = {};
  for (let i = 0; i < neededKeys.length; i++) {
    const key = neededKeys[i];
    const meta = STATUS_META[key] || { label: key, colorHex: null, sortOrder: 50 + i * 5, isActive: true };
    const s = await prisma.taskStatus.upsert({
      where: { tenantId_key: { tenantId: STATUS_TENANT_ID, key } },
      update: {},
      create: {
        tenantId: STATUS_TENANT_ID,
        key,
        label: meta.label,
        colorHex: meta.colorHex,
        sortOrder: meta.sortOrder,
        isActive: meta.isActive,
      }
    });
    statusIds[key] = s.id;
  }

  // ---- 4) Upsert projects by unique `code` and set string tenantId ----
  const projectsByCode = {};
  for (const p of DEMO_PROJECTS) {
    const client = clientsByName[p.clientName];
    const project = await prisma.project.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        status: p.status,
        type: p.type,
        client: { connect: { id: client.id } },
        tenantId: TENANT_STR,
      },
      create: {
        code: p.code,
        name: p.name,
        status: p.status,
        type: p.type,
        client: { connect: { id: client.id } },
        tenantId: TENANT_STR,
      }
    });
    projectsByCode[p.code] = project;
  }

  // ---- 5) Create tasks: connect project, set string tenantId, set required statusId ----
  for (const t of DEMO_TASKS) {
    const proj = projectsByCode[t.projectCode];
    await prisma.task.create({
      data: {
        project:  { connect: { id: proj.id } }, // relation required
        tenantId: TENANT_STR,                    // Task.tenantId is String
        title:    t.title,
        status:   t.status,                      // keep string for quick filters in UI
        statusId: statusIds[t.status],           // satisfy required relation
        dueDate:  toISO(t.due),
      }
    });
  }

  // ---- Summary ----
  const cc = await prisma.client.count({ where: { name: { in: clientNames } } });
  const pc = await prisma.project.count({ where: { code: { in: projectCodes } } });
  const pids = Object.values(projectsByCode).map(p => p.id);
  const tc = await prisma.task.count({ where: { projectId: { in: pids } } });
  console.log('✅ Seed complete',
    '\n TENANT_STR (Project/Task)=', TENANT_STR,
    '\n STATUS_TENANT_ID (TaskStatus)=', STATUS_TENANT_ID,
    '\n Counts =>', { clients: cc, projects: pc, tasks: tc }
  );

  process.exit(0);
})().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
