/* eslint-disable no-console */
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

function getDmmfModels() {
  const dmmf = Prisma.dmmf;
  return dmmf?.datamodel?.models || [];
}
function findModelName(preferredNames = []) {
  const models = getDmmfModels();
  const byName = new Map(models.map(m => [m.name.toLowerCase(), m.name]));
  for (const n of preferredNames) {
    const hit = byName.get(n.toLowerCase());
    if (hit) return hit;
  }
  // fuzzy: first model that contains any token
  const tokens = preferredNames.map(s => s.toLowerCase());
  const fuzzy = models.find(m => tokens.some(t => m.name.toLowerCase().includes(t)));
  return fuzzy?.name;
}
function fields(modelName) {
  const m = getDmmfModels().find(x => x.name === modelName);
  if (!m) throw new Error('Model not found in Prisma DMMF: ' + modelName);
  const map = new Map(m.fields.map(f => [f.name, f]));
  return { model: m, map };
}
function hasField(modelName, field) {
  return fields(modelName).map.has(field);
}
function firstField(modelName, candidates) {
  const { map } = fields(modelName);
  return candidates.find(c => map.has(c)) || null;
}
function isRelation(modelName, field) {
  const { map } = fields(modelName);
  const f = map.get(field);
  return !!f && f.kind === 'object';
}
function pickScalars(modelName, obj) {
  const { map } = fields(modelName);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const fd = map.get(k);
    if (fd && fd.kind === 'scalar' && v !== undefined) out[k] = v;
  }
  return out;
}
function delegate(name) {
  // prisma.<delegate> is lowerCamelCase of model name in most cases
  const key = name.charAt(0).toLowerCase() + name.slice(1);
  if (typeof prisma[key]?.create === 'function') return prisma[key];
  // fallback: fully lowercase
  if (typeof prisma[name.toLowerCase()]?.create === 'function') return prisma[name.toLowerCase()];
  const keys = Object.keys(prisma).filter(k => typeof prisma[k]?.create === 'function');
  throw new Error(`No delegate for model ${name}. Available: ${keys.join(', ')}`);
}

(async () => {
  const tenant = process.env.TENANT_DEFAULT || 'demo';

  // 1) Resolve actual model names in your schema
  const Client  = findModelName(['Client','Clients','Customer','Customers','Company']);
  const Project = findModelName(['Project','Projects','Job','Jobs','Contract']);
  const Task    = findModelName(['Task','Tasks','Todo','Todos','Activity']);

  if (!Client || !Project || !Task) {
    throw new Error('Could not resolve model names. Run scripts/print-models.cjs and tell me the names it prints.');
  }

  const clientD   = delegate(Client);
  const projectD  = delegate(Project);
  const taskD     = delegate(Task);

  // 2) Detect field names we can use
  const clientReg   = firstField(Client,  ['companyRegNo','companyNumber','companyNo','company_no']);
  const clientTen   = firstField(Client,  ['tenantId','tenant','tenant_id']);
  const projectTen  = firstField(Project, ['tenantId','tenant','tenant_id']);
  const taskTen     = firstField(Task,    ['tenantId','tenant','tenant_id']);

  const projectClientId  = firstField(Project, ['clientId','client_id']);
  const projectClientRel = isRelation(Project, 'client') ? 'client' :
                           isRelation(Project, 'customer') ? 'customer' : null;

  const taskProjectId    = firstField(Task, ['projectId','project_id']);
  const taskProjectRel   = isRelation(Task, 'project') ? 'project' : null;

  const taskDue          = firstField(Task, ['dueDate','due_on','dueAt','due','deadline']);

  // 3) DEV wipe (scoped by tenant if tenant field exists)
  try { await taskD.deleteMany(taskTen ? { where: { [taskTen]: tenant } } : {}); } catch {}
  try { await projectD.deleteMany(projectTen ? { where: { [projectTen]: tenant } } : {}); } catch {}
  try { await clientD.deleteMany(clientTen ? { where: { [clientTen]: tenant } } : {}); } catch {}

  // 4) Create clients (only existing fields)
  const rawClients = [
    { name: 'Acme Developments',       reg: '01234567' },
    { name: 'The Crown Estate',         reg: '00000000' },
    { name: 'Orbit Housing',            reg: '09876543' },
    { name: 'G4S Facilities',           reg: '06543210' },
    { name: 'Canary Wharf Group',       reg: '11111111' },
  ];
  const clients = [];
  for (const c of rawClients) {
    const data = pickScalars(Client, {
      name: c.name,
      ...(clientReg ? { [clientReg]: c.reg } : {}),
      ...(clientTen ? { [clientTen]: tenant } : {}),
    });
    clients.push(await clientD.create({ data }));
  }
  const [acme, crown, orbit, g4s, canary] = clients;

  // 5) Create projects with client linkage
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
    const scalars = pickScalars(Project, {
      code: p.code, name: p.name, status: p.status, type: p.type,
      ...(projectTen ? { [projectTen]: tenant } : {}),
    });
    const data = { ...scalars };
    if (projectClientId) data[projectClientId] = p.client.id;
    else if (projectClientRel) data[projectClientRel] = { connect: { id: p.client.id } };
    projects.push(await projectD.create({ data }));
  }

  // 6) Create tasks with project linkage + due field if present
  const iso = d => new Date(d).toISOString();
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
  let tCount = 0;
  for (const t of rawTasks) {
    const scalars = pickScalars(Task, {
      title: t.title,
      status: t.status,
      ...(taskTen ? { [taskTen]: tenant } : {}),
      ...(taskDue ? { [taskDue]: iso(t.due) } : {}),
    });
    const data = { ...scalars };
    if (taskProjectId) data[taskProjectId] = t.project.id;
    else if (taskProjectRel) data[taskProjectRel] = { connect: { id: t.project.id } };
    await taskD.create({ data });
    tCount++;
  }

  // 7) Summary
  const pc = await projectD.count(projectTen ? { where: { [projectTen]: tenant } } : {});
  const tc = await taskD.count(taskTen ? { where: { [taskTen]: tenant } } : {});
  const cc = await clientD.count(clientTen ? { where: { [clientTen]: tenant } } : {});
  console.log('✅ Seeded OK · tenant =', tenant,
    '\nModels:', { Client, Project, Task },
    '\nFields used:',
    { clientReg, clientTen, projectTen, taskTen, projectClientId, projectClientRel, taskProjectId, taskProjectRel, taskDue },
    '\nCounts:', { clients: cc, projects: pc, tasks: tc }
  );
  process.exit(0);
})().catch(e => { console.error('Seed failed:', e); process.exit(1); });
