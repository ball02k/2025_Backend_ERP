#!/usr/bin/env node
/**
 * Comprehensive seed data for 2025 ERP
 * Creates realistic, interconnected data across all modules:
 * - Multiple projects, clients, suppliers
 * - Full procurement lifecycle (RFx, tenders, awards, contracts, POs)
 * - Financial data (budgets, commitments, invoices, variations)
 * - Operations (RFIs, QA, H&S, carbon tracking)
 * - Tasks and deliveries
 */

const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

const TENANT = 'demo';

// Helpers
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function toDecimal(n) { return new Prisma.Decimal(n); }
function money(n) { return Number(n.toFixed(2)); }

const now = new Date();

// ============================================================================
// CLIENTS
// ============================================================================
async function seedClients() {
  const clients = [
    { name: 'TechCorp Industries', regNo: 'TC123456', vat: 'GB123456789', city: 'London' },
    { name: 'Green Energy Solutions Ltd', regNo: 'GES987654', vat: 'GB987654321', city: 'Manchester' },
    { name: 'Retail Spaces Group', regNo: 'RSG456789', vat: 'GB456789123', city: 'Birmingham' },
    { name: 'Healthcare Facilities Trust', regNo: 'HFT789123', vat: 'GB789123456', city: 'Leeds' },
  ];

  const created = [];
  for (const c of clients) {
    let client = await prisma.client.findFirst({ where: { tenantId: TENANT, name: c.name } });
    if (!client) {
      client = await prisma.client.create({
        data: {
          tenantId: TENANT,
          name: c.name,
          companyRegNo: c.regNo,
          vatNumber: c.vat,
          city: c.city,
          addressLine1: `${randInt(1, 100)} ${pick(['High Street', 'Main Road', 'Park Avenue', 'Victoria Street'])}`,
          postcode: `${pick(['SW', 'NW', 'SE', 'NE'])}${randInt(1, 9)} ${randInt(1, 9)}${pick(['AA', 'BB', 'CC'])}`,
        },
      });
    }
    created.push(client);
  }
  return created;
}

// ============================================================================
// SUPPLIERS
// ============================================================================
async function seedSuppliers() {
  const suppliers = [
    { name: 'Steelworks UK Ltd', status: 'active', caps: ['Steel', 'Fabrication', 'Structural'] },
    { name: 'City MEP Services', status: 'active', caps: ['MEP', 'Electrical', 'HVAC'] },
    { name: 'Finishes & Interiors Co', status: 'active', caps: ['Finishes', 'Joinery', 'Decoration'] },
    { name: 'Alpha Concrete Supplies', status: 'active', caps: ['Concrete', 'Groundworks', 'Foundations'] },
    { name: 'Skyline Facades Ltd', status: 'active', caps: ['Facades', 'Cladding', 'Glazing'] },
    { name: 'GreenPlant Hire', status: 'active', caps: ['Plant Hire', 'Equipment', 'Temporary Works'] },
    { name: 'Safety First Services', status: 'active', caps: ['Safety', 'Training', 'PPE Supply'] },
    { name: 'Digital Systems Integration', status: 'active', caps: ['IT', 'Security', 'AV Systems'] },
  ];

  const created = [];
  for (const s of suppliers) {
    let supplier = await prisma.supplier.findFirst({ where: { tenantId: TENANT, name: s.name } });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          tenantId: TENANT,
          name: s.name,
          status: s.status,
          performanceScore: randInt(70, 95),
          insuranceExpiry: addMonths(now, randInt(6, 24)),
          hsExpiry: addMonths(now, randInt(6, 18)),
          hsAccreditations: pick(['ISO45001', 'CHAS', 'SafeContractor', 'Constructionline']),
        },
      });
      // Add capabilities
      for (const cap of s.caps) {
        await prisma.supplierCapability.create({
          data: { tenantId: TENANT, supplierId: supplier.id, tag: cap },
        }).catch(() => {});
      }
    }
    created.push(supplier);
  }
  return created;
}

