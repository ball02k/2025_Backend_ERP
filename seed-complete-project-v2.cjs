/**
 * Comprehensive Project Seed Data V2
 * Creates a complete project with full lifecycle data
 * Follows existing seed patterns
 */

const { PrismaClient } = require('@prisma/client');
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
    // PHASE 1: FOUNDATION
    // ========================================================================
    console.log('\n📋 PHASE 1: Setting up foundation...');

    // Create client
    const client = await prisma.client.create({
      data: {
        name: 'Bridge Development Partners Ltd',
        companyRegNo: 'UK987654321',
        vatNo: 'GB123456789',
        address1: '50 Cannon Street',
        city: 'London',
        postcode: 'EC4N 6JJ',
        clientType: 'COMMERCIAL'
      }
    });
    console.log('  ✓ Client created');

    // Create the project
    const project = await prisma.project.create({
      data: {
        tenantId: TENANT_ID,
        name: PROJECT_NAME,
        code: PROJECT_CODE,
        status: 'active',
        client: {
          connect: { id: client.id }
        },
        budget: toDecimal(CONTRACT_VALUE),
        startPlanned: new Date('2025-01-01'),
        endPlanned: new Date('2027-12-31'),
        description: 'Construction of a 40-storey mixed-use tower'
      }
    });
    console.log(`  ✓ Project created: ${project.name} (ID: ${project.id})`);

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

    // Create budget lines
    const budgetCategories = [
      { code: 'PREL', name: 'Preliminaries', amount: CONTRACT_VALUE * 0.12 },
      { code: 'SUB', name: 'Substructure', amount: CONTRACT_VALUE * 0.08 },
      { code: 'SUPER', name: 'Superstructure', amount: CONTRACT_VALUE * 0.25 },
      { code: 'CLAD', name: 'Cladding & Roofing', amount: CONTRACT_VALUE * 0.15 },
      { code: 'MECH', name: 'Mechanical Services', amount: CONTRACT_VALUE * 0.12 },
      { code: 'ELEC', name: 'Electrical Services', amount: CONTRACT_VALUE * 0.10 },
      { code: 'FIT', name: 'Fit Out & Finishes', amount: CONTRACT_VALUE * 0.08 },
      { code: 'EXT', name: 'External Works', amount: CONTRACT_VALUE * 0.10 }
    ];

    const budgetLines = [];
    for (const cat of budgetCategories) {
      const line = await prisma.budgetLine.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          budgetGroupId: budgetGroup.id,
          code: cat.code,
          description: cat.name,
          unit: 'ITEM',
          quantity: toDecimal(1),
          rate: toDecimal(cat.amount),
          totalBudget: toDecimal(cat.amount),
          currency: 'GBP'
        }
      });
      budgetLines.push(line);
    }
    console.log(`  ✓ Created ${budgetLines.length} budget categories`);

    // ========================================================================
    // PHASE 3: PACKAGES FROM BUDGET
    // ========================================================================
    console.log('\n📦 PHASE 3: Creating packages...');

    const packages = [];
    const packageData = [
      { code: 'PREL', name: 'Preliminaries Package' },
      { code: 'SUB', name: 'Groundworks Package' },
      { code: 'SUPER', name: 'Concrete Frame Package' },
      { code: 'CLAD', name: 'Facade Package' },
      { code: 'MECH', name: 'Mechanical Package' },
      { code: 'ELEC', name: 'Electrical Package' }
    ];

    for (const pd of packageData) {
      const budgetLine = budgetLines.find(bl => bl.code === pd.code);
      if (!budgetLine) continue;

      const pkg = await prisma.package.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          code: pd.code,
          name: pd.name,
          totalBudget: budgetLine.totalBudget,
          status: 'active'
        }
      });

      // Link package to budget line
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

    const supplierData = [
      { name: 'ABC Groundworks Ltd', type: 'SUBCONTRACTOR' },
      { name: 'Rapid Build Ltd', type: 'SUBCONTRACTOR' },
      { name: 'Glass & Steel Ltd', type: 'SUBCONTRACTOR' },
      { name: 'HVAC Masters Ltd', type: 'SUBCONTRACTOR' },
      { name: 'Power & Light Ltd', type: 'SUBCONTRACTOR' },
      { name: 'Steel Solutions Ltd', type: 'MATERIAL' },
      { name: 'Concrete Supply Co', type: 'MATERIAL' }
    ];

    const suppliers = [];
    for (const sd of supplierData) {
      const supplier = await prisma.supplier.create({
        data: {
          tenantId: TENANT_ID,
          name: sd.name,
          type: sd.type,
          status: 'approved',
          email: sd.name.toLowerCase().replace(/[\s&]/g, '') + '@example.com',
          phone: '+44 20 1234 5678'
        }
      });
      suppliers.push(supplier);
    }
    console.log(`  ✓ Created ${suppliers.length} suppliers`);

    // ========================================================================
    // PHASE 5: TENDERS
    // ========================================================================
    console.log('\n📋 PHASE 5: Creating tenders...');

    const tenders = [];
    const subcontractors = suppliers.filter(s => s.type === 'SUBCONTRACTOR');

    // Create tender for Groundworks package
    if (packages[1] && subcontractors.length >= 3) {
      const tender = await prisma.tender.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          packageId: packages[1].id, // Groundworks
          tenderRef: `${PROJECT_CODE}-T-001`,
          title: 'Groundworks Package Tender',
          status: 'awarded',
          issueDate: new Date('2024-10-01'),
          returnDate: new Date('2024-10-21')
        }
      });

      // Create tender invitations
      for (let i = 0; i < Math.min(3, subcontractors.length); i++) {
        await prisma.tenderInvitation.create({
          data: {
            tenantId: TENANT_ID,
            tenderId: tender.id,
            supplierId: subcontractors[i].id,
            invitedDate: new Date('2024-10-01'),
            status: 'accepted'
          }
        });

        // Create submission
        await prisma.tenderSubmission.create({
          data: {
            tenantId: TENANT_ID,
            tenderId: tender.id,
            supplierId: subcontractors[i].id,
            submittedDate: new Date('2024-10-20'),
            proposedAmount: toDecimal(packages[1].totalBudget * (0.9 + i * 0.05)),
            status: 'evaluated'
          }
        });
      }

      // Create award for first supplier (best price)
      const award = await prisma.award.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          packageId: packages[1].id,
          tenderId: tender.id,
          supplierId: subcontractors[0].id,
          awardDate: new Date('2024-11-01'),
          awardValue: toDecimal(packages[1].totalBudget * 0.9),
          status: 'accepted'
        }
      });

      // Create contract from award
      const contract = await prisma.contract.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          supplierId: subcontractors[0].id,
          packageId: packages[1].id,
          contractRef: `${PROJECT_CODE}-C-001`,
          title: 'Groundworks Contract',
          value: award.awardValue,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          status: 'active',
          retentionPercentage: toDecimal(5)
        }
      });

      console.log(`  ✓ Created tender, award, and contract for Groundworks`);

      // ========================================================================
      // PHASE 6: PAYMENT APPLICATIONS
      // ========================================================================
      console.log('\n💰 PHASE 6: Creating payment applications...');

      // Create upstream contract first (needed for OUTBOUND apps)
      const upstreamContract = await prisma.upstreamContract.create({
        data: {
          tenantId: TENANT_ID,
          project: {
            connect: { id: project.id }
          },
          mainContractor: {
            connect: { id: client.id }
          },
          contractValue: toDecimal(CONTRACT_VALUE),
          retentionPercentage: toDecimal(5),
          paymentTermsDays: 30
        }
      });

      // OUTBOUND - Application to client
      const outApp = await prisma.applicationForPayment.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          upstreamContractId: upstreamContract.id,
          applicationNumber: 1,
          applicationDate: new Date('2025-02-25'),
          periodStart: new Date('2025-02-01'),
          periodEnd: new Date('2025-02-28'),
          claimedGrossValue: toDecimal(1000000),
          claimedThisPeriod: toDecimal(1000000),
          claimedNetValue: toDecimal(950000),
          status: 'certified',
          direction: 'OUTBOUND',
          certifiedGrossValue: toDecimal(980000),
          certifiedThisPeriod: toDecimal(980000),
          certifiedNetValue: toDecimal(931000)
        }
      });

      // INBOUND - Application from subcontractor
      const inApp = await prisma.applicationForPayment.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          contractId: contract.id,
          supplierId: subcontractors[0].id,
          applicationNumber: 1,
          applicationDate: new Date('2025-02-20'),
          periodStart: new Date('2025-02-01'),
          periodEnd: new Date('2025-02-28'),
          claimedGrossValue: toDecimal(200000),
          claimedThisPeriod: toDecimal(200000),
          claimedNetValue: toDecimal(190000),
          status: 'certified',
          direction: 'INBOUND',
          certifiedGrossValue: toDecimal(190000),
          certifiedThisPeriod: toDecimal(190000),
          certifiedNetValue: toDecimal(180500)
        }
      });
      console.log('  ✓ Created OUTBOUND and INBOUND payment applications');

      // ========================================================================
      // PHASE 7: PAYMENT CERTIFICATES
      // ========================================================================
      console.log('\n📜 PHASE 7: Creating payment certificates...');

      const certificate = await prisma.paymentCertificate.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          upstreamContractId: upstreamContract.id,
          paymentApplicationId: outApp.id,
          certificateNumber: 1,
          certificateDate: new Date('2025-02-28'),
          certifiedGross: outApp.certifiedGrossValue,
          retentionPercentage: toDecimal(5),
          retentionAmount: toDecimal(49000),
          netCertified: outApp.certifiedNetValue,
          paymentDueDate: new Date('2025-03-30'),
          paymentStatus: 'awaiting',
          status: 'received',
          direction: 'INBOUND'
        }
      });
      console.log('  ✓ Created payment certificate from client');

      // ========================================================================
      // PHASE 8: PURCHASE ORDERS
      // ========================================================================
      console.log('\n📦 PHASE 8: Creating purchase orders...');

      const materialSupplier = suppliers.find(s => s.type === 'MATERIAL');
      if (materialSupplier) {
        await prisma.purchaseOrder.create({
          data: {
            tenantId: TENANT_ID,
            projectId: project.id,
            supplierId: materialSupplier.id,
            poNumber: `PO-${PROJECT_CODE}-001`,
            orderDate: new Date('2025-02-10'),
            totalValue: toDecimal(75000),
            currency: 'GBP',
            status: 'approved',
            direction: 'OUTBOUND'
          }
        });
        console.log('  ✓ Created purchase order');
      }

      // ========================================================================
      // PHASE 9: INVOICES
      // ========================================================================
      console.log('\n💵 PHASE 9: Creating invoices...');

      // OUTBOUND invoice to client
      await prisma.invoice.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          invoiceNumber: `INV-${PROJECT_CODE}-001`,
          invoiceDate: certificate.certificateDate,
          dueDate: certificate.paymentDueDate,
          grossAmount: certificate.certifiedGross,
          netAmount: certificate.netCertified,
          status: 'sent',
          type: 'project',
          direction: 'OUTBOUND'
        }
      });

      // INBOUND invoice from supplier
      await prisma.invoice.create({
        data: {
          tenantId: TENANT_ID,
          projectId: project.id,
          supplierId: subcontractors[0].id,
          invoiceNumber: `SINV-001`,
          invoiceDate: new Date('2025-02-28'),
          dueDate: new Date('2025-03-30'),
          grossAmount: inApp.certifiedGrossValue,
          netAmount: inApp.certifiedNetValue,
          status: 'received',
          type: 'supplier',
          direction: 'INBOUND'
        }
      });
      console.log('  ✓ Created OUTBOUND and INBOUND invoices');

      // ========================================================================
      // PHASE 10: CVR DATA
      // ========================================================================
      console.log('\n📈 PHASE 10: Generating CVR data...');

      await prisma.cVRMonthly.create({
        data: {
          projectId: project.id,
          month: '2025-02',
          budgetCost: toDecimal(CONTRACT_VALUE / 36), // 3 year project
          committedCost: toDecimal(CONTRACT_VALUE * 0.4), // 40% committed
          actualCost: toDecimal(200000), // Actual spend
          forecastCost: toDecimal(CONTRACT_VALUE * 1.02) // 2% over budget forecast
        }
      });
      console.log('  ✓ Created CVR data');
    }

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('\n' + '━'.repeat(60));
    console.log('✨ PROJECT CREATION COMPLETE!');
    console.log('━'.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`  • Project: ${project.name} (${PROJECT_CODE})`);
    console.log(`  • Contract Value: £${CONTRACT_VALUE.toLocaleString()}`);
    console.log(`  • Budget Lines: ${budgetLines.length} categories`);
    console.log(`  • Packages: ${packages.length} created`);
    console.log(`  • Suppliers: ${suppliers.length} created`);
    console.log(`  • Complete workflow demonstrated`);

    console.log('\n🎯 You can now explore:');
    console.log('  • Full project overview');
    console.log('  • Budget breakdown with packages');
    console.log('  • Tender process with awards');
    console.log('  • Contracts linked to packages');
    console.log('  • Payment applications (both directions)');
    console.log('  • Payment certificates');
    console.log('  • Purchase orders and invoices');
    console.log('  • CVR data');

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