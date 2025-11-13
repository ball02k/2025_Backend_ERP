// seed-e2e-comprehensive.cjs
// Comprehensive end-to-end seed: Budget → Tender → Award → Contract

const { PrismaClient, Prisma } = require('@prisma/client');
const config = require('./seed-config.cjs');
const {
  trades,
  costCodes,
  tenderQuestions,
  demoClients,
  demoProjects,
  generateBudgetLines,
  groupLinesIntoPackages
} = require('./seed-data.cjs');
const {
  calculateWeightedScore,
  generateRealisticScore,
  generateAnswer,
  generateUniqueCode
} = require('./seed-utils.cjs');

const prisma = new PrismaClient();

async function main() {
  const tenantId = config.tenantId;
  const uniqueId = Date.now();

  console.log('🌱 Starting comprehensive end-to-end seed...');
  console.log(`   Tenant ID: ${tenantId}`);
  console.log(`   Unique ID: ${uniqueId}\n`);

  // ==========================================
  // PHASE 1: FOUNDATION DATA
  // ==========================================
  console.log('📋 Phase 1: Creating foundation data...');

  // 1.1 Roles
  const roleNames = ['Project Manager', 'Quantity Surveyor', 'Procurement Officer', 'Site Manager'];
  const roles = [];
  for (const name of roleNames) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId, name } },
      update: {},
      create: { tenantId, name }
    });
    roles.push(role);
  }
  console.log('  ✓ Roles created');

  // 1.2 Users
  const usersData = [
    { name: 'Alice Johnson', email: `alice.${uniqueId}@demo.local`, passwordSHA: 'demo123' },
    { name: 'Bob Smith', email: `bob.${uniqueId}@demo.local`, passwordSHA: 'demo123' },
    { name: 'Charlie Brown', email: `charlie.${uniqueId}@demo.local`, passwordSHA: 'demo123' },
    { name: 'Diana Prince', email: `diana.${uniqueId}@demo.local`, passwordSHA: 'demo123' }
  ];

  const users = [];
  for (const userData of usersData) {
    const user = await prisma.user.create({
      data: {
        tenantId,
        name: userData.name,
        email: userData.email,
        passwordSHA: userData.passwordSHA
      }
    });
    users.push(user);
  }
  console.log('  ✓ Users created');

  // 1.3 Clients
  const clients = [];
  for (const clientData of demoClients) {
    const client = await prisma.client.create({
      data: {
        name: `${clientData.name} ${uniqueId}`,
        address1: clientData.address || `${clientData.name} Building`,
        city: 'London',
        postcode: 'SW1A 1AA'
      }
    });
    clients.push(client);
  }
  console.log('  ✓ Clients created');

  // 1.4 Suppliers across different trades
  const suppliers = [];
  const supplierMetadata = []; // Store quality/trade info separately for later use

  for (let i = 0; i < 10; i++) {
    const trade = trades[i % trades.length];
    const quality = i % 3; // 0 = excellent, 1 = good, 2 = acceptable
    const accreditation = quality === 0 ? 'Gold' : quality === 1 ? 'Silver' : 'Bronze';

    // One supplier with expired insurance for testing compliance gates
    const insuranceExpiry = i === 0
      ? new Date('2023-12-31')
      : new Date('2026-12-31');

    const supplier = await prisma.supplier.create({
      data: {
        tenantId,
        name: `${trade.name} Specialists Ltd ${i + 1}`,
        email: `tender+${trade.code.toLowerCase()}${i + 1}@demo.local`,
        phone: `+44 20 ${1000 + i}000 ${2000 + i}`,
        insurancePolicyNumber: `INS-${trade.code}-${1000 + i}`,
        insuranceExpiry,
        hsAccreditations: accreditation,
        performanceScore: new Prisma.Decimal(85 - (quality * 10) + Math.random() * 5),
        complianceStatus: i === 0 ? 'expired_insurance' : 'compliant'
      }
    });

    suppliers.push(supplier);
    supplierMetadata.push({ supplier, trade: trade.code, quality });
  }
  console.log('  ✓ Suppliers created');

  // ==========================================
  // PHASE 2: PROJECTS & BUDGETS
  // ==========================================
  console.log('\n📋 Phase 2: Creating projects and budgets...');

  const allPackages = [];

  for (let projIndex = 0; projIndex < demoProjects.length; projIndex++) {
    const projectData = demoProjects[projIndex];
    const client = clients[projIndex % clients.length];

    // 2.1 Create Project
    const project = await prisma.project.create({
      data: {
        tenantId,
        code: `${projectData.code}-${uniqueId}`,
        name: projectData.name,
        description: projectData.description,
        client: {
          connect: { id: client.id }
        },
        status: projectData.status,
        startPlanned: projectData.startDate,
        endPlanned: projectData.endDate,
        budget: new Prisma.Decimal(projectData.value),
        sitePostcode: projectData.location || 'SW1A 1AA'
      }
    });
    console.log(`  ✓ Project created: ${project.code}`);

    // 2.2 Create Cost Codes for this project
    const projectCostCodes = [];
    for (const cc of costCodes) {
      const costCode = await prisma.costCode.upsert({
        where: { tenantId_code: { tenantId, code: `${cc.code}-${uniqueId}` } },
        update: {},
        create: {
          tenantId,
          code: `${cc.code}-${uniqueId}`,
          description: cc.name
        }
      });
      projectCostCodes.push(costCode);
    }

    // 2.3 Create Budget Group
    const budgetGroup = await prisma.budgetGroup.create({
      data: {
        tenantId,
        projectId: project.id,
        name: `${project.name} - Master Budget`
      }
    });

    // 2.4 Generate and create Budget Lines
    const budgetLinesData = generateBudgetLines(project.name);
    const budgetLines = [];

    for (const lineData of budgetLinesData) {
      const budgetLine = await prisma.budgetLine.create({
        data: {
          tenantId,
          projectId: project.id,
          groupId: budgetGroup.id,
          costCodeId: projectCostCodes[0].id, // Simplified - link to first cost code
          code: lineData.code,
          description: lineData.description,
          qty: new Prisma.Decimal(lineData.qty),
          unit: lineData.unit,
          rate: new Prisma.Decimal(lineData.rate),
          total: new Prisma.Decimal(lineData.total)
        }
      });
      budgetLines.push({ ...budgetLine, group: lineData.group });
    }
    console.log(`  ✓ Budget group created with ${budgetLines.length} lines`);

    // 2.5 Group budget lines into packages
    const packageGroups = groupLinesIntoPackages(budgetLines);

    for (const [tradeKey, lines] of Object.entries(packageGroups)) {
      if (lines.length === 0) continue;

      const trade = trades.find(t => t.code === tradeKey) || { code: tradeKey, name: tradeKey };
      const packageValue = lines.reduce((sum, l) => sum + Number(l.total), 0);

      // Create Package
      const pkg = await prisma.package.create({
        data: {
          projectId: project.id,
          name: `${trade.name} Package`,
          scopeSummary: `${trade.name} works for ${project.name}`,
          pricingMode: 'HYBRID',
          status: 'active',
          budgetEstimate: new Prisma.Decimal(packageValue)
        }
      });

      // Link budget lines to package via PackageItem
      for (const line of lines.slice(0, 20)) {
        // Limit to first 20 lines per package
        await prisma.packageItem.create({
          data: {
            tenantId,
            packageId: pkg.id,
            budgetLineId: line.id
          }
        });
      }

      // Create PackageLineItems (BOQ snapshot)
      for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const line = lines[i];
        await prisma.packageLineItem.create({
          data: {
            packageId: pkg.id,
            budgetLineItemId: line.id,
            itemNumber: `${i + 1}`,
            description: line.description,
            qty: line.qty,
            unit: line.unit,
            rate: line.rate,
            total: line.total,
            displayOrder: i + 1,
            tenantId
          }
        });
      }

      allPackages.push({
        package: pkg,
        project,
        trade,
        lines: lines.slice(0, 20),
        value: packageValue
      });

      console.log(`  ✓ Package created: ${pkg.name} (${lines.length} lines, £${Math.round(packageValue).toLocaleString()})`);
    }
  }

  // ==========================================
  // PHASE 3: TENDERS & SUBMISSIONS
  // ==========================================
  console.log(`\n📋 Phase 3: Creating tenders and submissions...`);

  const tenders = [];

  // Create tenders for ~70% of packages
  for (const pkgData of allPackages) {
    if (Math.random() > 0.7) continue; // Skip some packages

    const { package: pkg, project, trade } = pkgData;

    // Find suppliers for this trade using supplierMetadata
    const tradeMeta = supplierMetadata.filter(sm => sm.trade === trade.code);
    const tradeSuppliers = tradeMeta.map(sm => sm.supplier);

    if (tradeSuppliers.length < 2) continue; // Need at least 2 suppliers

    // Create Tender
    const tender = await prisma.tender.create({
      data: {
        tenantId,
        projectId: project.id,
        packageId: pkg.id,
        title: `${pkg.name} - RFP`,
        description: `Request for Proposal for ${pkg.name}`,
        status: 'open',
        deadlineAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      }
    });

    // Create Tender Section
    const section = await prisma.tenderSection.create({
      data: {
        tenderId: tender.id,
        name: 'Technical & Commercial',
        description: 'Technical qualifications and commercial pricing',
        orderIndex: 1,
        tenantId
      }
    });

    // Create Questions
    const questions = [];
    for (let i = 0; i < tenderQuestions.length; i++) {
      const q = tenderQuestions[i];
      const question = await prisma.tenderQuestion.create({
        data: {
          tenderId: tender.id,
          sectionId: section.id,
          text: q.text,
          type: q.type,
          weight: q.weight,
          isRequired: q.isRequired,
          orderIndex: i + 1,
          tenantId
        }
      });
      questions.push(question);
    }

    // Invite suppliers
    const invitedSuppliers = tradeSuppliers.slice(0, Math.min(4, tradeSuppliers.length));
    for (let i = 0; i < invitedSuppliers.length; i++) {
      await prisma.tenderSupplierInvite.create({
        data: {
          tenderId: tender.id,
          supplierId: invitedSuppliers[i].id,
          inviteToken: `invite-${tender.id}-${invitedSuppliers[i].id}-${uniqueId}-${i}`,
          status: 'responded',
          tenantId
        }
      });
    }

    // Create 2-3 submissions
    const numSubmissions = Math.min(Math.floor(Math.random() * 2) + 2, invitedSuppliers.length);
    const submittingSuppliers = invitedSuppliers.slice(0, numSubmissions);

    // Generate prices and rank
    const basePrice = pkgData.value;
    const prices = submittingSuppliers.map((s, i) => ({
      supplier: s,
      price: basePrice * (0.85 + Math.random() * 0.35), // 85% - 120% of budget
      rank: i + 1
    }));
    prices.sort((a, b) => a.price - b.price); // Sort by price
    prices.forEach((p, i) => (p.rank = i + 1)); // Assign ranks

    const responses = [];
    for (const priceData of prices) {
      const { supplier, price, rank } = priceData;

      // Get quality tier from supplierMetadata
      const supplierMeta = supplierMetadata.find(sm => sm.supplier.id === supplier.id);
      const quality = supplierMeta ? supplierMeta.quality : 1;

      // Create Response
      const response = await prisma.tenderResponse.create({
        data: {
          tenderId: tender.id,
          supplierId: supplier.id,
          priceTotal: new Prisma.Decimal(price),
          answers: {}, // Answers stored as JSON
          tenantId
        }
      });

      // Generate scores
      const scores = generateRealisticScore(rank, supplier.name);
      const totalScore = calculateWeightedScore(
        config.weights,
        scores.price,
        scores.programme,
        scores.technical,
        scores.hs,
        scores.esg
      );

      // Update with scores
      await prisma.tenderResponse.update({
        where: { id: response.id },
        data: {
          manualScore: totalScore,
          autoScore: totalScore
        }
      });

      responses.push({ ...response, rank, scores, totalScore });
    }

    tenders.push({ tender, pkg, project, responses, questions });
    console.log(`  ✓ Tender created: ${tender.title} (${responses.length} submissions)`);
  }

  // ==========================================
  // PHASE 4: AWARDS & CONTRACTS
  // ==========================================
  console.log(`\n📋 Phase 4: Creating awards and contracts...`);

  let awardsCreated = 0;
  let contractsCreated = 0;

  for (const tenderData of tenders) {
    const { tender, pkg, project, responses } = tenderData;

    // Award to highest scoring submission
    const winner = responses.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))[0];
    if (!winner) continue;

    // Create Award
    const award = await prisma.award.create({
      data: {
        projectId: project.id,
        packageId: pkg.id,
        supplierId: winner.supplierId,
        awardValue: winner.priceTotal,
        awardDate: new Date(),
        tenantId
      }
    });
    awardsCreated++;

    // Update tender status
    await prisma.tender.update({
      where: { id: tender.id },
      data: { status: 'awarded' }
    });

    // Create Contract
    const contract = await prisma.contract.create({
      data: {
        projectId: project.id,
        packageId: pkg.id,
        supplierId: winner.supplierId,
        awardId: award.id,
        contractRef: `CNT-${project.code.split('-')[0]}-${String(contractsCreated + 1).padStart(3, '0')}`,
        title: `${pkg.name} - Contract`,
        value: winner.priceTotal,
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days
        tenantId
      }
    });

    // Create Contract Documents
    const docTitles = [
      'Master Agreement',
      'Technical Specifications',
      'Insurance Certificate',
      'Performance Bond',
      'Health & Safety Plan',
      'Quality Assurance Plan'
    ];

    for (const title of docTitles) {
      await prisma.contractDocument.create({
        data: {
          contractId: contract.id,
          title,
          tenantId
        }
      });
    }

    contractsCreated++;
    console.log(`  ✓ Award & Contract created: ${contract.contractRef} (Supplier: ${winner.supplierId})`);
  }

  // Create direct awards for remaining packages
  for (const pkgData of allPackages) {
    // Skip if already has a tender
    if (tenders.some(t => t.pkg.id === pkgData.package.id)) continue;

    const { package: pkg, project, trade } = pkgData;

    // Find suitable supplier for this trade
    // Find suppliers for this trade using supplierMetadata
    const tradeMeta = supplierMetadata.filter(sm => sm.trade === trade.code);
    const tradeSuppliers = tradeMeta.map(sm => sm.supplier);

    if (tradeSuppliers.length === 0) continue;

    const supplier = tradeSuppliers[0];

    // Create Direct Award
    const award = await prisma.award.create({
      data: {
        projectId: project.id,
        packageId: pkg.id,
        supplierId: supplier.id,
        awardValue: new Prisma.Decimal(pkgData.value * 0.95), // 95% of budget
        awardDate: new Date(),
        overrideReason: 'Direct procurement - approved framework supplier',
        tenantId
      }
    });
    awardsCreated++;

    // Create Contract
    const contract = await prisma.contract.create({
      data: {
        projectId: project.id,
        packageId: pkg.id,
        supplierId: supplier.id,
        awardId: award.id,
        contractRef: `CNT-${project.code.split('-')[0]}-${String(contractsCreated + 1).padStart(3, '0')}`,
        title: `${pkg.name} - Contract`,
        value: award.awardValue,
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        tenantId
      }
    });

    // Create Contract Documents
    for (const title of ['Master Agreement', 'Schedule of Rates', 'Insurance']) {
      await prisma.contractDocument.create({
        data: {
          contractId: contract.id,
          title,
          tenantId
        }
      });
    }

    contractsCreated++;
  }

  // ==========================================
  // SUMMARY
  // ==========================================
  console.log('\n' + '='.repeat(70));
  console.log('✅ COMPREHENSIVE SEED COMPLETE');
  console.log('='.repeat(70));

  const counts = await Promise.all([
    prisma.project.count({ where: { tenantId } }),
    prisma.budgetLine.count({ where: { tenantId } }),
    prisma.package.count({ where: { project: { tenantId } } }),
    prisma.packageItem.count({ where: { tenantId } }),
    prisma.tender.count({ where: { tenantId } }),
    prisma.tenderQuestion.count({ where: { tenantId } }),
    prisma.tenderResponse.count({ where: { tenantId } }),
    prisma.award.count({ where: { tenantId } }),
    prisma.contract.count({ where: { tenantId } }),
    prisma.contractDocument.count({ where: { tenantId } })
  ]);

  console.log('\n📊 Data Summary:');
  console.log(`   • Projects: ${counts[0]}`);
  console.log(`   • Budget Lines: ${counts[1]}`);
  console.log(`   • Packages: ${counts[2]}`);
  console.log(`   • Package-Budget Links: ${counts[3]}`);
  console.log(`   • Tenders: ${counts[4]}`);
  console.log(`   • Tender Questions: ${counts[5]}`);
  console.log(`   • Tender Submissions: ${counts[6]}`);
  console.log(`   • Awards: ${counts[7]}`);
  console.log(`   • Contracts: ${counts[8]}`);
  console.log(`   • Contract Documents: ${counts[9]}`);

  console.log('\n🔗 Complete Traceability:');
  console.log('   ✓ Budget Lines → PackageItem → Package');
  console.log('   ✓ Package → Tender → Submissions (scored)');
  console.log('   ✓ Tender → Award (best score)');
  console.log('   ✓ Award → Contract → Documents');
  console.log('   ✓ Direct Awards → Contracts (non-tender route)');

  console.log('\n' + '='.repeat(70));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed error:', e.message);
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
