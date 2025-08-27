/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const tId = process.env.TENANT_DEFAULT || 'demo';

  // Wipe demo tenant data (dev only)
  try { await prisma.task.deleteMany({ where: { tenantId: tId } }); } catch {}
  try { await prisma.project.deleteMany({ where: { tenantId: tId } }); } catch {}
  try { await prisma.client.deleteMany({ where: { tenantId: tId } }); } catch {}

  // --- Clients (use schema-safe fields) ---
  const clients = await Promise.all([
    prisma.client.create({ data: { name: 'Acme Developments',       companyRegNo: '01234567', tenantId: tId } }),
    prisma.client.create({ data: { name: 'The Crown Estate',         companyRegNo: '00000000', tenantId: tId } }),
    prisma.client.create({ data: { name: 'Orbit Housing',            companyRegNo: '09876543', tenantId: tId } }),
    prisma.client.create({ data: { name: 'G4S Facilities',           companyRegNo: '06543210', tenantId: tId } }),
    prisma.client.create({ data: { name: 'Canary Wharf Group',       companyRegNo: '11111111', tenantId: tId } }),
  ]);
  const [acme, crown, orbit, g4s, canary] = clients;

  // --- Projects (only common, likely fields) ---
  const projects = await Promise.all([
    prisma.project.create({ data: { code:'P-1001', name:'Canary Wharf Fit-out',  status:'Active',   type:'Fit-out',        clientId: canary.id, tenantId: tId } }),
    prisma.project.create({ data: { code:'P-1002', name:'NHS Clinic Refurb',     status:'Active',   type:'Healthcare',     clientId: acme.id,   tenantId: tId } }),
    prisma.project.create({ data: { code:'P-1003', name:'Orbit Housing Block A', status:'Active',   type:'Residential',    clientId: orbit.id,  tenantId: tId } }),
    prisma.project.create({ data: { code:'P-1004', name:'Crown Estate Lobby',    status:'Pending',  type:'Commercial',     clientId: crown.id,  tenantId: tId } }),
    prisma.project.create({ data: { code:'P-1005', name:'G4S HQ M&E',            status:'Active',   type:'Infrastructure', clientId: g4s.id,    tenantId: tId } }),
    prisma.project.create({ data: { code:'P-1006', name:'School Sports Hall',    status:'Active',   type:'Education',      clientId: acme.id,   tenantId: tId } }),
  ]);

  // Helper for ISO dates
  const iso = (d) => new Date(d).toISOString();

  // --- Tasks (safe fields: title/status/dueDate/projectId/tenantId) ---
  const tasks = [
    { title:'RIBA Stage 3 sign-off', status:'done',         dueDate: iso('2025-08-01'), projectId: projects[0].id },
    { title:'Steel delivery',        status:'overdue',      dueDate: iso('2025-08-10'), projectId: projects[1].id },
    { title:'M&E design review',     status:'in_progress',  dueDate: iso('2025-09-05'), projectId: projects[4].id },
    { title:'Planning condition 12', status:'in_progress',  dueDate: iso('2025-09-12'), projectId: projects[2].id },
    { title:'Glazing package award', status:'overdue',      dueDate: iso('2025-08-15'), projectId: projects[0].id },
    { title:'Asbestos survey',       status:'done',         dueDate: iso('2025-07-25'), projectId: projects[3].id },
    { title:'Joinery shop drawings', status:'in_progress',  dueDate: iso('2025-09-01'), projectId: projects[5].id },
    { title:'Fire stopping audit',   status:'overdue',      dueDate: iso('2025-08-20'), projectId: projects[2].id },
  ];
  for (const t of tasks) {
    await prisma.task.create({ data: { ...t, tenantId: tId } });
  }

  // Summary
  const pc = await prisma.project.count({ where: { tenantId: tId } });
  const tc = await prisma.task.count({ where: { tenantId: tId } });
  const cc = await prisma.client.count({ where: { tenantId: tId } });
  console.log(`✅ Seeded tenant=${tId} · clients=${cc} projects=${pc} tasks=${tc}`);
  process.exit(0);
})().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
