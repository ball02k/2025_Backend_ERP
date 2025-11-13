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
// REALISTIC UK DATA
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
  { name: 'Thames Valley Groundworks Ltd', trade: 'Groundworks', city: 'London' },
  { name: 'London Steel Fabrications', trade: 'Structural Steel', city: 'London' },
  { name: 'Birmingham M&E Services', trade: 'Mechanical & Electrical', city: 'Birmingham' },
  { name: 'Manchester Facades Group', trade: 'Facades & Cladding', city: 'Manchester' },
  { name: 'Concrete Frame Specialists', trade: 'Concrete Frame', city: 'Leeds' },
  { name: 'UK Roofing Solutions', trade: 'Roofing & Waterproofing', city: 'Bristol' },
  { name: 'Elite Groundworks & Civil Engineering', trade: 'Groundworks', city: 'Manchester' },
  { name: 'Advanced Steel Structures', trade: 'Structural Steel', city: 'Birmingham' },
  { name: 'Precision M&E Contractors', trade: 'Mechanical & Electrical', city: 'London' },
  { name: 'Modern Facades UK', trade: 'Facades & Cladding', city: 'Leeds' },
  { name: 'Fit-Out Solutions Ltd', trade: 'Internal Fit-Out', city: 'London' },
  { name: 'Quality Joinery Works', trade: 'Joinery & Carpentry', city: 'Manchester' },
  { name: 'Plumbing & Heating Experts', trade: 'Plumbing & Heating', city: 'Bristol' },
  { name: 'Electrical Installations UK', trade: 'Electrical Services', city: 'Birmingham' },
  { name: 'HVAC Systems Pro', trade: 'HVAC Systems', city: 'London' },
  { name: 'Fire Safety Services', trade: 'Fire Protection', city: 'Leeds' },
  { name: 'Demo & Demolition Ltd', trade: 'Demolition', city: 'Manchester' },
  { name: 'Piling Contractors UK', trade: 'Piling & Foundations', city: 'London' },
  { name: 'Drainage Solutions Group', trade: 'Drainage & Utilities', city: 'Birmingham' },
  { name: 'Northern Groundworks', trade: 'Groundworks', city: 'Leeds' },
  { name: 'Southern Steel Works', trade: 'Structural Steel', city: 'Bristol' },
  { name: 'Midlands M&E', trade: 'Mechanical & Electrical', city: 'Birmingham' },
  { name: 'Cladding Specialists Ltd', trade: 'Facades & Cladding', city: 'London' },
  { name: 'Concrete Solutions UK', trade: 'Concrete Frame', city: 'Manchester' },
  { name: 'Premium Roofing Services', trade: 'Roofing & Waterproofing', city: 'Bristol' },
  { name: 'Interior Fit-Out Group', trade: 'Internal Fit-Out', city: 'Leeds' },
  { name: 'Master Joiners Ltd', trade: 'Joinery & Carpentry', city: 'London' },
  { name: 'Heating Solutions UK', trade: 'Plumbing & Heating', city: 'Birmingham' },
  { name: 'Power Electric Ltd', trade: 'Electrical Services', city: 'Manchester' },
  { name: 'Climate Control Systems', trade: 'HVAC Systems', city: 'Bristol' }
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
  { name: 'Commercial Properties UK', type: 'developer', contact: 'Sarah Jones' },
  { name: 'Birmingham Housing Trust', type: 'housing_association', contact: 'Michael Brown' },
  { name: 'Healthcare Estates Ltd', type: 'private', contact: 'Lisa Anderson' },
  { name: 'Education Buildings Group', type: 'public_sector', contact: 'Robert Taylor' },
  { name: 'Retail Developments PLC', type: 'developer', contact: 'Jennifer White' }
];

const USER_DATA = [
  { name: 'John Buyer', email: 'john.buyer@demo.com', role: 'Buyer' },
  { name: 'Sarah Project Manager', email: 'sarah.pm@demo.com', role: 'Project Manager' },
  { name: 'Mike Quantity Surveyor', email: 'mike.qs@demo.com', role: 'Quantity Surveyor' },
  { name: 'Emma Finance', email: 'emma.finance@demo.com', role: 'Finance' },
  { name: 'David Admin', email: 'david.admin@demo.com', role: 'Admin' },
  { name: 'Lisa Commercial', email: 'lisa.commercial@demo.com', role: 'Commercial Manager' },
  { name: 'Tom Procurement', email: 'tom.procurement@demo.com', role: 'Procurement' },
  { name: 'Rachel Contracts', email: 'rachel.contracts@demo.com', role: 'Contracts Manager' },
  { name: 'Peter Senior Buyer', email: 'peter.buyer@demo.com', role: 'Senior Buyer' },
  { name: 'Claire Operations', email: 'claire.ops@demo.com', role: 'Operations Manager' },
  { name: 'Mark Cost Controller', email: 'mark.cost@demo.com', role: 'Cost Controller' },
  { name: 'Sophie Estimator', email: 'sophie.estimator@demo.com', role: 'Estimator' }
];

