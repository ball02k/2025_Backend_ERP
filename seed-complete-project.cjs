/**
 * Comprehensive Project Seed Data
 * Creates a complete project with full lifecycle data
 * Demonstrates the standard workflow for a Main Contractor project
 */

const { PrismaClient } = require('@prisma/client');
const { faker } = require('@faker-js/faker');
const prisma = new PrismaClient();

// Configuration
const TENANT_ID = 'main';
const PROJECT_NAME = 'London Bridge Tower Development';
const PROJECT_CODE = 'LBT-2025';
const CONTRACT_VALUE = 25000000; // £25M project

// Helper to convert to Decimal
const toDecimal = (value) => {
  if (value === null || value === undefined) return null;
  return parseFloat(value.toString());
};

async function seedCompleteProject() {
  console.log('🏗️  Creating Complete Project: ' + PROJECT_NAME);
  console.log('━'.repeat(60));

  try {
    // ========================================================================
    // PHASE 1: FOUNDATION - Company, Users, Project
    // ========================================================================
    console.log('\n📋 PHASE 1: Setting up foundation...');

    // Get or create a client (for our main contractor role)
    let mainClient = await prisma.client.findFirst({
      where: {
        tenantId: TENANT_ID
      }
    });

    if (!mainClient) {
      mainClient = await prisma.client.create({
        data: {
          tenantId: TENANT_ID,
          name: 'Bridge Development Partners Ltd',
          shortName: 'BDP',
          registrationNumber: 'UK987654321',
          address: '50 Cannon Street, London',
          phone: '+44 20 7987 6543',
          email: 'projects@bridge-dev.com',
          status: 'ACTIVE'
        }
      });
    }
    console.log('  ✓ Client company created');

    // Create the project
    const project = await prisma.project.create({
      data: {
        tenantId: TENANT_ID,
        name: PROJECT_NAME,
        projectCode: PROJECT_CODE,
        status: 'ACTIVE',
        projectRole: 'MAIN_CONTRACTOR',
        contractValue: toDecimal(CONTRACT_VALUE),
        startDate: new Date('2025-01-01'),
        endDate: new Date('2027-12-31'),
        clientId: mainClient.id,
        address: 'London Bridge, London SE1',
        description: 'Construction of a 40-storey mixed-use tower with commercial, residential and retail spaces',
        procurementMode: 'hybrid',
        retentionPercentage: toDecimal(5),
        defectsLiabilityPeriod: 12
      }
    });
    console.log(`  ✓ Project created: ${project.name} (ID: ${project.id})`);

    // Create upstream contract (from client to us)
    const upstreamContract = await prisma.upstreamContract.create({
      data: {
        tenantId: TENANT_ID,
        projectId: project.id,
        mainContractorId: mainClient.id, // Client is "main contractor" from our perspective
        contractValue: toDecimal(CONTRACT_VALUE),
        retentionPercentage: toDecimal(5),
        mcdPercentage: toDecimal(2.5),
        defectsLiabilityWeeks: 52,
        paymentTermsDays: 30
      }
    });
    console.log('  ✓ Upstream contract created');

    // ========================================================================
    // PHASE 2: BUDGET LINES
    // ========================================================================
    console.log('\n📊 PHASE 2: Creating budget structure...');

    const budgetGroup = await prisma.budgetGroup.create({
      data: {
        tenantId: TENANT_ID,
        projectId: project.id,
        name: 'Main Budget',
        totalBudget: toDecimal(CONTRACT_VALUE)
      }
    });

    // Budget categories with realistic construction costs
    const budgetCategories = [
      { code: 'PREL', name: 'Preliminaries', percentage: 12 },
      { code: 'SUB', name: 'Substructure', percentage: 8 },
      { code: 'SUPER', name: 'Superstructure', percentage: 25 },
      { code: 'CLAD', name: 'Cladding & Roofing', percentage: 15 },
      { code: 'MECH', name: 'Mechanical Services', percentage: 12 },
      { code: 'ELEC', name: 'Electrical Services', percentage: 10 },
      { code: 'LIFT', name: 'Lifts & Escalators', percentage: 5 },
      { code: 'FIT', name: 'Fit Out & Finishes', percentage: 8 },
      { code: 'EXT', name: 'External Works', percentage: 5 }
    ];

    const budgetLines = [];
    for (const cat of budgetCategories) {
      const categoryBudget = CONTRACT_VALUE * (cat.percentage / 100);

      // Create main category line
      const mainLine = await prisma.budgetLine.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          budgetGroupId: budgetGroup.id,
          code: cat.code,
          description: cat.name,
          unit: 'ITEM',
          quantity: toDecimal(1),
          rate: toDecimal(categoryBudget),
          totalBudget: toDecimal(categoryBudget),
          currency: 'GBP'
        }
      });
      budgetLines.push(mainLine);

      // Create detailed sub-items for each category
      const subItemCount = faker.number.int({ min: 3, max: 6 });
      for (let i = 1; i <= subItemCount; i++) {
        const subBudget = categoryBudget / subItemCount;
        await prisma.budgetLine.create({
          data: {
            tenantId: TENANT_ID,
            projectId: project.id,
            budgetGroupId: budgetGroup.id,
            parentId: mainLine.id,
            code: `${cat.code}-${String(i).padStart(3, '0')}`,
            description: `${cat.name} - Item ${i}`,
            unit: ['m2', 'm3', 'nr', 'kg', 'hours'][faker.number.int({ min: 0, max: 4 })],
            quantity: toDecimal(faker.number.int({ min: 100, max: 1000 })),
            rate: toDecimal(subBudget / 100),
            totalBudget: toDecimal(subBudget),
            currency: 'GBP'
          }
        });
      }
    }
    console.log(`  ✓ Created ${budgetCategories.length} budget categories with sub-items`);

    // ========================================================================
    // PHASE 3: PACKAGES FROM BUDGET
    // ========================================================================
    console.log('\n📦 PHASE 3: Creating packages from budget...');

    const packages = [];
    const packageMapping = [
      { budgetCode: 'PREL', name: 'Preliminaries Package', scope: 'Site setup, welfare, management' },
      { budgetCode: 'SUB', name: 'Groundworks Package', scope: 'Foundations, basement, drainage' },
      { budgetCode: 'SUPER', name: 'Concrete Frame Package', scope: 'RC frame, cores, slabs' },
      { budgetCode: 'CLAD', name: 'Facade Package', scope: 'Curtain wall, cladding, roofing' },
      { budgetCode: 'MECH', name: 'Mechanical Package', scope: 'HVAC, plumbing, fire systems' },
      { budgetCode: 'ELEC', name: 'Electrical Package', scope: 'Power, lighting, data, security' },
      { budgetCode: 'LIFT', name: 'Lifts Package', scope: 'Passenger and goods lifts' },
      { budgetCode: 'FIT', name: 'Fit Out Package', scope: 'Internal finishes, joinery, decorations' }
    ];

    for (const pm of packageMapping) {
      const budgetLine = budgetLines.find(bl => bl.code === pm.budgetCode);
      if (!budgetLine) continue;

      const pkg = await prisma.package.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          code: pm.budgetCode,
          name: pm.name,
          scope: pm.scope,
          totalBudget: budgetLine.totalBudget,
          status: 'ACTIVE',
          procurementRoute: 'COMPETITIVE_TENDER'
        }
      });

      // Link package to budget lines
      await prisma.packageItem.create({
        data: {
          tenantId: TENANT_ID,
          packageId: pkg.id,
          budgetLineId: budgetLine.id
        }
      });

      packages.push(pkg);
    }
    console.log(`  ✓ Created ${packages.length} packages linked to budget`);

    // ========================================================================
    // PHASE 4: SUPPLIERS
    // ========================================================================
    console.log('\n🏢 PHASE 4: Creating suppliers...');

    const supplierTypes = [
      { type: 'GROUNDWORKS', names: ['ABC Groundworks Ltd', 'XYZ Civils Ltd', 'Foundation Experts Ltd'] },
      { type: 'CONCRETE', names: ['Rapid Build Ltd', 'Concrete Structures Ltd', 'Frame Solutions Ltd'] },
      { type: 'FACADE', names: ['Glass & Steel Ltd', 'Modern Facades Ltd', 'Curtain Wall Systems Ltd'] },
      { type: 'MECHANICAL', names: ['HVAC Masters Ltd', 'Climate Control Ltd', 'Mechanical Systems Ltd'] },
      { type: 'ELECTRICAL', names: ['Power & Light Ltd', 'Electrical Contractors Ltd', 'Spark Solutions Ltd'] },
      { type: 'LIFTS', names: ['Vertical Transport Ltd', 'Lift Solutions Ltd', 'Elevator Systems Ltd'] },
      { type: 'FITOUT', names: ['Interior Specialists Ltd', 'Fit Out Pros Ltd', 'Finishing Touch Ltd'] }
    ];

    const suppliers = [];
    for (const st of supplierTypes) {
      for (const name of st.names) {
        const supplier = await prisma.supplier.create({
          data: {
            tenantId: TENANT_ID,
            name,
            type: 'SUBCONTRACTOR',
            status: 'APPROVED',
            registrationNumber: `UK${faker.number.int({ min: 100000, max: 999999 })}`,
            vatNumber: `GB${faker.number.int({ min: 100000000, max: 999999999 })}`,
            email: faker.internet.email(),
            phone: faker.phone.number('+44 20 #### ####'),
            address: faker.location.streetAddress() + ', London',
            category: st.type,
            cisRegistered: true,
            cisVerified: true
          }
        });
        suppliers.push(supplier);
      }
    }
    console.log(`  ✓ Created ${suppliers.length} approved suppliers`);

    // ========================================================================
    // PHASE 5: TENDERS & AWARDS
    // ========================================================================
    console.log('\n📋 PHASE 5: Running tender process...');

    const awards = [];
    const contracts = [];

    // Create tenders for key packages
    const tenderPackages = packages.slice(1, 7); // Skip preliminaries, tender main packages

    for (const pkg of tenderPackages) {
      // Create tender
      const tender = await prisma.tender.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          packageId: pkg.id,
          tenderRef: `${PROJECT_CODE}-T-${pkg.code}`,
          title: `Tender for ${pkg.name}`,
          estimatedValue: toDecimal(Number(pkg.totalBudget)),
          tenderType: 'COMPETITIVE',
          status: 'AWARDED',
          issueDate: new Date('2024-10-01'),
          returnDate: new Date('2024-10-21'),
          interviewDate: new Date('2024-10-28'),
          awardDate: new Date('2024-11-05')
        }
      });

      // Get relevant suppliers for this package
      const relevantSuppliers = suppliers.filter(s =>
        s.category && pkg.name.toLowerCase().includes(s.category.toLowerCase().substring(0, 4))
      ).slice(0, 3);

      if (relevantSuppliers.length === 0) {
        relevantSuppliers.push(...suppliers.slice(0, 3));
      }

      // Create tender invitations and submissions
      let bestSubmission = null;
      let bestScore = 0;

      for (let i = 0; i < relevantSuppliers.length; i++) {
        const supplier = relevantSuppliers[i];

        // Create invitation
        await prisma.tenderInvitation.create({
          data: {
            tenantId: TENANT_ID,
            tenderId: tender.id,
            supplierId: supplier.id,
            invitedDate: new Date('2024-10-01'),
            status: 'ACCEPTED'
          }
        });

        // Create submission
        const baseAmount = Number(pkg.totalBudget);
        const variance = faker.number.float({ min: -0.15, max: 0.05 }); // -15% to +5%
        const submissionAmount = baseAmount * (1 + variance);
        const qualityScore = faker.number.int({ min: 70, max: 95 });
        const commercialScore = 100 - Math.abs(variance * 100);
        const totalScore = (qualityScore * 0.4 + commercialScore * 0.6);

        const submission = await prisma.tenderSubmission.create({
          data: {
            tenantId: TENANT_ID,
            tenderId: tender.id,
            supplierId: supplier.id,
            submissionRef: `${tender.tenderRef}-S${i + 1}`,
            submittedDate: new Date('2024-10-20'),
            proposedAmount: toDecimal(submissionAmount),
            qualityScore: toDecimal(qualityScore),
            commercialScore: toDecimal(commercialScore),
            totalScore: toDecimal(totalScore),
            status: 'EVALUATED',
            programmeWeeks: faker.number.int({ min: 12, max: 52 })
          }
        });

        // Track best submission
        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestSubmission = { submission, supplier };
        }
      }

      // Create award for best submission
      if (bestSubmission) {
        const award = await prisma.award.create({
          data: {
            tenantId: TENANT_ID,
            tenderId: tender.id,
            supplierId: bestSubmission.supplier.id,
            submissionId: bestSubmission.submission.id,
            awardDate: new Date('2024-11-05'),
            awardedAmount: bestSubmission.submission.proposedAmount,
            status: 'ACCEPTED',
            notes: `Awarded based on best overall score: ${bestScore.toFixed(1)}%`
          }
        });
        awards.push(award);

        // Create contract from award
        const contract = await prisma.contract.create({
          data: {
            tenantId: TENANT_ID,
            projectId: project.id,
            supplierId: bestSubmission.supplier.id,
            packageId: pkg.id,
            awardId: award.id,
            contractRef: `${PROJECT_CODE}-C-${pkg.code}`,
            title: `${pkg.name} - ${bestSubmission.supplier.name}`,
            value: bestSubmission.submission.proposedAmount,
            startDate: new Date('2025-01-01'),
            endDate: new Date('2026-12-31'),
            status: 'ACTIVE',
            retentionPercentage: toDecimal(5),
            defectsLiabilityWeeks: 52,
            paymentTermsDays: 30
          }
        });
        contracts.push(contract);
        console.log(`  ✓ Tender ${tender.tenderRef}: Awarded to ${bestSubmission.supplier.name}`);
      }
    }

    // ========================================================================
    // PHASE 6: PAYMENT APPLICATIONS
    // ========================================================================
    console.log('\n💰 PHASE 6: Creating payment applications...');

    // OUTBOUND - Applications we raise to client
    const outboundApps = [];
    for (let month = 1; month <= 3; month++) {
      const monthlyValue = CONTRACT_VALUE / 36; // 3 year project
      const cumulativeValue = monthlyValue * month;

      const app = await prisma.applicationForPayment.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          upstreamContractId: upstreamContract.id,
          applicationNumber: month,
          applicationNo: `PA-${PROJECT_CODE}-${String(month).padStart(3, '0')}`,
          applicationDate: new Date(2025, month - 1, 25),
          periodStart: new Date(2025, month - 1, 1),
          periodEnd: new Date(2025, month - 1, 28),
          claimedGrossValue: toDecimal(cumulativeValue),
          claimedPreviouslyPaid: toDecimal(month > 1 ? (month - 1) * monthlyValue : 0),
          claimedThisPeriod: toDecimal(monthlyValue),
          claimedRetention: toDecimal(monthlyValue * 0.05),
          claimedNetValue: toDecimal(monthlyValue * 0.95),
          status: month === 3 ? 'SUBMITTED' : 'CERTIFIED',
          direction: 'OUTBOUND',
          // Certified values for approved ones
          ...(month < 3 ? {
            certifiedGrossValue: toDecimal(cumulativeValue * 0.98), // 98% certified
            certifiedThisPeriod: toDecimal(monthlyValue * 0.98),
            certifiedRetention: toDecimal(monthlyValue * 0.98 * 0.05),
            certifiedNetValue: toDecimal(monthlyValue * 0.98 * 0.95),
            certifiedDate: new Date(2025, month - 1, 28)
          } : {})
        }
      });
      outboundApps.push(app);
    }
    console.log(`  ✓ Created ${outboundApps.length} OUTBOUND applications to client`);

    // INBOUND - Applications from subcontractors
    const inboundApps = [];
    for (const contract of contracts.slice(0, 4)) {
      for (let appNum = 1; appNum <= 2; appNum++) {
        const monthlyValue = Number(contract.value) / 24; // 2 year subcontract

        const app = await prisma.applicationForPayment.create({
          data: {
            tenantId: TENANT_ID,
            projectId: project.id,
            contractId: contract.id,
            supplierId: contract.supplierId,
            applicationNumber: appNum,
            applicationNo: `PA-${contract.contractRef}-${String(appNum).padStart(3, '0')}`,
            applicationDate: new Date(2025, appNum - 1, 20),
            periodStart: new Date(2025, appNum - 1, 1),
            periodEnd: new Date(2025, appNum - 1, 28),
            claimedGrossValue: toDecimal(monthlyValue * appNum),
            claimedPreviouslyPaid: toDecimal(appNum > 1 ? monthlyValue * (appNum - 1) : 0),
            claimedThisPeriod: toDecimal(monthlyValue),
            claimedRetention: toDecimal(monthlyValue * 0.05),
            claimedNetValue: toDecimal(monthlyValue * 0.95),
            status: 'CERTIFIED',
            direction: 'INBOUND',
            certifiedGrossValue: toDecimal(monthlyValue * appNum * 0.95), // 95% certified
            certifiedThisPeriod: toDecimal(monthlyValue * 0.95),
            certifiedRetention: toDecimal(monthlyValue * 0.95 * 0.05),
            certifiedNetValue: toDecimal(monthlyValue * 0.95 * 0.95),
            certifiedDate: new Date(2025, appNum - 1, 22)
          }
        });
        inboundApps.push(app);
      }
    }
    console.log(`  ✓ Created ${inboundApps.length} INBOUND applications from subcontractors`);

    // ========================================================================
    // PHASE 7: PAYMENT CERTIFICATES
    // ========================================================================
    console.log('\n📜 PHASE 7: Creating payment certificates...');

    // INBOUND - Certificates from client for our applications
    const certificates = [];
    for (const app of outboundApps.filter(a => a.status === 'CERTIFIED')) {
      const cert = await prisma.paymentCertificate.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          upstreamContractId: upstreamContract.id,
          paymentApplicationId: app.id,
          certificateNumber: app.applicationNumber,
          certificateRef: `CERT-${PROJECT_CODE}-${String(app.applicationNumber).padStart(3, '0')}`,
          certificateDate: app.certifiedDate || new Date(),
          certifiedGross: app.certifiedGrossValue,
          retentionPercentage: toDecimal(5),
          retentionAmount: app.certifiedRetention,
          mcdPercentage: toDecimal(2.5),
          mcdAmount: toDecimal(Number(app.certifiedThisPeriod) * 0.025),
          netCertified: toDecimal(Number(app.certifiedNetValue) * 0.975), // After MCD
          appliedGross: app.claimedGrossValue,
          varianceAmount: toDecimal(Number(app.certifiedGrossValue) - Number(app.claimedGrossValue)),
          paymentDueDate: new Date(2025, app.applicationNumber, 25),
          paymentStatus: app.applicationNumber === 1 ? 'PAID' : 'AWAITING',
          status: 'RECEIVED',
          direction: 'INBOUND'
        }
      });
      certificates.push(cert);

      // Record payment for first certificate
      if (app.applicationNumber === 1) {
        await prisma.certificatePayment.create({
          data: {
            tenantId: TENANT_ID,
            paymentCertificateId: cert.id,
            paymentDate: new Date(2025, 1, 25),
            paymentAmount: cert.netCertified,
            paymentReference: `PAY-${cert.certificateRef}`,
            paymentMethod: 'BANK_TRANSFER',
            isPartialPayment: false
          }
        });
      }
    }
    console.log(`  ✓ Created ${certificates.length} payment certificates from client`);

    // ========================================================================
    // PHASE 8: PURCHASE ORDERS
    // ========================================================================
    console.log('\n📦 PHASE 8: Creating purchase orders...');

    const materialSuppliers = await prisma.supplier.createMany({
      data: [
        {
          tenantId: TENANT_ID,
          name: 'Steel Solutions Ltd',
          type: 'MATERIAL',
          status: 'APPROVED',
          category: 'STEEL'
        },
        {
          tenantId: TENANT_ID,
          name: 'Concrete Supply Co',
          type: 'MATERIAL',
          status: 'APPROVED',
          category: 'CONCRETE'
        },
        {
          tenantId: TENANT_ID,
          name: 'Building Materials Ltd',
          type: 'MATERIAL',
          status: 'APPROVED',
          category: 'GENERAL'
        }
      ]
    });

    const materialSuppliersData = await prisma.supplier.findMany({
      where: {
        tenantId: TENANT_ID,
        type: 'MATERIAL'
      },
      take: 3
    });

    for (const supplier of materialSuppliersData) {
      for (let i = 1; i <= 2; i++) {
        await prisma.purchaseOrder.create({
          data: {
            tenantId: TENANT_ID,
            projectId: project.id,
            supplierId: supplier.id,
            poNumber: `PO-${PROJECT_CODE}-${supplier.category}-${String(i).padStart(3, '0')}`,
            orderDate: new Date(2025, i - 1, 10),
            deliveryDate: new Date(2025, i - 1, 20),
            totalValue: toDecimal(faker.number.int({ min: 50000, max: 200000 })),
            currency: 'GBP',
            status: i === 1 ? 'DELIVERED' : 'APPROVED',
            direction: 'OUTBOUND',
            paymentTerms: 'Net 30 days',
            deliveryAddress: project.address
          }
        });
      }
    }
    console.log(`  ✓ Created purchase orders for materials`);

    // ========================================================================
    // PHASE 9: INVOICES
    // ========================================================================
    console.log('\n💵 PHASE 9: Creating invoices...');

    // OUTBOUND - Invoices to client (based on certificates)
    for (const cert of certificates) {
      await prisma.invoice.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          invoiceNumber: `INV-${cert.certificateRef}`,
          invoiceDate: cert.certificateDate,
          dueDate: cert.paymentDueDate,
          grossAmount: cert.certifiedGross,
          vatAmount: toDecimal(Number(cert.certifiedGross) * 0.2),
          netAmount: cert.netCertified,
          status: cert.paymentStatus === 'PAID' ? 'PAID' : 'SENT',
          type: 'PROJECT',
          direction: 'OUTBOUND',
          paymentCertificateId: cert.id
        }
      });
    }

    // INBOUND - Invoices from suppliers
    for (const app of inboundApps.slice(0, 4)) {
      await prisma.invoice.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          supplierId: app.supplierId,
          invoiceNumber: `SINV-${app.applicationNo}`,
          invoiceDate: app.certifiedDate || app.applicationDate,
          dueDate: new Date(app.applicationDate.getTime() + 30 * 24 * 60 * 60 * 1000),
          grossAmount: app.certifiedGrossValue || app.claimedGrossValue,
          netAmount: app.certifiedNetValue || app.claimedNetValue,
          status: 'RECEIVED',
          type: 'SUPPLIER',
          direction: 'INBOUND',
          paymentApplicationId: app.id
        }
      });
    }
    console.log('  ✓ Created project and supplier invoices');

    // ========================================================================
    // PHASE 10: CVR DATA
    // ========================================================================
    console.log('\n📈 PHASE 10: Generating CVR data...');

    // Create monthly CVR records
    for (let month = 1; month <= 3; month++) {
      const monthStr = `2025-${String(month).padStart(2, '0')}`;
      const monthlyBudget = CONTRACT_VALUE / 36;
      const actualSpend = monthlyBudget * faker.number.float({ min: 0.85, max: 1.05 });
      const committed = monthlyBudget * faker.number.float({ min: 1.1, max: 1.3 });

      await prisma.cVRMonthly.create({
        data: {
          projectId: project.id,
          month: monthStr,
          budgetCost: toDecimal(monthlyBudget),
          committedCost: toDecimal(committed),
          actualCost: toDecimal(actualSpend),
          forecastCost: toDecimal(monthlyBudget * 1.02) // 2% over budget forecast
        }
      });
    }
    console.log('  ✓ Created CVR monthly data');

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('\n' + '━'.repeat(60));
    console.log('✨ PROJECT CREATION COMPLETE!');
    console.log('━'.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`  • Project: ${project.name} (${PROJECT_CODE})`);
    console.log(`  • Contract Value: £${CONTRACT_VALUE.toLocaleString()}`);
    console.log(`  • Budget Lines: ${budgetCategories.length} categories`);
    console.log(`  • Packages: ${packages.length} created`);
    console.log(`  • Suppliers: ${suppliers.length} approved`);
    console.log(`  • Tenders: ${tenderPackages.length} completed`);
    console.log(`  • Contracts: ${contracts.length} awarded`);
    console.log(`  • Payment Applications: ${outboundApps.length} OUT, ${inboundApps.length} IN`);
    console.log(`  • Certificates: ${certificates.length} received`);
    console.log(`  • CVR Data: 3 months generated`);

    console.log('\n🎯 You can now explore:');
    console.log('  • Full project overview with complete info');
    console.log('  • Budget breakdown with detailed lines');
    console.log('  • Packages linked to budget');
    console.log('  • Complete tender process with evaluations');
    console.log('  • Awarded contracts with suppliers');
    console.log('  • Payment applications (both directions)');
    console.log('  • Payment certificates and tracking');
    console.log('  • CVR with actual vs budget data');
    console.log('  • Cash flow projections');
    console.log('  • Retention amounts');
    console.log('  • Purchase orders and invoices');

    console.log(`\n🚀 Navigate to project: ${project.name}`);

  } catch (error) {
    console.error('\n❌ Error creating project:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed
seedCompleteProject().catch(console.error);