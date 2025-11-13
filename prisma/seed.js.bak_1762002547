/* eslint-disable no-console */
/**
 * Construction ERP — Dev seed to populate enough data so all FE project tabs render.
 * Safe for mixed schemas: every optional module is try/catch guarded.
 * Assumptions:
 *  - JWT users already exist or will be created here.
 *  - BigInt document IDs are stored as BigInt in DB.
 *  - No Prisma enums; strings only.
 *  - Tenant scoping required; using tenantId='demo' for seed.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function upsertUserByEmail(email, name, tenantId, role='admin') {
  // If your User model uses unique(email, tenantId) adjust accordingly
  let user = await prisma.user.findFirst({ where: { email, tenantId } }).catch(()=>null);
  if (!user) {
    user = await prisma.user.create({
      data: { email, name, role, tenantId }
    });
  } else if (user.role !== role) {
    user = await prisma.user.update({ where: { id: user.id }, data: { role } });
  }
  return user;
}

async function ensureProjectMembership(projectId, userId, tenantId, role='PM') {
  try {
    const exists = await prisma.projectMembership.findFirst({
      where: { tenantId, projectId: Number(projectId), userId: Number(userId) }
    });
    if (!exists) {
      await prisma.projectMembership.create({
        data: { tenantId, projectId: Number(projectId), userId: Number(userId), role }
      });
    }
  } catch { /* ProjectMembership may not exist in your schema */ }
}

function addDays(d, n) { const t = new Date(d); t.setUTCDate(t.getUTCDate()+n); return t; }

