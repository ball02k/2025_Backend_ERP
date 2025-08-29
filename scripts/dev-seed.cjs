/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { cascadeDeleteProjects } = require('./dev-utils/cascade.cjs');

(async () => {
  const TENANT = process.env.DEMO_TENANT_ID || process.env.TENANT_DEFAULT || 'demo';
  const devEmail = process.env.DEMO_USER_EMAIL || 'admin@demo.local';
  const devPassword = process.env.DEMO_USER_PASSWORD || 'demo1234';
  const crypto = require('crypto');
  const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
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

  // --- SAFER CLEANUP START ---
  const codes = DEMO_PROJECTS.map(p => p.code);
  const existing = await prisma.project.findMany({
    where: { code: { in: codes }, tenantId: TENANT },
    select: { id: true },
  });
  const projectIds = existing.map(p => p.id);
  if (projectIds.length) {
    console.log(`Cleaning existing demo projects: ${projectIds.join(', ')}`);
    await cascadeDeleteProjects(prisma, TENANT, projectIds);
  }
  // Also clean demo clients by name (will fail if referenced; order below will recreate)
  await prisma.client.deleteMany({ where: { name: { in: DEMO_CLIENTS.map(c => c.name) } } });
  // --- SAFER CLEANUP END ---

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

  // Ensure admin role and demo user exist (with hashed password)
  const devUser = await prisma.user.upsert({
    where: { email: devEmail },
    update: { tenantId: TENANT, name: 'Demo Admin', passwordSHA: sha256(devPassword) },
    create: { email: devEmail, name: 'Demo Admin', tenantId: TENANT, passwordSHA: sha256(devPassword) },
  });
  const adminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TENANT, name: 'admin' } },
    update: {},
    create: { tenantId: TENANT, name: 'admin' },
  });
  await prisma.userRole.upsert({
    where: { tenantId_userId_roleId: { tenantId: TENANT, userId: devUser.id, roleId: adminRole.id } },
    update: {},
    create: { tenantId: TENANT, userId: devUser.id, roleId: adminRole.id },
  });

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

  // Add memberships for dev user to all demo projects
  for (const proj of Object.values(projectMap)) {
    await prisma.projectMembership.upsert({
      where: { tenantId_projectId_userId: { tenantId: TENANT, projectId: proj.id, userId: devUser.id } },
      update: { role: 'Member' },
      create: { tenantId: TENANT, projectId: proj.id, userId: devUser.id, role: 'Member' },
    });
  }

  // Ensure demo membership for project id 1 (useful for quick /projects/1 checks)
  const p1 = await prisma.project.findFirst({ where: { id: 1 } });
  if (p1) {
    await prisma.projectMembership.upsert({
      where: { tenantId_projectId_userId: { tenantId: TENANT, projectId: p1.id, userId: devUser.id } },
      update: { role: 'owner' },
      create: { tenantId: TENANT, projectId: p1.id, userId: devUser.id, role: 'owner' },
    });
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

  // Example variation and document for demonstration (new schema)
  const var1 = await prisma.variation.create({
    data:{
      project:{ connect:{ id: projectMap['P-001'].id } },
      tenantId:TENANT,
      reference:'CE-101',
      title:'Change fire doors',
      contractType:'NEC4',
      type:'compensation_event',
      status:'proposed',
      reason:'Client instruction',
      submissionDate: new Date().toISOString(),
      value: 25000,
      costImpact: 20000,
      timeImpactDays: 3,
      notes: 'Seeded example',
      lines: {
        create: [
          { tenantId: TENANT, description: 'Replace doors set A', qty: 10.0, rate: 1000.0, value: 10000.0, sort: 1 },
          { tenantId: TENANT, description: 'Adjust frames', qty: 1.0, rate: 15000.0, value: 15000.0, sort: 2 }
        ]
      }
    }
  });

  // Budget, commitments, actual costs, forecast for variety
  await prisma.budgetLine.createMany({
    data: [
      { tenantId: TENANT, projectId: projectMap['P-001'].id, code: 'A100', category: 'Civils', description: 'Foundations', amount: 100000 },
      { tenantId: TENANT, projectId: projectMap['P-001'].id, code: 'B200', category: 'MEP', description: 'Electrical', amount: 80000 }
    ]
  });
  await prisma.commitment.create({ data: { tenantId: TENANT, projectId: projectMap['P-001'].id, ref: 'PO-COM-1', supplier: 'SteelCo', description: 'Structural steel', amount: 50000, status: 'Open' } });
  await prisma.actualCost.create({ data: { tenantId: TENANT, projectId: projectMap['P-001'].id, ref: 'INV-001', supplier: 'SteelCo', description: 'Steel delivery 1', amount: 20000 } });
  await prisma.forecast.create({ data: { tenantId: TENANT, projectId: projectMap['P-001'].id, period: '2025-09', description: 'Baseline forecast', amount: 150000 } });

  // Procurement: PO with lines and a delivery
  const po = await prisma.purchaseOrder.create({
    data: {
      tenantId: TENANT,
      projectId: projectMap['P-001'].id,
      code: `PO-${Date.now()}`,
      supplier: 'Doors Ltd',
      status: 'Open',
      orderDate: new Date(),
      total: 12500,
      lines: { create: [{ tenantId: TENANT, item: 'Fire doors', qty: 10, unit: 'ea', unitCost: 1250, lineTotal: 12500 }] }
    }
  });
  await prisma.delivery.create({ data: { tenantId: TENANT, poId: po.id, expectedAt: new Date(Date.now() + 3*24*3600*1000), note: 'Awaiting supplier confirmation' } });
  await prisma.document.create({
    data:{
      tenantId: TENANT,
      filename:'spec.pdf',
      storageKey:'uploads/spec.pdf',
      size:50000,
      mimeType:'application/pdf',
      uploadedById:'system'
    }
  });

  console.log('Seed complete');
  process.exit(0);
})().catch((e) => { console.error('Seed error', e); process.exit(1); });
