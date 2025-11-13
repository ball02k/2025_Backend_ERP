const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ======================
// UTILITY FUNCTIONS
// ======================

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomValue(min, max) {
  return Math.random() * (max - min) + min;
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateAccessToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

// ======================
// UK CONSTRUCTION DATA
// ======================

const UK_TRADES = [
  'Groundworks',
  'Structural Steel',
  'Mechanical & Electrical',
  'Facades & Cladding',
  'Roofing & Waterproofing',
  'Concrete Frame',
  'Internal Fit-Out',
  'Joinery & Carpentry',
  'Plumbing & Heating',
  'Electrical Services',
  'HVAC Systems',
  'Fire Protection',
  'Demolition',
  'Piling & Foundations',
  'Drainage & Utilities'
];

const SUPPLIER_NAMES = [
  { name: 'Thames Valley Groundworks Ltd', trade: 'Groundworks', city: 'London', regNo: '03456789', turnover: 8500000 },
  { name: 'London Steel Fabrications', trade: 'Structural Steel', city: 'London', regNo: '04567890', turnover: 12000000 },
  { name: 'Birmingham M&E Services', trade: 'Mechanical & Electrical', city: 'Birmingham', regNo: '05678901', turnover: 15000000 },
  { name: 'Manchester Facades Group', trade: 'Facades & Cladding', city: 'Manchester', regNo: '06789012', turnover: 9500000 },
  { name: 'Concrete Frame Specialists', trade: 'Concrete Frame', city: 'Leeds', regNo: '07890123', turnover: 11000000 },
  { name: 'UK Roofing Solutions', trade: 'Roofing & Waterproofing', city: 'Bristol', regNo: '08901234', turnover: 6500000 },
  { name: 'Elite Groundworks & Civil Engineering', trade: 'Groundworks', city: 'Manchester', regNo: '09012345', turnover: 10000000 },
  { name: 'Advanced Steel Structures', trade: 'Structural Steel', city: 'Birmingham', regNo: '10123456', turnover: 13500000 },
  { name: 'Precision M&E Contractors', trade: 'Mechanical & Electrical', city: 'London', regNo: '11234567', turnover: 18000000 },
  { name: 'Modern Facades UK', trade: 'Facades & Cladding', city: 'Leeds', regNo: '12345678', turnover: 8000000 },
  { name: 'Fit-Out Solutions Ltd', trade: 'Internal Fit-Out', city: 'London', regNo: '13456789', turnover: 7500000 },
  { name: 'Quality Joinery Works', trade: 'Joinery & Carpentry', city: 'Manchester', regNo: '14567890', turnover: 4500000 },
  { name: 'Plumbing & Heating Experts', trade: 'Plumbing & Heating', city: 'Bristol', regNo: '15678901', turnover: 5500000 },
  { name: 'Electrical Installations UK', trade: 'Electrical Services', city: 'Birmingham', regNo: '16789012', turnover: 9000000 },
  { name: 'HVAC Systems Pro', trade: 'HVAC Systems', city: 'London', regNo: '17890123', turnover: 12500000 },
  { name: 'Fire Safety Services', trade: 'Fire Protection', city: 'Leeds', regNo: '18901234', turnover: 3500000 },
  { name: 'Demo & Demolition Ltd', trade: 'Demolition', city: 'Manchester', regNo: '19012345', turnover: 5000000 },
  { name: 'Piling Contractors UK', trade: 'Piling & Foundations', city: 'London', regNo: '20123456', turnover: 14000000 },
  { name: 'Drainage Solutions Group', trade: 'Drainage & Utilities', city: 'Birmingham', regNo: '21234567', turnover: 6000000 },
  { name: 'Northern Groundworks', trade: 'Groundworks', city: 'Leeds', regNo: '22345678', turnover: 7000000 }
];

const UK_ADDRESSES = [
  { street: '123 Construction Road', city: 'London', postcode: 'EC1A 1BB' },
  { street: '45 Builder Street', city: 'Manchester', postcode: 'M1 1AE' },
  { street: '78 Industrial Way', city: 'Birmingham', postcode: 'B1 1AA' },
  { street: '90 Commerce Drive', city: 'Leeds', postcode: 'LS1 4BZ' },
  { street: '12 Enterprise Park', city: 'Bristol', postcode: 'BS1 6QA' },
  { street: '34 Victoria Road', city: 'London', postcode: 'SW1A 1AA' },
  { street: '56 Oxford Street', city: 'Manchester', postcode: 'M2 3BB' },
  { street: '89 High Street', city: 'Birmingham', postcode: 'B4 7SL' }
];

const CLIENT_DATA = [
  { name: 'London Property Developments Ltd', type: 'developer', contact: 'James Wilson' },
  { name: 'Manchester City Council', type: 'local_authority', contact: 'Emma Thompson' },
  { name: 'Residential Estates Group', type: 'private', contact: 'David Chen' },
  { name: 'Commercial Properties UK', type: 'developer', contact: 'Sarah Jones' }
];

const USER_DATA = [
  { name: 'John Buyer', email: 'john.buyer@demo.com', role: 'Buyer' },
  { name: 'Sarah Project Manager', email: 'sarah.pm@demo.com', role: 'Project Manager' },
  { name: 'Mike Quantity Surveyor', email: 'mike.qs@demo.com', role: 'Quantity Surveyor' },
  { name: 'Emma Finance', email: 'emma.finance@demo.com', role: 'Finance' },
  { name: 'David Admin', email: 'david.admin@demo.com', role: 'Admin' },
  { name: 'Lisa Commercial', email: 'lisa.commercial@demo.com', role: 'Commercial Manager' }
];

const PROJECT_DATA = [
  { name: 'Riverside Apartments Development', value: 25000000, type: 'residential', status: 'Active' },
  { name: 'City Centre Office Block', value: 45000000, type: 'commercial', status: 'Active' },
  { name: 'Hospital Extension Project', value: 35000000, type: 'healthcare', status: 'Active' }
];

// UK Construction Cost Codes (CESMM4 / NRM2 inspired)
const COST_CODES = [
  { code: '01', description: 'Preliminaries' },
  { code: '02', description: 'Substructure' },
  { code: '03', description: 'Superstructure' },
  { code: '04', description: 'External Walls' },
  { code: '05', description: 'Windows and Doors' },
  { code: '06', description: 'Internal Walls and Partitions' },
  { code: '07', description: 'Internal Finishes' },
  { code: '08', description: 'M&E Services' }
];

// Realistic UK construction budget items by cost code
const BUDGET_ITEMS_BY_CODE = {
  '01': [
    { desc: 'Site establishment and security', unit: 'item', rate: 15000, qty: 1 },
    { desc: 'Site offices and welfare facilities', unit: 'nr', rate: 8500, qty: 2 },
    { desc: 'Temporary power and lighting', unit: 'item', rate: 12000, qty: 1 },
    { desc: 'Site hoardings and signage', unit: 'm', rate: 85, qty: 150 },
    { desc: 'Scaffolding to building perimeter', unit: 'm2', rate: 12.50, qty: 2400 },
    { desc: 'Tower crane hire (26 weeks)', unit: 'week', rate: 3500, qty: 26 },
    { desc: 'Temporary traffic management', unit: 'item', rate: 6500, qty: 1 },
    { desc: 'Site insurance and bonds', unit: 'item', rate: 18000, qty: 1 },
    { desc: 'Project management and supervision', unit: 'week', rate: 4500, qty: 52 },
    { desc: 'Health and safety consultancy', unit: 'month', rate: 2800, qty: 12 }
  ],
  '02': [
    { desc: 'Excavation to reduced level', unit: 'm3', rate: 18.50, qty: 3500 },
    { desc: 'Disposal of excavated material', unit: 'm3', rate: 12.00, qty: 3200 },
    { desc: 'Piling: bored CFA piles 600mm dia', unit: 'm', rate: 125, qty: 420 },
    { desc: 'Pile caps and ground beams', unit: 'm3', rate: 285, qty: 180 },
    { desc: 'Concrete strip footings', unit: 'm3', rate: 195, qty: 95 },
    { desc: 'Reinforcement to substructure', unit: 't', rate: 1850, qty: 28 },
    { desc: 'Concrete ground floor slab 200mm', unit: 'm2', rate: 48, qty: 2800 },
    { desc: 'DPM and insulation to ground floor', unit: 'm2', rate: 18, qty: 2850 },
    { desc: 'Drainage: foul water system', unit: 'm', rate: 95, qty: 280 },
    { desc: 'Drainage: surface water system', unit: 'm', rate: 85, qty: 350 },
    { desc: 'Soakaways and attenuation tank', unit: 'nr', rate: 8500, qty: 3 },
    { desc: 'Connection to public sewer', unit: 'item', rate: 12000, qty: 1 }
  ],
  '03': [
    { desc: 'In-situ RC columns C30/37', unit: 'm3', rate: 385, qty: 145 },
    { desc: 'In-situ RC beams C30/37', unit: 'm3', rate: 395, qty: 185 },
    { desc: 'Flat slab 250mm C30/37', unit: 'm2', rate: 125, qty: 3200 },
    { desc: 'Reinforcement to frame', unit: 't', rate: 1750, qty: 185 },
    { desc: 'Formwork to concrete', unit: 'm2', rate: 48, qty: 4800 },
    { desc: 'Structural steel frame', unit: 't', rate: 2850, qty: 120 },
    { desc: 'Fire protection to steelwork', unit: 't', rate: 425, qty: 120 },
    { desc: 'Metal floor decking', unit: 'm2', rate: 38, qty: 3200 },
    { desc: 'Precast concrete stairs', unit: 'nr', rate: 4500, qty: 12 },
    { desc: 'Structural roof frame', unit: 'm2', rate: 165, qty: 1200 }
  ],
  '04': [
    { desc: 'Facing brickwork outer leaf', unit: 'm2', rate: 95, qty: 1850 },
    { desc: 'Insulated cavity wall system', unit: 'm2', rate: 125, qty: 1850 },
    { desc: 'Curtain walling system', unit: 'm2', rate: 485, qty: 850 },
    { desc: 'Rainscreen cladding panels', unit: 'm2', rate: 285, qty: 650 },
    { desc: 'Render system to external walls', unit: 'm2', rate: 65, qty: 450 },
    { desc: 'Movement joints and fixings', unit: 'm', rate: 45, qty: 320 },
    { desc: 'Cavity wall insulation 100mm', unit: 'm2', rate: 28, qty: 1850 },
    { desc: 'DPC and cavity trays', unit: 'm', rate: 12, qty: 580 }
  ],
  '05': [
    { desc: 'Aluminium windows double glazed', unit: 'nr', rate: 850, qty: 145 },
    { desc: 'Entrance doors glazed aluminium', unit: 'nr', rate: 2850, qty: 8 },
    { desc: 'Fire doors FD30 timber', unit: 'nr', rate: 485, qty: 48 },
    { desc: 'Fire doors FD60 timber', unit: 'nr', rate: 685, qty: 24 },
    { desc: 'Internal timber doors', unit: 'nr', rate: 285, qty: 85 },
    { desc: 'Door furniture and ironmongery', unit: 'item', rate: 125, qty: 165 },
    { desc: 'Automatic door operators', unit: 'nr', rate: 1850, qty: 4 },
    { desc: 'Rooflights double glazed', unit: 'nr', rate: 1250, qty: 18 }
  ],
  '06': [
    { desc: 'Blockwork partitions 100mm', unit: 'm2', rate: 48, qty: 1450 },
    { desc: 'Metal stud partitions 100mm', unit: 'm2', rate: 62, qty: 2200 },
    { desc: 'Fire-rated partitions 2hr', unit: 'm2', rate: 135, qty: 380 },
    { desc: 'Acoustic partitions to plant rooms', unit: 'm2', rate: 185, qty: 120 },
    { desc: 'Toilet cubicles IPS panels', unit: 'nr', rate: 485, qty: 28 },
    { desc: 'Demountable partitions glazed', unit: 'm2', rate: 285, qty: 450 }
  ],
  '07': [
    { desc: 'Plaster and skim to walls', unit: 'm2', rate: 18, qty: 8500 },
    { desc: 'Suspended ceiling tiles', unit: 'm2', rate: 35, qty: 3200 },
    { desc: 'Wall tiling to toilets', unit: 'm2', rate: 58, qty: 485 },
    { desc: 'Floor tiling ceramic', unit: 'm2', rate: 65, qty: 650 },
    { desc: 'Vinyl flooring', unit: 'm2', rate: 38, qty: 1850 },
    { desc: 'Carpet tiles', unit: 'm2', rate: 32, qty: 2400 },
    { desc: 'Raised access flooring', unit: 'm2', rate: 95, qty: 850 },
    { desc: 'Painting to walls emulsion', unit: 'm2', rate: 8.50, qty: 9500 },
    { desc: 'Skirting and architraves', unit: 'm', rate: 12, qty: 1850 },
    { desc: 'Joinery: reception desk bespoke', unit: 'item', rate: 8500, qty: 1 }
  ],
  '08': [
    { desc: 'HVAC: AHU units complete', unit: 'nr', rate: 28500, qty: 4 },
    { desc: 'Ductwork installation', unit: 'm', rate: 85, qty: 1850 },
    { desc: 'Heating pipework LTHW', unit: 'm', rate: 48, qty: 2400 },
    { desc: 'Radiators and controls', unit: 'nr', rate: 485, qty: 85 },
    { desc: 'Electrical: main switchgear', unit: 'item', rate: 45000, qty: 1 },
    { desc: 'Distribution boards', unit: 'nr', rate: 2850, qty: 12 },
    { desc: 'Lighting: LED fittings', unit: 'nr', rate: 145, qty: 485 },
    { desc: 'Power and data outlets', unit: 'nr', rate: 95, qty: 650 },
    { desc: 'Fire alarm system', unit: 'item', rate: 38500, qty: 1 },
    { desc: 'Emergency lighting', unit: 'nr', rate: 185, qty: 145 },
    { desc: 'Sanitaryware and fittings', unit: 'nr', rate: 385, qty: 95 },
    { desc: 'Above ground drainage', unit: 'm', rate: 65, qty: 380 }
  ]
};

// Password: 'password123' - SHA256 hash
const PASSWORD_SHA = 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f';

// ======================
// MAIN SEEDING FUNCTION
// ======================

async function main() {
  console.log('='.repeat(80));
  console.log('ULTRA-COMPREHENSIVE SEED: Budget-to-Contract Workflow');
  console.log('='.repeat(80));
  console.log('');

  console.log('Phase 1: Cleaning database...');
  await cleanDatabase();

  console.log('Phase 2: Creating core data (users, clients, suppliers)...');
  const users = await seedUsers();
  const clients = await seedClients();
  const suppliers = await seedSuppliers();

  console.log('Phase 3: Creating projects...');
  const projects = await seedProjects(clients, users);

  console.log('Phase 4: Creating budget structure (cost codes + budget lines)...');
  const { costCodes, budgetLines } = await seedBudgetStructure(projects);

  console.log('Phase 5: Creating packages with budget line references...');
  const packages = await seedPackagesWithBudgetLinks(projects, users, budgetLines);

  console.log('Phase 6: Creating tenders with sections & questions...');
  const tenders = await seedTendersWithQuestions(packages, users);

  console.log('Phase 7: Creating tender responses with answers...');
  await seedTenderResponses(tenders, suppliers);

  console.log('Phase 8: Creating tender criteria & scoring...');
  await seedTenderCriteriaAndScoring(tenders);

  console.log('Phase 9: Creating awarded tender with contract...');
  await seedAwardedTenderWithContract(tenders, packages, suppliers, users);

  console.log('Phase 10: Creating direct awards for non-tendered packages...');
  await seedDirectAwards(packages, suppliers, users);

  console.log('\n✅ SEEDING COMPLETE!');
  await printSummary();
}

// ======================
// DATABASE CLEANUP
// ======================

async function cleanDatabase() {
  const tables = [
    'ContractDocument',
    'ContractLineItem',
    'Contract',
    'TenderScore',
    'TenderSubmission',
    'TenderCriteria',
    'TenderResponse',
    'TenderQuestion',
    'TenderSection',
    'TenderSupplierInvite',
    'Tender',
    'PackageItem',
    'Package',
    'BudgetLine',
    'CostCode',
    'ProjectMembership',
    'Project',
    'SupplierCapability',
    'Supplier',
    'Contact',
    'Client',
    'UserRole',
    'User'
  ];

  for (const table of tables) {
    try {
      const modelName = table.charAt(0).toLowerCase() + table.slice(1);
      await prisma[modelName].deleteMany({});
      console.log(`  ✓ Cleaned ${table}`);
    } catch (e) {
      console.log(`  ⚠ Could not clean ${table}: ${e.message.split('\n')[0]}`);
    }
  }
}

// ======================
// SEED USERS
// ======================

async function seedUsers() {
  const users = [];
  for (const userData of USER_DATA) {
    const user = await prisma.user.create({
      data: {
        tenantId: 'demo',
        email: userData.email,
        name: userData.name,
        passwordSHA: PASSWORD_SHA,
        isActive: true
      }
    });
    users.push(user);
  }
  console.log(`  ✓ Created ${users.length} users`);
  return users;
}

// ======================
// SEED CLIENTS
// ======================

async function seedClients() {
  const clients = [];
  for (let i = 0; i < CLIENT_DATA.length; i++) {
    const data = CLIENT_DATA[i];
    const address = UK_ADDRESSES[i % UK_ADDRESSES.length];

    const client = await prisma.client.create({
      data: {
        name: data.name,
        companyRegNo: `${randomInt(1000000, 9999999)}`,
        vatNo: `GB${randomInt(100000000, 999999999)}`,
        address1: address.street,
        city: address.city,
        postcode: address.postcode
      }
    });

    await prisma.contact.create({
      data: {
        clientId: client.id,
        tenantId: 'demo',
        firstName: data.contact.split(' ')[0],
        lastName: data.contact.split(' ')[1] || '',
        email: `${data.contact.toLowerCase().replace(/\s+/g, '.')}@${data.name.toLowerCase().replace(/\s+/g, '')}.com`,
        phone: `0${randomInt(1000, 9999)} ${randomInt(100000, 999999)}`,
        role: 'Commercial Director',
        isPrimary: true
      }
    });

    clients.push(client);
  }
  console.log(`  ✓ Created ${clients.length} clients with contacts`);
  return clients;
}

// ======================
// SEED SUPPLIERS
// ======================

async function seedSuppliers() {
  const suppliers = [];
  for (const supplierData of SUPPLIER_NAMES) {
    const address = UK_ADDRESSES.find(a => a.city === supplierData.city) || randomElement(UK_ADDRESSES);

    const supplier = await prisma.supplier.create({
      data: {
        tenantId: 'demo',
        name: supplierData.name,
        status: 'active',
        email: `contact@${supplierData.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        phone: `0${randomInt(1000, 9999)} ${randomInt(100000, 999999)}`,
        companyRegNo: supplierData.regNo,
        vatNo: `GB${randomInt(100000000, 999999999)}`,
        insurancePolicyNumber: `INS-${randomInt(100000, 999999)}`,
        insuranceExpiry: randomDate(new Date('2025-06-01'), new Date('2026-12-31')),
        performanceScore: randomValue(3.5, 5.0)
      }
    });

    await prisma.supplierCapability.create({
      data: {
        supplierId: supplier.id,
        tenantId: 'demo',
        tag: supplierData.trade
      }
    });

    suppliers.push({ ...supplier, trade: supplierData.trade, regNo: supplierData.regNo, turnover: supplierData.turnover });
  }
  console.log(`  ✓ Created ${suppliers.length} suppliers with capabilities`);
  return suppliers;
}

// ======================
// SEED PROJECTS
// ======================

async function seedProjects(clients, users) {
  const projects = [];
  for (let i = 0; i < PROJECT_DATA.length; i++) {
    const data = PROJECT_DATA[i];
    const address = UK_ADDRESSES[i % UK_ADDRESSES.length];

    const project = await prisma.project.create({
      data: {
        tenantId: 'demo',
        code: `PRJ-${String(i + 1).padStart(4, '0')}`,
        name: data.name,
        description: `${data.type} construction project`,
        clientId: randomElement(clients).id,
        status: data.status,
        type: data.type,
        budget: data.value,
        startDate: randomDate(new Date('2024-06-01'), new Date('2025-01-01')),
        endDate: randomDate(new Date('2025-10-01'), new Date('2026-12-31')),
        startPlanned: randomDate(new Date('2024-06-01'), new Date('2025-01-01')),
        endPlanned: randomDate(new Date('2025-10-01'), new Date('2026-12-31')),
        sitePostcode: address.postcode,
        projectManagerUserId: randomElement(users).id,
        quantitySurveyorUserId: randomElement(users).id
      }
    });
    projects.push(project);
  }
  console.log(`  ✓ Created ${projects.length} projects`);
  return projects;
}

// ======================
// PHASE 1: BUDGET STRUCTURE
// ======================

async function seedBudgetStructure(projects) {
  const allCostCodes = [];
  const allBudgetLines = [];

  for (const project of projects) {
    console.log(`  Creating budget for: ${project.name}`);

    // Determine how many cost codes for this project (5-8)
    const numCostCodes = randomInt(5, 8);
    const selectedCodes = [...COST_CODES].sort(() => Math.random() - 0.5).slice(0, numCostCodes);

    let projectTotal = 0;

    for (let i = 0; i < selectedCodes.length; i++) {
      const codeData = selectedCodes[i];

      // Create cost code with project-specific code to avoid unique constraint
      const costCode = await prisma.costCode.create({
        data: {
          tenantId: 'demo',
          code: `P${project.id}-${codeData.code}`,
          description: codeData.description
        }
      });
      allCostCodes.push({ ...costCode, projectId: project.id });

      // Get budget items for this cost code
      const availableItems = BUDGET_ITEMS_BY_CODE[codeData.code] || [];
      const numItems = randomInt(8, Math.min(12, availableItems.length));
      const selectedItems = [...availableItems].sort(() => Math.random() - 0.5).slice(0, numItems);

      // Create budget lines for this cost code
      for (let j = 0; j < selectedItems.length; j++) {
        const item = selectedItems[j];
        const qty = item.qty * randomValue(0.8, 1.2);
        const rate = item.rate * randomValue(0.9, 1.1);
        const total = qty * rate;

        const budgetLine = await prisma.budgetLine.create({
          data: {
            tenantId: 'demo',
            projectId: project.id,
            costCodeId: costCode.id,
            code: `${codeData.code}.${String(j + 1).padStart(2, '0')}`,
            description: item.desc,
            qty: qty,
            unit: item.unit,
            rate: rate,
            total: total,
            amount: total,
            position: j
          }
        });

        allBudgetLines.push(budgetLine);
        projectTotal += parseFloat(total);
      }
    }

    console.log(`    ✓ Created ${numCostCodes} cost codes with ${allBudgetLines.filter(bl => bl.projectId === project.id).length} budget lines (Total: £${projectTotal.toFixed(2)})`);
  }

  console.log(`  ✓ Total: ${allCostCodes.length} cost codes, ${allBudgetLines.length} budget lines`);
  return { costCodes: allCostCodes, budgetLines: allBudgetLines };
}

// ======================
// PHASE 2: PACKAGES WITH BUDGET REFERENCES
// ======================

async function seedPackagesWithBudgetLinks(projects, users, budgetLines) {
  const allPackages = [];

  for (const project of projects) {
    const projectBudgetLines = budgetLines.filter(bl => bl.projectId === project.id);

    // Create 6-10 packages per project (total 20-30 across all projects)
    const numPackages = randomInt(6, 10);
    const trades = [...UK_TRADES].sort(() => Math.random() - 0.5).slice(0, numPackages);

    for (let i = 0; i < numPackages; i++) {
      const trade = trades[i];

      // Randomly select 3-8 budget lines for this package
      const numLines = randomInt(3, 8);
      const packageBudgetLines = [...projectBudgetLines]
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(numLines, projectBudgetLines.length));

      // Calculate package value from budget lines
      const packageValue = packageBudgetLines.reduce((sum, bl) => sum + parseFloat(bl.total || 0), 0);

      // Create package
      const pkg = await prisma.package.create({
        data: {
          projectId: project.id,
          name: `${trade} Package`,
          scopeSummary: `${trade} works for ${project.name}`,
          trade: trade,
          status: 'Draft',
          budgetEstimate: packageValue,
          estimatedValue: packageValue,
          budgetValue: packageValue,
          deadline: randomDate(new Date('2025-03-01'), new Date('2025-08-01')),
          targetAwardDate: randomDate(new Date('2025-02-01'), new Date('2025-06-01')),
          requiredOnSite: randomDate(new Date('2025-04-01'), new Date('2025-09-01')),
          ownerUserId: randomElement(users).id,
          buyerUserId: randomElement(users).id,
          pricingMode: 'MEASURED'
        }
      });

      // Link package to budget lines via PackageItem
      for (const budgetLine of packageBudgetLines) {
        await prisma.packageItem.create({
          data: {
            tenantId: 'demo',
            packageId: pkg.id,
            budgetLineId: budgetLine.id
          }
        });
      }

      allPackages.push({ ...pkg, trade });
    }
  }

  console.log(`  ✓ Created ${allPackages.length} packages with budget line references`);
  return allPackages;
}

// ======================
// PHASE 3: TENDERS WITH SECTIONS & QUESTIONS
// ======================

async function seedTendersWithQuestions(packages, users) {
  const tenders = [];

  // Define tender states distribution
  // Create tenders for most packages (leaving some for direct awards)
  const tenderStates = [
    { status: 'draft', count: 3 },
    { status: 'live', count: 8 },
    { status: 'closed', count: 4 },
    { status: 'evaluating', count: 2 },
    { status: 'awarded', count: 2 }
  ];

  let packageIndex = 0;

  for (const state of tenderStates) {
    for (let i = 0; i < state.count; i++) {
      if (packageIndex >= packages.length) break;

      const pkg = packages[packageIndex++];

      const issuedDate = state.status !== 'draft' ? randomDate(new Date('2025-01-01'), new Date('2025-02-01')) : null;
      const deadlineDate = state.status !== 'draft' ? randomDate(new Date('2025-03-01'), new Date('2025-04-01')) : null;

      const tender = await prisma.tender.create({
        data: {
          tenantId: 'demo',
          projectId: pkg.projectId,
          packageId: pkg.id,
          title: `${pkg.name} - Tender`,
          description: `Competitive tender for ${pkg.scopeSummary}`,
          status: state.status,
          deadlineAt: deadlineDate,
          invitedCount: state.status !== 'draft' ? randomInt(3, 5) : 0,
          submissionCount: ['closed', 'evaluating', 'awarded'].includes(state.status) ? randomInt(2, 4) : 0
        }
      });

      // Create tender sections
      const sections = await createTenderSections(tender.id);

      // Create tender questions
      await createTenderQuestions(tender.id, sections);

      tenders.push({ ...tender, package: pkg, sections });
    }
  }

  console.log(`  ✓ Created ${tenders.length} tenders with sections and questions`);
  return tenders;
}

async function createTenderSections(tenderId) {
  const sectionData = [
    { name: 'Company Information', description: 'General company details and credentials', order: 1 },
    { name: 'Experience & References', description: 'Previous projects and client references', order: 2 },
    { name: 'Technical Proposal', description: 'Methodology, programme, and resources', order: 3 },
    { name: 'Commercial Proposal', description: 'Pricing and payment terms', order: 4 }
  ];

  const sections = [];
  for (const data of sectionData) {
    const section = await prisma.tenderSection.create({
      data: {
        tenantId: 'demo',
        tenderId: tenderId,
        name: data.name,
        description: data.description,
        orderIndex: data.order
      }
    });
    sections.push(section);
  }

  return sections;
}

async function createTenderQuestions(tenderId, sections) {
  const questionsBySection = {
    0: [ // Company Information
      { text: 'Company Registration Number', type: 'text', weight: 5, required: true, help: 'Companies House registration number' },
      { text: 'Annual Turnover (last 3 years)', type: 'number', weight: 5, required: true, help: 'Average annual turnover in GBP' },
      { text: 'Number of Employees', type: 'number', weight: 3, required: true, help: 'Total permanent employees' },
      { text: 'Insurance Cover Level', type: 'number', weight: 5, required: true, help: 'Public/Employers Liability cover in £m' },
      { text: 'Accreditations (ISO 9001, 14001, 45001)', type: 'yes_no', weight: 7, required: true, help: 'Confirm quality, environmental, and H&S accreditations' }
    ],
    1: [ // Experience
      { text: 'Similar Projects Completed (last 5 years)', type: 'number', weight: 10, required: true, help: 'Number of similar projects completed' },
      { text: 'Case Study: Relevant Project Experience', type: 'textarea', weight: 15, required: true, help: 'Describe a relevant project including scope, value, and outcomes' },
      { text: 'Client References (minimum 2)', type: 'textarea', weight: 10, required: true, help: 'Provide contact details for recent clients' }
    ],
    2: [ // Technical
      { text: 'Proposed Methodology', type: 'textarea', weight: 15, required: true, help: 'Detail your approach to delivering the works' },
      { text: 'Programme Duration (weeks)', type: 'number', weight: 10, required: true, help: 'Proposed construction duration in weeks' },
      { text: 'Key Personnel CVs', type: 'file', weight: 5, required: true, help: 'Upload CVs for project manager, site manager, and key supervisors' },
      { text: 'Health & Safety Plan', type: 'file', weight: 10, required: true, help: 'Outline H&S approach and controls' }
    ],
    3: [ // Commercial
      { text: 'Total Price (excluding VAT)', type: 'number', weight: 10, required: true, help: 'Total lump sum or measured price in GBP' },
      { text: 'Payment Terms Offered', type: 'text', weight: 5, required: false, help: 'e.g., 30 days from valuation' }
    ]
  };

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const questions = questionsBySection[i] || [];

    for (let j = 0; j < questions.length; j++) {
      const q = questions[j];
      await prisma.tenderQuestion.create({
        data: {
          tenantId: 'demo',
          tenderId: tenderId,
          sectionId: section.id,
          text: q.text,
          type: q.type,
          weight: q.weight,
          isRequired: q.required,
          helpText: q.help,
          orderIndex: j + 1
        }
      });
    }
  }
}

// ======================
// PHASE 4: TENDER RESPONSES WITH ANSWERS
// ======================

async function seedTenderResponses(tenders, suppliers) {
  for (const tender of tenders) {
    // Only create responses for live, closed, evaluating, or awarded tenders
    if (['draft'].includes(tender.status)) continue;

    const pkg = tender.package;
    const tradeSuppliers = suppliers.filter(s => s.trade === pkg.trade);

    // Determine number of responses based on status
    let numResponses;
    if (tender.status === 'awarded') numResponses = 3;
    else if (tender.status === 'evaluating') numResponses = 3;
    else if (tender.status === 'closed') numResponses = randomInt(2, 4);
    else numResponses = randomInt(1, 3); // live - some responses in

    const selectedSuppliers = [...tradeSuppliers].sort(() => Math.random() - 0.5).slice(0, Math.min(numResponses, tradeSuppliers.length));

    // Get all questions for this tender
    const questions = await prisma.tenderQuestion.findMany({
      where: { tenderId: tender.id },
      orderBy: { orderIndex: 'asc' }
    });

    for (let i = 0; i < selectedSuppliers.length; i++) {
      const supplier = selectedSuppliers[i];

      // Generate realistic answers
      const answers = {};
      let totalScore = 0;
      let maxScore = 0;

      for (const question of questions) {
        maxScore += question.weight;

        let answer;
        let score;

        switch (question.type) {
          case 'text':
            if (question.text.includes('Registration')) {
              answer = supplier.regNo;
              score = question.weight; // Full marks
            } else if (question.text.includes('Payment Terms')) {
              answer = randomElement(['30 days from valuation', '45 days from invoice', '30 days end of month']);
              score = question.weight * 0.8;
            } else {
              answer = 'Sample text response';
              score = question.weight * 0.7;
            }
            break;

          case 'number':
            if (question.text.includes('Turnover')) {
              answer = supplier.turnover;
              score = question.weight * (supplier.turnover > 5000000 ? 1.0 : 0.7);
            } else if (question.text.includes('Employees')) {
              answer = randomInt(15, 150);
              score = question.weight * 0.85;
            } else if (question.text.includes('Insurance')) {
              answer = randomInt(5, 15);
              score = question.weight * 0.9;
            } else if (question.text.includes('Projects')) {
              answer = randomInt(5, 25);
              score = question.weight * 0.95;
            } else if (question.text.includes('Programme')) {
              answer = randomInt(20, 40);
              score = question.weight * randomValue(0.7, 1.0);
            } else if (question.text.includes('Total Price')) {
              const variance = tender.status === 'evaluating' && i === 0 ? 0.95 : randomValue(0.85, 1.15);
              answer = Math.round(pkg.budgetEstimate * variance);
              score = question.weight * (variance < 1.0 ? 1.0 : 0.8);
            } else {
              answer = randomInt(10, 100);
              score = question.weight * 0.8;
            }
            break;

          case 'yes_no':
            answer = randomElement(['yes', 'yes', 'yes', 'no']); // 75% yes
            score = answer === 'yes' ? question.weight : question.weight * 0.3;
            break;

          case 'textarea':
            if (question.text.includes('Case Study')) {
              answer = `Recently completed a £${randomInt(3, 12)}m ${pkg.trade.toLowerCase()} project for ${randomElement(['NHS Trust', 'University', 'Commercial Developer', 'Local Authority'])}. Project delivered on time and 2% under budget. Client satisfaction: Excellent.`;
              score = question.weight * randomValue(0.75, 1.0);
            } else if (question.text.includes('References')) {
              answer = `Reference 1: John Smith, ABC Developments, 07700 900${randomInt(100, 999)}\nReference 2: Jane Doe, XYZ Construction, 07700 900${randomInt(100, 999)}`;
              score = question.weight * 0.9;
            } else if (question.text.includes('Methodology')) {
              answer = 'Our approach prioritizes quality, safety, and programme certainty. We will employ a dedicated site team, implement robust QA procedures, and maintain weekly progress meetings with the client team.';
              score = question.weight * randomValue(0.7, 0.95);
            } else {
              answer = 'Detailed response provided in accordance with requirements.';
              score = question.weight * 0.8;
            }
            break;

          case 'file':
            answer = 'document_uploaded.pdf';
            score = question.weight * 0.85;
            break;

          case 'rating':
            answer = randomInt(3, 5);
            score = (answer / 5) * question.weight;
            break;

          default:
            answer = 'N/A';
            score = 0;
        }

        answers[question.id] = { answer, score: Math.round(score * 10) / 10 };
        totalScore += score;
      }

      // Calculate percentage score
      const autoScore = Math.round((totalScore / maxScore) * 100);

      // For evaluating tender, make one response very strong (92+)
      let finalScore = autoScore;
      if (tender.status === 'evaluating' && i === 0) {
        finalScore = randomInt(92, 98);
      }

      // Extract price from answers
      const priceQuestion = questions.find(q => q.text.includes('Total Price'));
      const priceTotal = priceQuestion ? answers[priceQuestion.id].answer : pkg.budgetEstimate;

      const response = await prisma.tenderResponse.create({
        data: {
          tenantId: 'demo',
          tender: { connect: { id: tender.id } },
          supplier: { connect: { id: supplier.id } },
          priceTotal: priceTotal,
          answers: answers,
          autoScore: finalScore,
          submittedAt: randomDate(new Date('2025-02-15'), tender.deadlineAt || new Date('2025-03-15')),
          source: 'portal'
        }
      });

      // Also create TenderSubmission for scoring purposes
      const submission = await prisma.tenderSubmission.create({
        data: {
          tenantId: 'demo',
          tenderId: tender.id,
          supplierId: supplier.id,
          accessToken: require('crypto').randomBytes(32).toString('hex'),
          status: 'submitted',
          formData: answers,
          totalPrice: priceTotal,
          submittedAt: response.submittedAt
        }
      });

      console.log(`    ✓ Response from ${supplier.name}: £${priceTotal.toLocaleString()} (Score: ${finalScore}%)`);
    }
  }

  console.log(`  ✓ Created tender responses with realistic answers`);
}

// ======================
// PHASE 5: TENDER CRITERIA & SCORING
// ======================

async function seedTenderCriteriaAndScoring(tenders) {
  for (const tender of tenders) {
    // Only create criteria for closed/evaluating/awarded tenders
    if (!['closed', 'evaluating', 'awarded'].includes(tender.status)) continue;

    // Create tender criteria
    const criteriaData = [
      { name: 'Price', weight: 30, type: 'price' },
      { name: 'Technical Capability', weight: 40, type: 'technical' },
      { name: 'Programme', weight: 15, type: 'programme' },
      { name: 'Health & Safety', weight: 15, type: 'health_safety' }
    ];

    const criteria = [];
    for (const data of criteriaData) {
      const criterion = await prisma.tenderCriteria.create({
        data: {
          tenantId: 'demo',
          tenderId: tender.id,
          name: data.name,
          weight: data.weight,
          type: data.type
        }
      });
      criteria.push(criterion);
    }

    // Get all submissions for this tender (for scoring)
    const submissions = await prisma.tenderSubmission.findMany({
      where: { tenderId: tender.id }
    });

    // Also get all responses (for autoScore values)
    const responses = await prisma.tenderResponse.findMany({
      where: { tenderId: tender.id }
    });

    // Score each submission against each criterion
    for (const submission of submissions) {
      // Find matching response for autoScore
      const matchingResponse = responses.find(r => r.supplierId === submission.supplierId);

      for (const criterion of criteria) {
        let autoScore;

        if (criterion.type === 'price') {
          // Price scoring: lowest gets 100, others proportionally less
          const allPrices = submissions.map(s => parseFloat(s.totalPrice));
          const lowestPrice = Math.min(...allPrices);
          autoScore = Math.round((lowestPrice / parseFloat(submission.totalPrice)) * 100);
        } else {
          // Other criteria: use question-based scoring with variance
          const baseScore = matchingResponse ? matchingResponse.autoScore : 75;
          autoScore = Math.round(baseScore * randomValue(0.9, 1.1));
          autoScore = Math.min(100, Math.max(60, autoScore)); // Clamp between 60-100
        }

        await prisma.tenderScore.create({
          data: {
            tenantId: 'demo',
            criteriaId: criterion.id,
            submissionId: submission.id,
            autoScore: autoScore
          }
        });
      }
    }

    console.log(`    ✓ Created criteria and scoring for tender: ${tender.title}`);
  }

  console.log(`  ✓ Created tender criteria and scoring`);
}

// ======================
// PHASE 6 & 7: AWARDED TENDER WITH CONTRACT
// ======================

async function seedAwardedTenderWithContract(tenders, packages, suppliers, users) {
  // Find the awarded tender
  const awardedTender = tenders.find(t => t.status === 'awarded');
  if (!awardedTender) {
    console.log('  ⚠ No awarded tender found to create contract');
    return;
  }

  // Get the best response (highest score)
  const responses = await prisma.tenderResponse.findMany({
    where: { tenderId: awardedTender.id },
    include: { supplier: true },
    orderBy: { autoScore: 'desc' }
  });

  if (responses.length === 0) {
    console.log('  ⚠ No responses found for awarded tender');
    return;
  }

  const winningResponse = responses[0];
  const pkg = packages.find(p => p.id === awardedTender.packageId);

  // Create contract
  const contract = await prisma.contract.create({
    data: {
      tenantId: 'demo',
      projectId: pkg.projectId,
      packageId: pkg.id,
      supplierId: winningResponse.supplierId,
      title: `${pkg.name} - Subcontract Agreement`,
      contractRef: 'CON-2025-0001',
      value: winningResponse.priceTotal,
      currency: 'GBP',
      status: 'signed',
      signedAt: randomDate(new Date('2025-04-01'), new Date('2025-04-15')),
      startDate: new Date('2025-05-01'),
      endDate: new Date('2025-11-30'),
      retentionPct: 5,
      paymentTerms: '30 days from valuation',
      notes: `Awarded following competitive tender evaluation. Winner: ${winningResponse.supplier.name} with score ${winningResponse.autoScore}%. Technical submission was comprehensive, programme realistic, and price competitive. Recommendation: Award approved by Commercial Manager.`
    }
  });

  console.log(`  ✓ Created contract ${contract.contractRef} for £${parseFloat(contract.value).toLocaleString()}`);

  // Create contract documents
  const documents = [
    {
      title: 'Main Subcontract Agreement',
      type: 'main_contract',
      signed: true,
      signedDate: contract.signedAt,
      witness: 'Lisa Commercial'
    },
    {
      title: 'Performance Bond 10%',
      type: 'bond',
      signed: true,
      signedDate: contract.signedAt,
      witness: null
    },
    {
      title: 'Insurance Certificate £10M Liability',
      type: 'insurance',
      signed: true,
      signedDate: contract.signedAt,
      witness: null
    },
    {
      title: 'Contract Programme 26 weeks',
      type: 'programme',
      signed: false,
      signedDate: null,
      witness: null
    }
  ];

  for (const doc of documents) {
    const contractDoc = await prisma.contractDocument.create({
      data: {
        tenantId: 'demo',
        contractId: contract.id,
        title: doc.title,
        editorType: 'prosemirror',
        active: true
      }
    });

    // Create initial version
    await prisma.contractVersion.create({
      data: {
        tenantId: 'demo',
        contractDocId: contractDoc.id,
        versionNo: 1,
        contentJson: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: doc.title }]
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: doc.signed
                    ? `This document was signed on ${doc.signedDate?.toISOString().split('T')[0]} ${doc.witness ? 'and witnessed by ' + doc.witness : ''}.`
                    : 'This document is pending signature.'
                }
              ]
            }
          ]
        },
        createdBy: randomElement(users).id
      }
    });

    console.log(`    ✓ Created contract document: ${doc.title}`);
  }

  console.log(`  ✓ Contract created with 4 documents (3 signed, 1 pending)`);
}

// ======================
// PHASE 8: DIRECT AWARDS
// ======================

async function seedDirectAwards(packages, suppliers, users) {
  // Find packages without tenders
  const packagesWithTenders = await prisma.tender.findMany({
    select: { packageId: true }
  });
  const tenderedPackageIds = new Set(packagesWithTenders.map(t => t.packageId));

  const nonTenderedPackages = packages.filter(pkg => !tenderedPackageIds.has(pkg.id));

  console.log(`  Found ${nonTenderedPackages.length} packages without tenders for direct award`);

  for (const pkg of nonTenderedPackages) {
    const tradeSuppliers = suppliers.filter(s => s.trade === pkg.trade);
    if (tradeSuppliers.length === 0) continue;

    const supplier = randomElement(tradeSuppliers);
    const awardValue = pkg.budgetEstimate * randomValue(0.92, 1.08);

    const contract = await prisma.contract.create({
      data: {
        tenantId: 'demo',
        projectId: pkg.projectId,
        packageId: pkg.id,
        supplierId: supplier.id,
        title: `${pkg.name} - Direct Award`,
        contractRef: `CON-2025-DA-${String(nonTenderedPackages.indexOf(pkg) + 1).padStart(3, '0')}`,
        value: awardValue,
        currency: 'GBP',
        status: randomElement(['draft', 'signed', 'active']),
        signedAt: randomElement([null, randomDate(new Date('2025-03-01'), new Date('2025-04-01'))]),
        startDate: randomDate(new Date('2025-04-01'), new Date('2025-06-01')),
        endDate: randomDate(new Date('2025-09-01'), new Date('2026-03-01')),
        retentionPct: 5,
        paymentTerms: '30 days from valuation',
        notes: `Direct award justification: ${randomElement([
          'Framework agreement supplier with proven track record',
          'Specialist supplier - only one capable of delivering this scope',
          'Emergency works - time constraints preclude competitive tender',
          'Continuation of existing works under negotiated rates',
          'Single source supplier for proprietary system'
        ])}`
      }
    });

    console.log(`    ✓ Direct award to ${supplier.name}: £${awardValue.toLocaleString()}`);
  }

  console.log(`  ✓ Created ${nonTenderedPackages.length} direct awards`);
}

// ======================
// SUMMARY
// ======================

async function printSummary() {
  const counts = {
    users: await prisma.user.count(),
    clients: await prisma.client.count(),
    suppliers: await prisma.supplier.count(),
    projects: await prisma.project.count(),
    costCodes: await prisma.costCode.count(),
    budgetLines: await prisma.budgetLine.count(),
    packages: await prisma.package.count(),
    packageItems: await prisma.packageItem.count(),
    tenders: await prisma.tender.count(),
    tenderSections: await prisma.tenderSection.count(),
    tenderQuestions: await prisma.tenderQuestion.count(),
    tenderResponses: await prisma.tenderResponse.count(),
    tenderCriteria: await prisma.tenderCriteria.count(),
    tenderScores: await prisma.tenderScore.count(),
    contracts: await prisma.contract.count(),
    contractDocuments: await prisma.contractDocument.count()
  };

  const tendersByStatus = await prisma.tender.groupBy({
    by: ['status'],
    _count: true
  });

  console.log('\n' + '='.repeat(80));
  console.log('DATABASE SEEDING SUMMARY - ULTRA-COMPREHENSIVE');
  console.log('='.repeat(80));
  console.log('\nCORE DATA:');
  console.log(`  Users:                    ${counts.users}`);
  console.log(`  Clients:                  ${counts.clients}`);
  console.log(`  Suppliers:                ${counts.suppliers}`);
  console.log(`  Projects:                 ${counts.projects}`);

  console.log('\nBUDGET STRUCTURE:');
  console.log(`  Cost Codes:               ${counts.costCodes}`);
  console.log(`  Budget Lines:             ${counts.budgetLines}`);

  console.log('\nPACKAGES:');
  console.log(`  Packages:                 ${counts.packages}`);
  console.log(`  Package-Budget Links:     ${counts.packageItems}`);

  console.log('\nTENDERING:');
  console.log(`  Tenders:                  ${counts.tenders}`);
  tendersByStatus.forEach(t => {
    console.log(`    - ${t.status}:                  ${t._count}`);
  });
  console.log(`  Tender Sections:          ${counts.tenderSections}`);
  console.log(`  Tender Questions:         ${counts.tenderQuestions}`);
  console.log(`  Tender Responses:         ${counts.tenderResponses}`);
  console.log(`  Tender Criteria:          ${counts.tenderCriteria}`);
  console.log(`  Tender Scores:            ${counts.tenderScores}`);

  console.log('\nCONTRACTS:');
  console.log(`  Contracts:                ${counts.contracts}`);
  console.log(`  Contract Documents:       ${counts.contractDocuments}`);

  console.log('\n' + '='.repeat(80));
  console.log('✅ Complete Budget-to-Contract Workflow Seeded Successfully!');
  console.log('\nTEST CREDENTIALS:');
  console.log('  Email:    john.buyer@demo.com');
  console.log('  Password: password123');
  console.log('\nAll users use the same password: password123');
  console.log('='.repeat(80));
  console.log('');
}

// ======================
// EXECUTE
// ======================

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
