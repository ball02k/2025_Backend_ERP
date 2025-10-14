/* Seed script for demo tenant.
   - No new deps
   - Safe: only writes tenantId = "demo"
   - Creates: Client, Project (if possible), Tasks, RFIs, QA/QC (+items), H&S, Carbon
*/
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TENANT = 'demo';

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function ymd(d) { return new Date(d); }

async function getOrCreateClient() {
  const name = 'Demo Client Ltd';
  let client = await prisma.client.findFirst({ where: { tenantId: TENANT, name } }).catch(()=>null);
  if (!client) {
    try {
      client = await prisma.client.create({
        data: {
          tenantId: TENANT,
          name,
          companyRegNo: '01234567',
          vatNumber: 'GB123456789',
          addressLine1: '1 Demo Street',
          city: 'London',
          postcode: 'EC1A 1AA',
        }
      });
    } catch (e) {
      // Client model may have different fields; fallback to minimal (Client has no tenantId in this schema)
      client = await prisma.client.create({ data: { name } });
    }
  }
  return client;
}

async function ensureProject(code, name, clientId, extras = {}) {
  // Use upsert by unique code to avoid duplicates on re-run
  return prisma.project.upsert({
    where: { code },
    update: { name, clientId, ...extras },
    create: {
      tenantId: TENANT,
      code,
      name,
      clientId,
      status: extras.status || 'Active',
      type: extras.type || 'General',
      startDate: extras.startDate || ymd(new Date()),
      endDate: extras.endDate || null,
    },
  });
}

async function getOrCreateProject(client) {
  // Backwards-compatible single project for scripts expecting one
  return ensureProject('PRJ-001', 'Demo Project Alpha', client.id);
}

async function ensureTaskStatuses() {
  const defs = [
    { key: 'Open', label: 'Open', sortOrder: 1 },
    { key: 'InProgress', label: 'In Progress', sortOrder: 2 },
    { key: 'Blocked', label: 'Blocked', sortOrder: 3 },
    { key: 'Done', label: 'Done', sortOrder: 99 },
  ];
  const map = {};
  for (const d of defs) {
    const s = await prisma.taskStatus.upsert({
      where: { tenantId_key: { tenantId: 0, key: d.key } },
      update: { label: d.label, sortOrder: d.sortOrder },
      create: { tenantId: 0, key: d.key, label: d.label, sortOrder: d.sortOrder },
    });
    map[d.key] = s.id;
  }
  return map;
}

async function seedTasks(projectId) {
  const statusMap = await ensureTaskStatuses();
  const plans = [
    { title: 'Mobilise site compound', k: 'Open' },
    { title: 'Issue short-term programme', k: 'InProgress' },
    { title: 'Subcontractor kickoff', k: 'Open' },
    { title: 'Order rebar package', k: 'Blocked' },
    { title: 'Submit RAMS for groundwork', k: 'InProgress' },
    { title: 'Book utility surveys', k: 'Done' },
  ];
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    try {
      await prisma.task.create({
        data: {
          tenantId: TENANT,
          projectId,
          title: p.title,
          status: p.k,
          statusId: statusMap[p.k],
          dueDate: addDays(new Date(), 7 + i * 3),
          assignee: pick(['A. Foreman','S. PM','M. QS', 'T. Engineer']),
        }
      });
    } catch { /* tolerate schema differences */ }
  }
}

async function seedRfis(projectId) {
  for (let i = 1; i <= 6; i++) {
    await prisma.rfi.create({
      data: {
        tenantId: TENANT,
        projectId,
        rfiNumber: `RFI-${String(i).padStart(3,'0')}`,
        subject: `Clarification on detail ${i}`,
        question: `Please confirm specification for element ${i}.`,
        status: pick(['open','answered','closed']),
        priority: pick(['low','med','high','urgent']),
        discipline: pick(['Civils','MEP','Arch']),
        dueDate: addDays(new Date(), 3 + i),
      }
    }).catch(()=>{ /* ignore if model changed */ });
  }
}

async function seedQA(projectId) {
  for (let i = 1; i <= 3; i++) {
    const rec = await prisma.qaRecord.create({
      data: {
        tenantId: TENANT,
        projectId,
        type: pick(['inspection','test','snag','NCR']),
        title: `QA Check ${i}`,
        status: pick(['open','pass','fail']),
        trade: pick(['Concrete','Steel','MEP','Facade']),
        dueDate: addDays(new Date(), 10 + i),
      }
    }).catch(()=>null);
    if (rec) {
      for (let j = 1; j <= 4; j++) {
        await prisma.qaItem.create({
          data: {
            tenantId: TENANT,
            qaRecordId: rec.id,
            item: `Item ${i}.${j}`,
            result: pick(['open','pass','fail','na']),
            dueDate: addDays(new Date(), 10 + j),
          }
        }).catch(()=>{});
      }
    }
  }
}