// ============================================================================
// PROJECTS
// ============================================================================
async function seedProjects(clients) {
  const projects = [
    {
      code: 'HQ-2025',
      name: 'Headquarters Office Fit-Out',
      clientId: clients[0].id,
      type: 'Commercial',
      status: 'Active',
      budget: 2500000,
      startDate: addDays(now, -90),
      endDate: addDays(now, 180),
    },
    {
      code: 'WF-2025',
      name: 'Wind Farm Construction Phase 2',
      clientId: clients[1].id,
      type: 'Infrastructure',
      status: 'Active',
      budget: 8500000,
      startDate: addDays(now, -120),
      endDate: addDays(now, 360),
    },
    {
      code: 'RTL-2025',
      name: 'Shopping Centre Refurbishment',
      clientId: clients[2].id,
      type: 'Retail',
      status: 'Active',
      budget: 1750000,
      startDate: addDays(now, -60),
      endDate: addDays(now, 150),
    },
    {
      code: 'HC-2025',
      name: 'Medical Centre Extension',
      clientId: clients[3].id,
      type: 'Healthcare',
      status: 'Active',
      budget: 3200000,
      startDate: addDays(now, -45),
      endDate: addDays(now, 240),
    },
    {
      code: 'SCH-2024',
      name: 'Primary School Build',
      clientId: clients[0].id,
      type: 'Education',
      status: 'Completed',
      budget: 4500000,
      startDate: addDays(now, -365),
      endDate: addDays(now, -30),
    },
  ];

  const created = [];
  for (const p of projects) {
    let project = await prisma.project.findFirst({ where: { tenantId: TENANT, code: p.code } });
    if (!project) {
      project = await prisma.project.create({
        data: {
          tenantId: TENANT,
          ...p,
        },
      });
    }
    created.push(project);
  }
  return created;
}

// ============================================================================
// BUDGETS
// ============================================================================
async function seedBudgets(projectId) {
  const budgetGroups = [
    { name: 'Groundworks & Substructure', code: '1.0', lines: [
      { code: '1.1', description: 'Site clearance and enabling works', qty: 1, rate: 85000 },
      { code: '1.2', description: 'Excavation and earthworks', qty: 1, rate: 120000 },
      { code: '1.3', description: 'Foundations and ground beams', qty: 1, rate: 180000 },
    ]},
    { name: 'Superstructure', code: '2.0', lines: [
      { code: '2.1', description: 'Structural steel frame', qty: 245, unit: 'tonnes', rate: 2800 },
      { code: '2.2', description: 'Concrete floors and slabs', qty: 3200, unit: 'm²', rate: 145 },
      { code: '2.3', description: 'Roofing and cladding', qty: 2500, unit: 'm²', rate: 185 },
    ]},
    { name: 'MEP Services', code: '3.0', lines: [
      { code: '3.1', description: 'Mechanical installations', qty: 1, rate: 420000 },
      { code: '3.2', description: 'Electrical installations', qty: 1, rate: 380000 },
      { code: '3.3', description: 'Plumbing and drainage', qty: 1, rate: 165000 },
    ]},
    { name: 'Finishes', code: '4.0', lines: [
      { code: '4.1', description: 'Internal wall finishes', qty: 4500, unit: 'm²', rate: 65 },
      { code: '4.2', description: 'Floor finishes', qty: 3200, unit: 'm²', rate: 95 },
      { code: '4.3', description: 'Ceiling systems', qty: 3000, unit: 'm²', rate: 75 },
      { code: '4.4', description: 'Joinery and fit-out', qty: 1, rate: 285000 },
    ]},
    { name: 'Preliminaries', code: '5.0', lines: [
      { code: '5.1', description: 'Site establishment and welfare', qty: 1, rate: 125000 },
      { code: '5.2', description: 'Temporary works', qty: 1, rate: 95000 },
      { code: '5.3', description: 'Management and supervision', qty: 1, rate: 180000 },
    ]},
  ];

  for (const group of budgetGroups) {
    const budgetGroup = await prisma.budgetGroup.create({
      data: {
        tenantId: TENANT,
        projectId,
        name: group.name,
        code: group.code,
      },
    }).catch(() => null);

    for (const line of group.lines) {
      const total = (line.qty || 1) * line.rate;
      await prisma.budgetLine.create({
        data: {
          tenantId: TENANT,
          projectId,
          groupId: budgetGroup?.id || null,
          code: line.code,
          description: line.description,
          qty: line.qty || 1,
          unit: line.unit || 'sum',
          rate: toDecimal(line.rate),
          total: toDecimal(total),
          amount: toDecimal(total),
        },
      }).catch(() => {});
    }
  }
}

