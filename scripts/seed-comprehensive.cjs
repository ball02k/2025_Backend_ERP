#!/usr/bin/env node
/* Comprehensive ERP seed script - populates all major tables */
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

const TENANT = 'demo';

async function main() {
  console.log('🌱 Starting comprehensive ERP seed...');

  // Get existing data
  const projects = await prisma.project.findMany({ where: { tenantId: TENANT }, orderBy: { id: 'asc' } });
  const suppliers = await prisma.supplier.findMany({ where: { tenantId: TENANT }, orderBy: { id: 'asc' } });
  const users = await prisma.user.findMany({ where: { tenantId: TENANT }, orderBy: { id: 'asc' } });

  if (projects.length === 0) {
    console.log('❌ No projects found. Please run npm run seed:demo first.');
    return;
  }

  console.log(`📊 Found ${projects.length} projects, ${suppliers.length} suppliers, ${users.length} users`);

  // 1. CREATE BUDGET GROUPS
  console.log('📁 Creating budget groups...');
  const budgetGroups = [];
  for (const [idx, project] of projects.entries()) {
    // Check if groups already exist
    let group1 = await prisma.budgetGroup.findFirst({
      where: { tenantId: TENANT, projectId: project.id, name: 'Substructure' }
    });
    if (!group1) {
      group1 = await prisma.budgetGroup.create({
        data: {
          tenantId: TENANT,
          projectId: project.id,
          name: 'Substructure',
          sortOrder: 1,
        },
      });
    }

    let group2 = await prisma.budgetGroup.findFirst({
      where: { tenantId: TENANT, projectId: project.id, name: 'Superstructure' }
    });
    if (!group2) {
      group2 = await prisma.budgetGroup.create({
        data: {
          tenantId: TENANT,
          projectId: project.id,
          name: 'Superstructure',
          sortOrder: 2,
        },
      });
    }

    let group3 = await prisma.budgetGroup.findFirst({
      where: { tenantId: TENANT, projectId: project.id, name: 'Finishes' }
    });
    if (!group3) {
      group3 = await prisma.budgetGroup.create({
        data: {
          tenantId: TENANT,
          projectId: project.id,
          name: 'Finishes',
          sortOrder: 3,
        },
      });
    }

    budgetGroups.push(group1, group2, group3);
  }
  console.log(`✅ Created ${budgetGroups.length} budget groups`);

  // 2. CREATE MORE BUDGET LINES
  console.log('💰 Creating additional budget lines...');
  let budgetLineCount = 0;
  for (const project of projects) {
    const groups = budgetGroups.filter(g => g.projectId === project.id);

    for (const group of groups) {
      const lines = [
        { description: `${group.name} - Groundwork`, qty: 100, unit: 'm2', rate: 50, groupId: group.id },
        { description: `${group.name} - Materials`, qty: 500, unit: 'kg', rate: 15, groupId: group.id },
        { description: `${group.name} - Labour`, qty: 80, unit: 'hrs', rate: 45, groupId: group.id },
      ];

      for (const line of lines) {
        const total = new Prisma.Decimal(line.qty * line.rate);
        await prisma.budgetLine.create({
          data: {
            tenantId: TENANT,
            projectId: project.id,
            budgetGroupId: line.groupId,
            description: line.description,
            qty: new Prisma.Decimal(line.qty),
            unit: line.unit,
            rate: new Prisma.Decimal(line.rate),
            total,
            amount: total,
          },
        }).catch(() => {}); // Skip if exists
        budgetLineCount++;
      }
    }
  }
  console.log(`✅ Created ${budgetLineCount} budget lines`);

  // 3. CREATE PACKAGES
  console.log('📦 Creating packages...');
  const packages = [];
  for (const [idx, project] of projects.entries()) {
    const pkg1 = await prisma.package.create({
      data: {
        projectId: project.id,
        name: 'Groundworks Package',
        scopeSummary: 'All groundworks and foundations',
        trade: 'Groundworks',
        status: 'Tendering',
        budgetEstimate: new Prisma.Decimal(50000 + idx * 10000),
      },
    }).catch(() => null);

    const pkg2 = await prisma.package.create({
      data: {
        projectId: project.id,
        name: 'Structural Package',
        scopeSummary: 'Structural steel and concrete',
        trade: 'Structural',
        status: 'Awarded',
        budgetEstimate: new Prisma.Decimal(120000 + idx * 20000),
        awardValue: new Prisma.Decimal(115000 + idx * 20000),
        awardSupplierId: suppliers[idx % suppliers.length]?.id,
      },
    }).catch(() => null);

    const pkg3 = await prisma.package.create({
      data: {
        projectId: project.id,
        name: 'MEP Package',
        scopeSummary: 'Mechanical, electrical and plumbing',
        trade: 'MEP',
        status: 'Draft',
        budgetEstimate: new Prisma.Decimal(80000 + idx * 15000),
      },
    }).catch(() => null);

    if (pkg1) packages.push(pkg1);
    if (pkg2) packages.push(pkg2);
    if (pkg3) packages.push(pkg3);
  }
  console.log(`✅ Created ${packages.length} packages`);

  // 4. CREATE CONTRACTS
  console.log('📄 Creating contracts...');
  let contractCount = 0;
  for (const pkg of packages.filter(p => p.status === 'Awarded')) {
    const project = projects.find(p => p.id === pkg.projectId);
    if (!project || !pkg.awardSupplierId) continue;

    await prisma.contract.create({
      data: {
        tenantId: TENANT,
        projectId: project.id,
        packageId: pkg.id,
        supplierId: pkg.awardSupplierId,
        title: `${pkg.name} Contract`,
        contractNumber: `CNT-${project.code}-${String(contractCount + 1).padStart(3, '0')}`,
        value: pkg.awardValue || new Prisma.Decimal(100000),
        status: 'Live',
        startDate: new Date('2025-01-15'),
        endDate: new Date('2025-09-30'),
      },
    }).catch(() => {}); // Skip if exists
    contractCount++;
  }
  console.log(`✅ Created ${contractCount} contracts`);

  // 5. CREATE INVOICES
  console.log('🧾 Creating invoices...');
  const contracts = await prisma.contract.findMany({
    where: { project: { tenantId: TENANT } },
    select: {
      id: true,
      projectId: true,
      supplierId: true,
      contractNumber: true,
      title: true,
      value: true,
      supplier: { select: { id: true, name: true } },
      project: { select: { id: true, code: true } },
    },
  });

  let invoiceCount = 0;
  for (const contract of contracts) {
    const supplier = contract.supplier;
    if (!supplier) continue;

    // Create 2-3 invoices per contract
    const numInvoices = 2 + (contract.id % 2);
    for (let i = 0; i < numInvoices; i++) {
      const net = Number(contract.value) * (0.2 + i * 0.15);
      const vat = net * 0.2;
      const gross = net + vat;

      const invoice = await prisma.invoice.create({
        data: {
          tenantId: TENANT,
          projectId: contract.projectId,
          supplierId: supplier.id,
          number: `INV-${contract.contractNumber || contract.project.code}-${String(i + 1).padStart(3, '0')}`,
          issueDate: new Date(2025, 1 + i, 15),
          dueDate: new Date(2025, 2 + i, 15),
          net: new Prisma.Decimal(net),
          vat: new Prisma.Decimal(vat),
          gross: new Prisma.Decimal(gross),
          status: i === 0 ? 'Paid' : 'Open',
          contractId: contract.id,
        },
      }).catch(() => null);

      // Create invoice line separately
      if (invoice) {
        await prisma.invoiceLine.create({
          data: {
            tenantId: TENANT,
            invoiceId: invoice.id,
            lineNo: 1,
            description: `${contract.title} - Progress Payment ${i + 1}`,
            qty: new Prisma.Decimal(1),
            unit: 'lump sum',
            rate: new Prisma.Decimal(net),
            totalExVat: new Prisma.Decimal(net),
            totalVat: new Prisma.Decimal(vat),
            totalIncVat: new Prisma.Decimal(gross),
          },
        }).catch(() => {});
      }
      invoiceCount++;
    }
  }
  console.log(`✅ Created ${invoiceCount} invoices`);

  // 6. CREATE VARIATIONS
  console.log('📝 Creating variations...');
  let variationCount = 0;
  for (const contract of contracts.slice(0, 3)) {
    await prisma.variation.create({
      data: {
        tenantId: TENANT,
        projectId: contract.projectId,
        contractId: contract.id,
        title: 'Additional groundwork required',
        description: 'Client requested additional excavation for utilities',
        status: 'Approved',
        value: new Prisma.Decimal(5000),
        approvedBy: users[0]?.id,
        approvedAt: new Date('2025-02-01'),
      },
    }).catch(() => {});
    variationCount++;
  }
  console.log(`✅ Created ${variationCount} variations`);

  // 7. CREATE TENDERS
  console.log('📋 Creating tenders...');
  let tenderCount = 0;
  for (const pkg of packages.filter(p => p.status === 'Tendering').slice(0, 3)) {
    const tender = await prisma.tender.create({
      data: {
        tenantId: TENANT,
        projectId: pkg.projectId,
        packageId: pkg.id,
        title: `Tender for ${pkg.name}`,
        description: pkg.scopeSummary,
        status: 'open',
        openDate: new Date('2025-01-10'),
        closeDate: new Date('2025-02-15'),
      },
    }).catch(() => null);

    if (tender) {
      // Create bids from suppliers
      for (const supplier of suppliers.slice(0, 3)) {
        await prisma.tenderBid.create({
          data: {
            tenantId: TENANT,
            tenderId: tender.id,
            supplierId: supplier.id,
            price: new Prisma.Decimal(Number(pkg.budgetEstimate || 50000) * (0.85 + Math.random() * 0.3)),
            notes: `Competitive bid from ${supplier.name}`,
          },
        }).catch(() => {});
      }
      tenderCount++;
    }
  }
  console.log(`✅ Created ${tenderCount} tenders with bids`);

  // 8. CREATE COST CODES
  console.log('🏷️  Creating cost codes...');
  const costCodes = [
    { code: '1.1.1', description: 'Site Clearance' },
    { code: '1.1.2', description: 'Excavation' },
    { code: '1.2.1', description: 'Concrete Works' },
    { code: '2.1.1', description: 'Structural Steel' },
    { code: '2.2.1', description: 'Brickwork' },
    { code: '3.1.1', description: 'Floor Finishes' },
    { code: '3.2.1', description: 'Wall Finishes' },
    { code: '4.1.1', description: 'Electrical' },
    { code: '4.2.1', description: 'Plumbing' },
    { code: '5.1.1', description: 'Preliminaries' },
  ];

  for (const cc of costCodes) {
    await prisma.costCode.upsert({
      where: { tenantId_code: { tenantId: TENANT, code: cc.code } },
      update: {},
      create: {
        tenantId: TENANT,
        code: cc.code,
        description: cc.description,
      },
    });
  }
  console.log(`✅ Created ${costCodes.length} cost codes`);

  // 9. UPDATE SOME BUDGET LINES WITH COST CODES
  console.log('🔗 Linking budget lines to cost codes...');
  const allCostCodes = await prisma.costCode.findMany({ where: { tenantId: TENANT } });
  const budgetLines = await prisma.budgetLine.findMany({
    where: { tenantId: TENANT, costCodeId: null },
    take: 10,
  });

  for (const [idx, line] of budgetLines.entries()) {
    await prisma.budgetLine.update({
      where: { id: line.id },
      data: { costCodeId: allCostCodes[idx % allCostCodes.length].id },
    }).catch(() => {});
  }
  console.log(`✅ Linked ${budgetLines.length} budget lines to cost codes`);

  // 10. CREATE DOCUMENTS
  console.log('📎 Creating documents...');
  let docCount = 0;
  for (const project of projects.slice(0, 2)) {
    const docs = [
      { name: 'Project Plan.pdf', type: 'application/pdf', size: 1024000 },
      { name: 'Site Photos.zip', type: 'application/zip', size: 5120000 },
      { name: 'Budget Breakdown.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 256000 },
    ];

    for (const doc of docs) {
      await prisma.document.create({
        data: {
          tenantId: TENANT,
          name: doc.name,
          originalName: doc.name,
          mimeType: doc.type,
          sizeBytes: doc.size,
          storageKey: `projects/${project.id}/${doc.name.toLowerCase().replace(/ /g, '-')}`,
          uploadedBy: users[0]?.id,
          links: {
            create: {
              tenantId: TENANT,
              entityType: 'Project',
              entityId: project.id,
            },
          },
        },
      }).catch(() => {});
      docCount++;
    }
  }
  console.log(`✅ Created ${docCount} documents`);

  // Final summary
  console.log('\n✨ Comprehensive seed complete!');
  const summary = await Promise.all([
    prisma.project.count({ where: { tenantId: TENANT } }),
    prisma.budgetGroup.count({ where: { tenantId: TENANT } }),
    prisma.budgetLine.count({ where: { tenantId: TENANT } }),
    prisma.package.count({ where: { project: { tenantId: TENANT } } }),
    prisma.contract.count({ where: { project: { tenantId: TENANT } } }),
    prisma.invoice.count({ where: { tenantId: TENANT } }),
    prisma.tender.count({ where: { tenantId: TENANT } }),
    prisma.variation.count({ where: { tenantId: TENANT } }),
    prisma.costCode.count({ where: { tenantId: TENANT } }),
    prisma.document.count({ where: { tenantId: TENANT } }),
  ]);

  console.log('\n📊 Final Database Summary:');
  console.log(`   Projects: ${summary[0]}`);
  console.log(`   Budget Groups: ${summary[1]}`);
  console.log(`   Budget Lines: ${summary[2]}`);
  console.log(`   Packages: ${summary[3]}`);
  console.log(`   Contracts: ${summary[4]}`);
  console.log(`   Invoices: ${summary[5]}`);
  console.log(`   Tenders: ${summary[6]}`);
  console.log(`   Variations: ${summary[7]}`);
  console.log(`   Cost Codes: ${summary[8]}`);
  console.log(`   Documents: ${summary[9]}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  });