const PROJECT_DATA = [
  { name: 'Riverside Apartments Development', value: 25000000, type: 'residential', status: 'Active' },
  { name: 'City Centre Office Block', value: 45000000, type: 'commercial', status: 'Active' },
  { name: 'Hospital Extension Project', value: 35000000, type: 'healthcare', status: 'Active' },
  { name: 'Primary School Renovation', value: 5000000, type: 'education', status: 'Active' },
  { name: 'Retail Park Development', value: 18000000, type: 'retail', status: 'Active' },
  { name: 'Mixed Use Tower Block', value: 60000000, type: 'mixed_use', status: 'Active' },
  { name: 'Industrial Warehouse Complex', value: 12000000, type: 'industrial', status: 'Active' }
];

// Password: 'password123' - SHA256 hash
const PASSWORD_SHA = 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f';

// ======================
// MAIN SEEDING FUNCTION
// ======================

async function main() {
  console.log('🗑️  Phase 1: Cleaning database...');
  await cleanDatabase();

  console.log('👥 Phase 2: Creating users...');
  const users = await seedUsers();

  console.log('🏢 Phase 3: Creating clients...');
  const clients = await seedClients();

  console.log('🏗️  Phase 4: Creating suppliers...');
  const suppliers = await seedSuppliers();

  console.log('📁 Phase 5: Creating projects...');
  const projects = await seedProjects(clients, users);

  console.log('📦 Phase 6: Creating packages...');
  const packages = await seedPackages(projects, users);

  console.log('📋 Phase 7: Creating tenders (Request model)...');
  const requests = await seedRequests(packages);

  console.log('📧 Phase 8: Creating tender invitations...');
  const invitations = await seedTenderInvitations(requests, suppliers, users);

  console.log('📝 Phase 9: Creating tender submissions...');
  const submissions = await seedTenderSubmissions(invitations, suppliers);

  console.log('🏆 Phase 10: Creating direct awards...');
  const awards = await seedAwards(packages, suppliers, users);

  console.log('📄 Phase 11: Creating contracts...');
  const contracts = await seedContracts(projects, packages, suppliers, requests, awards, users);

  console.log('📦 Phase 12: Creating purchase orders...');
  const purchaseOrders = await seedPurchaseOrders(projects, contracts, users);

  console.log('💰 Phase 13: Creating invoices...');
  const invoices = await seedInvoices(projects, contracts, suppliers);

  console.log('💳 Phase 14: Creating payments (ApplicationForPayment)...');
  await seedPayments(projects, contracts, suppliers);

  console.log('\n✅ Seeding complete!');
  await printSummary();
}

// ======================
// DATABASE CLEANUP
// ======================

async function cleanDatabase() {
  const tables = [
    'ApplicationForPayment',
    'Invoice',
    'PurchaseOrder',
    'Contract',
    'Award',
    'AwardDecision',
    'TenderSubmission',
    'TenderInvitation',
    'Request',
    'PackageLineItem',
    'Package',
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
      console.log(`  ⚠ Could not clean ${table}: ${e.message}`);
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

    // Create a primary contact for each client
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
        companyRegNo: `${randomInt(1000000, 9999999)}`,
        vatNo: `GB${randomInt(100000000, 999999999)}`,
        insurancePolicyNumber: `INS-${randomInt(100000, 999999)}`,
        insuranceExpiry: randomDate(new Date('2025-06-01'), new Date('2026-12-31')),
        performanceScore: randomValue(3.5, 5.0)
      }
    });

    // Add capability/trade
    await prisma.supplierCapability.create({
      data: {
        supplierId: supplier.id,
        tenantId: 'demo',
        tag: supplierData.trade
      }
    });

    suppliers.push({ ...supplier, trade: supplierData.trade });
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
// SEED PACKAGES
// ======================

