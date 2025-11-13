const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding tender system data...');

  const tenantId = 'tenant-demo-001';

  // Create Users
  console.log('Creating users...');
  const buyerUser = await prisma.user.upsert({
    where: { email: 'buyer@construction.com' },
    update: {},
    create: {
      email: 'buyer@construction.com',
      name: 'John Smith',
      tenantId,
      role: 'admin',
      passwordHash: '$2a$10$K7L1OJ45/4Y2nIvhRVpCe.FSmhDdWoXehVzJptJ/op0lSsvqNu/1u', // password: demo123
    },
  });

  const evaluatorUser = await prisma.user.upsert({
    where: { email: 'evaluator@construction.com' },
    update: {},
    create: {
      email: 'evaluator@construction.com',
      name: 'Sarah Johnson',
      tenantId,
      role: 'manager',
      passwordHash: '$2a$10$K7L1OJ45/4Y2nIvhRVpCe.FSmhDdWoXehVzJptJ/op0lSsvqNu/1u',
    },
  });

  // Create Project
  console.log('Creating project...');
  const project = await prisma.project.upsert({
    where: {
      name_tenantId: {
        name: 'New Hospital Wing Construction',
        tenantId
      }
    },
    update: {},
    create: {
      tenantId,
      name: 'New Hospital Wing Construction',
      code: 'HOS-2025-001',
      description: 'Construction of a new 5-storey hospital wing including operating theatres, patient wards, and medical facilities',
      location: 'Manchester, UK',
      status: 'Planning',
      budget: 12500000,
      startDate: new Date('2025-06-01'),
      endDate: new Date('2027-03-31'),
      client: 'NHS Manchester Trust',
      projectManager: buyerUser.name,
    },
  });

  // Create Suppliers
  console.log('Creating suppliers...');
  const suppliers = await Promise.all([
    prisma.supplier.upsert({
      where: { name_tenantId: { name: 'BuildTech Construction Ltd', tenantId } },
      update: {},
      create: {
        tenantId,
        name: 'BuildTech Construction Ltd',
        email: 'tender@buildtech.com',
        phone: '+44 20 1234 5678',
        address: '123 Construction Way, London, EC1A 1BB',
        contactPerson: 'Mike Anderson',
        status: 'Active',
        rating: 4.5,
        trades: ['General Building', 'Groundworks', 'Concrete'],
      },
    }),
    prisma.supplier.upsert({
      where: { name_tenantId: { name: 'Elite Groundworks plc', tenantId } },
      update: {},
      create: {
        tenantId,
        name: 'Elite Groundworks plc',
        email: 'bids@eliteground.com',
        phone: '+44 161 555 0100',
        address: '45 Industrial Estate, Manchester, M1 2AB',
        contactPerson: 'David Chen',
        status: 'Active',
        rating: 4.2,
        trades: ['Groundworks', 'Piling', 'Drainage'],
      },
    }),
    prisma.supplier.upsert({
      where: { name_tenantId: { name: 'Premier Build Services', tenantId } },
      update: {},
      create: {
        tenantId,
        name: 'Premier Build Services',
        email: 'enquiries@premierbuild.com',
        phone: '+44 161 555 0200',
        address: '78 Business Park, Manchester, M2 3CD',
        contactPerson: 'Lisa Thompson',
        status: 'Active',
        rating: 4.7,
        trades: ['General Building', 'Fit Out', 'Refurbishment'],
      },
    }),
  ]);

  // Create Packages with different pricing modes
  console.log('Creating packages...');

  // Package 1: Lump Sum
  const lumpSumPackage = await prisma.package.create({
    data: {
      tenantId,
      projectId: project.id,
      name: 'Site Preliminaries & Setup',
      code: 'PKG-001',
      trade: 'General Building',
      scopeSummary: 'Site setup including site office, welfare facilities, security fencing, temporary services, and site management for project duration',
      status: 'Draft',
      pricingMode: 'LUMP_SUM',
      breakdownMandatory: false,
      estimatedValue: 250000,
      budgetValue: 275000,
      createdBy: buyerUser.id,
    },
  });

  // Package 2: Measured (BOQ)
  const measuredPackage = await prisma.package.create({
    data: {
      tenantId,
      projectId: project.id,
      name: 'Groundworks & Foundations',
      code: 'PKG-002',
      trade: 'Groundworks',
      scopeSummary: 'Excavation, piling, drainage, and concrete foundations for new hospital wing',
      status: 'Draft',
      pricingMode: 'MEASURED',
      breakdownMandatory: true,
      estimatedValue: 850000,
      budgetValue: 925000,
      createdBy: buyerUser.id,
      lineItems: {
        create: [
          {
            tenantId,
            itemNumber: '1.1',
            section: 'Site Clearance',
            description: 'Clear site vegetation and topsoil',
            specification: 'Remove vegetation, strip topsoil to 300mm depth, cart away to approved disposal site',
            quantity: 2500,
            unit: 'm²',
            qty: 2500,
            estimatedRate: 12.50,
            estimatedTotal: 31250,
            rate: 12.50,
            total: 31250,
            displayOrder: 1,
            isMandatory: true,
            createdBy: buyerUser.id,
          },
          {
            tenantId,
            itemNumber: '1.2',
            section: 'Site Clearance',
            description: 'Demolish existing structures',
            specification: 'Demolish existing single-storey annexe, break up foundations, cart away',
            quantity: 150,
            unit: 'm³',
            qty: 150,
            estimatedRate: 85.00,
            estimatedTotal: 12750,
            rate: 85.00,
            total: 12750,
            displayOrder: 2,
            isMandatory: true,
            createdBy: buyerUser.id,
          },
          {
            tenantId,
            itemNumber: '2.1',
            section: 'Excavation',
            description: 'Bulk excavation for basement',
            specification: 'Excavate to formation level, average 4.5m depth, cart away surplus',
            quantity: 3200,
            unit: 'm³',
            qty: 3200,
            estimatedRate: 28.00,
            estimatedTotal: 89600,
            rate: 28.00,
            total: 89600,
            displayOrder: 3,
            isMandatory: true,
            createdBy: buyerUser.id,
          },
          {
            tenantId,
            itemNumber: '2.2',
            section: 'Excavation',
            description: 'Trim and prepare formation',
            specification: 'Hand trim to formation, prepare and compact',
            quantity: 800,
            unit: 'm²',
            qty: 800,
            estimatedRate: 8.50,
            estimatedTotal: 6800,
            rate: 8.50,
            total: 6800,
            displayOrder: 4,
            isMandatory: true,
            createdBy: buyerUser.id,
          },
          {
            tenantId,
            itemNumber: '3.1',
            section: 'Piling',
            description: 'Bored piles 600mm diameter',
            specification: 'CFA piles, 600mm diameter, average 12m depth, C35/45 concrete',
            quantity: 120,
            unit: 'nr',
            qty: 120,
            estimatedRate: 2850.00,
            estimatedTotal: 342000,
            rate: 2850.00,
            total: 342000,
            displayOrder: 5,
            isMandatory: true,
            createdBy: buyerUser.id,
          },
          {
            tenantId,
            itemNumber: '4.1',
            section: 'Drainage',
            description: 'Foul drainage pipework 150mm',
            specification: 'uPVC drainage pipes, 150mm diameter, flexible joints, laid in trench',
            quantity: 285,
            unit: 'm',
            qty: 285,
            estimatedRate: 95.00,
            estimatedTotal: 27075,
            rate: 95.00,
            total: 27075,
            displayOrder: 6,
            isMandatory: true,
            createdBy: buyerUser.id,
          },
          {
            tenantId,
            itemNumber: '4.2',
            section: 'Drainage',
            description: 'Surface water drainage 225mm',
            specification: 'Concrete drainage pipes, 225mm diameter, flexible joints',
            quantity: 320,
            unit: 'm',
            qty: 320,
            estimatedRate: 110.00,
            estimatedTotal: 35200,
            rate: 110.00,
            total: 35200,
            displayOrder: 7,
            isMandatory: true,
            createdBy: buyerUser.id,
          },
          {
            tenantId,
            itemNumber: '4.3',
            section: 'Drainage',
            description: 'Manholes 1200mm diameter',
            specification: 'Precast concrete manholes, 1200mm internal diameter, average 3m deep',
            quantity: 8,
            unit: 'nr',
            qty: 8,
            estimatedRate: 3200.00,
            estimatedTotal: 25600,
            rate: 3200.00,
            total: 25600,
            displayOrder: 8,
            isMandatory: true,
            createdBy: buyerUser.id,
          },
          {
            tenantId,
            itemNumber: '5.1',
            section: 'Concrete Foundations',
            description: 'Mass concrete foundations',
            specification: 'C25/30 mass concrete, poured in trenches, vibrated',
            quantity: 420,
            unit: 'm³',
            qty: 420,
            estimatedRate: 185.00,
            estimatedTotal: 77700,
            rate: 185.00,
            total: 77700,
            displayOrder: 9,
            isMandatory: true,
            createdBy: buyerUser.id,
          },
          {
            tenantId,
            itemNumber: '5.2',
            section: 'Concrete Foundations',
            description: 'Reinforced ground beams',
            specification: 'RC ground beams, C35/45 concrete, reinforced as per drawings',
            quantity: 95,
            unit: 'm³',
            qty: 95,
            estimatedRate: 420.00,
            estimatedTotal: 39900,
            rate: 420.00,
            total: 39900,
            displayOrder: 10,
            isMandatory: true,
            createdBy: buyerUser.id,
          },
        ],
      },
    },
  });

  // Package 3: Hybrid
  const hybridPackage = await prisma.package.create({
    data: {
      tenantId,
      projectId: project.id,
      name: 'Structural Frame & Envelope',
      code: 'PKG-003',
      trade: 'General Building',
      scopeSummary: 'Structural steel frame, concrete floors, external cladding and envelope',
      status: 'Draft',
      pricingMode: 'HYBRID',
      breakdownMandatory: false,
      estimatedValue: 2100000,
      budgetValue: 2250000,
      createdBy: buyerUser.id,
      lineItems: {
        create: [
          {
            tenantId,
            itemNumber: '1.1',
            section: 'Structural Steel',
            description: 'Structural steelwork frame',
            specification: 'Fabricated and erected structural steel frame, Grade S355',
            quantity: 850,
            unit: 't',
            qty: 850,
            estimatedRate: 1450.00,
            estimatedTotal: 1232500,
            rate: 1450.00,
            total: 1232500,
            displayOrder: 1,
            isMandatory: true,
            createdBy: buyerUser.id,
          },
          {
            tenantId,
            itemNumber: '2.1',
            section: 'Concrete Floors',
            description: 'RC floor slabs 200mm',
            specification: 'Reinforced concrete floor slabs, 200mm thick, C35/45',
            quantity: 3500,
            unit: 'm²',
            qty: 3500,
            estimatedRate: 125.00,
            estimatedTotal: 437500,
            rate: 125.00,
            total: 437500,
            displayOrder: 2,
            isMandatory: true,
            createdBy: buyerUser.id,
          },
          {
            tenantId,
            itemNumber: '3.1',
            section: 'External Cladding',
            description: 'Curtain walling system',
            specification: 'Aluminum curtain walling, double glazed units, thermally broken',
            quantity: 1200,
            unit: 'm²',
            qty: 1200,
            estimatedRate: 485.00,
            estimatedTotal: 582000,
            rate: 485.00,
            total: 582000,
            displayOrder: 3,
            isMandatory: true,
            createdBy: buyerUser.id,
          },
        ],
      },
    },
  });

  // Create Tender/Request
  console.log('Creating tender...');
  const tender = await prisma.request.create({
    data: {
      tenantId,
      projectId: project.id,
      packageId: measuredPackage.id,
      title: 'Groundworks & Foundations - Hospital Wing',
      type: 'Tender',
      status: 'Open',
      issueDate: new Date(),
      submissionDeadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21 days from now
      clarificationDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
      returnDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      expectedValue: 850000,
      createdBy: buyerUser.name,
    },
  });

  // Create Tender Invitations
  console.log('Creating tender invitations...');
  const invitations = await Promise.all(
    suppliers.map((supplier, idx) =>
      prisma.tenderInvitation.create({
        data: {
          tenantId,
          requestId: tender.id,
          supplierId: supplier.id,
          invitedBy: buyerUser.id,
          invitedAt: new Date(),
          status: idx === 0 ? 'accepted' : idx === 1 ? 'accepted' : 'pending',
          respondedAt: idx < 2 ? new Date() : null,
        },
      })
    )
  );

  // Create Tender Responses with Package Responses
  console.log('Creating tender responses and package pricing...');

  // Response 1: BuildTech - Itemized pricing
  const response1 = await prisma.tenderResponse.create({
    data: {
      tenantId,
      requestId: tender.id,
      supplierId: suppliers[0].id,
      status: 'submitted',
      totalBidValue: 785250.00,
      submittedAt: new Date(),
    },
  });

  const packageResponse1 = await prisma.packageResponse.create({
    data: {
      tenantId,
      packageId: measuredPackage.id,
      tenderResponseId: response1.id,
      supplierId: suppliers[0].id,
      pricingType: 'ITEMIZED_ONLY',
      packageTotal: 675000.00,

      // Commercial terms
      preliminaries: 54000.00, // 8%
      prelimsPercentage: 8.0,
      contingency: 33750.00, // 5%
      contingencyPercentage: 5.0,
      overheadsProfit: 67500.00, // 10%
      overheadsProfitPerc: 10.0,

      // Programme
      programmeDuration: 18,
      startDate: new Date('2025-07-01'),
      completionDate: new Date('2026-01-15'),
      keyMilestones: JSON.stringify([
        { name: 'Site mobilization', week: 1 },
        { name: 'Piling complete', week: 8 },
        { name: 'Drainage complete', week: 12 },
        { name: 'Foundations complete', week: 16 },
        { name: 'Practical completion', week: 18 },
      ]),

      // Other terms
      paymentTerms: '30 days from valuation',
      retentionPercentage: 5.0,
      defectsLiability: 12,
      warranties: 'Professional indemnity insurance £5m, Public liability £10m',

      // Assumptions and exclusions
      assumptions: JSON.stringify([
        'Ground conditions as per site investigation report',
        'Site access available 7am-6pm Monday to Saturday',
        'No unexploded ordnance',
        'Utility diversions completed before commencement',
      ]),
      exclusions: JSON.stringify([
        'Temporary works design',
        'Building control fees',
        'Party wall agreements',
        'Asbestos surveys and removal',
      ]),

      status: 'submitted',
      submittedAt: new Date(),

      // Line item prices
      lineItemPrices: {
        create: [
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '1.1' } })).id, rate: 11.80, total: 29500.00, notes: 'Competitive rate including disposal costs' },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '1.2' } })).id, rate: 82.00, total: 12300.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '2.1' } })).id, rate: 26.50, total: 84800.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '2.2' } })).id, rate: 8.00, total: 6400.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '3.1' } })).id, rate: 2750.00, total: 330000.00, notes: 'Includes pile testing' },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '4.1' } })).id, rate: 92.00, total: 26220.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '4.2' } })).id, rate: 105.00, total: 33600.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '4.3' } })).id, rate: 3100.00, total: 24800.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '5.1' } })).id, rate: 180.00, total: 75600.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '5.2' } })).id, rate: 410.00, total: 38950.00 },
        ],
      },
    },
  });

  // Response 2: Elite Groundworks - Itemized pricing (lowest price)
  const response2 = await prisma.tenderResponse.create({
    data: {
      tenantId,
      requestId: tender.id,
      supplierId: suppliers[1].id,
      status: 'submitted',
      totalBidValue: 742875.00,
      submittedAt: new Date(),
    },
  });

  const packageResponse2 = await prisma.packageResponse.create({
    data: {
      tenantId,
      packageId: measuredPackage.id,
      tenderResponseId: response2.id,
      supplierId: suppliers[1].id,
      pricingType: 'ITEMIZED_ONLY',
      packageTotal: 638000.00,

      preliminaries: 51040.00, // 8%
      prelimsPercentage: 8.0,
      contingency: 31900.00, // 5%
      contingencyPercentage: 5.0,
      overheadsProfit: 63800.00, // 10%
      overheadsProfitPerc: 10.0,

      programmeDuration: 16,
      startDate: new Date('2025-07-01'),
      completionDate: new Date('2025-11-30'),

      paymentTerms: '21 days from valuation',
      retentionPercentage: 5.0,
      defectsLiability: 12,
      warranties: 'Professional indemnity insurance £5m, Public liability £10m',

      assumptions: JSON.stringify([
        'Site conditions as per provided information',
        'Access to water and power on site',
        'No contaminated ground',
      ]),
      exclusions: JSON.stringify([
        'Temporary works design',
        'CDM coordinator fees',
      ]),

      status: 'submitted',
      submittedAt: new Date(),

      lineItemPrices: {
        create: [
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '1.1' } })).id, rate: 11.50, total: 28750.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '1.2' } })).id, rate: 80.00, total: 12000.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '2.1' } })).id, rate: 25.50, total: 81600.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '2.2' } })).id, rate: 7.80, total: 6240.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '3.1' } })).id, rate: 2680.00, total: 321600.00, notes: 'Specialist piling subcontractor' },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '4.1' } })).id, rate: 90.00, total: 25650.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '4.2' } })).id, rate: 102.00, total: 32640.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '4.3' } })).id, rate: 3050.00, total: 24400.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '5.1' } })).id, rate: 178.00, total: 74760.00 },
          { tenantId, lineItemId: (await prisma.packageLineItem.findFirst({ where: { packageId: measuredPackage.id, itemNumber: '5.2' } })).id, rate: 405.00, total: 38475.00 },
        ],
      },
    },
  });

  // Create Clarifications
  console.log('Creating clarifications...');
  await prisma.tenderClarification.createMany({
    data: [
      {
        tenantId,
        requestId: tender.id,
        question: 'Can you confirm the piling specification? The site investigation report mentions variable ground conditions.',
        askedBy: suppliers[0].id.toString(),
        askedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        status: 'answered',
        answer: 'The piling specification should be CFA piles as stated. The contractor is responsible for adjusting pile depths based on actual encountered ground conditions. All piles must achieve design capacity as per structural engineer requirements.',
        answeredBy: buyerUser.id,
        answeredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        isPublic: true,
      },
      {
        tenantId,
        requestId: tender.id,
        question: 'What is the required testing regime for the piles?',
        askedBy: suppliers[1].id.toString(),
        askedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
        status: 'answered',
        answer: 'Testing requirements: 2 No. preliminary piles with full instrumentation, 5% of working piles to have integrity testing, all piles to have load testing as per BS 8004.',
        answeredBy: buyerUser.id,
        answeredAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        isPublic: true,
      },
      {
        tenantId,
        requestId: tender.id,
        question: 'Are there any restrictions on working hours or noise limitations?',
        askedBy: suppliers[0].id.toString(),
        askedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        status: 'pending',
        isPublic: true,
      },
    ],
  });

  // Create Audit Logs
  console.log('Creating audit logs...');
  await prisma.tenderAuditLog.createMany({
    data: [
      {
        tenantId,
        requestId: tender.id,
        entityType: 'tender',
        entityId: tender.id,
        action: 'created',
        actorType: 'user',
        actorId: buyerUser.id.toString(),
        actorName: buyerUser.name,
        changes: JSON.stringify({ status: 'Draft', title: tender.title }),
      },
      {
        tenantId,
        requestId: tender.id,
        entityType: 'tender',
        entityId: tender.id,
        action: 'published',
        actorType: 'user',
        actorId: buyerUser.id.toString(),
        actorName: buyerUser.name,
        changes: JSON.stringify({ status: 'Open', publishedAt: new Date().toISOString() }),
      },
    ],
  });

  console.log('✅ Tender system seed data complete!');
  console.log('\n📊 Summary:');
  console.log(`   - Project: ${project.name}`);
  console.log(`   - Packages: 3 (Lump Sum, Measured BOQ, Hybrid)`);
  console.log(`   - Suppliers: ${suppliers.length}`);
  console.log(`   - Tender: ${tender.title}`);
  console.log(`   - Responses: 2 submitted`);
  console.log(`   - Clarifications: 3`);
  console.log('\n🔑 Login credentials:');
  console.log('   Email: buyer@construction.com');
  console.log('   Email: evaluator@construction.com');
  console.log('   Password: demo123\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