// ============================================================================
// PACKAGES & TENDERS
// ============================================================================
async function seedPackages(projectId, suppliers) {
  const packages = [
    { name: 'Structural Steel Package', trade: 'Structural', scope: 'Supply and install structural steelwork', budget: 686000 },
    { name: 'MEP Package', trade: 'MEP', scope: 'Complete M&E installations', budget: 965000 },
    { name: 'Finishes Package', trade: 'Finishes', scope: 'All internal finishes and fit-out', budget: 710000 },
    { name: 'Facades Package', trade: 'Facades', scope: 'External envelope and glazing', budget: 462500 },
  ];

  const created = [];
  for (const pkg of packages) {
    const packageRec = await prisma.package.create({
      data: {
        projectId,
        name: pkg.name,
        trade: pkg.trade,
        scopeSummary: pkg.scope,
        budgetEstimate: pkg.budget,
        status: 'Tender',
        deadline: addDays(now, randInt(14, 45)),
      },
    }).catch(() => null);

    if (packageRec) {
      // Invite 3-5 suppliers
      const inviteCount = randInt(3, Math.min(5, suppliers.length));
      const invited = [];
      for (let i = 0; i < inviteCount; i++) {
        const supplier = suppliers[i % suppliers.length];
        await prisma.tenderInvite.create({
          data: {
            packageId: packageRec.id,
            supplierId: supplier.id,
            invitedAt: addDays(now, -randInt(7, 21)),
            status: 'Invited',
          },
        }).catch(() => {});
        invited.push(supplier);
      }

      // Create submissions from 2-3 suppliers
      const submissionCount = Math.max(2, inviteCount - randInt(0, 2));
      let bestSubmission = null;
      for (let i = 0; i < submissionCount; i++) {
        const supplier = invited[i];
        const variance = 1 - (randInt(-10, 15) / 100);
        const price = Math.round(pkg.budget * variance);
        const techScore = randInt(65, 95);
        const priceScore = randInt(60, 90);
        const overallScore = (techScore * 0.6) + (priceScore * 0.4);

        const submission = await prisma.submission.create({
          data: {
            packageId: packageRec.id,
            supplierId: supplier.id,
            price: toDecimal(price),
            durationWeeks: randInt(16, 32),
            technicalScore: techScore,
            priceScore,
            overallScore,
            status: 'Submitted',
            submittedAt: addDays(now, -randInt(1, 10)),
          },
        }).catch(() => null);

        if (submission && (!bestSubmission || overallScore > bestSubmission.overallScore)) {
          bestSubmission = { submission, supplier, price };
        }
      }

      // Award to best submission
      if (bestSubmission && Math.random() > 0.3) { // 70% awarded
        await prisma.package.update({
          where: { id: packageRec.id },
          data: {
            status: 'Awarded',
            awardSupplierId: bestSubmission.supplier.id,
            awardValue: toDecimal(bestSubmission.price),
          },
        }).catch(() => {});

        // Create contract
        await prisma.contract.create({
          data: {
            tenantId: TENANT,
            projectId,
            packageId: packageRec.id,
            supplierId: bestSubmission.supplier.id,
            title: `${pkg.name} Contract`,
            contractNumber: `CNT-${projectId}-${String(packageRec.id).padStart(3, '0')}`,
            value: toDecimal(bestSubmission.price),
            status: pick(['Draft', 'Signed', 'Active']),
            signedAt: addDays(now, -randInt(1, 7)),
            startDate: addDays(now, randInt(7, 21)),
            retentionPct: pick([3, 5, 10]),
          },
        }).catch(() => {});
      }

      created.push({ package: packageRec, bestSubmission });
    }
  }
  return created;
}