async function seedPackages(projects, users) {
  const packages = [];
  const packageStatuses = ['Draft', 'Tendering', 'Evaluating', 'Awarded', 'Active'];

  for (const project of projects) {
    const packageCount = randomInt(3, 5);
    const trades = [...UK_TRADES].sort(() => Math.random() - 0.5).slice(0, packageCount);

    for (let i = 0; i < packageCount; i++) {
      const trade = trades[i];
      const budgetEstimate = (project.budget / packageCount) * randomValue(0.8, 1.2);

      const pkg = await prisma.package.create({
        data: {
          projectId: project.id,
          name: `${trade} Package`,
          scopeSummary: `${trade} works for ${project.name}`,
          trade: trade,
          status: randomElement(packageStatuses),
          budgetEstimate: budgetEstimate,
          estimatedValue: budgetEstimate,
          budgetValue: budgetEstimate * randomValue(0.95, 1.05),
          deadline: randomDate(new Date('2025-03-01'), new Date('2025-08-01')),
          targetAwardDate: randomDate(new Date('2025-02-01'), new Date('2025-06-01')),
          requiredOnSite: randomDate(new Date('2025-04-01'), new Date('2025-09-01')),
          ownerUserId: randomElement(users).id,
          buyerUserId: randomElement(users).id,
          pricingMode: randomElement(['LUMP_SUM', 'MEASURED', 'HYBRID'])
        }
      });

      packages.push({ ...pkg, trade });
    }
  }

  console.log(`  ✓ Created ${packages.length} packages`);
  return packages;
}

// ======================
// SEED REQUESTS (TENDERS)
// ======================

async function seedRequests(packages) {
  const requests = [];
  const statuses = ['draft', 'live', 'closed', 'awarded'];

  // Create tenders for about 40% of packages
  const tenderedPackages = packages.slice(0, Math.floor(packages.length * 0.4));

  for (let i = 0; i < tenderedPackages.length; i++) {
    const pkg = tenderedPackages[i];
    const status = i < 3 ? 'draft' : i < 8 ? 'live' : i < 11 ? 'closed' : 'awarded';

    const request = await prisma.request.create({
      data: {
        tenantId: 'demo',
        packageId: pkg.id,
        title: `${pkg.name} - Request for Proposal`,
        type: randomElement(['RFP', 'RFQ', 'ITT']),
        status: status,
        deadline: status === 'draft' ? null : randomDate(new Date('2025-02-01'), new Date('2025-07-01')),
        issuedAt: status !== 'draft' ? randomDate(new Date('2025-01-01'), new Date('2025-02-01')) : null,
        addenda: `Full tender documentation for ${pkg.name}. Please review all requirements carefully.`,
        stage: 1,
        totalStages: randomElement([1, 2])
      }
    });

    requests.push(request);
  }

  console.log(`  ✓ Created ${requests.length} tenders (Request model)`);
  return requests;
}

// ======================
// SEED TENDER INVITATIONS
// ======================

async function seedTenderInvitations(requests, suppliers, users) {
  const invitations = [];

  for (const request of requests) {
    // Get the package to match trade
    const pkg = await prisma.package.findUnique({
      where: { id: request.packageId }
    });

    if (!pkg) continue;

    // Find suppliers matching the package trade
    const tradeSuppliers = suppliers.filter(s => s.trade === pkg.trade);
    const inviteCount = Math.min(randomInt(3, 6), tradeSuppliers.length);
    const selectedSuppliers = [...tradeSuppliers].sort(() => Math.random() - 0.5).slice(0, inviteCount);

    for (const supplier of selectedSuppliers) {
      const status = randomElement(['invited', 'invited', 'viewed', 'viewed', 'submitted', 'declined']);
      const invitedAt = request.issuedAt || new Date();
      const viewedAt = status !== 'invited' ? randomDate(invitedAt, new Date()) : null;

      const invitation = await prisma.tenderInvitation.create({
        data: {
          tenantId: 'demo',
          requestId: request.id,
          supplierId: supplier.id,
          status: status,
          invitedAt: invitedAt,
          invitedBy: randomElement(users).id,
          viewedAt: viewedAt,
          viewCount: viewedAt ? randomInt(1, 5) : 0,
          declinedAt: status === 'declined' ? randomDate(viewedAt || invitedAt, new Date()) : null,
          declineReason: status === 'declined' ? 'Unable to meet project timeline' : null
        }
      });

      invitations.push(invitation);
    }
  }

  console.log(`  ✓ Created ${invitations.length} tender invitations`);
  return invitations;
}