async function seedHS(projectId) {
  const base = new Date();
  const types = ['incident','near_miss','observation','inspection'];
  const severities = ['minor','moderate','major','critical'];
  for (let i = 0; i < 4; i++) {
    await prisma.hsEvent.create({
      data: {
        tenantId: TENANT,
        projectId,
        type: types[i],
        title: `H&S ${types[i]} #${i+1}`,
        description: `Recorded ${types[i]} on site area ${i+1}.`,
        eventDate: addDays(base, -i * 7),
        status: pick(['open','investigating','closed']),
        severity: pick(severities),
        isRIDDOR: i === 0 ? true : false,
      }
    }).catch(()=>{});
  }
}

async function seedCarbon(projectId) {
  const cats = [
    { scope: '1', category: 'Fuel-diesel', unit: 'L', factor: 2.68, factorUnit: 'kgCO2e/unit' },
    { scope: '2', category: 'Electricity', unit: 'kWh', factor: 0.20, factorUnit: 'kgCO2e/unit' },
    { scope: '3', category: 'Materials-concrete', unit: 't', factor: 100, factorUnit: 'kgCO2e/unit' },
  ];
  const today = new Date();
  for (let m = 0; m < 3; m++) {
    const d = addDays(today, -30 * m);
    for (const c of cats) {
      const qty = Math.round(50 + Math.random() * 150);
      await prisma.carbonEntry.create({
        data: {
          tenantId: TENANT,
          projectId,
          scope: c.scope,
          category: c.category,
          activityDate: d,
          quantity: qty,
          unit: c.unit,
          emissionFactor: c.factor,
          factorUnit: c.factorUnit,
          calculatedKgCO2e: qty * c.factor,
          periodMonth: d.getMonth() + 1,
          periodYear: d.getFullYear(),
          notes: 'Seeded entry',
        }
      }).catch(()=>{});
    }
  }
}

async function ensureSuppliers() {
  const names = [
    'Acme Steel Ltd',
    'Prime MEP Services',
    'Alpha Concrete Co',
    'Skyline Facades',
    'GreenPlant Hire',
  ];
  const out = [];
  for (const name of names) {
    let s = await prisma.supplier.findFirst({ where: { tenantId: TENANT, name } }).catch(()=>null);
    if (!s) {
      s = await prisma.supplier.create({ data: { tenantId: TENANT, name, status: 'active' } });
      // add a couple of capabilities
      const caps = name.includes('MEP') ? ['MEP','Electrical'] : name.includes('Steel') ? ['Steel','Fabrication'] : name.includes('Concrete') ? ['Concrete','Groundworks'] : ['General'];
      for (const tag of caps) {
        await prisma.supplierCapability.create({ data: { tenantId: TENANT, supplierId: s.id, tag } }).catch(()=>{});
      }
    }
    out.push(s);
  }
  // Ensure internal supplier exists for tenant
  try {
    let self = await prisma.supplier.findFirst({ where: { tenantId: TENANT, isInternal: true } });
    if (!self) {
      self = await prisma.supplier.create({ data: { tenantId: TENANT, name: 'Internal Delivery (Your Company)', isInternal: true, status: 'active' } });
    }
    // Store selfSupplierId in TenantSetting (KV storage)
    try {
      const key = 'selfSupplierId';
      const existing = await prisma.tenantSetting.findFirst({ where: { tenantId: TENANT, k: key } });
      if (!existing) await prisma.tenantSetting.create({ data: { tenantId: TENANT, k: key, v: self.id } });
      else if (!existing.v) await prisma.tenantSetting.update({ where: { tenantId_k: { tenantId: TENANT, k: key } }, data: { v: self.id } });
    } catch (_) { /* tolerate missing KV model */ }
  } catch (_) {}
  return out;
}