// ============================================================================
// PURCHASE ORDERS
// ============================================================================
async function seedPurchaseOrders(projectId, suppliers) {
  const poData = [
    { supplier: 0, status: 'Open', lines: [
      { item: 'Structural steel - first delivery', qty: 85, unit: 'tonnes', unitCost: 2800 },
      { item: 'Bolts and fixings', qty: 500, unit: 'units', unitCost: 12.5 },
    ]},
    { supplier: 1, status: 'Approved', lines: [
      { item: 'Cable installation', qty: 2500, unit: 'm', unitCost: 8.5 },
      { item: 'Distribution boards', qty: 12, unit: 'units', unitCost: 850 },
      { item: 'LED lighting', qty: 240, unit: 'units', unitCost: 65 },
    ]},
    { supplier: 2, status: 'Closed', lines: [
      { item: 'Paint and decorating materials', qty: 1, unit: 'sum', unitCost: 18500 },
    ]},
    { supplier: 3, status: 'Open', lines: [
      { item: 'Ready-mix concrete C35', qty: 125, unit: 'm³', unitCost: 145 },
    ]},
  ];

  for (let i = 0; i < poData.length; i++) {
    const data = poData[i];
    const supplier = suppliers[data.supplier % suppliers.length];
    const total = data.lines.reduce((sum, line) => sum + (line.qty * line.unitCost), 0);

    const po = await prisma.purchaseOrder.create({
      data: {
        tenantId: TENANT,
        projectId,
        code: `PO-${projectId}-${String(i + 1).padStart(4, '0')}`,
        poNumber: `PO-${String(projectId).padStart(3, '0')}-${String(i + 1).padStart(4, '0')}`,
        supplier: supplier.name,
        supplierId: supplier.id,
        status: data.status,
        orderDate: addDays(now, -randInt(5, 30)),
        total: toDecimal(total),
      },
    }).catch(() => null);

    if (po) {
      for (const line of data.lines) {
        const lineTotal = line.qty * line.unitCost;
        await prisma.pOLine.create({
          data: {
            tenantId: TENANT,
            poId: po.id,
            item: line.item,
            qty: toDecimal(line.qty),
            unit: line.unit,
            unitCost: toDecimal(line.unitCost),
            lineTotal: toDecimal(lineTotal),
          },
        }).catch(() => {});
      }

      // Add deliveries
      const deliveryCount = randInt(1, 3);
      for (let d = 0; d < deliveryCount; d++) {
        const expectedAt = addDays(now, randInt(-10, 20));
        const isReceived = expectedAt < now && Math.random() > 0.3;
        await prisma.delivery.create({
          data: {
            tenantId: TENANT,
            poId: po.id,
            expectedAt,
            receivedAt: isReceived ? addDays(expectedAt, randInt(0, 3)) : null,
            note: `Delivery ${d + 1}/${deliveryCount}`,
          },
        }).catch(() => {});
      }
    }
  }
}

// ============================================================================
// RFIs
// ============================================================================
async function seedRFIs(projectId) {
  const rfis = [
    { subject: 'Clarification on steel connection details', discipline: 'Structural', priority: 'high' },
    { subject: 'Electrical load calculations confirmation', discipline: 'MEP', priority: 'urgent' },
    { subject: 'Floor finish specification query', discipline: 'Arch', priority: 'medium' },
    { subject: 'Fire stopping detail at penetrations', discipline: 'MEP', priority: 'high' },
    { subject: 'Facade panel fixing methodology', discipline: 'Arch', priority: 'medium' },
    { subject: 'HVAC ductwork routing approval', discipline: 'MEP', priority: 'low' },
  ];

  for (let i = 0; i < rfis.length; i++) {
    const rfi = rfis[i];
    const daysAgo = randInt(1, 30);
    const status = daysAgo > 20 ? 'answered' : daysAgo > 10 ? 'open' : pick(['open', 'answered']);

    await prisma.rfi.create({
      data: {
        tenantId: TENANT,
        projectId,
        rfiNumber: `RFI-${String(projectId).padStart(3, '0')}-${String(i + 1).padStart(3, '0')}`,
        subject: rfi.subject,
        question: `Please provide clarification on ${rfi.subject.toLowerCase()}.`,
        status,
        priority: rfi.priority,
        discipline: rfi.discipline,
        createdBy: pick(['John Smith', 'Sarah Jones', 'Mike Chen', 'Emma Wilson']),
        dueDate: addDays(now, -daysAgo + randInt(3, 14)),
        createdAt: addDays(now, -daysAgo),
        respondedAt: status === 'answered' ? addDays(now, -randInt(1, daysAgo)) : null,
        response: status === 'answered' ? 'Confirmed as per specification section 3.2.' : null,
      },
    }).catch(() => {});
  }
}

