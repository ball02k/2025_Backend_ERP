const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// UTILITY FUNCTIONS
function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomValue(min, max) {
  return min + Math.random() * (max - min);
}

const TENANT_ID = 'demo';

const TRADES = [
  'Groundworks', 'Structural Steel', 'Mechanical & Electrical', 'Facades', 'Roofing',
  'Concrete Frame', 'Internal Fit-Out', 'Flooring', 'Joinery', 'Glazing',
  'Plumbing', 'HVAC', 'Electrical', 'Fire Protection', 'Landscaping'
];

const SUPPLIER_NAMES = [
  { name: 'Thames Valley Groundworks Ltd', trade: 'Groundworks' },
  { name: 'London Steel Fabrications', trade: 'Structural Steel' },
  { name: 'Birmingham M&E Services', trade: 'Mechanical & Electrical' },
  { name: 'Manchester Facades Ltd', trade: 'Facades' },
  { name: 'Premier Roofing Solutions', trade: 'Roofing' },
  { name: 'Concrete Frame Specialists', trade: 'Concrete Frame' },
  { name: 'Elite Interior Fit-Out', trade: 'Internal Fit-Out' },
  { name: 'Industrial Flooring Co', trade: 'Flooring' },
  { name: 'Bespoke Joinery Works', trade: 'Joinery' },
  { name: 'Advanced Glazing Systems', trade: 'Glazing' },
  { name: 'Precision Plumbing Ltd', trade: 'Plumbing' },
  { name: 'Climate Control HVAC', trade: 'HVAC' },
  { name: 'PowerTech Electrical', trade: 'Electrical' },
  { name: 'SafeGuard Fire Protection', trade: 'Fire Protection' },
  { name: 'GreenScape Landscaping', trade: 'Landscaping' },
  { name: 'Metro Groundworks', trade: 'Groundworks' },
  { name: 'UK Steel Solutions', trade: 'Structural Steel' },
  { name: 'National M&E Contractors', trade: 'Mechanical & Electrical' },
  { name: 'Citywide Facades', trade: 'Facades' },
  { name: 'Weatherproof Roofing', trade: 'Roofing' },
  { name: 'Rapid Concrete', trade: 'Concrete Frame' },
  { name: 'Platinum Interiors', trade: 'Internal Fit-Out' },
  { name: 'Commercial Flooring Experts', trade: 'Flooring' },
  { name: 'Traditional Joinery', trade: 'Joinery' },
  { name: 'Crystal Clear Glazing', trade: 'Glazing' },
  { name: 'Aquaflow Plumbing', trade: 'Plumbing' },
  { name: 'TempControl HVAC', trade: 'HVAC' },
  { name: 'Bright Spark Electrical', trade: 'Electrical' },
  { name: 'FireSafe Systems', trade: 'Fire Protection' },
  { name: 'Urban Landscaping Ltd', trade: 'Landscaping' }
];

const UK_CITIES = ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Liverpool', 'Bristol', 'Sheffield', 'Edinburgh', 'Cardiff'];

const CLIENT_DATA = [
  { name: 'London Property Developments Ltd', contact: 'James Wilson', email: 'james@lpd.co.uk', phone: '020 7946 0958' },
  { name: 'Manchester City Council', contact: 'Emma Thompson', email: 'emma.thompson@manchester.gov.uk', phone: '0161 234 5678' },
  { name: 'Residential Estates Group', contact: 'David Chen', email: 'david@residentialestates.com', phone: '0121 496 0000' },
  { name: 'Healthcare Trust Properties', contact: 'Sarah Mitchell', email: 'sarah.mitchell@nhstrust.uk', phone: '0113 243 3144' },
  { name: 'Education Facilities Ltd', contact: 'Michael Brown', email: 'mbrown@edfacilities.com', phone: '0141 287 2000' },
  { name: 'Retail Park Investments', contact: 'Lisa Anderson', email: 'landerson@retailparks.com', phone: '0151 233 3000' },
  { name: 'Industrial Estate Holdings', contact: 'Robert Taylor', email: 'rtaylor@industrialestates.co.uk', phone: '0117 922 2000' },
  { name: 'Mixed Use Developments PLC', contact: 'Jennifer White', email: 'jwhite@mixeduse.com', phone: '0114 273 4567' }
];