async function main() {
  const tenantId = 'demo';

  // 1) Admin user (so FE can see everything)
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'you@example.com';
  const admin = await upsertUserByEmail(adminEmail, 'You (Admin)', tenantId, 'admin');

  // 2) Project
  let project = await prisma.project.findFirst({ where: { tenantId, code: 'PRJ-001' } }).catch(()=>null);
  if (!project) {
    project = await prisma.project.create({
      data: {
        tenantId,
        name: 'A12 Junction Upgrade',
        code: 'PRJ-001',
        status: 'Active',
        sector: 'Highways',
      }
    });
  }
  await ensureProjectMembership(project.id, admin.id, tenantId, 'PM');

  // 3) Packages (3+ rows across statuses)
  const pkgDefs = [
    { code:'CIV-01', name:'Earthworks', category:'Civils', speculativeBudget: 500000, approvedBudget: 480000, committed: 300000, actual: 120000, status:'Awarded', capabilityTags: ['Civils'] },
    { code:'ELE-01', name:'Electrical', category:'M&E', speculativeBudget: 200000, approvedBudget: 220000, committed: 0, actual: 0, status:'Tendering', capabilityTags: ['M&E'], leadTimeDays: 30 },
    { code:'STR-01', name:'Bridge steelwork', category:'Structures', speculativeBudget: 750000, approvedBudget: 700000, committed: 0, actual: 0, status:'Planned', capabilityTags: ['Structures'] },
  ];
  const packages = [];
  for (const def of pkgDefs) {
    const existing = await prisma.package.findFirst({ where: { tenantId, projectId: project.id, code: def.code } }).catch(()=>null);
    const data = { tenantId, projectId: project.id, ...def };
    packages.push(existing ? await prisma.package.update({ where: { id: existing.id }, data }) : await prisma.package.create({ data }));
  }
  const earthworks = packages.find(p=>p.code==='CIV-01');
  const electrical = packages.find(p=>p.code==='ELE-01');

  // 4) RFx (linked to Earthworks) + invites + status Awarded
  let rfx = await prisma.rFx.findFirst({ where: { tenantId, projectId: project.id, packageId: earthworks?.id } }).catch(()=>null);
  if (!rfx && earthworks) {
    rfx = await prisma.rFx.create({
      data: {
        tenantId, projectId: project.id, packageId: earthworks.id,
        title: `RFx: ${earthworks.code} ${earthworks.name}`,
        status: 'Awarded',
        issuedAt: addDays(new Date(), -20),
        awardedAt: addDays(new Date(), -10),
        weightingPrice: 60,
        weightingTech: 40,
      }
    });
    // Prefill one item
    await prisma.rFxItem.create({
      data: { tenantId, rfxId: rfx.id, description: `Scope per package ${earthworks.code}`, qty: 1, unit: 'lot', specRef: earthworks.category }
    }).catch(()=>{});
  }
  // Two invites (one awarded)
  if (rfx) {
    const invites = [
      { supplierId: 101, status:'Awarded', priceTotal: 300000, techScore: 75, carbonScore: 60, leadTimeDays: 14 },
      { supplierId: 102, status:'NotAwarded', priceTotal: 315000, techScore: 80, carbonScore: 55, leadTimeDays: 21 },
    ];
    for (const inv of invites) {
      try {
        const exists = await prisma.rFxInvite.findFirst({ where: { tenantId, rfxId: rfx.id, supplierId: inv.supplierId } });
        if (!exists) {
          await prisma.rFxInvite.create({ data: { tenantId, rfxId: rfx.id, sentAt: addDays(new Date(), -22), respondedAt: addDays(new Date(), -11), ...inv } });
        } else {
          await prisma.rFxInvite.update({ where: { id: exists.id }, data: inv });
        }
      } catch {}
    }
  }

  // 5) Purchase Order from award (only if model exists in schema)
  try {
    if (rfx && earthworks) {
      const existingPO = await prisma.purchaseOrder.findFirst({ where: { tenantId, projectId: project.id, ref: `PO-${rfx.id}` } });
      if (!existingPO) {
        await prisma.purchaseOrder.create({
          data: {
            tenantId,
            projectId: project.id,
            packageId: earthworks.id,
            supplierId: 101,
            ref: `PO-${rfx.id}`,
            total: 300000,
            committed: 300000,
            status: 'Approved',
            orderedAt: addDays(new Date(), -10),
          }
        });
      }
    }
  } catch {
    console.log('• PurchaseOrder model not present — skipping PO seed.');
  }

  // 6) CVR — current period + 1 entry for Earthworks
  const now = new Date();
  const periodMonth = now.getUTCMonth() + 1;
  const periodYear = now.getUTCFullYear();
  let period = await prisma.cVRPeriod.findFirst({ where: { tenantId, projectId: project.id, periodMonth, periodYear } }).catch(()=>null);
  if (!period) {
    period = await prisma.cVRPeriod.create({ data: { tenantId, projectId: project.id, periodMonth, periodYear, locked: false } });
  }
  if (earthworks && period) {
    const code = `PKG:${earthworks.code}`;
    const entry = await prisma.cVREntry.findFirst({ where: { tenantId, projectId: project.id, periodId: period.id, code } }).catch(()=>null);
    const payload = {
      tenantId,
      projectId: project.id,
      periodId: period.id,
      code,
      name: earthworks.name,
      value: 350000,
      committed: 300000,
      actual: 120000,
      prelims: 10000,
      retentions: 5000,
      risk: 8000,
      source: 'AWARD',
    };
    if (!entry) await prisma.cVREntry.create({ data: payload });
    else await prisma.cVREntry.update({ where: { id: entry.id }, data: payload });
  }

  // 7) Programme tasks (one late, one in progress; plus procurement lane)
  try {
    await prisma.programmeTask.createMany({
      data: [
        { tenantId, projectId: project.id, name: 'Tender: Electrical', type:'PROCUREMENT', start: addDays(now,-10), end: addDays(now,-2), status:'NOT_STARTED', packageId: electrical?.id || null, critical: true },
        { tenantId, projectId: project.id, name: 'Delivery: Earthworks', type:'DELIVERY', start: addDays(now,-1), end: addDays(now,20), status:'IN_PROGRESS', packageId: earthworks?.id || null, critical: false },
        { tenantId, projectId: project.id, name: 'Milestone: Practical Completion', type:'MILESTONE', start: addDays(now,90), end: addDays(now,90), status:'NOT_STARTED', packageId: null, critical: true },
      ]
    });
  } catch {
    console.log('• ProgrammeTask model not present — skipping programme seed.');
  }

  // 8) Documents: groups and one file link (BigInt documentId)
  try {
    const groups = ['Contracts','H&S','Design/Drawings','Commercial'];
    const made = [];
    for (let i=0;i<groups.length;i++) {
      const name = groups[i];
      let g = await prisma.projectDocumentGroup.findFirst({ where: { tenantId, projectId: project.id, name } });
      if (!g) g = await prisma.projectDocumentGroup.create({ data: { tenantId, projectId: project.id, name, orderIdx: i+1 } });
      made.push(g);
    }
    const contracts = made.find(g=>g.name==='Contracts');
    if (contracts) {
      const exists = await prisma.projectDocument.findFirst({ where: { tenantId, projectId: project.id, groupId: contracts.id, name: 'Subcontract_Earthworks.pdf' } });
      if (!exists) {
        await prisma.projectDocument.create({
          data: {
            tenantId,
            projectId: project.id,
            groupId: contracts.id,
            documentId: BigInt('1755182809400'),
            name: 'Subcontract_Earthworks.pdf',
            sizeBytes: BigInt(1024*150),
            version: 1,
            uploadedBy: admin.id,
          }
        });
      }
    }
  } catch {
    console.log('• ProjectDocumentGroup/ProjectDocument not present — skipping doc seed.');
  }

  // 9) Optional light rows: H&S, Quality, Carbon, Risks (if models exist)
  try {
    await prisma.hs?.createMany?.({
      data: [
        { tenantId, projectId: project.id, type: 'RAMS', title: 'Earthworks RAMS', status: 'Submitted', dueAt: addDays(now, 7) },
        { tenantId, projectId: project.id, type: 'Permit', title: 'Hot Works Permit', status: 'Approved', dueAt: addDays(now, 30) },
      ]
    });
  } catch {}
  try {
    await prisma.quality?.createMany?.({
      data: [
        { tenantId, projectId: project.id, type: 'ITP', title: 'ITP – Earthworks', status: 'Approved' },
        { tenantId, projectId: project.id, type: 'NCR', title: 'NCR-0001 – Rebar spacing', status: 'Open' },
      ]
    });
  } catch {}
  try {
    await prisma.carbon?.createMany?.({
      data: [
        { tenantId, projectId: project.id, scope: 'Scope 1', tco2e: 8.4, source: 'Plant fuel – week 32' },
        { tenantId, projectId: project.id, scope: 'Scope 3', tco2e: 3.1, source: 'Steel delivery' },
      ]
    });
  } catch {}
  try {
    await prisma.risks?.createMany?.({
      data: [
        { tenantId, projectId: project.id, title: 'Supply chain delay – Electrical switchgear', probability: 'High', impact: 'Medium', ownerId: admin.id },
        { tenantId, projectId: project.id, title: 'Design change – parapet details', probability: 'Medium', impact: 'High', ownerId: admin.id },
      ]
    });
  } catch {}

  // 10) Delta file hint (optional)
  console.log('✔ Seed complete for tenant=%s project=%s (%s)', tenantId, project.code, project.name);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