// ============================================================================
// QA RECORDS
// ============================================================================
async function seedQA(projectId) {
  const qaTypes = ['inspection', 'test', 'snag', 'NCR'];
  const trades = ['Concrete', 'Steel', 'MEP', 'Finishes', 'Facades'];
  const statuses = ['open', 'pass', 'fail'];

  for (let i = 0; i < 12; i++) {
    const type = pick(qaTypes);
    const trade = pick(trades);
    const status = pick(statuses);
    const daysAgo = randInt(1, 45);

    const record = await prisma.qaRecord.create({
      data: {
        tenantId: TENANT,
        projectId,
        type,
        title: `${type.toUpperCase()}: ${trade} - Area ${String.fromCharCode(65 + (i % 5))}`,
        status,
        trade,
        inspector: pick(['A. Smith', 'B. Jones', 'C. Chen', 'D. Wilson']),
        dueDate: addDays(now, -daysAgo + randInt(7, 21)),
        createdAt: addDays(now, -daysAgo),
        closedAt: status !== 'open' ? addDays(now, -randInt(1, Math.max(1, daysAgo - 5))) : null,
      },
    }).catch(() => null);

    if (record) {
      // Add QA items
      const itemCount = randInt(2, 6);
      for (let j = 0; j < itemCount; j++) {
        await prisma.qaItem.create({
          data: {
            tenantId: TENANT,
            qaRecordId: record.id,
            item: `Check point ${j + 1}: ${pick(['Alignment', 'Finish quality', 'Dimensional accuracy', 'Material compliance', 'Installation method'])}`,
            result: pick(['pass', 'fail', 'na', 'open']),
            notes: Math.random() > 0.5 ? `Noted: ${pick(['Minor defect', 'Acceptable variation', 'Rectified on site', 'To be monitored'])}` : null,
          },
        }).catch(() => {});
      }
    }
  }
}

// ============================================================================
// H&S EVENTS
// ============================================================================
async function seedHS(projectId) {
  const types = ['incident', 'near_miss', 'observation', 'inspection', 'toolbox_talk'];
  const severities = ['minor', 'moderate', 'major'];
  const statuses = ['open', 'investigating', 'closed'];

  for (let i = 0; i < 15; i++) {
    const type = pick(types);
    const severity = type === 'incident' ? pick(severities) : 'minor';
    const daysAgo = randInt(1, 90);
    const status = daysAgo > 60 ? 'closed' : daysAgo > 30 ? pick(['investigating', 'closed']) : pick(statuses);

    await prisma.hsEvent.create({
      data: {
        tenantId: TENANT,
        projectId,
        type,
        title: `${type.replace('_', ' ').toUpperCase()}: ${pick(['Site access', 'Working at height', 'Lifting operations', 'Manual handling', 'PPE compliance', 'Housekeeping'])}`,
        description: `Event recorded on ${addDays(now, -daysAgo).toLocaleDateString()}. ${pick(['No injuries sustained', 'First aid administered', 'Corrective action required', 'Site briefing completed'])}.`,
        eventDate: addDays(now, -daysAgo),
        status,
        severity,
        isRIDDOR: type === 'incident' && severity === 'major' && Math.random() > 0.8,
        reportedBy: pick(['Site Manager', 'Foreman', 'Safety Officer', 'Subcontractor']),
        closedAt: status === 'closed' ? addDays(now, -randInt(1, Math.max(1, daysAgo - 5))) : null,
      },
    }).catch(() => {});
  }
}