// ======================
// SEED TENDER SUBMISSIONS
// ======================

async function seedTenderSubmissions(invitations, suppliers) {
  const submissions = [];

  // Get invitations with 'submitted' status
  const submittedInvitations = invitations.filter(inv => inv.status === 'submitted');

  for (const invitation of submittedInvitations) {
    const request = await prisma.request.findUnique({
      where: { id: invitation.requestId },
      include: { package: true }
    });

    if (!request || !request.package) continue;

    const budgetValue = request.package.budgetEstimate || 100000;
    const totalPrice = budgetValue * randomValue(0.85, 1.15);

    const submission = await prisma.tenderSubmission.create({
      data: {
        tenantId: 'demo',
        tenderId: request.id,
        supplierId: invitation.supplierId,
        status: request.status === 'awarded' && Math.random() > 0.7 ? 'submitted' : 'submitted',
        totalPrice: totalPrice,
        submittedAt: randomDate(invitation.invitedAt, request.deadline || new Date()),
        formData: {
          commercialNotes: 'Competitive pricing with quality materials',
          programmeWeeks: randomInt(12, 52),
          warranty: '12 months defects liability'
        }
      }
    });

    // Create some line items
    const lineItemCount = randomInt(3, 8);
    for (let i = 0; i < lineItemCount; i++) {
      await prisma.tenderSubmissionItem.create({
        data: {
          tenantId: 'demo',
          submissionId: submission.id,
          description: `${request.package.trade} - Item ${i + 1}`,
          quantity: randomValue(10, 1000),
          unitPrice: randomValue(10, 500),
          total: randomValue(1000, 50000)
        }
      });
    }

    submissions.push(submission);
  }

  console.log(`  ✓ Created ${submissions.length} tender submissions`);
  return submissions;
}

// ======================
// SEED AWARDS
// ======================

async function seedAwards(packages, suppliers, users) {
  const awards = [];

  // Create awards for some packages (direct awards)
  const awardablePackages = packages
    .filter(p => ['Awarded', 'Active'].includes(p.status))
    .slice(0, randomInt(5, 8));

  for (const pkg of awardablePackages) {
    const tradeSuppliers = suppliers.filter(s => s.trade === pkg.trade);
    if (tradeSuppliers.length === 0) continue;

    const supplier = randomElement(tradeSuppliers);
    const awardValue = pkg.budgetEstimate * randomValue(0.9, 1.05);

    const award = await prisma.award.create({
      data: {
        tenantId: 'demo',
        projectId: pkg.projectId,
        packageId: pkg.id,
        supplierId: supplier.id,
        awardValue: awardValue,
        awardDate: randomDate(new Date('2025-01-01'), new Date('2025-03-01'))
      }
    });

    awards.push(award);
  }

  console.log(`  ✓ Created ${awards.length} awards`);
  return awards;
}

// ======================
// SEED CONTRACTS
// ======================

async function seedContracts(projects, packages, suppliers, requests, awards, users) {
  const contracts = [];

  // Create contracts from awards
  for (const award of awards) {
    const pkg = packages.find(p => p.id === award.packageId);
    if (!pkg) continue;

    const contract = await prisma.contract.create({
      data: {
        tenantId: 'demo',
        projectId: award.projectId,
        packageId: award.packageId,
        supplierId: award.supplierId,
        title: `${pkg.name} - Subcontract Agreement`,
        contractRef: `CON-2025-${String(contracts.length + 1).padStart(4, '0')}`,
        value: award.awardValue,
        currency: 'GBP',
        status: randomElement(['signed', 'active', 'active']),
        signedAt: randomDate(new Date('2025-01-15'), new Date('2025-03-15')),
        startDate: randomDate(new Date('2025-02-01'), new Date('2025-04-01')),
        endDate: randomDate(new Date('2025-09-01'), new Date('2026-12-31')),
        retentionPct: randomElement([3, 5, 10]),
        paymentTerms: randomElement(['30 days', '45 days', '60 days']),
        awardId: award.id
      }
    });

    contracts.push(contract);
  }

  // Create additional contracts from awarded tenders
  const awardedRequests = requests.filter(r => r.status === 'awarded').slice(0, 5);

  for (const request of awardedRequests) {
    const pkg = packages.find(p => p.id === request.packageId);
    if (!pkg) continue;

    const tradeSuppliers = suppliers.filter(s => s.trade === pkg.trade);
    if (tradeSuppliers.length === 0) continue;

    const supplier = randomElement(tradeSuppliers);

    const contract = await prisma.contract.create({
      data: {
        tenantId: 'demo',
        projectId: pkg.projectId,
        packageId: pkg.id,
        supplierId: supplier.id,
        title: `${pkg.name} - Subcontract Agreement`,
        contractRef: `CON-2025-${String(contracts.length + 1).padStart(4, '0')}`,
        value: pkg.budgetEstimate * randomValue(0.88, 1.08),
        currency: 'GBP',
        status: randomElement(['signed', 'active']),
        signedAt: randomDate(new Date('2025-01-15'), new Date('2025-03-15')),
        startDate: randomDate(new Date('2025-02-01'), new Date('2025-04-01')),
        endDate: randomDate(new Date('2025-09-01'), new Date('2026-12-31')),
        retentionPct: randomElement([3, 5, 10]),
        paymentTerms: randomElement(['30 days', '45 days', '60 days'])
      }
    });

    contracts.push(contract);
  }

  console.log(`  ✓ Created ${contracts.length} contracts`);
  return contracts;
}

