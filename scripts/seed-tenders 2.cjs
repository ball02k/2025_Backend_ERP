#!/usr/bin/env node
/*
 Seed Tender rows for existing Packages so packages have visible tenders.
 Usage:
   TENANT=demo PROJECT_ID=8 node scripts/seed-tenders.cjs
*/
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const TENANT = process.env.TENANT || process.env.DEMO_TENANT_ID || 'demo';
  const projectId = process.env.PROJECT_ID ? Number(process.env.PROJECT_ID) : null;
  const wipe = String(process.env.WIPE || '0') === '1';
  const doAward = String(process.env.AWARD || '1') === '1';

  console.log(`[seed-tenders] tenant=${TENANT} projectId=${projectId ?? '(all)'} wipe=${wipe}`);

  // Optional cleanup (only tenders for the scope)
  if (wipe) {
    const delWhere = projectId ? { projectId } : {};
    await prisma.tenderResponse?.deleteMany?.({ where: { tenantId: TENANT, tender: delWhere } }).catch(()=>{});
    await prisma.tender?.deleteMany?.({ where: { tenantId: TENANT, ...delWhere } }).catch(()=>{});
  }

  // Load packages in scope
  const pkgWhere = projectId ? { projectId } : {};
  const packages = await prisma.package.findMany({
    where: pkgWhere,
    select: { id: true, name: true, projectId: true },
    orderBy: [{ projectId: 'asc' }, { id: 'asc' }],
  });
  console.log(`[seed-tenders] packages in scope: ${packages.length}`);

  let created = 0, skipped = 0;
  // Ensure we have a couple of demo suppliers
  const supA = (await prisma.supplier.findFirst({ where: { tenantId: TENANT, name: 'Supplier Alpha' } }))
    || (await prisma.supplier.create({ data: { tenantId: TENANT, name: 'Supplier Alpha', email: 'alpha@supplier.local' } }));
  const supB = (await prisma.supplier.findFirst({ where: { tenantId: TENANT, name: 'Supplier Beta' } }))
    || (await prisma.supplier.create({ data: { tenantId: TENANT, name: 'Supplier Beta', email: 'beta@supplier.local' } }));
  let idx = 0;
  for (const p of packages) {
    idx++;
    const exists = await prisma.tender.findFirst({ where: { tenantId: TENANT, packageId: p.id } });
    if (exists) {
      skipped++;
      // Still seed responses if missing and refresh counts/deadline realism
      await seedInvitesAndResponses(exists, supA.id, supB.id, TENANT, idx);
      await refreshCounts(exists.id, TENANT);
      continue;
    }
    // Stagger deadlines 7..45 days from now
    const offsetDays = 7 + Math.floor(Math.random() * 39);
    const deadlineBase = new Date();
    const deadline = new Date(deadlineBase.getTime() + offsetDays * 86400000);
    const t = await prisma.tender.create({
      data: {
        tenantId: TENANT,
        projectId: p.projectId,
        packageId: p.id,
        title: `${p.name} Tender`,
        status: idx % 5 === 0 ? 'issued' : 'open',
        deadlineAt: deadline,
      },
    });
    const [r1, r2] = await seedInvitesAndResponses(t, supA.id, supB.id, TENANT, idx);
    await refreshCounts(t.id, TENANT);
    // Randomly award some tenders for demo realism
    if (doAward && idx % 3 === 0) {
      const pick = await pickBestResponse(t.id, TENANT);
      if (pick) await awardTender(t, pick, TENANT);
    }
    created++;
  }
  console.log(`[seed-tenders] created=${created}, skipped(existing)=${skipped}`);
}