// ============================================================================
// CARBON TRACKING
// ============================================================================
async function seedCarbon(projectId) {
  const categories = [
    { scope: '1', category: 'Diesel-Site Plant', unit: 'L', factor: 2.68 },
    { scope: '1', category: 'Gas-Heating', unit: 'm³', factor: 2.04 },
    { scope: '2', category: 'Grid Electricity', unit: 'kWh', factor: 0.19 },
    { scope: '3', category: 'Concrete-Ready Mix', unit: 't', factor: 95 },
    { scope: '3', category: 'Steel-Structural', unit: 't', factor: 1850 },
    { scope: '3', category: 'Timber-Softwood', unit: 'm³', factor: 125 },
    { scope: '3', category: 'Waste-General', unit: 't', factor: 21.5 },
  ];

  // Create entries for the last 6 months
  for (let m = 0; m < 6; m++) {
    const monthDate = addMonths(now, -m);
    const month = monthDate.getMonth() + 1;
    const year = monthDate.getFullYear();

    for (const cat of categories) {
      const entries = randInt(1, 4); // 1-4 entries per category per month
      for (let e = 0; e < entries; e++) {
        const qty = randInt(10, 500);
        const kgCO2e = qty * cat.factor;

        await prisma.carbonEntry.create({
          data: {
            tenantId: TENANT,
            projectId,
            scope: cat.scope,
            category: cat.category,
            activityDate: addDays(monthDate, randInt(1, 28)),
            quantity: qty,
            unit: cat.unit,
            emissionFactor: cat.factor,
            factorUnit: 'kgCO2e/unit',
            calculatedKgCO2e: kgCO2e,
            periodMonth: month,
            periodYear: year,
            source: pick(['Supplier invoice', 'Delivery note', 'Site record', 'Meter reading']),
            notes: `Monthly ${cat.category} consumption`,
          },
        }).catch(() => {});
      }
    }
  }
}

// ============================================================================
// TASKS
// ============================================================================
async function seedTasks(projectId) {
  // Ensure task statuses exist
  const statusDefs = [
    { key: 'Open', label: 'Open', sortOrder: 1 },
    { key: 'InProgress', label: 'In Progress', sortOrder: 2 },
    { key: 'Blocked', label: 'Blocked', sortOrder: 3 },
    { key: 'Done', label: 'Done', sortOrder: 99 },
  ];

  const statusMap = {};
  for (const def of statusDefs) {
    const status = await prisma.taskStatus.upsert({
      where: { tenantId_key: { tenantId: 0, key: def.key } },
      update: { label: def.label, sortOrder: def.sortOrder },
      create: { tenantId: 0, key: def.key, label: def.label, sortOrder: def.sortOrder },
    });
    statusMap[def.key] = status.id;
  }

  const tasks = [
    { title: 'Complete site mobilization', status: 'Done', dueOffset: -20 },
    { title: 'Approve structural drawings', status: 'Done', dueOffset: -15 },
    { title: 'Order long-lead MEP equipment', status: 'InProgress', dueOffset: 5 },
    { title: 'Submit RAMS for groundworks', status: 'InProgress', dueOffset: 3 },
    { title: 'Coordinate steel delivery schedule', status: 'Open', dueOffset: 7 },
    { title: 'Review facade shop drawings', status: 'Open', dueOffset: 10 },
    { title: 'Book utility connections', status: 'Blocked', dueOffset: -2 },
    { title: 'Organize site safety induction', status: 'Open', dueOffset: 14 },
    { title: 'Prepare monthly progress report', status: 'InProgress', dueOffset: 2 },
    { title: 'Coordinate crane installation', status: 'Open', dueOffset: 21 },
  ];

  for (const task of tasks) {
    const dueDate = addDays(now, task.dueOffset);
    await prisma.task.create({
      data: {
        tenantId: TENANT,
        projectId,
        title: task.title,
        status: task.status,
        statusId: statusMap[task.status],
        dueDate,
        assignee: pick(['Project Manager', 'Site Manager', 'QS', 'Design Coordinator', 'Safety Officer']),
        priority: task.dueOffset < 0 ? 'high' : task.dueOffset < 7 ? 'medium' : 'low',
        createdAt: addDays(dueDate, -randInt(7, 21)),
      },
    }).catch(() => {});
  }
}