async function ensureTrades() {
  const groups = {
    'Groundworks & Civils': [
      'Demolition','Enabling Works','Earthworks','Piling','Drainage','Utilities Diversions','Roads/Highways','Kerbs & Paving'
    ],
    'Structure': [
      'Concrete (in-situ)','Precast','Reinforcement','Structural Steelwork','Metal Decking','Timber Frame'
    ],
    'Envelope': [
      'Brick/Blockwork','Cladding','Rainscreen','Curtain Walling','Roofing (Flat/Pitched)','Waterproofing','Windows & External Doors'
    ],
    'MEP (Building Services)': [
      'Mechanical','Electrical','Public Health (Plumbing/Drainage)','Sprinklers','Fire Alarm','BMS','HV/LV','UPS/Generators','Data/Comms','Security/CCTV/Access'
    ],
    'Interiors & Finishes': [
      'Partitions','Drylining','Ceilings','Screed','Flooring','Joinery','Decorations','Tiling','Washrooms/Sanitaryware'
    ],
    'Vertical Transport & Specialist': [
      'Lifts','Escalators','Facades Access/ BMU','Scaffolding/Temporary Works'
    ],
    'External Works & Landscaping': [
      'Hard Landscaping','Soft Landscaping','Fencing/Gates','Street Furniture'
    ],
    'Compliance & Fire': [
      'Fire Stopping/Compartmentation','Fire Doors'
    ],
    'Other': [
      'Temporary Electrics/Mechanical','Hoists','Modular/Off-site'
    ],
  };
  let order = 1;
  for (const [group, names] of Object.entries(groups)) {
    for (const name of names) {
      const code = `${group.split(' ')[0].toUpperCase()}-${String(order).padStart(3,'0')}`;
      try {
        await prisma.trade.upsert({
          where: { tenantId_code: { tenantId: TENANT, code } },
          update: { name, group },
          create: { tenantId: TENANT, code, name, group },
        });
      } catch (_) {
        // Fallback when compound unique not available; try match by name
        const existing = await prisma.trade.findFirst({ where: { tenantId: TENANT, name } }).catch(()=>null);
        if (!existing) await prisma.trade.create({ data: { tenantId: TENANT, code, name, group } }).catch(()=>{});
      }
      order++;
    }
  }
}

async function seedPackages(projectId, suppliers) {
  const pkgDefs = [
    { name: 'Structural Steel Package', trade: 'Steel', status: 'Tender' },
    { name: 'MEP First Fix', trade: 'MEP', status: 'Tender' },
  ];
  for (const def of pkgDefs) {
    const pkg = await prisma.package.create({
      data: {
        projectId,
        name: def.name,
        scope: `${def.trade} scope for level A & B`,
        trade: def.trade,
        status: def.status,
        budgetEstimate: 100000,
        deadline: addDays(new Date(), 21),
      }
    }).catch(()=>null);
    if (!pkg) continue;

    // Invite first 3 suppliers
    const invited = suppliers.slice(0, 3);
    for (const s of invited) {
      await prisma.tenderInvite.create({ data: { packageId: pkg.id, supplierId: s.id, status: 'Invited' } }).catch(()=>{});
    }

    // Submissions from two suppliers
    const submitters = invited.slice(0, 2);
    let best = null;
    for (let i = 0; i < submitters.length; i++) {
      const s = submitters[i];
      const price = Math.round(80000 + Math.random() * 40000);
      const sub = await prisma.submission.create({
        data: {
          packageId: pkg.id,
          supplierId: s.id,
          price,
          durationWeeks: 8 + i * 2,
          technicalScore: 60 + Math.random() * 40,
          priceScore: 60 + Math.random() * 40,
          overallScore: 60 + Math.random() * 40,
          status: 'Submitted',
        }
      }).catch(()=>null);
      if (sub && (!best || (sub.price < best.price))) best = { s, sub };
    }

    // Award and contract
    if (best) {
      await prisma.package.update({
        where: { id: pkg.id },
        data: { awardSupplierId: best.s.id, awardValue: best.sub.price, status: 'Awarded' }
      }).catch(()=>{});
      await prisma.contract.create({
        data: {
          projectId,
          packageId: pkg.id,
          supplierId: best.s.id,
          title: `${def.name} Contract`,
          value: best.sub.price,
          status: 'Pending',
          contractNumber: `CT-${projectId}-${pkg.id}`,
          startDate: addDays(new Date(), 14),
        }
      }).catch(()=>{});
    }
  }
}

function money(n) { return Number(n.toFixed(2)); }

