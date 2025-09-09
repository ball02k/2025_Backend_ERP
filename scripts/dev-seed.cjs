/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { recomputeProjectSnapshot } = require('../services/projectSnapshot');
const { cascadeDeleteProjects } = require('./dev-utils/cascade.cjs');

(async () => {
  const TENANT = process.env.DEMO_TENANT_ID || process.env.TENANT_DEFAULT || 'demo';
  const crypto = require('crypto');
  const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const STATUS_TENANT_ID = 1;

  // Cleanup existing demo data (FK-safe)
  try {
    const existing = await prisma.project.findMany({
      where: { tenantId: TENANT, code: { in: ['P-001', 'P-002', 'P-003'] } },
      select: { id: true },
    });
    const ids = existing.map((p) => p.id);
    if (ids.length) await cascadeDeleteProjects(prisma, TENANT, ids);
  } catch (e) {
    console.warn('Project cascade cleanup skipped:', e?.message || e);
  }

  // Optional: clean an existing Demo Client if orphaned
  try {
    const c = await prisma.client.findFirst({ where: { name: 'Demo Client' } });
    if (c) {
      await prisma.contact.deleteMany({ where: { clientId: c.id } }).catch(() => {});
      await prisma.client.deleteMany({ where: { id: c.id } });
    }
  } catch (e) {
    console.warn('Client cleanup skipped:', e?.message || e);
  }

  // Upsert lookup values
  await prisma.taskStatus.upsert({
    where: { tenantId_key: { tenantId: STATUS_TENANT_ID, key: 'open' } },
    update: {},
    create: { tenantId: STATUS_TENANT_ID, key: 'open', label: 'Open', isActive: true },
  });
  await prisma.taskStatus.upsert({
    where: { tenantId_key: { tenantId: STATUS_TENANT_ID, key: 'done' } },
    update: {},
    create: { tenantId: STATUS_TENANT_ID, key: 'done', label: 'Done', isActive: true },
  });
  const statusActive = await prisma.projectStatus.upsert({
    where: { tenantId_key: { tenantId: STATUS_TENANT_ID, key: 'Active' } },
    update: {},
    create: { tenantId: STATUS_TENANT_ID, key: 'Active', label: 'Active', isActive: true },
  });
  const typeDemo = await prisma.projectType.upsert({
    where: { tenantId_key: { tenantId: STATUS_TENANT_ID, key: 'Demo' } },
    update: {},
    create: { tenantId: STATUS_TENANT_ID, key: 'Demo', label: 'Demo', isActive: true },
  });

  // Client
  const client = (await prisma.client.findFirst({ where: { name: 'Demo Client' } }))
    || (await prisma.client.create({
      data: { name: 'Demo Client', companyRegNo: '12345678', vatNo: 'GB123456789' },
    }));

  // Users & roles
  const adminEmail = process.env.DEMO_USER_EMAIL || 'admin@demo.local';
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { tenantId: TENANT, name: 'Demo Admin', passwordSHA: sha256('demo1234') },
    create: { email: adminEmail, name: 'Demo Admin', tenantId: TENANT, passwordSHA: sha256('demo1234') },
  });
  const adminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TENANT, name: 'admin' } },
    update: {},
    create: { tenantId: TENANT, name: 'admin' },
  });
  await prisma.userRole.upsert({
    where: { tenantId_userId_roleId: { tenantId: TENANT, userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { tenantId: TENANT, userId: adminUser.id, roleId: adminRole.id },
  });

  // Basic permissions and admin role permissions
  const perms = [
    { key: 'projects.view', label: 'View Projects' },
    { key: 'projects.edit', label: 'Edit Projects' },
    { key: 'tasks.manage', label: 'Manage Tasks' },
    { key: 'variations.manage', label: 'Manage Variations' },
    { key: 'procurement.view', label: 'View Procurement' },
    { key: 'procurement.manage', label: 'Manage Procurement' },
    { key: 'documents.manage', label: 'Manage Documents' },
  ];
  for (const p of perms) {
    const perm = await prisma.permission.upsert({
      where: { tenantId_key: { tenantId: TENANT, key: p.key } },
      update: { label: p.label },
      create: { tenantId: TENANT, key: p.key, label: p.label },
    });
    await prisma.rolePermission.upsert({
      where: { tenantId_roleId_permissionId: { tenantId: TENANT, roleId: adminRole.id, permissionId: perm.id } },
      update: {},
      create: { tenantId: TENANT, roleId: adminRole.id, permissionId: perm.id },
    }).catch(() => {});
  }

  const pmUser = await prisma.user.upsert({
    where: { email: 'pm@demo.local' },
    update: { tenantId: TENANT, name: 'Demo PM', passwordSHA: sha256('demo1234') },
    create: { email: 'pm@demo.local', name: 'Demo PM', tenantId: TENANT, passwordSHA: sha256('demo1234') },
  });
  const pmRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TENANT, name: 'pm' } },
    update: {},
    create: { tenantId: TENANT, name: 'pm' },
  });
  await prisma.userRole.upsert({
    where: { tenantId_userId_roleId: { tenantId: TENANT, userId: pmUser.id, roleId: pmRole.id } },
    update: {},
    create: { tenantId: TENANT, userId: pmUser.id, roleId: pmRole.id },
  });

  // Projects
  const proj1 = await prisma.project.upsert({
    where: { code: 'P-001' },
    update: {
      name: 'Alpha Build', tenantId: TENANT, clientId: client.id,
      status: 'Active', type: 'Demo', statusId: statusActive.id, typeId: typeDemo.id,
      projectManagerId: pmUser.id, budget: 100000, actualSpend: 120000,
      startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'),
    },
    create: {
      code: 'P-001',
      name: 'Alpha Build',
      tenantId: TENANT,
      clientId: client.id,
      status: 'Active',
      type: 'Demo',
      statusId: statusActive.id,
      typeId: typeDemo.id,
      projectManagerId: pmUser.id,
      budget: 100000,
      actualSpend: 120000,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
    },
  });
  const proj2 = await prisma.project.upsert({
    where: { code: 'P-002' },
    update: {
      name: 'Beta Hub', tenantId: TENANT, clientId: client.id,
      status: 'Active', type: 'Demo', statusId: statusActive.id, typeId: typeDemo.id,
      projectManagerId: pmUser.id, budget: 200000, actualSpend: 50000,
      startDate: new Date('2025-02-01'), endDate: new Date('2025-11-30'),
    },
    create: {
      code: 'P-002',
      name: 'Beta Hub',
      tenantId: TENANT,
      clientId: client.id,
      status: 'Active',
      type: 'Demo',
      statusId: statusActive.id,
      typeId: typeDemo.id,
      projectManagerId: pmUser.id,
      budget: 200000,
      actualSpend: 50000,
      startDate: new Date('2025-02-01'),
      endDate: new Date('2025-11-30'),
    },
  });
  const proj3 = await prisma.project.upsert({
    where: { code: 'P-003' },
    update: {
      name: 'Gamma Labs', tenantId: TENANT, clientId: client.id,
      status: 'Active', type: 'Demo', statusId: statusActive.id, typeId: typeDemo.id,
      projectManagerId: pmUser.id, budget: 150000, actualSpend: 25000,
      startDate: new Date('2025-03-01'), endDate: new Date('2025-10-31'),
    },
    create: {
      code: 'P-003',
      name: 'Gamma Labs',
      tenantId: TENANT,
      clientId: client.id,
      status: 'Active',
      type: 'Demo',
      statusId: statusActive.id,
      typeId: typeDemo.id,
      projectManagerId: pmUser.id,
      budget: 150000,
      actualSpend: 25000,
      startDate: new Date('2025-03-01'),
      endDate: new Date('2025-10-31'),
    },
  });

  // Memberships
  for (const proj of [proj1, proj2, proj3]) {
    await prisma.projectMembership.create({ data: { tenantId: TENANT, projectId: proj.id, userId: adminUser.id, role: 'admin' } });
    await prisma.projectMembership.create({ data: { tenantId: TENANT, projectId: proj.id, userId: pmUser.id, role: 'pm' } });
  }

  // Tasks
  const taskStatus = await prisma.taskStatus.findFirst({ where: { tenantId: STATUS_TENANT_ID, key: 'open' } });
  const taskStatusDone = await prisma.taskStatus.findFirst({ where: { tenantId: STATUS_TENANT_ID, key: 'done' } });
  const now = new Date();
  for (let i = 0; i < 4; i++) {
    await prisma.task.create({ data: { tenantId: TENANT, projectId: proj1.id, title: `Overdue ${i+1}`, status: 'Open', statusId: taskStatus.id, dueDate: new Date(now.getTime() - (i+1)*86400000) } });
  }
  for (let i = 0; i < 4; i++) {
    await prisma.task.create({ data: { tenantId: TENANT, projectId: proj1.id, title: `Due Soon ${i+1}`, status: 'Open', statusId: taskStatus.id, dueDate: new Date(now.getTime() + (i+1)*86400000) } });
  }
  for (let i = 0; i < 4; i++) {
    await prisma.task.create({ data: { tenantId: TENANT, projectId: proj2.id, title: `Future ${i+1}`, status: 'Open', statusId: taskStatus.id, dueDate: new Date(now.getTime() + (i+8)*86400000) } });
  }
  // Done tasks
  for (let i = 0; i < 2; i++) {
    await prisma.task.create({ data: { tenantId: TENANT, projectId: proj1.id, title: `Completed ${i+1}`, status: 'Done', statusId: taskStatusDone.id, dueDate: new Date(now.getTime() - (i+10)*86400000) } });
  }
  await prisma.task.create({ data: { tenantId: TENANT, projectId: proj2.id, title: 'Handover Checklist', status: 'Done', statusId: taskStatusDone.id, dueDate: new Date(now.getTime() - 2*86400000) } });
  await prisma.task.create({ data: { tenantId: TENANT, projectId: proj3.id, title: 'Site Induction', status: 'Open', statusId: taskStatus.id, dueDate: new Date(now.getTime() + 3*86400000) } });

  // Variations
  const v1 = await prisma.variation.create({ data: { tenantId: TENANT, projectId: proj1.id, reference: 'VAR-1', title: 'Draft change', contractType: 'NEC4', type: 'ce', status: 'draft', value: 0, costImpact: 0 } });
  const v2 = await prisma.variation.create({ data: { tenantId: TENANT, projectId: proj1.id, reference: 'VAR-2', title: 'Submitted change', contractType: 'NEC4', type: 'ce', status: 'submitted', value: 10000, costImpact: 8000 } });
  const v3 = await prisma.variation.create({ data: { tenantId: TENANT, projectId: proj1.id, reference: 'VAR-3', title: 'Approved change', contractType: 'NEC4', type: 'ce', status: 'approved', value: 5000, costImpact: 4000 } });
  // Variation lines
  await prisma.variationLine.createMany({
    data: [
      { tenantId: TENANT, variationId: v2.id, description: 'Re-route cable trays', qty: 120, rate: 35, value: 4200, sort: 1 },
      { tenantId: TENANT, variationId: v2.id, description: 'Additional sockets', qty: 25, rate: 60, value: 1500, sort: 2 },
      { tenantId: TENANT, variationId: v3.id, description: 'Additional steel cleats', qty: 80, rate: 15, value: 1200, sort: 1 },
    ],
    skipDuplicates: true,
  });

  // Purchase orders
  // Purchase orders with multiple lines and deliveries
  const po1 = await prisma.purchaseOrder.create({
    data: {
      tenantId: TENANT,
      projectId: proj1.id,
      code: 'PO-1',
      supplier: 'Supplier 1',
      status: 'Open',
      orderDate: new Date(),
      total: 7500,
      lines: {
        create: [
          { tenantId: TENANT, item: 'Cable tray 100mm', qty: 50, unit: 'm', unitCost: 50, lineTotal: 2500 },
          { tenantId: TENANT, item: 'Sockets 13A', qty: 50, unit: 'ea', unitCost: 100, lineTotal: 5000 },
        ],
      },
    },
  });
  await prisma.delivery.createMany({
    data: [
      { tenantId: TENANT, poId: po1.id, expectedAt: new Date(), note: 'First drop' },
      { tenantId: TENANT, poId: po1.id, expectedAt: new Date(), receivedAt: new Date(), note: 'Received partial' },
    ],
  });

  const po2 = await prisma.purchaseOrder.create({
    data: {
      tenantId: TENANT,
      projectId: proj1.id,
      code: 'PO-2',
      supplier: 'Supplier 2',
      status: 'Closed',
      orderDate: new Date(),
      total: 6000,
      lines: { create: [{ tenantId: TENANT, item: 'Steel plates', qty: 30, unit: 'ea', unitCost: 200, lineTotal: 6000 }] },
    },
  });
  await prisma.delivery.create({ data: { tenantId: TENANT, poId: po2.id, expectedAt: new Date(), receivedAt: new Date(), note: 'All received' } });

  const po3 = await prisma.purchaseOrder.create({
    data: {
      tenantId: TENANT,
      projectId: proj2.id,
      code: 'PO-3',
      supplier: 'Concrete Co',
      status: 'Open',
      orderDate: new Date(),
      total: 8400,
      lines: { create: [{ tenantId: TENANT, item: 'Readymix C30', qty: 70, unit: 'm3', unitCost: 120, lineTotal: 8400 }] },
    },
  });

  // Documents
  await prisma.document.createMany({ data: [
    { tenantId: TENANT, filename: 'spec1.pdf', storageKey: 'uploads/spec1.pdf', size: 1000, mimeType: 'application/pdf', uploadedById: 'system' },
    { tenantId: TENANT, filename: 'spec2.pdf', storageKey: 'uploads/spec2.pdf', size: 2000, mimeType: 'application/pdf', uploadedById: 'system' },
    { tenantId: TENANT, filename: 'plan-A1.pdf', storageKey: 'uploads/plan-A1.pdf', size: 3500, mimeType: 'application/pdf', uploadedById: 'system' },
    { tenantId: TENANT, filename: 'site-photo-1.jpg', storageKey: 'uploads/site-photo-1.jpg', size: 800, mimeType: 'image/jpeg', uploadedById: 'system' },
  ], skipDuplicates: true });

  // Link first document to project1 (for FE association examples)
  try {
    const [doc1, doc2] = await prisma.document.findMany({ where: { tenantId: TENANT }, orderBy: { uploadedAt: 'asc' }, take: 2 });
    if (doc1) await prisma.documentLink.create({ data: { tenantId: TENANT, documentId: doc1.id, projectId: proj1.id, linkType: 'project' } });
    if (doc2) await prisma.documentLink.create({ data: { tenantId: TENANT, documentId: doc2.id, projectId: proj2.id, linkType: 'project' } });
    // Link a document to a variation for FE association examples
    const docVar = await prisma.document.findFirst({ where: { tenantId: TENANT, filename: 'spec2.pdf' } });
    if (docVar && v2) await prisma.documentLink.create({ data: { tenantId: TENANT, documentId: docVar.id, variationId: v2.id, linkType: 'variation' } });
  } catch {}

  // Contacts (for clients/contacts pages)
  await prisma.contact.createMany({
    data: [
      { tenantId: TENANT, clientId: client.id, firstName: 'Alice', lastName: 'Builder', email: 'alice@demo-client.local', isPrimary: true },
      { tenantId: TENANT, clientId: client.id, firstName: 'Bob', lastName: 'QS', email: 'bob@demo-client.local', isPrimary: false },
    ],
    skipDuplicates: true,
  });

  // Suppliers catalog (for procurement utilities)
  await prisma.supplier.createMany({
    data: [
      { tenantId: TENANT, name: 'Supplier 1', status: 'active' },
      { tenantId: TENANT, name: 'Supplier 2', status: 'active' },
      { tenantId: TENANT, name: 'Concrete Co', status: 'approved' },
      { tenantId: TENANT, name: 'Steel Masters', status: 'approved' },
    ],
    skipDuplicates: true,
  });

  // Supplier capabilities & scores
  const supList = await prisma.supplier.findMany({ where: { tenantId: TENANT } });
  for (const s of supList) {
    await prisma.supplierCapability.createMany({
      data: [
        { tenantId: TENANT, supplierId: s.id, tag: 'ISO9001' },
        { tenantId: TENANT, supplierId: s.id, tag: 'CSCS' },
      ],
      skipDuplicates: true,
    });
    await prisma.supplier.update({ where: { id: s.id }, data: { performanceScore: 85 } }).catch(() => {});
  }

  // ---------------- RFx Demo Seed ----------------
  try {
    const reqTitle = 'Office Fit-Out – Main RFx';
    let rfx = await prisma.request.findFirst({ where: { tenantId: TENANT, title: reqTitle } });
    if (!rfx) {
      rfx = await prisma.request.create({
        data: {
          tenantId: TENANT,
          title: reqTitle,
          type: 'RFP',
          status: 'published',
          deadline: new Date(Date.now() + 7 * 86400000),
          stage: 1,
          totalStages: 1,
          weighting: {
            scoring: { policy: 'open' },
            scale: { normalize: true, defaultMin: 0, defaultMax: 100, targetMax: 100 },
          },
          addenda: 'Please include prelims breakdown.',
        },
      });

      // Sections
      const secTech = await prisma.requestSection.create({
        data: { tenantId: TENANT, requestId: rfx.id, title: 'Technical', weight: 0.6, order: 1 },
      });
      const secComm = await prisma.requestSection.create({
        data: { tenantId: TENANT, requestId: rfx.id, title: 'Commercial', weight: 0.4, order: 2 },
      });

      // Questions
      const q1 = await prisma.requestQuestion.create({
        data: {
          tenantId: TENANT,
          requestId: rfx.id,
          sectionId: secTech.id,
          qType: 'mcq',
          prompt: 'Do you have ISO 9001?',
          required: true,
          options: [
            { value: 'yes', label: 'Yes', score: 100 },
            { value: 'no', label: 'No', score: 0 },
          ],
          weight: 2,
          order: 1,
        },
      });
      const q2 = await prisma.requestQuestion.create({
        data: {
          tenantId: TENANT,
          requestId: rfx.id,
          sectionId: secTech.id,
          qType: 'number',
          prompt: 'Years of experience on similar projects',
          required: true,
          weight: 1,
          calc: { min: 0, max: 20 },
          order: 2,
        },
      });
      const q3 = await prisma.requestQuestion.create({
        data: {
          tenantId: TENANT,
          requestId: rfx.id,
          sectionId: secComm.id,
          qType: 'text',
          prompt: 'Describe your delivery approach',
          required: false,
          weight: 1,
          order: 1,
        },
      });
      const q4 = await prisma.requestQuestion.create({
        data: {
          tenantId: TENANT,
          requestId: rfx.id,
          sectionId: secComm.id,
          qType: 'number',
          prompt: 'Total price (£)',
          required: true,
          weight: 2,
          // When normalized, lower price maps to higher score if using a policy; keep as numeric for now
          calc: { min: 0, max: 1000000 },
          order: 2,
        },
      });

      // Supplier invites
      const suppliers = await prisma.supplier.findMany({ where: { tenantId: TENANT, name: { in: ['Supplier 1','Supplier 2','Steel Masters'] } } });
      const s1 = suppliers.find((s) => s.name === 'Supplier 1');
      const s2 = suppliers.find((s) => s.name === 'Supplier 2');
      const s3 = suppliers.find((s) => s.name === 'Steel Masters');
      if (s1) await prisma.requestInvite.create({ data: { tenantId: TENANT, requestId: rfx.id, supplierId: s1.id, email: 's1@suppliers.local' } });
      if (s2) await prisma.requestInvite.create({ data: { tenantId: TENANT, requestId: rfx.id, supplierId: s2.id, email: 's2@suppliers.local' } });
      if (s3) await prisma.requestInvite.create({ data: { tenantId: TENANT, requestId: rfx.id, supplierId: s3.id, email: 's3@suppliers.local' } });

      // Responses (submitted)
      const nowResp = new Date();
      if (s1) {
        await prisma.requestResponse.create({
          data: {
            tenantId: TENANT,
            requestId: rfx.id,
            supplierId: s1.id,
            stage: 1,
            answers: {
              [q1.id]: 'yes',
              [q2.id]: 8,
              [q3.id]: 'We will phase deliveries and coordinate with site ops',
              [q4.id]: 250000,
              _scores: { [q3.id]: 80 },
            },
            submittedAt: nowResp,
            status: 'submitted',
          },
        });
      }
      if (s2) {
        await prisma.requestResponse.create({
          data: {
            tenantId: TENANT,
            requestId: rfx.id,
            supplierId: s2.id,
            stage: 1,
            answers: {
              [q1.id]: 'no',
              [q2.id]: 12,
              [q3.id]: 'Direct-to-site weekly drops; minimal storage needed',
              [q4.id]: 230000,
              _scores: { [q3.id]: 70 },
            },
            submittedAt: nowResp,
            status: 'submitted',
          },
        });
      }
      if (s3) {
        await prisma.requestResponse.create({
          data: {
            tenantId: TENANT,
            requestId: rfx.id,
            supplierId: s3.id,
            stage: 1,
            answers: {
              [q1.id]: 'yes',
              [q2.id]: 15,
              [q3.id]: 'Lean delivery with prefabrication where possible',
              [q4.id]: 255000,
              _scores: { [q3.id]: 85 },
            },
            submittedAt: nowResp,
            status: 'submitted',
          },
        });
      }

      // QnA
      await prisma.requestQna.create({
        data: {
          tenantId: TENANT,
          requestId: rfx.id,
          supplierId: s1 ? s1.id : null,
          question: 'Can installation be done out-of-hours?',
          answer: 'Yes, weekend working is acceptable.',
        },
      });

      // Provisional award decision (seed)
      if (s2) {
        await prisma.awardDecision.create({
          data: { tenantId: TENANT, requestId: rfx.id, supplierId: s2.id, decision: 'awarded', reason: 'Best value', decidedBy: adminUser.id, decidedAt: new Date() },
        });
        await prisma.request.update({ where: { id: rfx.id }, data: { status: 'awarded' } });
      }
    }
    console.log('✔ Seeded RFx demo');
  } catch (e) {
    console.warn('RFx seed skipped:', e?.message || e);
  }

  // ---------------- Tender/Package/Contract Seed ----------------
  try {
    const s1 = await prisma.supplier.findFirst({ where: { tenantId: TENANT, name: 'Supplier 1' } });
    const s2 = await prisma.supplier.findFirst({ where: { tenantId: TENANT, name: 'Steel Masters' } });
    const pkg = await prisma.package.create({
      data: {
        projectId: proj1.id,
        name: 'Fit-Out Package',
        scope: 'Office fit-out including partitions and MEP',
        trade: 'Fit-Out',
        status: 'Tendering',
        deadline: new Date(Date.now() + 10 * 86400000),
      },
    });
    if (s1) await prisma.tenderInvite.create({ data: { packageId: pkg.id, supplierId: s1.id, status: 'Invited' } });
    if (s2) await prisma.tenderInvite.create({ data: { packageId: pkg.id, supplierId: s2.id, status: 'Invited' } });
    if (s1) await prisma.submission.create({ data: { packageId: pkg.id, supplierId: s1.id, price: 220000, durationWeeks: 10, technicalScore: 78, priceScore: 88, overallScore: 83, rank: 2, status: 'Submitted' } });
    if (s2) await prisma.submission.create({ data: { packageId: pkg.id, supplierId: s2.id, price: 210000, durationWeeks: 9, technicalScore: 82, priceScore: 90, overallScore: 86, rank: 1, status: 'Submitted' } });
    if (s2) {
      await prisma.package.update({ where: { id: pkg.id }, data: { awardSupplierId: s2.id, awardValue: 210000, status: 'Awarded' } });
      await prisma.contract.create({ data: { projectId: proj1.id, packageId: pkg.id, supplierId: s2.id, title: 'Fit-Out Contract', value: 210000, status: 'Signed', signedAt: new Date() } });
    }

    // Another standalone contract on project 2
    if (s1) await prisma.contract.create({ data: { projectId: proj2.id, supplierId: s1.id, title: 'MEP Maintenance', value: 45000, status: 'Pending' } });
  } catch (e) {
    console.warn('Package/Contract seed skipped:', e?.message || e);
  }

  // Financial seed: budgets, commitments, actuals, forecasts with periodMonth for CVR/trend
  const periods = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'];
  for (const p of periods) {
    await prisma.budgetLine.create({ data: { tenantId: TENANT, projectId: proj1.id, code: 'BLD', category: 'Build', description: `Build budget ${p}`, amount: 30000, periodMonth: p } });
    await prisma.commitment.create({ data: { tenantId: TENANT, projectId: proj1.id, category: 'Build', description: `Committed ${p}`, amount: 10000, status: 'Open', periodMonth: p } });
    await prisma.actualCost.create({ data: { tenantId: TENANT, projectId: proj1.id, category: 'Build', description: `Actual spend ${p}`, amount: 5000, periodMonth: p, incurredAt: new Date(p + '-15T00:00:00Z') } });
    await prisma.forecast.create({ data: { tenantId: TENANT, projectId: proj1.id, description: 'Build', amount: 20000, period: p, periodMonth: p } });
  }

  // Financial items for quick UI checks
  await prisma.financialItem.createMany({
    data: [
      { tenantId: TENANT, projectId: proj1.id, name: 'Contingency', amount: 15000 },
      { tenantId: TENANT, projectId: proj1.id, name: 'Prelims', amount: 22000 },
      { tenantId: TENANT, projectId: proj2.id, name: 'Design Fees', amount: 18000 },
    ],
    skipDuplicates: true,
  });

  // Recompute snapshots
  await recomputeProjectSnapshot(prisma, { projectId: proj1.id });
  await recomputeProjectSnapshot(prisma, { projectId: proj2.id });
  await recomputeProjectSnapshot(prisma, { projectId: proj3.id });

  // Variation status history
  try {
    const hist = [
      { variationId: v2.id, fromStatus: 'draft', toStatus: 'submitted', note: 'Submitted for review' },
      { variationId: v3.id, fromStatus: 'submitted', toStatus: 'approved', note: 'Approved by PM' },
    ];
    for (const h of hist) {
      await prisma.variationStatusHistory.create({ data: { tenantId: TENANT, ...h } });
    }
  } catch {}

  // Onboarding demo
  try {
    const ob = await prisma.onboardingProject.create({ data: { tenantId: TENANT, name: 'Supplier Onboarding', status: 'active' } });
    const form = await prisma.onboardingForm.create({ data: { tenantId: TENANT, projectId: ob.id, title: 'General Onboarding', isPublished: true, sections: [{ title: 'Basics' }, { title: 'H&S' }] } });
    const sup = await prisma.supplier.findFirst({ where: { tenantId: TENANT } });
    if (sup) {
      const inv = await prisma.onboardingInvite.create({ data: { tenantId: TENANT, projectId: ob.id, supplierId: sup.id, email: 'onboard@supplier.local', token: 'demo-token', status: 'invited' } });
      await prisma.onboardingResponse.create({ data: { tenantId: TENANT, projectId: ob.id, supplierId: sup.id, formId: form.id, answers: { company: sup.name, hs: 'ISO45001' }, status: 'submitted', submittedAt: new Date(), decision: 'approved' } });
      await prisma.onboardingInvite.update({ where: { id: inv.id }, data: { status: 'responded', respondedAt: new Date() } });
    }
  } catch {}

  // SPM demo
  try {
    const tmpl = await prisma.spmTemplate.create({ data: { tenantId: TENANT, name: 'Monthly Performance', categories: ['Delivery','Quality'], kpis: ['On-time','Defects'] } });
    const s1 = await prisma.supplier.findFirst({ where: { tenantId: TENANT, name: 'Supplier 1' } });
    if (s1) {
      const card = await prisma.spmScorecard.create({ data: { tenantId: TENANT, supplierId: s1.id, templateId: tmpl.id, periodMonth: '2025-06', status: 'closed', totalScore: 88 } });
      await prisma.spmScore.createMany({ data: [
        { tenantId: TENANT, scorecardId: card.id, category: 'Delivery', kpi: 'On-time', weight: 0.5, value: 90 },
        { tenantId: TENANT, scorecardId: card.id, category: 'Quality', kpi: 'Defects', weight: 0.5, value: 86 },
      ] });
    }
  } catch {}

  // Audit logs
  try {
    await prisma.auditLog.createMany({ data: [
      { userId: adminUser.id, entity: 'Project', entityId: String(proj1.id), action: 'create' },
      { userId: adminUser.id, entity: 'PurchaseOrder', entityId: String(po1.id), action: 'create' },
      { userId: adminUser.id, entity: 'Variation', entityId: String(v2.id), action: 'submit' },
    ] });
  } catch {}
  try { const { recomputeFinancials } = require('../services/projectSnapshot'); await recomputeFinancials(proj1.id, TENANT); } catch {}

  console.log('Seed complete');
  process.exit(0);
})().catch((e) => { console.error('Seed error', e); process.exit(1); });