// ============================================================================
// VARIATIONS
// ============================================================================
async function seedVariations(projectId) {
  const variations = [
    { title: 'Additional floor loading requirement', value: 45000, status: 'Approved' },
    { title: 'Upgraded lighting specification', value: 28500, status: 'Submitted' },
    { title: 'Extended facade area', value: 92000, status: 'Draft' },
    { title: 'Additional data cabling', value: 15200, status: 'Approved' },
    { title: 'Client requested partition changes', value: 33750, status: 'Submitted' },
  ];

  for (let i = 0; i < variations.length; i++) {
    const v = variations[i];
    const daysAgo = randInt(5, 45);

    await prisma.variation.create({
      data: {
        tenantId: TENANT,
        projectId,
        variationNumber: `VO-${String(projectId).padStart(3, '0')}-${String(i + 1).padStart(3, '0')}`,
        title: v.title,
        description: `Variation for ${v.title.toLowerCase()}. Impact assessment and pricing provided.`,
        status: v.status,
        valueEstimate: toDecimal(v.value),
        valueApproved: v.status === 'Approved' ? toDecimal(v.value) : null,
        initiator: pick(['Client', 'Design Team', 'Site Team', 'QS']),
        createdAt: addDays(now, -daysAgo),
        submittedAt: v.status !== 'Draft' ? addDays(now, -randInt(1, daysAgo - 2)) : null,
        approvedAt: v.status === 'Approved' ? addDays(now, -randInt(1, 10)) : null,
      },
    }).catch(() => {});
  }
}

// ============================================================================
// INVOICES
// ============================================================================
async function seedInvoices(projectId, suppliers) {
  const invoices = [
    { supplier: 0, number: 'INV-ST-2025-001', net: 238000, status: 'Paid' },
    { supplier: 1, number: 'INV-MEP-2025-001', net: 156000, status: 'Approved' },
    { supplier: 1, number: 'INV-MEP-2025-002', net: 89500, status: 'Pending' },
    { supplier: 2, number: 'INV-FIN-2025-001', net: 127000, status: 'Approved' },
    { supplier: 3, number: 'INV-CON-2025-001', net: 18125, status: 'Paid' },
  ];

  for (const inv of invoices) {
    const supplier = suppliers[inv.supplier % suppliers.length];
    const daysAgo = inv.status === 'Paid' ? randInt(30, 60) : randInt(5, 25);
    const vat = inv.net * 0.2;
    const gross = inv.net + vat;

    await prisma.invoice.create({
      data: {
        tenantId: TENANT,
        projectId,
        supplierId: supplier.id,
        number: inv.number,
        issueDate: addDays(now, -daysAgo),
        dueDate: addDays(now, -daysAgo + 30),
        net: toDecimal(inv.net),
        vat: toDecimal(vat),
        gross: toDecimal(gross),
        status: inv.status,
        paidAt: inv.status === 'Paid' ? addDays(now, -randInt(1, 15)) : null,
      },
    }).catch(() => {});
  }
}

