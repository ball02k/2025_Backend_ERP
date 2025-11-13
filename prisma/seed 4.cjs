"use strict";

// Prisma seed aligned to prisma/schema.prisma
// Populates coherent demo data so all pages render

const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const prisma = new PrismaClient();

const TENANT_ID = process.env.DEMO_TENANT_ID || process.env.TENANT_DEFAULT || "demo";
const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL || "admin@demo.local";
const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD || "demo1234";
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function ensureDefaults() {
  // Lookup tables (global, tenantId null)
  const pStatuses = [
    { key: "Active", label: "Active", colorHex: "#2ecc71", sortOrder: 1 },
    { key: "On Hold", label: "On Hold", colorHex: "#f1c40f", sortOrder: 2 },
    { key: "Completed", label: "Completed", colorHex: "#95a5a6", sortOrder: 3 },
  ];
  for (const s of pStatuses) {
    const exist = await prisma.projectStatus.findFirst({ where: { tenantId: null, key: s.key } });
    if (exist) await prisma.projectStatus.update({ where: { id: exist.id }, data: { ...s, isActive: true } });
    else await prisma.projectStatus.create({ data: { ...s, tenantId: null, isActive: true } });
  }

  const pTypes = [
    { key: "General", label: "General", colorHex: "#3498db", sortOrder: 1 },
    { key: "Fit-Out", label: "Fit-Out", colorHex: "#9b59b6", sortOrder: 2 },
    { key: "Infrastructure", label: "Infrastructure", colorHex: "#e67e22", sortOrder: 3 },
  ];
  for (const t of pTypes) {
    const exist = await prisma.projectType.findFirst({ where: { tenantId: null, key: t.key } });
    if (exist) await prisma.projectType.update({ where: { id: exist.id }, data: { ...t, isActive: true } });
    else await prisma.projectType.create({ data: { ...t, tenantId: null, isActive: true } });
  }

  const tStatuses = [
    { key: "Open", label: "Open", colorHex: "#e74c3c", sortOrder: 1 },
    { key: "In Progress", label: "In Progress", colorHex: "#f39c12", sortOrder: 2 },
    { key: "Done", label: "Done", colorHex: "#2ecc71", sortOrder: 3 },
  ];
  for (const t of tStatuses) {
    const exist = await prisma.taskStatus.findFirst({ where: { tenantId: null, key: t.key } });
    if (exist) await prisma.taskStatus.update({ where: { id: exist.id }, data: { ...t, isActive: true } });
    else await prisma.taskStatus.create({ data: { ...t, tenantId: null, isActive: true } });
  }
}

async function ensureUserAndRole() {
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      tenantId: TENANT_ID,
      email: DEMO_USER_EMAIL,
      name: "Demo Admin",
      passwordSHA: sha256(DEMO_USER_PASSWORD),
    },
  });
  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TENANT_ID, name: "admin" } },
    update: {},
    create: { tenantId: TENANT_ID, name: "admin" },
  });
  await prisma.userRole.upsert({
    where: { tenantId_userId_roleId: { tenantId: TENANT_ID, userId: user.id, roleId: role.id } },
    update: {},
    create: { tenantId: TENANT_ID, userId: user.id, roleId: role.id },
  });
  return user;
}