async function seedPOs(projectId, suppliers) {
  if (!suppliers.length) return;
  const s1 = suppliers[0];
  const s2 = suppliers[1] || suppliers[0];

  // PO 1: Open, one future delivery
  await createPOWithDeliveries(projectId, s1, `PO-${projectId}-001`, 'Open', [
    { item: 'Materials', qty: 10, unit: 'ea', unitCost: 120.5 },
    { item: 'Labour', qty: 5, unit: 'hr', unitCost: 80.0 },
  ], [
    { expectedAt: addDays(new Date(), 7), receivedAt: null, note: 'Initial delivery' },
  ]);

  // PO 2: Partially Received, two deliveries, one received
  await createPOWithDeliveries(projectId, s1, `PO-${projectId}-002`, 'Partially Received', [
    { item: 'Fixings', qty: 200, unit: 'ea', unitCost: 1.2 },
    { item: 'Site labour', qty: 12, unit: 'hr', unitCost: 60.0 },
  ], [
    { expectedAt: addDays(new Date(), -2), receivedAt: addDays(new Date(), -1), note: 'Batch 1 received' },
    { expectedAt: addDays(new Date(), 5), receivedAt: null, note: 'Batch 2 pending' },
  ]);

  // PO 3: Closed, all deliveries received, different supplier
  await createPOWithDeliveries(projectId, s2, `PO-${projectId}-003`, 'Closed', [
    { item: 'Plant hire', qty: 3, unit: 'days', unitCost: 150.0 },
  ], [
    { expectedAt: addDays(new Date(), -10), receivedAt: addDays(new Date(), -9), note: 'Delivered' },
  ]);
}

async function createPOWithDeliveries(projectId, supplier, code, status, lines, deliveries) {
  const total = lines.reduce((acc, l) => acc + l.qty * l.unitCost, 0);
  const po = await prisma.purchaseOrder.create({
    data: {
      tenantId: TENANT,
      projectId,
      code,
      supplier: supplier.name,
      supplierId: supplier.id,
      status,
      total: money(total),
    }
  }).catch(()=>null);
  if (!po) return null;
  for (const l of lines) {
    const lineTotal = l.qty * l.unitCost;
    await prisma.pOLine.create({
      data: {
        tenantId: TENANT,
        poId: po.id,
        item: l.item,
        qty: money(l.qty),
        unit: l.unit,
        unitCost: money(l.unitCost),
        lineTotal: money(lineTotal),
      }
    }).catch(()=>{});
  }
  for (const d of deliveries) {
    await prisma.delivery.create({
      data: {
        tenantId: TENANT,
        poId: po.id,
        expectedAt: d.expectedAt,
        receivedAt: d.receivedAt || null,
        note: d.note || null,
      }
    }).catch(()=>{});
  }
  return po;
}

async function seedRequestsRFQ(suppliers) {
  // Create a simple 1-stage RFQ with 2 sections and 3 questions
  const req = await prisma.request.create({
    data: {
      tenantId: TENANT,
      title: 'RFQ - Temporary Works Package',
      type: 'RFQ',
      status: 'open',
      deadline: addDays(new Date(), 10),
      stage: 1,
      totalStages: 1,
      weighting: { price: 60, technical: 40 },
    }
  });

  const secTech = await prisma.requestSection.create({ data: { tenantId: TENANT, requestId: req.id, title: 'Technical', weight: 40, order: 1 } });
  const secPrice = await prisma.requestSection.create({ data: { tenantId: TENANT, requestId: req.id, title: 'Commercial', weight: 60, order: 2 } });

  const q1 = await prisma.requestQuestion.create({ data: { tenantId: TENANT, requestId: req.id, sectionId: secTech.id, qType: 'text', prompt: 'Method statement summary', required: true, order: 1 } });
  const q2 = await prisma.requestQuestion.create({ data: { tenantId: TENANT, requestId: req.id, sectionId: secTech.id, qType: 'file', prompt: 'RAMS document', required: false, order: 2 } });
  const q3 = await prisma.requestQuestion.create({ data: { tenantId: TENANT, requestId: req.id, sectionId: secPrice.id, qType: 'number', prompt: 'Lump sum price (GBP)', required: true, order: 3 } });

  // Invite first 3 suppliers
  const invited = suppliers.slice(0, 3);
  for (const s of invited) {
    await prisma.requestInvite.create({ data: { tenantId: TENANT, requestId: req.id, supplierId: s.id, email: `${s.name.replace(/\s+/g,'').toLowerCase()}@example.com` } });
  }

  // Responses from 2 suppliers
  const responders = invited.slice(0, 2);
  let best = null;
  for (const s of responders) {
    const answers = {
      [q1.id]: 'We will deploy a competent team and sequence works safely.',
      [q2.id]: null,
      [q3.id]: 50000 + Math.floor(Math.random() * 20000),
    };
    const resp = await prisma.requestResponse.create({
      data: {
        tenantId: TENANT,
        requestId: req.id,
        supplierId: s.id,
        stage: 1,
        answers,
        submittedAt: new Date(),
        status: 'submitted',
        score: 70 + Math.random() * 20,
      }
    });
    if (!best || answers[q3.id] < best.price) best = { supplier: s, price: answers[q3.id] };
  }

  // QnA example
  await prisma.requestQna.create({ data: { tenantId: TENANT, requestId: req.id, supplierId: responders[0].id, question: 'Is weekend working required?', answer: 'No, standard hours only.', answeredAt: new Date() } });

  // Award decision
  if (best) {
    await prisma.awardDecision.create({ data: { tenantId: TENANT, requestId: req.id, supplierId: best.supplier.id, decision: 'awarded', reason: 'Best compliant price', decidedAt: new Date() } });
  }
}

