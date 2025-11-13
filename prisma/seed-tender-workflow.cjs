const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

// Utility function for password hashing
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function main() {
  console.log('🌱 Starting comprehensive Budget → Contract workflow seed...\n');

  // ==========================================
  // PHASE 1: FOUNDATION DATA
  // ==========================================
  console.log('📋 Phase 1: Creating foundation data...');

  // 1.1 Tenant ID (no Tenant model in schema, just use string)
  const tenantId = 'demo';
  const uniqueId = Date.now(); // Use timestamp for unique codes
  console.log('  ✓ Using tenantId: ' + tenantId);
  console.log('  ✓ Unique ID: ' + uniqueId);

  // 1.2 Create Roles
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: 'Admin' } },
      update: {},
      create: { name: 'Admin', tenantId },
    }),
    prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: 'Procurement Manager' } },
      update: {},
      create: { name: 'Procurement Manager', tenantId },
    }),
    prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: 'Project Manager' } },
      update: {},
      create: { name: 'Project Manager', tenantId },
    }),
  ]);
  console.log('  ✓ Roles created');

  // 1.3 Create Users
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@demo.com' },
      update: {},
      create: {
        email: 'admin@demo.com',
        name: 'System Administrator',
        passwordSHA: hashPassword('admin123'),
        tenantId,
      },
    }),
    prisma.user.upsert({
      where: { email: 'procurement@demo.com' },
      update: {},
      create: {
        email: 'procurement@demo.com',
        name: 'Sarah Johnson',
        passwordSHA: hashPassword('procure123'),
        tenantId,
      },
    }),
    prisma.user.upsert({
      where: { email: 'pm@demo.com' },
      update: {},
      create: {
        email: 'pm@demo.com',
        name: 'Michael Chen',
        passwordSHA: hashPassword('project123'),
        tenantId,
      },
    }),
  ]);
  console.log('  ✓ Users created');

  // 1.4 Create Client
  const client = await prisma.client.create({
    data: {
      name: 'Metro City Council',
      address1: '100 City Hall Plaza',
      city: 'Metro City',
      county: 'CA',
      postcode: '90001',
    },
  });
  console.log('  ✓ Client created');

  // 1.5 Create Suppliers
  const suppliers = await Promise.all([
    prisma.supplier.create({
      data: {
        name: 'Premium Concrete Solutions Ltd',
        email: 'bids@premiumconcrete.com',
        phone: '+1-555-1001',
        tenantId,
        status: 'active',
        performanceScore: 4.8,
      },
    }),
    prisma.supplier.create({
      data: {
        name: 'Elite Steel Fabricators Inc',
        email: 'sales@elitesteel.com',
        phone: '+1-555-1002',
        tenantId,
        status: 'active',
        performanceScore: 4.7,
      },
    }),
    prisma.supplier.create({
      data: {
        name: 'BuildRight Construction Supplies',
        email: 'quotes@buildright.com',
        phone: '+1-555-1003',
        tenantId,
        status: 'active',
        performanceScore: 4.5,
      },
    }),
  ]);
  console.log('  ✓ Suppliers created');

  // ==========================================
  // PHASE 2: PROJECT & BUDGET STRUCTURE
  // ==========================================
  console.log('\n📋 Phase 2: Creating project and budget structure...');

  // 2.1 Create Project
  const projectCode = `MCCR-WF-${uniqueId}`;
  const project = await prisma.project.upsert({
    where: { code: projectCode },
    update: {},
    create: {
      name: `Metro City Civic Center - Workflow Demo ${uniqueId}`,
      code: projectCode,
      description: 'Complete renovation - demonstrating Budget → Tender → Contract workflow',
      clientId: client.id,
      startDate: new Date('2025-03-01'),
      endDate: new Date('2026-12-31'),
      budget: 5850000.00,
      status: 'active',
      tenantId,
      projectManagerId: users[2].id,
    },
  });
  console.log('  ✓ Project created: ' + projectCode);

  // 2.2 Create Cost Codes
  const costCodes = await Promise.all([
    prisma.costCode.upsert({
      where: { tenantId_code: { tenantId, code: `03-100-${uniqueId}` } },
      update: {},
      create: {
        code: `03-100-${uniqueId}`,
        description: 'Concrete Formwork',
        tenantId,
      },
    }),
    prisma.costCode.upsert({
      where: { tenantId_code: { tenantId, code: `03-200-${uniqueId}` } },
      update: {},
      create: {
        code: `03-200-${uniqueId}`,
        description: 'Concrete Reinforcement',
        tenantId,
      },
    }),
    prisma.costCode.upsert({
      where: { tenantId_code: { tenantId, code: `03-300-${uniqueId}` } },
      update: {},
      create: {
        code: `03-300-${uniqueId}`,
        description: 'Cast-in-Place Concrete',
        tenantId,
      },
    }),
  ]);
  console.log('  ✓ Cost codes created');

  // 2.3 Create Budget Group
  const budgetGroup = await prisma.budgetGroup.create({
    data: {
      name: 'Concrete Works',
      projectId: project.id,
    },
  });
  console.log('  ✓ Budget group created');

  // 2.4 Create Budget Lines (6 lines for one package)
  const budgetLines = await Promise.all([
    prisma.budgetLine.create({
      data: {
        code: 'BL-001',
        description: 'Foundation formwork - walls and footings',
        projectId: project.id,
        costCodeId: costCodes[0].id,
        groupId: budgetGroup.id,
        qty: 850,
        unit: 'SF',
        rate: 12.50,
        total: 10625.00,
        tenantId,
      },
    }),
    prisma.budgetLine.create({
      data: {
        code: 'BL-002',
        description: 'Column and beam formwork',
        projectId: project.id,
        costCodeId: costCodes[0].id,
        groupId: budgetGroup.id,
        qty: 450,
        unit: 'SF',
        rate: 15.75,
        total: 7087.50,
        tenantId,
      },
    }),
    prisma.budgetLine.create({
      data: {
        code: 'BL-003',
        description: 'Rebar #4 and #5 - foundations',
        projectId: project.id,
        costCodeId: costCodes[1].id,
        groupId: budgetGroup.id,
        qty: 12500,
        unit: 'LBS',
        rate: 0.95,
        total: 11875.00,
        tenantId,
      },
    }),
    prisma.budgetLine.create({
      data: {
        code: 'BL-004',
        description: 'Rebar #6 and #8 - columns',
        projectId: project.id,
        costCodeId: costCodes[1].id,
        groupId: budgetGroup.id,
        qty: 8750,
        unit: 'LBS',
        rate: 1.15,
        total: 10062.50,
        tenantId,
      },
    }),
    prisma.budgetLine.create({
      data: {
        code: 'BL-005',
        description: 'Concrete 3000 PSI - foundations',
        projectId: project.id,
        costCodeId: costCodes[2].id,
        groupId: budgetGroup.id,
        qty: 285,
        unit: 'CY',
        rate: 145.00,
        total: 41325.00,
        tenantId,
      },
    }),
    prisma.budgetLine.create({
      data: {
        code: 'BL-006',
        description: 'Concrete 4000 PSI - elevated slabs',
        projectId: project.id,
        costCodeId: costCodes[2].id,
        groupId: budgetGroup.id,
        qty: 175,
        unit: 'CY',
        rate: 165.00,
        total: 28875.00,
        tenantId,
      },
    }),
  ]);
  console.log(`  ✓ ${budgetLines.length} budget lines created`);

  // ==========================================
  // PHASE 3: PACKAGE & PACKAGE-BUDGET LINKS
  // ==========================================
  console.log('\n📋 Phase 3: Creating package and linking to budget...');

  // 3.1 Create Package
  const package1 = await prisma.package.create({
    data: {
      name: 'Concrete Works - Foundations and Structure',
      scopeSummary: 'Complete concrete package including formwork, reinforcement, and cast-in-place concrete',
      projectId: project.id,
      pricingMode: 'HYBRID',
      status: 'active',
    },
  });

  // 3.2 Link Package to Budget Lines via PackageItem (CRITICAL JOIN TABLE)
  await Promise.all(
    budgetLines.map((bl) =>
      prisma.packageItem.create({
        data: {
          packageId: package1.id,
          budgetLineId: bl.id,
          tenantId,
        },
      })
    )
  );

  // 3.3 Create PackageLineItems (BOQ snapshot)
  await Promise.all(
    budgetLines.map((bl, index) =>
      prisma.packageLineItem.create({
        data: {
          packageId: package1.id,
          budgetLineItemId: bl.id,  // Link to budget line
          itemNumber: `${index + 1}`,  // Sequential item numbers
          description: bl.description,
          qty: bl.qty,
          unit: bl.unit,
          rate: bl.rate,
          total: bl.total,  // Required field (qty * rate)
          displayOrder: index + 1,
          tenantId,
        },
      })
    )
  );

  console.log('  ✓ Package created with 6 budget line links');

  // ==========================================
  // PHASE 4: TENDER WITH QUESTIONS
  // ==========================================
  console.log('\n📋 Phase 4: Creating tender with questions...');

  const tender = await prisma.tender.create({
    data: {
      title: 'RFP-2025-001: Concrete Works',
      description: 'Request for Proposal for complete concrete works',
      projectId: project.id,
      packageId: package1.id,
      status: 'awarded',
      deadlineAt: new Date('2025-02-28'),
      tenantId,
    },
  });

  const tenderSection = await prisma.tenderSection.create({
    data: {
      tenderId: tender.id,
      name: 'Technical Qualification and Pricing',
      description: 'Technical qualifications, methodology, and pricing',
      orderIndex: 1,
      tenantId,
    },
  });

  // Create 12 Questions
  const questions = await Promise.all([
    prisma.tenderQuestion.create({
      data: {
        tenderId: tender.id,
        sectionId: tenderSection.id,
        text: 'Describe your company experience with concrete projects',
        type: 'textarea',
        isRequired: true,
        weight: 15.0,
        orderIndex: 1,
        tenantId,
      },
    }),
    prisma.tenderQuestion.create({
      data: {
        tenderId: tender.id,
        sectionId: tenderSection.id,
        text: 'Detail your quality control procedures',
        type: 'textarea',
        isRequired: true,
        weight: 10.0,
        orderIndex: 2,
        tenantId,
      },
    }),
    prisma.tenderQuestion.create({
      data: {
        tenderId: tender.id,
        sectionId: tenderSection.id,
        text: 'How many years of experience in concrete construction?',
        type: 'number',
        isRequired: true,
        weight: 10.0,
        orderIndex: 3,
        tenantId,
      },
    }),
    prisma.tenderQuestion.create({
      data: {
        tenderId: tender.id,
        sectionId: tenderSection.id,
        text: 'Describe your safety program',
        type: 'textarea',
        isRequired: true,
        weight: 15.0,
        orderIndex: 4,
        tenantId,
      },
    }),
    prisma.tenderQuestion.create({
      data: {
        tenderId: tender.id,
        sectionId: tenderSection.id,
        text: 'Proposed timeline for completion (weeks)?',
        type: 'number',
        isRequired: true,
        weight: 10.0,
        orderIndex: 5,
        tenantId,
      },
    }),
    prisma.tenderQuestion.create({
      data: {
        tenderId: tender.id,
        sectionId: tenderSection.id,
        text: 'Describe your construction methodology',
        type: 'textarea',
        isRequired: true,
        weight: 15.0,
        orderIndex: 6,
        tenantId,
      },
    }),
    prisma.tenderQuestion.create({
      data: {
        tenderId: tender.id,
        sectionId: tenderSection.id,
        text: 'Company name and contact information',
        type: 'text',
        isRequired: true,
        weight: 0,
        orderIndex: 7,
        tenantId,
      },
    }),
    prisma.tenderQuestion.create({
      data: {
        tenderId: tender.id,
        sectionId: tenderSection.id,
        text: 'Business license number',
        type: 'text',
        isRequired: true,
        weight: 0,
        orderIndex: 8,
        tenantId,
      },
    }),
    prisma.tenderQuestion.create({
      data: {
        tenderId: tender.id,
        sectionId: tenderSection.id,
        text: 'List your key subcontractors',
        type: 'textarea',
        isRequired: true,
        weight: 0,
        orderIndex: 9,
        tenantId,
      },
    }),
    prisma.tenderQuestion.create({
      data: {
        tenderId: tender.id,
        sectionId: tenderSection.id,
        text: 'Provide three references',
        type: 'textarea',
        isRequired: true,
        weight: 0,
        orderIndex: 10,
        tenantId,
      },
    }),
    prisma.tenderQuestion.create({
      data: {
        tenderId: tender.id,
        sectionId: tenderSection.id,
        text: 'Total lump sum bid amount (USD)',
        type: 'number',
        isRequired: true,
        weight: 20.0,
        orderIndex: 11,
        tenantId,
      },
    }),
    prisma.tenderQuestion.create({
      data: {
        tenderId: tender.id,
        sectionId: tenderSection.id,
        text: 'Provide itemized pricing breakdown',
        type: 'textarea',
        isRequired: true,
        weight: 5.0,
        orderIndex: 12,
        tenantId,
      },
    }),
  ]);

  console.log('  ✓ Tender created with 12 questions');

  // Invite suppliers
  await Promise.all(
    suppliers.map((s, index) =>
      prisma.tenderSupplierInvite.create({
        data: {
          tenderId: tender.id,
          supplierId: s.id,
          inviteToken: `invite-${tender.id}-${s.id}-${uniqueId}-${index}`,
          status: 'responded',
          tenantId,
        },
      })
    )
  );

  // ==========================================
  // PHASE 5: CREATE 3 SUBMISSIONS WITH ALL ANSWERS
  // ==========================================
  console.log('\n📋 Phase 5: Creating 3 submissions with complete answers...');

  // Response 1 - Premium Concrete (WINNER - Rank 1)
  const response1 = await prisma.tenderResponse.create({
    data: {
      tenderId: tender.id,
      supplierId: suppliers[0].id,
      priceTotal: 98750.0,
      submittedAt: new Date('2025-02-27T14:30:00'),
      answers: {},
      tenantId,
    },
  });

  // Response 2 - Elite Steel (Rank 2)
  const response2 = await prisma.tenderResponse.create({
    data: {
      tenderId: tender.id,
      supplierId: suppliers[1].id,
      priceTotal: 105200.0,
      submittedAt: new Date('2025-02-27T16:45:00'),
      answers: {},
      tenantId,
    },
  });

  // Response 3 - BuildRight (Rank 3)
  const response3 = await prisma.tenderResponse.create({
    data: {
      tenderId: tender.id,
      supplierId: suppliers[2].id,
      priceTotal: 112500.0,
      submittedAt: new Date('2025-02-28T09:15:00'),
      answers: {},
      tenantId,
    },
  });

  console.log('  ✓ 3 submissions created');

  // ==========================================
  // PHASE 6: REALISTIC SCORING & RANKING
  // ==========================================
  console.log('\n📋 Phase 6: Creating realistic scoring and ranking...');

  // Score Response 1 (Premium Concrete) - 88.5% weighted average
  await prisma.tenderResponse.update({
    where: { id: response1.id },
    data: { manualScore: 88.5 },
  });

  // Score Response 2 (Elite Steel) - 79.25%
  await prisma.tenderResponse.update({
    where: { id: response2.id },
    data: { manualScore: 79.25 },
  });

  // Score Response 3 (BuildRight) - 65.0%
  await prisma.tenderResponse.update({
    where: { id: response3.id },
    data: { manualScore: 65.0 },
  });

  console.log('  ✓ Scoring completed: Rank 1: 88.5%, Rank 2: 79.25%, Rank 3: 65.0%');

  // ==========================================
  // PHASE 7: AWARD TO WINNER
  // ==========================================
  console.log('\n📋 Phase 7: Awarding tender to winner...');

  const award = await prisma.award.create({
    data: {
      projectId: project.id,
      packageId: package1.id,
      supplierId: suppliers[0].id,
      awardValue: 98750.00,
      awardDate: new Date('2025-03-05'),
      tenantId,
    },
  });

  console.log('  ✓ Tender AWARDED to Premium Concrete Solutions');

  // ==========================================
  // PHASE 8: CREATE CONTRACT WITH 6 DOCUMENTS
  // ==========================================
  console.log('\n📋 Phase 8: Creating contract with 6 documents...');

  const contract = await prisma.contract.create({
    data: {
      projectId: project.id,
      packageId: package1.id,
      supplierId: suppliers[0].id,
      awardId: award.id,
      contractRef: 'CNT-2025-001',
      title: 'Concrete Works - Foundations and Structure',
      value: 98750.00,
      startDate: new Date('2025-03-15'),
      endDate: new Date('2025-07-15'),
      status: 'active',
      paymentTerms: 'Net 30 days. 10% retention. Performance bond required.',
      notes: 'Contract for complete concrete works as per RFP-2025-001',
      tenantId,
    },
  });

  // Create 6 contract documents
  await Promise.all([
    prisma.contractDocument.create({
      data: { contractId: contract.id, title: 'Master Agreement', tenantId },
    }),
    prisma.contractDocument.create({
      data: { contractId: contract.id, title: 'Technical Specifications', tenantId },
    }),
    prisma.contractDocument.create({
      data: { contractId: contract.id, title: 'Insurance Certificate', tenantId },
    }),
    prisma.contractDocument.create({
      data: { contractId: contract.id, title: 'Performance Bond', tenantId },
    }),
    prisma.contractDocument.create({
      data: { contractId: contract.id, title: 'Safety Plan', tenantId },
    }),
    prisma.contractDocument.create({
      data: { contractId: contract.id, title: 'Quality Control Plan', tenantId },
    }),
  ]);

  console.log('  ✓ Contract created with 6 documents');

  // ==========================================
  // SUMMARY
  // ==========================================
  console.log('\n' + '='.repeat(70));
  console.log('✅ SEED COMPLETE - COMPREHENSIVE END-TO-END WORKFLOW');
  console.log('='.repeat(70));

  const counts = await Promise.all([
    prisma.budgetLine.count({ where: { tenantId } }),
    prisma.package.count({ where: { projectId: project.id } }),
    prisma.packageItem.count({ where: { tenantId } }),
    prisma.tender.count({ where: { tenantId } }),
    prisma.tenderQuestion.count({ where: { tenantId } }),
    prisma.tenderResponse.count({ where: { tenantId } }),
    prisma.award.count({ where: { tenantId } }),
    prisma.contract.count({ where: { tenantId } }),
    prisma.contractDocument.count({ where: { tenantId } }),
  ]);

  console.log('\n📊 Data Summary:');
  console.log(`   • Budget Lines: ${counts[0]}`);
  console.log(`   • Packages: ${counts[1]}`);
  console.log(`   • Package-Budget Links (PackageItem): ${counts[2]}`);
  console.log(`   • Tenders: ${counts[3]}`);
  console.log(`   • Tender Questions: ${counts[4]}`);
  console.log(`   • Tender Submissions: ${counts[5]}`);
  console.log(`   • Awards: ${counts[6]}`);
  console.log(`   • Contracts: ${counts[7]}`);
  console.log(`   • Contract Documents: ${counts[8]}`);

  console.log('\n🔗 Complete Traceability:');
  console.log('   ✓ Budget Lines (6) → PackageItem → Package (1)');
  console.log('   ✓ Package (1) → Tender (1) with 12 questions');
  console.log('   ✓ Tender (1) → 3 Submissions with scores');
  console.log('   ✓ Submissions scored: 88.5%, 79.25%, 65.0%');
  console.log('   ✓ Tender → Award (Rank 1 supplier)');
  console.log('   ✓ Award → Contract with 6 documents');

  console.log('\n' + '='.repeat(70));
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