async function seedInvitesAndResponses(tender, supAId, supBId, tenantId, seedIndex = 1) {
  try {
    // invites
    const invA = await prisma.tenderSupplierInvite.findFirst({ where: { tenantId, tenderId: tender.id, supplierId: supAId } });
    if (!invA) await prisma.tenderSupplierInvite.create({ data: { tenantId, tenderId: tender.id, supplierId: supAId, inviteToken: `tok-${tender.id}-${supAId}-${Date.now()}`, status: 'invited' } });
    const invB = await prisma.tenderSupplierInvite.findFirst({ where: { tenantId, tenderId: tender.id, supplierId: supBId } });
    if (!invB) await prisma.tenderSupplierInvite.create({ data: { tenantId, tenderId: tender.id, supplierId: supBId, inviteToken: `tok-${tender.id}-${supBId}-${Date.now()}`, status: 'invited' } });

    // responses (one or both suppliers)
    const rA = await prisma.tenderResponse.findFirst({ where: { tenantId, tenderId: tender.id, supplierId: supAId } });
    let createdA = rA;
    if (!rA) createdA = await prisma.tenderResponse.create({
      data: {
        tenantId,
        tenderId: tender.id,
        supplierId: supAId,
        priceTotal: 180000 + (seedIndex % 7) * 5000 + Math.floor(Math.random() * 9000),
        leadTimeDays: 45 + (seedIndex % 20),
        answers: [],
        autoScore: 0.5 + Math.random() * 0.3,
        manualScore: 0.1 + Math.random() * 0.2,
        notes: 'Seeded supplier Alpha response',
        source: 'supplier',
        submittedAt: new Date(),
      },
    });
    const rB = await prisma.tenderResponse.findFirst({ where: { tenantId, tenderId: tender.id, supplierId: supBId } });
    let createdB = rB;
    if (!rB) createdB = await prisma.tenderResponse.create({
      data: {
        tenantId,
        tenderId: tender.id,
        supplierId: supBId,
        priceTotal: 170000 + (seedIndex % 5) * 7000 + Math.floor(Math.random() * 8000),
        leadTimeDays: 40 + (seedIndex % 15),
        answers: [],
        autoScore: 0.55 + Math.random() * 0.3,
        manualScore: 0.15 + Math.random() * 0.2,
        notes: 'Seeded supplier Beta response',
        source: 'supplier',
        submittedAt: new Date(),
      },
    });
    return [createdA, createdB];
  } catch (e) {
    console.warn('[seedInvitesAndResponses] skipped', e?.message || e);
  }
}

async function refreshCounts(tenderId, tenantId) {
  try {
    const [inv, sub] = await Promise.all([
      prisma.tenderSupplierInvite.count({ where: { tenantId, tenderId } }),
      prisma.tenderResponse.count({ where: { tenantId, tenderId } }),
    ]);
    await prisma.tender.update({ where: { id: tenderId }, data: { invitedCount: inv, submissionCount: sub } });
  } catch {}
}

async function pickBestResponse(tenderId, tenantId) {
  const rows = await prisma.tenderResponse.findMany({
    where: { tenantId, tenderId },
    orderBy: [{ priceTotal: 'asc' }],
  });
  return rows[0] || null;
}

async function awardTender(tender, response, tenantId) {
  try {
    // Create contract (value from response), basic dates
    const contract = await prisma.contract.create({
      data: {
        projectId: tender.projectId,
        packageId: tender.packageId ?? null,
        supplierId: response.supplierId,
        title: tender.title,
        contractNumber: `CT-${tender.id}-${response.supplierId}`,
        value: response.priceTotal,
        status: 'Signed',
        signedAt: new Date(),
        startDate: new Date(),
      },
    });

    // Update CVR committed for current period
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let header = await prisma.costValueReconciliation.findFirst({ where: { tenantId, projectId: tender.projectId, period } });
    if (!header) header = await prisma.costValueReconciliation.create({ data: { tenantId, projectId: tender.projectId, period } });
    const line = await prisma.cVRLine.findFirst({ where: { tenantId, cvrId: header.id, packageId: tender.packageId ?? null, costCode: null } });
    if (line) {
      await prisma.cVRLine.update({ where: { id: line.id }, data: { committed: (Number(line.committed) || 0) + Number(response.priceTotal) } });
    } else {
      await prisma.cVRLine.create({ data: { tenantId, cvrId: header.id, packageId: tender.packageId ?? null, costCode: null, budget: 0, committed: Number(response.priceTotal), actual: 0, earnedValue: 0, variance: 0, adjustment: 0 } });
    }

    // Mark tender awarded and refresh counts
    await prisma.tender.update({ where: { id: tender.id }, data: { status: 'awarded' } });
    await refreshCounts(tender.id, tenantId);
    return contract;
  } catch (e) {
    console.warn('[awardTender] skipped', e?.message || e);
    return null;
  }
}

main().then(()=>process.exit(0)).catch((e)=>{ console.error('[seed-tenders] error', e); process.exit(1); });