// ============================================================================
// PROJECT SNAPSHOTS (for dashboard/overview)
// ============================================================================
async function updateProjectSnapshot(projectId) {
  const budgetSum = await prisma.budgetLine.aggregate({
    _sum: { amount: true },
    where: { tenantId: TENANT, projectId },
  }).catch(() => ({ _sum: { amount: 0 } }));

  const contractSum = await prisma.contract.aggregate({
    _sum: { value: true },
    where: { tenantId: TENANT, projectId },
  }).catch(() => ({ _sum: { value: 0 } }));

  const invoiceSum = await prisma.invoice.aggregate({
    _sum: { net: true },
    where: { tenantId: TENANT, projectId },
  }).catch(() => ({ _sum: { net: 0 } }));

  const rfisOpen = await prisma.rfi.count({
    where: { tenantId: TENANT, projectId, status: { in: ['open', 'Open'] } },
  }).catch(() => 0);

  const qaOpen = await prisma.qaRecord.count({
    where: { tenantId: TENANT, projectId, status: { in: ['open', 'Open', 'fail'] } },
  }).catch(() => 0);

  const hsOpen = await prisma.hsEvent.count({
    where: { tenantId: TENANT, projectId, status: { in: ['open', 'Open', 'investigating'] } },
  }).catch(() => 0);

  const tasksOverdue = await prisma.task.count({
    where: {
      tenantId: TENANT,
      projectId,
      status: { in: ['Open', 'InProgress', 'Blocked'] },
      dueDate: { lt: now },
    },
  }).catch(() => 0);

  const variationsSubmitted = await prisma.variation.count({
    where: { tenantId: TENANT, projectId, status: 'Submitted' },
  }).catch(() => 0);

  const variationsApproved = await prisma.variation.count({
    where: { tenantId: TENANT, projectId, status: 'Approved' },
  }).catch(() => 0);

  const budget = Number(budgetSum._sum.amount || 0);
  const committed = Number(contractSum._sum.value || 0);
  const actual = Number(invoiceSum._sum.net || 0);
  const variance = budget - committed;

  await prisma.projectSnapshot.upsert({
    where: { projectId },
    update: {
      financialBudget: budget,
      financialCommitted: committed,
      financialActual: actual,
      variance,
      rfisOpen,
      qaOpenNCR: qaOpen,
      hsOpenPermits: hsOpen,
      tasksOverdue,
      variationsSubmitted,
      variationsApproved,
      updatedAt: now,
    },
    create: {
      projectId,
      financialBudget: budget,
      financialCommitted: committed,
      financialActual: actual,
      variance,
      rfisOpen,
      qaOpenNCR: qaOpen,
      hsOpenPermits: hsOpen,
      tasksOverdue,
      variationsSubmitted,
      variationsApproved,
    },
  }).catch(() => {});
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('🌱 Starting comprehensive seed for tenant:', TENANT);

  console.log('\n1️⃣  Seeding clients...');
  const clients = await seedClients();
  console.log(`✅ Created ${clients.length} clients`);

  console.log('\n2️⃣  Seeding suppliers...');
  const suppliers = await seedSuppliers();
  console.log(`✅ Created ${suppliers.length} suppliers`);

  console.log('\n3️⃣  Seeding projects...');
  const projects = await seedProjects(clients);
  console.log(`✅ Created ${projects.length} projects`);

  // Seed detailed data for active projects only
  const activeProjects = projects.filter(p => p.status === 'Active');

  for (const project of activeProjects) {
    console.log(`\n📦 Seeding data for project: ${project.name} (ID: ${project.id})`);

    console.log('  - Budgets');
    await seedBudgets(project.id);

    console.log('  - Packages & Tenders');
    await seedPackages(project.id, suppliers);

    console.log('  - Purchase Orders');
    await seedPurchaseOrders(project.id, suppliers);

    console.log('  - RFIs');
    await seedRFIs(project.id);

    console.log('  - QA Records');
    await seedQA(project.id);

    console.log('  - H&S Events');
    await seedHS(project.id);

    console.log('  - Carbon Tracking');
    await seedCarbon(project.id);

    console.log('  - Tasks');
    await seedTasks(project.id);

    console.log('  - Variations');
    await seedVariations(project.id);

    console.log('  - Invoices');
    await seedInvoices(project.id, suppliers);

    console.log('  - Updating snapshot');
    await updateProjectSnapshot(project.id);
  }

  console.log('\n✅ Comprehensive seed completed successfully!');
  console.log(`\n📊 Summary:`);
  console.log(`   - ${clients.length} clients`);
  console.log(`   - ${suppliers.length} suppliers`);
  console.log(`   - ${projects.length} projects (${activeProjects.length} active)`);
  console.log(`\n🚀 Open the app and navigate to /projects to see the data!`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('\n❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