async function ensureMasterData() {
  // Clients and contacts
  let client = await prisma.client.findFirst({ where: { name: "Canary Wharf Group", deletedAt: null } });
  if (!client) {
    client = await prisma.client.create({
      data: {
        name: "Canary Wharf Group",
        companyRegNo: "04136077",
        vatNo: "GB123456789",
        address1: "1 Canada Square",
        city: "London",
        postcode: "E14 5AB",
      },
    });
  }
  const contactExists = await prisma.contact.findFirst({ where: { clientId: client.id, email: "pm@cwgroup.co.uk" } });
  if (!contactExists) {
    await prisma.contact.create({
      data: {
        clientId: client.id,
        tenantId: TENANT_ID,
        firstName: "Client",
        lastName: "PM",
        email: "pm@cwgroup.co.uk",
        phone: "+44 20 7946 0000",
        isPrimary: true,
      },
    });
  }

  // Suppliers
  const supA = await prisma.supplier.upsert({
    where: { id: (await prisma.supplier.findFirst({ where: { tenantId: TENANT_ID, name: "Alpha Steel Ltd" } }))?.id || -1 },
    update: {},
    create: {
      tenantId: TENANT_ID,
      name: "Alpha Steel Ltd",
      companyRegNo: "01234567",
      vatNo: "GB111111111",
      hsAccreditations: "CHAS, SSIP",
      insuranceExpiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180),
      status: "active",
      performanceScore: 4.3,
    },
  });
  const supB = await prisma.supplier.upsert({
    where: { id: (await prisma.supplier.findFirst({ where: { tenantId: TENANT_ID, name: "Beta MEP Services" } }))?.id || -1 },
    update: {},
    create: {
      tenantId: TENANT_ID,
      name: "Beta MEP Services",
      companyRegNo: "07654321",
      vatNo: "GB222222222",
      hsAccreditations: "Constructionline Gold",
      insuranceExpiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 120),
      status: "active",
      performanceScore: 4.0,
    },
  });
  // Capabilities
  const tagsA = ["category:Steel", "trade:Structural Steel", "region:London"];
  for (const tag of tagsA) await prisma.supplierCapability.upsert({
    where: { id: (await prisma.supplierCapability.findFirst({ where: { tenantId: TENANT_ID, supplierId: supA.id, tag } }))?.id || -1 },
    update: {},
    create: { tenantId: TENANT_ID, supplierId: supA.id, tag },
  });
  const tagsB = ["category:MEP", "trade:MEP", "region:South East"];
  for (const tag of tagsB) await prisma.supplierCapability.upsert({
    where: { id: (await prisma.supplierCapability.findFirst({ where: { tenantId: TENANT_ID, supplierId: supB.id, tag } }))?.id || -1 },
    update: {},
    create: { tenantId: TENANT_ID, supplierId: supB.id, tag },
  });

  return { client, supA, supB };
}

