#!/usr/bin/env node
/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenantId = process.env.TENANT_DEFAULT || 'demo';
  const projectId = Number(process.env.PROJECT_ID || 8);

  const project = await prisma.project.findFirst({ where: { tenantId, id: projectId } });
  if (!project) {
    console.error(`Project ${projectId} not found for tenant ${tenantId}`);
    process.exit(1);
  }

  // Ensure client
  let client = null;
  if (project.clientId) {
    client = await prisma.client.findFirst({ where: { id: project.clientId } });
  }
  if (!client) {
    client = await prisma.client.findFirst({ where: { name: 'Acme Demo' } });
    if (!client) client = await prisma.client.create({ data: { name: 'Acme Demo' } });
  }

  // Ensure a contact for the client
  let contact = await prisma.contact.findFirst({ where: { clientId: client.id, email: 'site.contact@acme.test' } });
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        clientId: client.id,
        tenantId,
        firstName: 'Site',
        lastName: 'Contact',
        email: 'site.contact@acme.test',
        phone: '+44 20 7946 0958',
        role: 'Client Contact',
        isPrimary: true,
      },
    });
  }

  // Ensure internal users for PM and QS
  let pm = await prisma.user.findFirst({ where: { tenantId, email: 'pm.demo@erp.test' } });
  if (!pm) {
    pm = await prisma.user.create({
      data: {
        tenantId,
        email: 'pm.demo@erp.test',
        name: 'Pat Manager',
        passwordSHA: 'dummy-sha',
        isActive: true,
      },
    });
  }
  let qs = await prisma.user.findFirst({ where: { tenantId, email: 'qs.demo@erp.test' } });
  if (!qs) {
    qs = await prisma.user.create({
      data: {
        tenantId,
        email: 'qs.demo@erp.test',
        name: 'Quinn Surveyor',
        passwordSHA: 'dummy-sha',
        isActive: true,
      },
    });
  }

  // Ensure supplier used across finance/rfx
  let supplier = await prisma.supplier.findFirst({ where: { tenantId, name: 'Demo Supplier Ltd' } });
  if (!supplier) supplier = await prisma.supplier.create({ data: { tenantId, name: 'Demo Supplier Ltd', status: 'active' } });

  // Ensure basic task statuses (global)
  const statusKeys = ['Open','In Progress','Done'];
  const taskStatusIds = {};
  for (const key of statusKeys) {
    const up = await prisma.taskStatus.upsert({
      where: { tenantId_key: { tenantId: 0, key } },
      update: {},
      create: { tenantId: 0, key, label: key },
    });
    taskStatusIds[key] = up.id;
  }

  // Ensure packages
  const pkgMain = await prisma.package.upsert({
    where: { id: (await prisma.package.findFirst({ where: { projectId: project.id, name: 'Main Works' } }))?.id || 0 },
    update: {},
    create: { projectId: project.id, name: 'Main Works', scope: 'Main build works', status: 'Draft' },
  }).catch(async()=>{
    return prisma.package.findFirst({ where: { projectId: project.id, name: 'Main Works' } });
  });
  const pkgEnable = await prisma.package.upsert({
    where: { id: (await prisma.package.findFirst({ where: { projectId: project.id, name: 'Enabling Works' } }))?.id || 0 },
    update: {},
    create: { projectId: project.id, name: 'Enabling Works', scope: 'Site enabling and prelims', status: 'Draft' },
  }).catch(async()=>{
    return prisma.package.findFirst({ where: { projectId: project.id, name: 'Enabling Works' } });
  });

  // Budget lines
  async function ensureBudgetLine(code, name, planned, pkg) {
    const existing = await prisma.budgetLine.findFirst({ where: { tenantId, projectId: project.id, code } });
    if (existing) return existing;
    return prisma.budgetLine.create({ data: { tenantId, projectId: project.id, code, planned, amount: planned, description: name } });
  }
  const bl1 = await ensureBudgetLine('BL-001', 'Main Works Baseline', 100000, pkgMain);
  const bl2 = await ensureBudgetLine('BL-002', 'Enabling Works Baseline', 25000, pkgEnable);

  // Contract for Main Works
  let contract = await prisma.contract.findFirst({ where: { projectId: project.id, packageId: pkgMain?.id || undefined } });
  if (!contract) {
    contract = await prisma.contract.create({
      data: {
        projectId: project.id,
        packageId: pkgMain?.id || null,
        supplierId: supplier.id,
        title: 'Main Works Contract',
        contractNumber: 'CNT-MW-001',
        value: 60000,
        originalValue: 60000,
        status: 'Pending',
        startDate: new Date(),
      },
    });
  }

  // Purchase Order + line + delivery
  let po = await prisma.purchaseOrder.findFirst({ where: { tenantId, projectId: project.id, code: 'PO-0001' } });
  if (!po) {
    po = await prisma.purchaseOrder.create({
      data: {
        tenantId,
        projectId: project.id,
        code: 'PO-0001',
        supplier: supplier.name,
        supplierId: supplier.id,
        status: 'Open',
        total: 5000,
        lines: { create: [
          { tenantId, item: 'Concrete C30/37', qty: 50, unit: 'm3', unitCost: 80, lineTotal: 4000 },
          { tenantId, item: 'Rebar B500B', qty: 1000, unit: 'kg', unitCost: 1, lineTotal: 1000 },
        ]},
        deliveries: { create: [ { tenantId, expectedAt: new Date(Date.now()+7*86400000), note: 'Initial pour' } ] },
      },
      include: { lines: true, deliveries: true },
    });
  }

  // Invoice linked to contract and package
  const invNum = `INV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-MW`;
  let invoice = await prisma.invoice.findFirst({ where: { tenantId, projectId: project.id, number: invNum } });
  if (!invoice) {
    invoice = await prisma.invoice.create({
      data: {
        tenantId,
        projectId: project.id,
        supplierId: supplier.id,
        number: invNum,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 14*86400000),
        net: 10000,
        vat: 2000,
        gross: 12000,
        status: 'Open',
        source: 'seed',
        packageId: pkgMain?.id || null,
        contractId: contract.id,
      },
    });
  }

  // Tasks (3 demo)
  async function ensureTask(title, statusKey, daysAhead) {
    const existing = await prisma.task.findFirst({ where: { tenantId, projectId: project.id, title } });
    if (existing) return existing;
    return prisma.task.create({ data: {
      tenantId,
      projectId: project.id,
      title,
      description: `${title} description`,
      dueDate: new Date(Date.now() + daysAhead*86400000),
      status: statusKey,
      statusId: taskStatusIds[statusKey],
    }});
  }
  await ensureTask('Kick-off meeting', 'Open', 3);
  await ensureTask('Site setup', 'In Progress', 14);
  await ensureTask('Pour slab A', 'Open', 21);

  // Variation (1 demo)
  let variation = await prisma.variation.findFirst({ where: { tenantId, projectId: project.id, title: 'Add doorway to block A' } });
  if (!variation) {
    variation = await prisma.variation.create({ data: {
      tenantId,
      projectId: project.id,
      packageId: pkgMain?.id || null,
      // contractId is Int? while Contract.id is BigInt; leave null for compatibility
      title: 'Add doorway to block A',
      description: 'Client requested additional doorway; includes lintel and making good.',
      contractType: 'JCT',
      type: 'Change',
      status: 'Submitted',
      value: 2500,
      amount: 2500,
      costImpact: 2000,
      timeImpactDays: 1,
      lines: { create: [{ tenantId, description: 'Lintel installation', qty: 1, rate: 2500, value: 2500 }] },
    }});
  }

  // Actual cost and forecast
  await prisma.actualCost.create({ data: { tenantId, projectId: project.id, ref: 'AC-001', supplier: supplier.name, description: 'Site fencing hire', category: 'Prelims', amount: 750, periodMonth: new Date().toISOString().slice(0,7) } }).catch(()=>{});
  await prisma.forecast.upsert({ where: { tenantId_projectId_period: { tenantId, projectId: project.id, period: new Date().toISOString().slice(0,7) } }, update: { amount: 50000 }, create: { tenantId, projectId: project.id, period: new Date().toISOString().slice(0,7), amount: 50000 } });

  // RFI
  await prisma.rfi.create({ data: { tenantId, projectId: project.id, rfiNumber: `RFI-${project.id}-001`, subject: 'Door ironmongery spec', question: 'Confirm lever handle finish for A01 doors.', status: 'open', priority: 'med' } }).catch(()=>{});

  // QA Record + item
  const qa = await prisma.qaRecord.create({ data: { tenantId, projectId: project.id, type: 'Inspection', title: 'Rebar installation check', description: 'Verify rebar spacing and cover before pour', status: 'open' } }).catch(()=>null);
  if (qa) await prisma.qaItem.create({ data: { tenantId, qaRecordId: qa.id, item: 'Rebar spacing per drawing', result: 'open' } }).catch(()=>{});

  // H&S Event
  await prisma.hsEvent.create({ data: { tenantId, projectId: project.id, type: 'Near Miss', title: 'Trip hazard identified', description: 'Loose cable across walkway; removed and secured', eventDate: new Date(), status: 'open', severity: 'low' } }).catch(()=>{});

  // Carbon entry (Scope 3 delivery)
  await prisma.carbonEntry.create({ data: { tenantId, projectId: project.id, scope: '3', category: 'Materials', activityDate: new Date(), quantity: 2.5, unit: 't', emissionFactor: 350, factorUnit: 'kgCO2e/t', calculatedKgCO2e: 875, supplierId: supplier.id, notes: 'Rebar delivery' } }).catch(()=>{});

  // Application for Payment
  const seq = (await prisma.applicationForPayment.count({ where: { tenantId } })) + 1;
  const afpNo = `AFP-${new Date().getFullYear()}-${String(seq).padStart(5,'0')}`;
  await prisma.applicationForPayment.create({ data: {
    tenantId,
    projectId: project.id,
    supplierId: supplier.id,
    contractId: contract.id,
    applicationNo: afpNo,
    applicationDate: new Date(),
    periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    periodEnd: new Date(),
    currency: 'GBP',
    grossToDate: 12000,
    variationsValue: 2500,
    prelimsValue: 1000,
    retentionValue: 600,
    mosValue: 0,
    offsiteValue: 0,
    deductionsValue: 0,
    netClaimed: 10900,
    status: 'submitted',
  } }).catch(()=>{});

  // Project memberships for PM and QS
  await prisma.projectMembership.upsert({ where: { tenantId_projectId_userId: { tenantId, projectId: project.id, userId: pm.id } }, update: { role: 'PM' }, create: { tenantId, projectId: project.id, userId: pm.id, role: 'PM' } }).catch(()=>{});
  await prisma.projectMembership.upsert({ where: { tenantId_projectId_userId: { tenantId, projectId: project.id, userId: qs.id } }, update: { role: 'QS' }, create: { tenantId, projectId: project.id, userId: qs.id, role: 'QS' } }).catch(()=>{});

  // Update project with rich dummy data including location
  const update = await prisma.project.update({
    where: { id: project.id },
    data: {
      clientId: client.id,
      clientContactId: contact.id,
      projectManagerUserId: pm.id,
      quantitySurveyorUserId: qs.id,
      description: 'Seeded MVP demo project with full dummy data.',
      status: 'Active',
      type: 'General',
      contractType: 'JCT',
      contractForm: 'Design and Build',
      paymentTermsDays: 30,
      retentionPct: 5,
      currency: 'GBP',
      country: 'UK',
      sitePostcode: 'W1A 1AA',
      siteLat: 51.507351,
      siteLng: -0.127758,
      labels: { priority: 'high', stage: 'demo' },
    },
    include: {
      client: true,
      clientContact: true,
      projectManager: true,
      quantitySurveyor: true,
    },
  });

  console.log('Updated project with dummy data:', {
    id: update.id,
    clientId: update.clientId,
    clientContactId: update.clientContactId,
    projectManagerUserId: update.projectManagerUserId,
    quantitySurveyorUserId: update.quantitySurveyorUserId,
    site: { postcode: update.sitePostcode, lat: update.siteLat?.toString?.(), lng: update.siteLng?.toString?.() },
  });
}

main().then(()=>process.exit(0)).catch((e)=>{ console.error(e); process.exit(1); });