const PROJECT_DATA = [
  { name: 'Riverside Apartments', value: 25000000, description: '150-unit luxury apartment complex with riverside views' },
  { name: 'City Centre Office Block', value: 45000000, description: '12-story Grade A office building with retail ground floor' },
  { name: 'Hospital Extension', value: 35000000, description: 'New wing for emergency department and 80 additional beds' },
  { name: 'Primary School Renovation', value: 5000000, description: 'Complete refurbishment of 1960s school building' },
  { name: 'Retail Park Development', value: 18000000, description: '50,000 sq ft retail park with parking for 300 vehicles' },
  { name: 'Industrial Warehouse Complex', value: 12000000, description: '4 x 15,000 sq ft warehouse units with offices' },
  { name: 'Mixed-Use Town Centre', value: 55000000, description: 'Residential, retail, and leisure development' }
];

async function main() {
  console.log('🚀 Starting comprehensive database seeding...\n');

  console.log('🗑️  Phase 1: Cleaning database...');
  await cleanDatabase();

  console.log('\n👥 Phase 2: Creating users...');
  const users = await seedUsers();

  console.log('\n🏢 Phase 3: Creating clients...');
  const clients = await seedClients();

  console.log('\n🏗️  Phase 4: Creating suppliers...');
  const suppliers = await seedSuppliers();

  console.log('\n📁 Phase 5: Creating projects and packages...');
  const { projects, packages } = await seedProjectsAndPackages(clients, users);

  console.log('\n📋 Phase 6: Creating tenders and submissions...');
  const { tenders, submissions } = await seedTendersAndSubmissions(packages, suppliers, users);

  console.log('\n📄 Phase 7: Creating contracts...');
  const contracts = await seedContracts(packages, suppliers, tenders, users);

  console.log('\n📦 Phase 8: Creating purchase orders...');
  const pos = await seedPurchaseOrders(contracts);

  console.log('\n💰 Phase 9: Creating invoices...');
  await seedInvoicesAndPayments(contracts, pos);

  console.log('\n✅ Seeding complete!');
  await printSummary();
}

async function cleanDatabase() {
  const tables = [
    'InvoiceLine', 'Invoice', 'POLine', 'PurchaseOrder',
    'ContractLineItem', 'Contract', 'TenderSubmission', 'TenderInvitation',
    'Request', 'PackageLineItem', 'Package', 'Project',
    'Supplier', 'Client', 'UserRole', 'User'
  ];

  for (const table of tables) {
    try {
      const modelName = table.charAt(0).toLowerCase() + table.slice(1);
      if (prisma[modelName]) {
        await prisma[modelName].deleteMany({});
        console.log(`  ✓ Cleaned ${table}`);
      }
    } catch (e) {
      console.log(`  ⚠ Could not clean ${table}: ${e.message}`);
    }
  }
}

async function seedUsers() {
  const password = await bcrypt.hash('password123', 10);
  const users = [];

  const userData = [
    { email: 'john.buyer@contractor.com', name: 'John Buyer' },
    { email: 'sarah.pm@contractor.com', name: 'Sarah Project Manager' },
    { email: 'mike.qs@contractor.com', name: 'Mike Quantity Surveyor' },
    { email: 'emma.commercial@contractor.com', name: 'Emma Commercial Manager' },
    { email: 'david.procurement@contractor.com', name: 'David Procurement Lead' },
    { email: 'lisa.contracts@contractor.com', name: 'Lisa Contracts Manager' },
    { email: 'tom.finance@contractor.com', name: 'Tom Finance Director' },
    { email: 'jane.admin@contractor.com', name: 'Jane Admin' }
  ];

  for (const data of userData) {
    const user = await prisma.user.create({
      data: { tenantId: TENANT_ID, email: data.email, name: data.name, passwordSHA: password, isActive: true }
    });
    users.push(user);
    console.log(`  ✓ Created user: ${user.name}`);
  }

  return users;
}