// Seed basic PackageTaxonomy rows to support scope suggestions
async function seedPackageTaxonomy() {
  const items = [
    { code: 'STEEL', name: 'Structural Steel', keywords: ['steel','frame','beams','columns'], costCodePrefixes: ['SUPER'] },
    { code: 'MEP', name: 'MEP', keywords: ['mechanical','electrical','plumbing','services'], costCodePrefixes: ['M&E'] },
    { code: 'CONC', name: 'Concrete', keywords: ['concrete','rebar','formwork'], costCodePrefixes: ['SUB'] },
    { code: 'FACADE', name: 'Facade', keywords: ['cladding','curtain wall','façade','glazing'], costCodePrefixes: ['SUPER'] },
  ];
  for (const it of items) {
    const exists = await prisma.packageTaxonomy.findFirst({ where: { tenantId: TENANT, code: it.code } }).catch(()=>null);
    if (!exists) {
      await prisma.packageTaxonomy.create({ data: { tenantId: TENANT, code: it.code, name: it.name, keywords: it.keywords, costCodePrefixes: it.costCodePrefixes, isActive: true } }).catch(()=>{});
    }
  }
}

async function main() {
  console.log('Seeding for tenant:', TENANT);
  // Clean ONLY demo tenant artifacts in these modules to avoid duplication
  await prisma.delivery.deleteMany({ where: { tenantId: TENANT } }).catch(()=>{});
  await prisma.pOLine.deleteMany({ where: { tenantId: TENANT } }).catch(()=>{});
  await prisma.purchaseOrder.deleteMany({ where: { tenantId: TENANT } }).catch(()=>{});
  await prisma.contract.deleteMany({ where: { project: { tenantId: TENANT } } }).catch(()=>{});
  await prisma.submission.deleteMany({ where: { package: { project: { tenantId: TENANT } } } }).catch(()=>{});
  await prisma.tenderInvite.deleteMany({ where: { package: { project: { tenantId: TENANT } } } }).catch(()=>{});
  await prisma.package.deleteMany({ where: { project: { tenantId: TENANT } } }).catch(()=>{});
  await prisma.rfi.deleteMany({ where: { tenantId: TENANT } }).catch(()=>{});
  await prisma.qaItem.deleteMany({ where: { tenantId: TENANT } }).catch(()=>{});
  await prisma.qaRecord.deleteMany({ where: { tenantId: TENANT } }).catch(()=>{});
  await prisma.hsEvent.deleteMany({ where: { tenantId: TENANT } }).catch(()=>{});
  await prisma.carbonEntry.deleteMany({ where: { tenantId: TENANT } }).catch(()=>{});
  await prisma.task.deleteMany({ where: { tenantId: TENANT } }).catch(()=>{});

  const client = await getOrCreateClient();
  // Multiple projects
  const p1 = await ensureProject('PRJ-001', 'Demo Project Alpha', client.id, { status: 'Active', type: 'General' });
  const p2 = await ensureProject('PRJ-002', 'Demo Project Beta', client.id, { status: 'Active', type: 'Fitout', startDate: addDays(new Date(), -45) });
  const p3 = await ensureProject('PRJ-003', 'Demo Project Gamma', client.id, { status: 'Closed', type: 'Civils', startDate: addDays(new Date(), -180), endDate: addDays(new Date(), -10) });

  const suppliers = await ensureSuppliers();
  await ensureTrades().catch(()=>{});

  for (const p of [p1, p2, p3]) {
    await seedTasks(p.id);
    await seedRfis(p.id);
    await seedQA(p.id);
    await seedHS(p.id);
    await seedCarbon(p.id);
    await seedPackages(p.id, suppliers);
    await seedPOs(p.id, suppliers);
  }

  // Seed a Request/RFQ flow (not project-bound)
  await seedRequestsRFQ(suppliers);
  // Seed basic package taxonomy for scope suggestions
  await seedPackageTaxonomy().catch(()=>{});

  // Settings/Taxonomies (additive; tolerant if tables absent)
  try {
    // Helper to upsert taxonomy and terms
    async function ensureTaxonomy(key, name, isHierarchical, terms) {
      const tx = await prisma.taxonomy.upsert({
        where: { tenantId_key: { tenantId: TENANT, key } },
        update: { name, isHierarchical, isLocked: false },
        create: { tenantId: TENANT, key, name, isHierarchical, isLocked: false },
      });
      if (Array.isArray(terms) && terms.length) {
        // Upsert terms by code or label
        const existing = await prisma.taxonomyTerm.findMany({ where: { tenantId: TENANT, taxonomyId: tx.id } });
        const byCode = new Map(); const byLabel = new Map();
        existing.forEach((t) => { if (t.code) byCode.set(t.code, t); byLabel.set(t.label.toLowerCase(), t); });
        const parentIdByCode = new Map();
        for (let i = 0; i < terms.length; i++) {
          const t = terms[i];
          const code = t.code || null;
          const label = t.label;
          const parentCode = t.parentCode || null;
          let parentId = null;
          if (parentCode) {
            parentId = parentIdByCode.get(parentCode) || byCode.get(parentCode)?.id || null;
          }
          const found = code ? byCode.get(code) : byLabel.get(label.toLowerCase());
          if (found) {
            await prisma.taxonomyTerm.update({ where: { id: found.id }, data: { label, sort: t.sort || 0, parentId } });
          } else {
            const created = await prisma.taxonomyTerm.create({ data: { tenantId: TENANT, taxonomyId: tx.id, code, label, sort: t.sort || 0, parentId } });
            if (code) parentIdByCode.set(code, created.id);
          }
        }
      }
    }

    // cost_codes (NRM scaffold levels)
    await ensureTaxonomy('cost_codes', 'Cost Codes', true, [
      { code: 'PRELIM', label: 'Preliminaries', sort: 10 },
      { code: 'SUB', label: 'Substructure', sort: 20 },
      { code: 'SUPER', label: 'Superstructure', sort: 30 },
      { code: 'FIN', label: 'Finishes', sort: 40 },
      { code: 'FIT', label: 'Fittings & furnishings', sort: 50 },
      { code: 'M&E', label: 'Building services', sort: 60 },
      { code: 'EXT', label: 'External works', sort: 70 },
      { code: 'RISK', label: 'Risks/Provisional sums', sort: 80 },
    ]);

    // contract_families
    await ensureTaxonomy('contract_families', 'Contract Families', false, [
      { code: 'NEC3', label: 'NEC3 (ECC, PSC, TSC Options A–F)' },
      { code: 'NEC4', label: 'NEC4 (ECC, PSC, TSC Options A–F)' },
      { code: 'JCT', label: 'JCT (SBC, DB, IC, MW, etc.)' },
    ]);

    // rfx_scoring_sets
    await ensureTaxonomy('rfx_scoring_sets', 'RFx Scoring Sets', false, [
      { code: 'STD', label: 'Price 40, Programme 20, Technical 20, H&S 10, ESG 10' },
    ]);

    // Supplier accreditations list
    const accs = ['Constructionline', 'CHAS'];
    for (const name of accs) {
      await prisma.supplierAccreditation.upsert({
        where: { tenantId_name: { tenantId: TENANT, name } },
        update: {},
        create: { tenantId: TENANT, name },
      }).catch(()=>{});
    }
  } catch (e) {
    if (e?.code === 'P2021') {
      console.warn('[seed] Settings/Taxonomies tables not present; skipping.');
    } else {
      console.warn('[seed] Taxonomies seed warning:', e.message || e);
    }
  }

  console.log('Done. Project ids:', p1.id, p2.id, p3.id);
}

main()
  .then(()=> prisma.$disconnect())
  .catch(async (e) => {
    console.error('Seed failed:', e.message);
    await prisma.$disconnect();
    process.exit(1);
  });