// ======================
// SEED PURCHASE ORDERS
// ======================

async function seedPurchaseOrders(projects, contracts, users) {
  const purchaseOrders = [];

  for (const contract of contracts) {
    const poCount = randomInt(1, 2);

    for (let i = 0; i < poCount; i++) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: contract.supplierId }
      });

      const poValue = contract.value / poCount;

      const po = await prisma.purchaseOrder.create({
        data: {
          tenantId: 'demo',
          projectId: contract.projectId,
          code: `PO-2025-${String(purchaseOrders.length + 1).padStart(4, '0')}`,
          supplier: supplier?.name || 'Unknown Supplier',
          supplierId: contract.supplierId,
          contractId: contract.id,
          status: randomElement(['Open', 'Issued', 'Received']),
          orderDate: randomDate(new Date('2025-02-01'), new Date('2025-04-01')),
          total: poValue
        }
      });

      // Create PO lines
      const lineCount = randomInt(2, 5);
      for (let j = 0; j < lineCount; j++) {
        const lineTotal = poValue / lineCount;
        const qty = randomValue(10, 100);
        const unitCost = lineTotal / qty;

        await prisma.pOLine.create({
          data: {
            tenantId: 'demo',
            poId: po.id,
            item: `PO Line Item ${j + 1}`,
            qty: qty,
            unit: randomElement(['m', 'm2', 'm3', 'nr', 'item']),
            unitCost: unitCost,
            lineTotal: lineTotal
          }
        });
      }

      purchaseOrders.push(po);
    }
  }

  console.log(`  ✓ Created ${purchaseOrders.length} purchase orders`);
  return purchaseOrders;
}

// ======================
// SEED INVOICES
// ======================

async function seedInvoices(projects, contracts, suppliers) {
  const invoices = [];

  for (const contract of contracts) {
    const invoiceCount = randomInt(2, 4);
    const valuePerInvoice = contract.value / invoiceCount;

    for (let i = 0; i < invoiceCount; i++) {
      const status = randomElement(['Open', 'Open', 'Paid', 'Overdue']);
      const issueDate = randomDate(new Date('2025-02-01'), new Date('2025-05-01'));
      const dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + 30);

      const invoice = await prisma.invoice.create({
        data: {
          tenantId: 'demo',
          projectId: contract.projectId,
          supplierId: contract.supplierId,
          contractId: contract.id,
          number: `INV-${String(invoices.length + 1).padStart(5, '0')}`,
          issueDate: issueDate,
          dueDate: dueDate,
          net: valuePerInvoice,
          vat: valuePerInvoice * 0.2,
          gross: valuePerInvoice * 1.2,
          status: status,
          source: randomElement(['email', 'portal', 'manual'])
        }
      });

      invoices.push(invoice);
    }
  }

  console.log(`  ✓ Created ${invoices.length} invoices`);
  return invoices;
}

// ======================
// SEED PAYMENTS
// ======================

