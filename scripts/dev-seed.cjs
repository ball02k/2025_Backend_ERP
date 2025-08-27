/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// --- helpers: introspect schema and adapt writes ---
function getModel(name) {
  // Prisma exposes an internal DMMF we can read safely for seeds
  const m = prisma?._dmmf?.datamodel?.models?.find(m => m.name === name);
  if (!m) throw new Error('Model not found in Prisma DMMF: ' + name);
  return m;
}
function fieldsOf(model) {
  return new Map(model.fields.map(f => [f.name, f]));
}
function hasField(model, name) {
  return fieldsOf(model).has(name);
}
function firstExistingField(model, candidates = []) {
  const f = fieldsOf(model);
  return candidates.find(c => f.has(c));
}
function isRelationField(model, name) {
  const f = fieldsOf(model).get(name);
  return !!f && f.kind === 'object';
}
function scalarPick(model, data) {
  const f = fieldsOf(model);
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    const fd = f.get(k);
    if (fd && fd.kind === 'scalar') out[k] = v;
  }
  return out;
}
async function safeDeleteMany(modelName, whereByTenant) {
  try { await prisma[modelName.toLowerCase()].deleteMany(whereByTenant); }
  catch { try { await prisma[modelName.toLowerCase()].deleteMany(); } catch {} }
}

(async () => {
  const tId = process.env.TENANT_DEFAULT || 'demo';

  const ClientM  = getModel('Client');
  const ProjectM = getModel('Project');
  const TaskM    = getModel('Task');

  // Figure out common field names per model
  const clientRegField   = firstExistingField(ClientM,  ['companyRegNo','companyNumber','company_no','companyNo']);
  const clientTenantFld  = hasField(ClientM,  'tenantId')  ? 'tenantId'  : null;
  const projectTenantFld = hasField(ProjectM,'tenantId')   ? 'tenantId'  : null;
  const taskTenantFld    = hasField(TaskM,   'tenantId')   ? 'tenantId'  : null;

  const projectClientId  = hasField(ProjectM, 'clientId') ? 'clientId' : null;
  const projectClientRel = isRelationField(ProjectM, 'client') ? 'client' : null;

  const taskProjectId    = hasField(TaskM, 'projectId') ? 'projectId' : null;
  const taskProjectRel   = isRelationField(TaskM, 'project') ? 'project' : null;

  const taskDueField     = firstExistingField(TaskM, ['dueDate','due_on','due','dueAt']); // choose what exists

  // --- DEV wipe (scoped by tenant if supported) ---
  await safeDeleteMany('Task',    taskTenantFld    ? { where: { [taskTenantFld]: tId } } : {});
  await safeDeleteMany('Project', projectTenantFld ? { where: { [projectTenantFld]: tId } } : {});
  await safeDeleteMany('Client',  clientTenantFld  ? { where: { [clientTenantFld]: tId } } : {});

  // --- Clients (only fields that exist) ---
  const rawClients = [
    { name: 'Acme Developments',       reg: '01234567' },
    { name: 'The Crown Estate',         reg: '00000000' },
    { name: 'Orbit Housing',            reg: '09876543' },
    { name: 'G4S Facilities',           reg: '06543210' },
    { name: 'Canary Wharf Group',       reg: '11111111' },
  ];

  const clients = [];
  for (const c of rawClients) {
    const base = { name: c.name };
    if (clientRegField) base[clientRegField] = c.reg;
    if (clientTenantFld) base[clientTenantFld] = tId;

    const created = await prisma.client.create({ data: scalarPick(ClientM, base) });
    clients.push(created);
  }

  const [acme, crown, orbit, g4s, canary] = clients;

  // --- Projects (robust linking to client) ---
  const rawProjects = [
    { code:'P-1001', name:'Canary Wharf Fit-out',  status:'Active',  type:'Fit-out',        client: canary },
    { code:'P-1002', name:'NHS Clinic Refurb',     status:'Active',  type:'Healthcare',     client: acme   },
    { code:'P-1003', name:'Orbit Housing Block A', status:'Active',  type:'Residential',    client: orbit  },
    { code:'P-1004', name:'Crown Estate Lobby',    status:'Pending', type:'Commercial',     client: crown  },
    { code:'P-1005', name:'G4S HQ M&E',            status:'Active',  type:'Infrastructure', client: g4s    },
    { code:'P-1006', name:'School Sports Hall',    status:'Active',  type:'Education',      client: acme   },
  ];

  const projects = [];
  for (const p of rawProjects) {
    const scalars = scalarPick(ProjectM, {
      code: p.code, name: p.name, status: p.status, type: p.type,
      ...(projectTenantFld ? { [projectTenantFld]: tId } : {})
    });

    // relation linkage
    const data = { ...scalars };
    if (projectClientId) {
      data[projectClientId] = p.client.id;
    } else if (projectClientRel) {
      data[projectClientRel] = { connect: { id: p.client.id } };
    }

    const created = await prisma.project.create({ data });
    projects.push(created);
  }

  // --- Tasks (robust linking to project; adaptive due field) ---
  const iso = (d) => new Date(d).toISOString();
  const rawTasks = [
    { title:'RIBA Stage 3 sign-off', status:'done',         due: '2025-08-01', project: projects[0] },
    { title:'Steel delivery',        status:'overdue',      due: '2025-08-10', project: projects[1] },
    { title:'M&E design review',     status:'in_progress',  due: '2025-09-05', project: projects[4] },
    { title:'Planning condition 12', status:'in_progress',  due: '2025-09-12', project: projects[2] },
    { title:'Glazing package award', status:'overdue',      due: '2025-08-15', project: projects[0] },
    { title:'Asbestos survey',       status:'done',         due: '2025-07-25', project: projects[3] },
    { title:'Joinery shop drawings', status:'in_progress',  due: '2025-09-01', project: projects[5] },
    { title:'Fire stopping audit',   status:'overdue',      due: '2025-08-20', project: projects[2] },
  ];

  let taskCount = 0;
  for (const t of rawTasks) {
    const scalars = scalarPick(TaskM, {
      title: t.title,
      status: t.status,
      ...(taskTenantFld ? { [taskTenantFld]: tId } : {}),
      ...(taskDueField ? { [taskDueField]: iso(t.due) } : {}),
    });

    const data = { ...scalars };
    if (taskProjectId) {
      data[taskProjectId] = t.project.id;
    } else if (taskProjectRel) {
      data[taskProjectRel] = { connect: { id: t.project.id } };
    }

    await prisma.task.create({ data });
    taskCount++;
  }

  // Summary
  const pc = await prisma.project.count({ where: projectTenantFld ? { [projectTenantFld]: tId } : {} });
  const tc = await prisma.task.count({ where: taskTenantFld ? { [taskTenantFld]: tId } : {} });
  const cc = await prisma.client.count({ where: clientTenantFld ? { [clientTenantFld]: tId } : {} });

  console.log('✅ Seeded:',
    `tenant=${tId}`,
    `clients=${cc}`,
    `projects=${pc}`,
    `tasks=${tc}`,
    '\nFields used =>',
    'Client:', { regField: clientRegField, tenantField: clientTenantFld },
    'Project:', { clientId: projectClientId, clientRel: projectClientRel, tenantField: projectTenantFld },
    'Task:', { projectId: taskProjectId, projectRel: taskProjectRel, dueField: taskDueField, tenantField: taskTenantFld }
  );

  process.exit(0);
})().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
