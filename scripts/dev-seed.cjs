/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const TENANT = process.env.TENANT_DEFAULT || 'demo';
  const STATUS_TENANT_ID = 1; // integer for status tables

  // Demo values
  const DEMO_CLIENTS = [
    { name:'Acme Developments', companyRegNo:'01234567' },
    { name:'Crown Estate', companyRegNo:'00000000' },
    { name:'Orbit Housing', companyRegNo:'09876543' },
  ];
  const DEMO_PROJECTS = [
    { code:'P-001', name:'Acme Tower', status:'Active', type:'Commercial', clientName:'Acme Developments' },
    { code:'P-002', name:'Orbit Block A', status:'Active', type:'Residential', clientName:'Orbit Housing' },
    { code:'P-003', name:'Crown Lobby', status:'Pending', type:'Fit-out', clientName:'Crown Estate' },
  ];
  const DEMO_TASKS = [
    { title:'Site survey', status:'in_progress', due:'2025-09-01', projectCode:'P-001' },
    { title:'Steel delivery', status:'overdue', due:'2025-08-15', projectCode:'P-002' },
    { title:'Planning consent', status:'done', due:'2025-07-30', projectCode:'P-003' },
  ];

  // Clean up demo
  const codes = DEMO_PROJECTS.map(p => p.code);
  const names = DEMO_CLIENTS.map(c => c.name);
  const existing = await prisma.project.findMany({ where: { code: { in: codes } }, select:{ id:true }});
  const ids = existing.map(p => p.id);
  if (ids.length) await prisma.task.deleteMany({ where:{ projectId:{ in: ids } }});
  await prisma.project.deleteMany({ where:{ code:{ in: codes } }});
  await prisma.client.deleteMany({ where:{ name:{ in: names } }});

  // Upsert statuses and types (compound unique on tenantId+key)
  const statusKeys = ['done','overdue','in_progress'];
  const projectStatuses = ['Active','Pending'];
  const projectTypes = ['Commercial','Residential','Fit-out'];
  for (const key of statusKeys) {
    await prisma.taskStatus.upsert({
      where: { tenantId_key: { tenantId: STATUS_TENANT_ID, key } },
      update: {},
      create: { tenantId: STATUS_TENANT_ID, key, label: key, isActive:true },
    });
  }
  for (const key of projectStatuses) {
    await prisma.projectStatus.upsert({
      where: { tenantId_key: { tenantId: STATUS_TENANT_ID, key } },
      update: {},
      create: { tenantId: STATUS_TENANT_ID, key, label: key, isActive:true },
    });
  }
  for (const key of projectTypes) {
    await prisma.projectType.upsert({
      where: { tenantId_key: { tenantId: STATUS_TENANT_ID, key } },
      update: {},
      create: { tenantId: STATUS_TENANT_ID, key, label: key, isActive:true },
    });
  }

  // Create clients
  const clientMap = {};
  for (const c of DEMO_CLIENTS) {
    const created = await prisma.client.create({
      data:{ name:c.name, companyRegNo:c.companyRegNo }
    });
    clientMap[c.name] = created;
  }

  // Create projects with status/type by simple strings and tenantId
  const projectMap = {};
  for (const p of DEMO_PROJECTS) {
    const client = clientMap[p.clientName];
    const project = await prisma.project.create({
      data:{
        code:p.code,
        name:p.name,
        status:p.status,
        type:p.type,
        client:{ connect:{ id: client.id } },
        tenantId:TENANT
      }
    });
    projectMap[p.code] = project;
  }

  // Create tasks with relation to statusRel and project
  for (const t of DEMO_TASKS) {
    const proj = projectMap[t.projectCode];
    await prisma.task.create({
      data:{
        project:{ connect:{ id: proj.id } },
        tenantId:TENANT,
        title:t.title,
        status:t.status,
        dueDate:new Date(t.due).toISOString(),
        statusRel:{ connect:{ tenantId_key:{ tenantId: STATUS_TENANT_ID, key: t.status } } }
      }
    });
  }

  // Example variation and document for demonstration
  const var1 = await prisma.variation.create({
    data:{
      project:{ connect:{ id: projectMap['P-001'].id } },
      tenantId:TENANT,
      referenceCode:'VAR001',
      title:'Change fire doors',
      type:'Change',
      status:'Draft',
      estimated_cost:20000,
      estimated_sell:25000
    }
  });
  await prisma.document.create({
    data:{
      fileName:'spec.pdf',
      storageKey:'uploads/spec.pdf',
      storageProvider:'local',
      size:50000n,
      contentType:'application/pdf',
      uploadedBy:'System'
    }
  });

  console.log('Seed complete');
  process.exit(0);
})().catch((e) => { console.error('Seed error', e); process.exit(1); });