async function seedPayments(projects, contracts, suppliers) {
  const payments = [];

  for (const contract of contracts) {
    const paymentCount = randomInt(2, 4);
    const valuePerPayment = contract.value / paymentCount;

    for (let i = 0; i < paymentCount; i++) {
      const status = randomElement(['draft', 'submitted', 'certified', 'paid']);
      const applicationDate = randomDate(new Date('2025-02-01'), new Date('2025-05-01'));
      const periodStart = new Date(applicationDate);
      periodStart.setDate(1);
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      periodEnd.setDate(0);

      const netClaimed = valuePerPayment * randomValue(0.9, 1.0);
      const retentionValue = netClaimed * 0.05;

      const payment = await prisma.applicationForPayment.create({
        data: {
          tenantId: 'demo',
          projectId: contract.projectId,
          supplierId: contract.supplierId,
          contractId: contract.id,
          applicationNo: `AFP-2025-${String(payments.length + 1).padStart(5, '0')}`,
          applicationDate: applicationDate,
          periodStart: periodStart,
          periodEnd: periodEnd,
          assessmentDate: status !== 'draft' ? randomDate(applicationDate, new Date()) : null,
          dueDate: status !== 'draft' ? randomDate(applicationDate, new Date()) : null,
          currency: 'GBP',
          grossToDate: netClaimed,
          variationsValue: netClaimed * randomValue(0, 0.1),
          prelimsValue: netClaimed * randomValue(0.05, 0.15),
          retentionValue: retentionValue,
          mosValue: 0,
          offsiteValue: 0,
          deductionsValue: 0,
          netClaimed: netClaimed - retentionValue,
          certifiedAmount: status === 'certified' || status === 'paid' ? netClaimed - retentionValue : null,
          certifiedDate: status === 'certified' || status === 'paid' ? randomDate(applicationDate, new Date()) : null,
          status: status
        }
      });

      payments.push(payment);
    }
  }

  console.log(`  ✓ Created ${payments.length} payment applications`);
  return payments;
}

// ======================
// SUMMARY
// ======================

async function printSummary() {
  const counts = {
    users: await prisma.user.count(),
    clients: await prisma.client.count(),
    contacts: await prisma.contact.count(),
    suppliers: await prisma.supplier.count(),
    supplierCapabilities: await prisma.supplierCapability.count(),
    projects: await prisma.project.count(),
    packages: await prisma.package.count(),
    requests: await prisma.request.count(),
    tenderInvitations: await prisma.tenderInvitation.count(),
    tenderSubmissions: await prisma.tenderSubmission.count(),
    tenderSubmissionItems: await prisma.tenderSubmissionItem.count(),
    awards: await prisma.award.count(),
    contracts: await prisma.contract.count(),
    purchaseOrders: await prisma.purchaseOrder.count(),
    poLines: await prisma.pOLine.count(),
    invoices: await prisma.invoice.count(),
    payments: await prisma.applicationForPayment.count()
  };

  console.log('\n' + '='.repeat(60));
  console.log('📊 DATABASE SEEDING SUMMARY');
  console.log('='.repeat(60));
  console.log('');
  console.log('CORE DATA:');
  console.log(`  Users:                    ${counts.users}`);
  console.log(`  Clients:                  ${counts.clients}`);
  console.log(`  Client Contacts:          ${counts.contacts}`);
  console.log(`  Suppliers:                ${counts.suppliers}`);
  console.log(`  Supplier Capabilities:    ${counts.supplierCapabilities}`);
  console.log('');
  console.log('PROJECT DATA:');
  console.log(`  Projects:                 ${counts.projects}`);
  console.log(`  Packages:                 ${counts.packages}`);
  console.log('');
  console.log('PROCUREMENT DATA:');
  console.log(`  Tenders (Requests):       ${counts.requests}`);
  console.log(`  Tender Invitations:       ${counts.tenderInvitations}`);
  console.log(`  Tender Submissions:       ${counts.tenderSubmissions}`);
  console.log(`  Submission Line Items:    ${counts.tenderSubmissionItems}`);
  console.log(`  Direct Awards:            ${counts.awards}`);
  console.log('');
  console.log('COMMERCIAL DATA:');
  console.log(`  Contracts:                ${counts.contracts}`);
  console.log(`  Purchase Orders:          ${counts.purchaseOrders}`);
  console.log(`  PO Lines:                 ${counts.poLines}`);
  console.log('');
  console.log('FINANCIAL DATA:');
  console.log(`  Invoices:                 ${counts.invoices}`);
  console.log(`  Payment Applications:     ${counts.payments}`);
  console.log('');
  console.log('='.repeat(60));
  console.log('');
  console.log('✅ Database fully seeded with realistic UK construction data!');
  console.log('');
  console.log('TEST CREDENTIALS:');
  console.log('  Email:    john.buyer@demo.com');
  console.log('  Password: password123');
  console.log('');
  console.log('All users use the same password: password123');
  console.log('='.repeat(60));
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