async function seedClients() {
  const clients = [];

  for (const data of CLIENT_DATA) {
    const client = await prisma.client.create({
      data: {
        tenantId: TENANT_ID, name: data.name, contactName: data.contact,
        email: data.email, phone: data.phone, city: randomElement(UK_CITIES), status: 'active'
      }
    });
    clients.push(client);
    console.log(`  ✓ Created client: ${client.name}`);
  }

  return clients;
}

async function seedSuppliers() {
  const suppliers = [];

  for (const data of SUPPLIER_NAMES) {
    const supplier = await prisma.supplier.create({
      data: {
        tenantId: TENANT_ID, name: data.name, trade: data.trade, status: 'approved',
        email: `contact@${data.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        phone: `0${randomInt(1000, 9999)} ${randomInt(100000, 999999)}`,
        city: randomElement(UK_CITIES),
        paymentTerms: randomElement(['30 days', '45 days', '60 days']),
        tier: randomElement(['preferred', 'approved', 'standard'])
      }
    });
    suppliers.push(supplier);
    console.log(`  ✓ Created supplier: ${supplier.name} (${supplier.trade})`);
  }

  return suppliers;
}

async function seedProjectsAndPackages(clients, users) {
  const projects = [];
  const packages = [];

  for (const data of PROJECT_DATA) {
    const startDate = randomDate(new Date('2024-01-01'), new Date('2025-01-01'));
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + randomInt(12, 36));

    const project = await prisma.project.create({
      data: {
        tenantId: TENANT_ID, clientId: randomElement(clients).id, name: data.name,
        description: data.description, value: data.value,
        status: randomElement(['active', 'active', 'planning']),
        startDate: startDate, targetEndDate: endDate, location: randomElement(UK_CITIES),
        projectManagerId: randomElement(users).id,
        quantitySurveyorId: randomElement(users).id
      }
    });
    projects.push(project);
    console.log(`  ✓ Created project: ${project.name}`);

    const packageCount = randomInt(5, 8);
    const packageValue = data.value / packageCount;

    for (let i = 0; i < packageCount; i++) {
      const trade = randomElement(TRADES);
      const actualValue = packageValue * randomValue(0.7, 1.3);

      const pkg = await prisma.package.create({
        data: {
          tenantId: TENANT_ID, projectId: project.id, name: `${trade} Package`,
          description: `${trade} works for ${project.name}`, trade: trade,
          code: `PKG-${project.id}-${String(i + 1).padStart(3, '0')}`,
          budgetTotal: actualValue,
          status: randomElement(['draft', 'active', 'tendering', 'awarded']),
          ownerId: randomElement(users).id, buyerId: randomElement(users).id
        }
      });
      packages.push(pkg);

      const lineItemCount = randomInt(10, 15);
      for (let j = 0; j < lineItemCount; j++) {
        await prisma.packageLineItem.create({
          data: {
            tenantId: TENANT_ID, packageId: pkg.id, itemNumber: `${String(j + 1).padStart(3, '0')}`,
            description: `${trade} item ${j + 1}`, unit: randomElement(['m', 'm2', 'm3', 'nr', 'kg', 't']),
            quantity: randomValue(10, 1000), budgetRate: randomValue(50, 500)
          }
        });
      }
    }

    console.log(`    ✓ Created ${packageCount} packages with line items`);
  }

  return { projects, packages };
}

async function seedTendersAndSubmissions(packages, suppliers, users) {
  const tenders = [];
  const submissions = [];
  const tenderedPackages = packages.filter(p => Math.random() > 0.4);

  for (const pkg of tenderedPackages) {
    const status = randomElement(['draft', 'draft', 'issued', 'issued', 'issued', 'closed', 'awarded']);
    const issueDate = randomDate(new Date('2024-06-01'), new Date('2025-01-01'));
    const deadline = new Date(issueDate);
    deadline.setDate(deadline.getDate() + randomInt(14, 45));

    const tender = await prisma.request.create({
      data: {
        tenantId: TENANT_ID, packageId: pkg.id, title: `${pkg.name} - Tender`,
        description: `Request for quotation: ${pkg.description}`,
        status: status, type: 'RFQ', deadlineAt: deadline,
        issuedAt: status !== 'draft' ? issueDate : null
      }
    });
    tenders.push(tender);

    await prisma.package.update({
      where: { id: pkg.id },
      data: {
        sourcingStatus: status === 'awarded' ? 'tender' : (status === 'draft' ? null : 'tender'),
        tenderId: tender.id
      }
    });

    if (status !== 'draft') {
      const tradeSuppliers = suppliers.filter(s => s.trade === pkg.trade);
      const inviteCount = Math.min(randomInt(3, 6), tradeSuppliers.length);
      const invitedSuppliers = [];

      for (let i = 0; i < inviteCount; i++) {
        const supplier = tradeSuppliers[i];
        if (!invitedSuppliers.includes(supplier.id)) {
          invitedSuppliers.push(supplier.id);

          const inviteStatus = randomElement(['invited', 'viewed', 'submitted', 'submitted']);

          await prisma.tenderInvitation.create({
            data: {
              tenantId: TENANT_ID, requestId: tender.id, supplierId: supplier.id,
              status: inviteStatus, invitedAt: issueDate, invitedById: randomElement(users).id
            }
          });

          if (inviteStatus === 'submitted' || (status === 'awarded' && i === 0)) {
            const submissionStatus = (status === 'awarded' && i === 0) ? 'awarded' : 'submitted';
            const submissionValue = pkg.budgetTotal * randomValue(0.85, 1.15);

            const submission = await prisma.tenderSubmission.create({
              data: {
                tenantId: TENANT_ID, requestId: tender.id, supplierId: supplier.id,
                totalValue: submissionValue, submittedAt: randomDate(issueDate, deadline),
                status: submissionStatus
              }
            });
            submissions.push(submission);
          }
        }
      }

      console.log(`  ✓ Created tender: ${tender.title} (${inviteCount} suppliers invited)`);
    }
  }

  return { tenders, submissions };
}

async function seedContracts(packages, suppliers, tenders, users) {
  const contracts = [];
  const awardedTenders = tenders.filter(t => t.status === 'awarded');

  for (const tender of awardedTenders) {
    const awardedSubmissions = await prisma.tenderSubmission.findMany({
      where: { requestId: tender.id, status: 'awarded' }
    });

    if (awardedSubmissions.length > 0) {
      const winning = awardedSubmissions[0];
      const pkg = packages.find(p => p.id === tender.packageId);

      const startDate = new Date(tender.deadlineAt);
      startDate.setDate(startDate.getDate() + 30);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + randomInt(3, 18));

      const contract = await prisma.contract.create({
        data: {
          tenantId: TENANT_ID, packageId: tender.packageId, supplierId: winning.supplierId,
          contractNumber: `CON-2025-${String(contracts.length + 1).padStart(4, '0')}`,
          title: `Contract: ${pkg.name}`, value: winning.totalValue,
          status: randomElement(['signed', 'active', 'active']),
          startDate: startDate, endDate: endDate,
          signedDate: new Date(startDate).setDate(startDate.getDate() - 7)
        }
      });
      contracts.push(contract);

      await prisma.package.update({
        where: { id: tender.packageId },
        data: {
          contractId: contract.id, awardedToSupplierId: winning.supplierId,
          awardedValue: winning.totalValue, status: 'awarded'
        }
      });

      console.log(`  ✓ Created contract: ${contract.contractNumber}`);
    }
  }

  const untendered = packages.filter(p => !p.tenderId && Math.random() > 0.6).slice(0, 5);

  for (const pkg of untendered) {
    const tradeSuppliers = suppliers.filter(s => s.trade === pkg.trade);
    if (tradeSuppliers.length > 0) {
      const supplier = randomElement(tradeSuppliers);
      const value = pkg.budgetTotal * randomValue(0.9, 1.05);

      const startDate = randomDate(new Date('2024-09-01'), new Date('2025-02-01'));
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + randomInt(3, 12));

      const contract = await prisma.contract.create({
        data: {
          tenantId: TENANT_ID, packageId: pkg.id, supplierId: supplier.id,
          contractNumber: `CON-2025-${String(contracts.length + 1).padStart(4, '0')}`,
          title: `Contract: ${pkg.name}`, value: value,
          status: randomElement(['signed', 'active']),
          startDate: startDate, endDate: endDate,
          signedDate: new Date(startDate).setDate(startDate.getDate() - 7)
        }
      });
      contracts.push(contract);

      await prisma.package.update({
        where: { id: pkg.id },
        data: {
          contractId: contract.id, awardedToSupplierId: supplier.id,
          awardedValue: value, status: 'awarded', sourcingStatus: 'direct_award'
        }
      });

      console.log(`  ✓ Created direct award contract: ${contract.contractNumber}`);
    }
  }

  return contracts;
}

async function seedPurchaseOrders(contracts) {
  const pos = [];

  for (const contract of contracts) {
    const poCount = randomInt(1, 2);
    const valuePerPO = contract.value / poCount;

    for (let i = 0; i < poCount; i++) {
      const issuedDate = randomDate(new Date(contract.startDate), new Date());
      const deliveryDate = new Date(issuedDate);
      deliveryDate.setDate(deliveryDate.getDate() + randomInt(30, 90));

      const po = await prisma.purchaseOrder.create({
        data: {
          tenantId: TENANT_ID, contractId: contract.id,
          poNumber: `PO-2025-${String(pos.length + 1).padStart(4, '0')}`,
          description: `Purchase order ${i + 1} for ${contract.title}`,
          totalValue: valuePerPO, status: randomElement(['issued', 'received', 'invoiced']),
          issuedDate: issuedDate, deliveryDate: deliveryDate
        }
      });
      pos.push(po);
    }
  }

  console.log(`  ✓ Created ${pos.length} purchase orders`);
  return pos;
}

async function seedInvoicesAndPayments(contracts, pos) {
  let invoiceCount = 0;

  for (const contract of contracts) {
    const numInvoices = randomInt(2, 4);
    const valuePerInvoice = contract.value / numInvoices;

    for (let i = 0; i < numInvoices; i++) {
      const invoiceDate = randomDate(new Date(contract.startDate), new Date());
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + 30);

      const isPaid = Math.random() > 0.4;
      const status = isPaid ? 'paid' : (dueDate < new Date() ? 'overdue' : 'issued');

      await prisma.invoice.create({
        data: {
          tenantId: TENANT_ID, contractId: contract.id,
          invoiceNumber: `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(5, '0')}`,
          description: `Invoice ${i + 1} - ${contract.title}`,
          netAmount: valuePerInvoice, vatAmount: valuePerInvoice * 0.2,
          grossAmount: valuePerInvoice * 1.2, status: status,
          invoiceDate: invoiceDate, dueDate: dueDate
        }
      });
      invoiceCount++;
    }
  }

  console.log(`  ✓ Created ${invoiceCount} invoices`);
}

async function printSummary() {
  const counts = await Promise.all([
    prisma.user.count(), prisma.client.count(), prisma.supplier.count(),
    prisma.project.count(), prisma.package.count(), prisma.packageLineItem.count(),
    prisma.request.count(), prisma.tenderSubmission.count(), prisma.tenderInvitation.count(),
    prisma.contract.count(), prisma.purchaseOrder.count(), prisma.invoice.count()
  ]);

  console.log('\n' + '='.repeat(50));
  console.log('📊 DATABASE SEEDING SUMMARY');
  console.log('='.repeat(50));
  console.log(`  Users:              ${counts[0]}`);
  console.log(`  Clients:            ${counts[1]}`);
  console.log(`  Suppliers:          ${counts[2]}`);
  console.log(`  Projects:           ${counts[3]}`);
  console.log(`  Packages:           ${counts[4]}`);
  console.log(`  Line Items:         ${counts[5]}`);
  console.log(`  Tenders:            ${counts[6]}`);
  console.log(`  Submissions:        ${counts[7]}`);
  console.log(`  Invitations:        ${counts[8]}`);
  console.log(`  Contracts:          ${counts[9]}`);
  console.log(`  Purchase Orders:    ${counts[10]}`);
  console.log(`  Invoices:           ${counts[11]}`);
  console.log('='.repeat(50));
  console.log('\n✅ Database fully seeded with connected, realistic data!');
  console.log('\n📝 Test Login Credentials:');
  console.log('   Email: john.buyer@contractor.com');
  console.log('   Password: password123');
  console.log('\n🔍 View data: npx prisma studio');
  console.log('='.repeat(50) + '\n');
}

main()
  .catch(e => {
    console.error('\n❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