async function ensureProjectData(user, client) {
  // Resolve lookup relations
  const st = await prisma.projectStatus.findFirst({ where: { key: "Active" } });
  const tp = await prisma.projectType.findFirst({ where: { key: "General" } });

  let project = await prisma.project.findFirst({ where: { tenantId: TENANT_ID, code: "CWG-001", deletedAt: null } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        tenantId: TENANT_ID,
        code: "CWG-001",
        name: "Canada Square Podium Refurb",
        description: "Refurbishment of the podium and public realm",
        clientId: client.id,
        status: "Active",
        type: "General",
        statusId: st?.id || null,
        typeId: tp?.id || null,
        projectManagerId: user.id,
        budget: 3500000.0,
        actualSpend: 450000.0,
        startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
        endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 300),
      },
    });
  }

  // Ensure membership (PM)
  await prisma.projectMembership.upsert({
    where: { tenantId_projectId_userId: { tenantId: TENANT_ID, projectId: project.id, userId: user.id } },
    update: { role: "PM" },
    create: { tenantId: TENANT_ID, projectId: project.id, userId: user.id, role: "PM" },
  });

  // Tasks
  const openStatus = await prisma.taskStatus.findFirst({ where: { key: "Open" } });
  const t1 = await prisma.task.findFirst({ where: { tenantId: TENANT_ID, projectId: project.id, title: "Kick-off Meeting" } });
  if (!t1) {
    await prisma.task.create({
      data: {
        tenantId: TENANT_ID,
        projectId: project.id,
        title: "Kick-off Meeting",
        description: "Introduce team and agree ways of working",
        status: "Open",
        statusId: openStatus?.id || 1,
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    });
  }
  const t2 = await prisma.task.findFirst({ where: { tenantId: TENANT_ID, projectId: project.id, title: "Issue Procurement Strategy" } });
  if (!t2) {
    await prisma.task.create({
      data: {
        tenantId: TENANT_ID,
        projectId: project.id,
        title: "Issue Procurement Strategy",
        status: "In Progress",
        statusId: (await prisma.taskStatus.findFirst({ where: { key: "In Progress" } }))?.id || openStatus?.id || 1,
      },
    });
  }

  // Variations (basic)
  const v1 = await prisma.variation.findFirst({ where: { tenantId: TENANT_ID, projectId: project.id, title: "Client Change - Handrail Finish" } });
  if (!v1) {
    const created = await prisma.variation.create({
      data: {
        tenantId: TENANT_ID,
        projectId: project.id,
        reference: "VAR-001",
        title: "Client Change - Handrail Finish",
        description: "Upgrade to brushed stainless",
        contractType: "NEC4",
        type: "Change",
        status: "Submitted",
        value: 12500.0,
        costImpact: 9800.0,
        timeImpactDays: 2,
        submittedDate: new Date(),
      },
    });
    await prisma.variationLine.create({
      data: {
        tenantId: TENANT_ID,
        variationId: created.id,
        description: "Material upgrade",
        qty: 1,
        rate: 12500.0,
        value: 12500.0,
        sort: 1,
      },
    });
    await prisma.variationStatusHistory.create({
      data: { tenantId: TENANT_ID, variationId: created.id, fromStatus: "Draft", toStatus: "Submitted", note: "Submitted to client" },
    });
  }

  // Project snapshot
  const snap = await prisma.projectSnapshot.findUnique({ where: { projectId: project.id } });
  if (!snap) {
    await prisma.projectSnapshot.create({
      data: {
        projectId: project.id,
        tenantId: TENANT_ID,
        financialBudget: 3500000.0,
        financialCommitted: 950000.0,
        financialActual: 450000.0,
        financialForecast: 3200000.0,
        schedulePct: 15,
        tasksOverdue: 0,
        tasksDueThisWeek: 2,
      },
    });
  }

  // Procurement: packages, invites, submissions, contract
  let pkgSteel = await prisma.package.findFirst({ where: { projectId: project.id, name: "Structural Steel Package" } });
  if (!pkgSteel) {
    pkgSteel = await prisma.package.create({
      data: {
        projectId: project.id,
        name: "Structural Steel Package",
        scope: "Supply and install steel frame",
        trade: "Structural Steel",
        status: "Invitation",
        budgetEstimate: 2500000,
        deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 21),
      },
    });
  }

  const { supA, supB } = await ensureMasterData();
  await prisma.tenderInvite.upsert({
    where: { packageId_supplierId: { packageId: pkgSteel.id, supplierId: supA.id } },
    update: {},
    create: { packageId: pkgSteel.id, supplierId: supA.id, status: "Invited" },
  });
  await prisma.tenderInvite.upsert({
    where: { packageId_supplierId: { packageId: pkgSteel.id, supplierId: supB.id } },
    update: {},
    create: { packageId: pkgSteel.id, supplierId: supB.id, status: "Invited" },
  });

  const subA = await prisma.submission.upsert({
    where: { packageId_supplierId: { packageId: pkgSteel.id, supplierId: supA.id } },
    update: { price: 2400000, durationWeeks: 20, technicalScore: 0.86, priceScore: 0.9, overallScore: 0.88, rank: 1, status: "Submitted" },
    create: { packageId: pkgSteel.id, supplierId: supA.id, price: 2400000, durationWeeks: 20, technicalScore: 0.86, priceScore: 0.9, overallScore: 0.88, rank: 1, status: "Submitted" },
  });
  await prisma.contract.upsert({
    where: { packageId: pkgSteel.id },
    update: { status: "Signed", signedAt: new Date() },
    create: { projectId: project.id, packageId: pkgSteel.id, supplierId: supA.id, title: "Subcontract - Structural Steel", value: 2400000, status: "Signed", signedAt: new Date() },
  });

  // Purchase Orders
  const po = await prisma.purchaseOrder.findFirst({ where: { tenantId: TENANT_ID, projectId: project.id, code: "PO-0001" } });
  const poRow = po || (await prisma.purchaseOrder.create({
    data: {
      tenantId: TENANT_ID,
      projectId: project.id,
      code: "PO-0001",
      supplier: supA.name,
      supplierId: supA.id,
      status: "Open",
      total: 125000,
    },
  }));
  const line = await prisma.pOLine.findFirst({ where: { tenantId: TENANT_ID, poId: poRow.id, item: "Steel beams" } });
  if (!line) {
    await prisma.pOLine.create({ data: { tenantId: TENANT_ID, poId: poRow.id, item: "Steel beams", qty: 25, unit: "ea", unitCost: 5000, lineTotal: 125000 } });
  }
  const del = await prisma.delivery.findFirst({ where: { tenantId: TENANT_ID, poId: poRow.id } });
  if (!del) {
    await prisma.delivery.create({ data: { tenantId: TENANT_ID, poId: poRow.id, expectedAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) } });
  }

  // Financials
  await prisma.budgetLine.create({ data: { tenantId: TENANT_ID, projectId: project.id, code: "A100", category: "Steel", periodMonth: "2025-09", description: "Steel budget", amount: 400000 } }).catch(()=>{});
  await prisma.commitment.create({ data: { tenantId: TENANT_ID, projectId: project.id, linkedPoId: poRow.id, ref: "PO-0001", supplier: supA.name, description: "Steel order", category: "Steel", periodMonth: "2025-09", amount: 125000, status: "Open" } }).catch(()=>{});
  await prisma.actualCost.create({ data: { tenantId: TENANT_ID, projectId: project.id, ref: "INV-0001", supplier: supA.name, description: "Deposit", category: "Steel", amount: 50000, periodMonth: "2025-09" } }).catch(()=>{});
  await prisma.forecast.create({ data: { tenantId: TENANT_ID, projectId: project.id, period: "2025-10", periodMonth: "2025-10", description: "Steel install", amount: 300000 } }).catch(()=>{});
  await prisma.financialItem.create({ data: { tenantId: TENANT_ID, projectId: project.id, name: "Contingency", amount: 150000 } }).catch(()=>{});

  // Documents
  const doc = await prisma.document.findFirst({ where: { tenantId: TENANT_ID, filename: "Subcontract_Earthworks.pdf" } });
  const docRow = doc || (await prisma.document.create({ data: { tenantId: TENANT_ID, filename: "Subcontract_Earthworks.pdf", mimeType: "application/pdf", size: 1024, storageKey: "demo/Subcontract_Earthworks.pdf" } }));
  const link = await prisma.documentLink.findFirst({ where: { tenantId: TENANT_ID, documentId: docRow.id, projectId: project.id } });
  if (!link) await prisma.documentLink.create({ data: { tenantId: TENANT_ID, documentId: docRow.id, projectId: project.id, linkType: "contract" } });

  // Requests (RFP style)
  const reqRow = await prisma.request.findFirst({ where: { tenantId: TENANT_ID, title: "Steel Package RFP" } });
  const request = reqRow || (await prisma.request.create({ data: { tenantId: TENANT_ID, title: "Steel Package RFP", type: "RFP", status: "open", deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10), stage: 1, totalStages: 1 } }));
  const sec = await prisma.requestSection.findFirst({ where: { tenantId: TENANT_ID, requestId: request.id, title: "Commercial" } });
  const section = sec || (await prisma.requestSection.create({ data: { tenantId: TENANT_ID, requestId: request.id, title: "Commercial", order: 1, weight: 0.6 } }));
  const q = await prisma.requestQuestion.findFirst({ where: { tenantId: TENANT_ID, requestId: request.id, sectionId: section.id, prompt: "Provide a lump sum price" } });
  if (!q) await prisma.requestQuestion.create({ data: { tenantId: TENANT_ID, requestId: request.id, sectionId: section.id, qType: "number", prompt: "Provide a lump sum price", required: true, order: 1, weight: 0.6 } });
  await prisma.requestInvite.upsert({ where: { id: (await prisma.requestInvite.findFirst({ where: { tenantId: TENANT_ID, requestId: request.id, supplierId: supA.id } }))?.id || -1 }, update: {}, create: { tenantId: TENANT_ID, requestId: request.id, supplierId: supA.id, email: "tenders@alphasteel.co.uk", status: "invited" } });
  await prisma.requestResponse.upsert({ where: { id: (await prisma.requestResponse.findFirst({ where: { tenantId: TENANT_ID, requestId: request.id, supplierId: supA.id, stage: 1 } }))?.id || -1 }, update: { status: "submitted", score: 0.88, submittedAt: new Date() }, create: { tenantId: TENANT_ID, requestId: request.id, supplierId: supA.id, stage: 1, answers: { price: 2400000 }, status: "submitted", score: 0.88, submittedAt: new Date() } });
  await prisma.awardDecision.upsert({ where: { id: (await prisma.awardDecision.findFirst({ where: { tenantId: TENANT_ID, requestId: request.id, supplierId: supA.id } }))?.id || -1 }, update: { decision: "award", decidedAt: new Date(), reason: "Best value" }, create: { tenantId: TENANT_ID, requestId: request.id, supplierId: supA.id, decision: "award", decidedAt: new Date(), reason: "Best value" } });

  // Onboarding demo rows
  await prisma.onboardingProject.create({ data: { tenantId: TENANT_ID, name: "Steel Onboarding", status: "in_progress" } }).catch(()=>{});
  await prisma.onboardingForm.create({ data: { tenantId: TENANT_ID, projectId: project.id, title: "Supplier Pre-Qual", isPublished: true, sections: [{ title: "Insurance" }] } }).catch(()=>{});

  // Audit log placeholder
  await prisma.auditLog.create({ data: { userId: user.id, entity: "Project", entityId: String(project.id), action: "seed", changes: { note: "Seeded project" } } }).catch(()=>{});

  // --- New modules demo data ---
  // RFIs
  const existingRfi = await prisma.rfi.findFirst({ where: { tenantId: TENANT_ID, projectId: project.id } });
  if (!existingRfi) {
    const rfis = [
      { rfiNumber: 'RFI-0001', subject: 'Clarify ceiling detail', question: 'Please provide detail at grid C-D/4-5', priority: 'high', status: 'open', dueDate: new Date(Date.now() + 7*864e5) },
      { rfiNumber: 'RFI-0002', subject: 'MEP penetration sizes', question: 'Confirm final sizes for riser R2', priority: 'med', status: 'answered', respondedAt: new Date(), responseText: 'See drawing M-102', responseByUserId: String(user.id) },
      { rfiNumber: 'RFI-0003', subject: 'Facade bracket spec', question: 'Is stainless Grade 316 required?', priority: 'low', status: 'closed', closedAt: new Date() },
    ];
    for (const r of rfis) {
      await prisma.rfi.create({ data: { tenantId: TENANT_ID, projectId: project.id, ...r } });
    }
  }

  // QA/QC records and items
  const existingQa = await prisma.qaRecord.findFirst({ where: { tenantId: TENANT_ID, projectId: project.id } });
  if (!existingQa) {
    const rec = await prisma.qaRecord.create({ data: { tenantId: TENANT_ID, projectId: project.id, type: 'inspection', title: 'Rebar Fixing Inspection', status: 'open', trade: 'Civils', location: 'Basement 1' } });
    const items = [
      { item: 'Rebar grade and spacing', result: 'pass' },
      { item: 'Cover to reinforcement', result: 'fail', notes: '20mm short at grid B/3' },
      { item: 'Starter bars installed', result: 'open' },
    ];
    for (const it of items) {
      await prisma.qaItem.create({ data: { tenantId: TENANT_ID, qaRecordId: rec.id, ...it } });
    }
  }

  // H&S events
  const existingHs = await prisma.hsEvent.findFirst({ where: { tenantId: TENANT_ID, projectId: project.id } });
  if (!existingHs) {
    await prisma.hsEvent.create({ data: { tenantId: TENANT_ID, projectId: project.id, type: 'incident', title: 'Cut to hand', description: 'Minor laceration while handling sheet metal', eventDate: new Date(Date.now() - 2*864e5), severity: 'minor', status: 'closed', immediateAction: 'First aid administered', closedAt: new Date() } });
    await prisma.hsEvent.create({ data: { tenantId: TENANT_ID, projectId: project.id, type: 'incident', title: 'Fall from height (ladder)', description: 'Operative fell from ladder (~1.5m)', eventDate: new Date(Date.now() - 10*864e5), severity: 'major', isRIDDOR: true, status: 'investigating' } });
  }

  // Carbon entries across months
  const existingCarbon = await prisma.carbonEntry.findFirst({ where: { tenantId: TENANT_ID, projectId: project.id } });
  if (!existingCarbon) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const entries = [
      { scope: '1', category: 'Fuel-diesel', activityDate: now, quantity: 500, unit: 'L', emissionFactor: 2.68, factorUnit: 'kgCO2e/unit', periodMonth: month, periodYear: year, materialOrFuel: 'Diesel (red)' },
      { scope: '2', category: 'Electricity', activityDate: now, quantity: 12000, unit: 'kWh', emissionFactor: 0.18, factorUnit: 'kgCO2e/unit', periodMonth: month, periodYear: year },
      { scope: '3', category: 'Materials-concrete', activityDate: new Date(year, month-2, 15), quantity: 50, unit: 't', emissionFactor: 100, factorUnit: 'kgCO2e/unit', periodMonth: month-2, periodYear: year, materialOrFuel: 'C30/37' },
    ];
    for (const e of entries) {
      const calc = Number(e.quantity) * Number(e.emissionFactor);
      await prisma.carbonEntry.create({ data: { tenantId: TENANT_ID, projectId: project.id, ...e, calculatedKgCO2e: calc } });
    }
  }

  // Link an existing doc to an RFI and QA record if available
  const rfiOne = await prisma.rfi.findFirst({ where: { tenantId: TENANT_ID, projectId: project.id, rfiNumber: 'RFI-0001' } });
  if (rfiOne) {
    const rfiDocLink = await prisma.documentLink.findFirst({ where: { tenantId: TENANT_ID, documentId: docRow.id, rfiId: rfiOne.id } });
    if (!rfiDocLink) await prisma.documentLink.create({ data: { tenantId: TENANT_ID, documentId: docRow.id, rfiId: rfiOne.id, linkType: 'rfi' } });
  }
  const qaRec = await prisma.qaRecord.findFirst({ where: { tenantId: TENANT_ID, projectId: project.id, type: 'inspection' } });
  if (qaRec) {
    const qaDocLink = await prisma.documentLink.findFirst({ where: { tenantId: TENANT_ID, documentId: docRow.id, qaRecordId: qaRec.id } });
    if (!qaDocLink) await prisma.documentLink.create({ data: { tenantId: TENANT_ID, documentId: docRow.id, qaRecordId: qaRec.id, linkType: 'qa' } });
  }

  return project;
}

async function run() {
  console.log("Seeding demo data for tenant:", TENANT_ID);
  await ensureDefaults();
  const user = await ensureUserAndRole();
  const { client } = await ensureMasterData();
  await ensureProjectData(user, client);
  console.log("✅ Seed completed.");
}

run()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
