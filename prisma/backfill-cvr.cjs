/**
 * CVR Backfill Script
 *
 * Populates CVRCommitment and CVRActual tables from existing:
 * - Signed Contracts → CVRCommitment
 * - Approved Purchase Orders → CVRCommitment
 * - Invoices → CVRActual
 *
 * Run: node prisma/backfill-cvr.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillContractCommitments() {
  console.log('\n📜 Backfilling CVR Commitments from Signed Contracts...');

  // Find all signed contracts
  const contracts = await prisma.contract.findMany({
    where: { status: 'signed' },
    include: {
      lineItems: true,
    },
  });

  console.log(`   Found ${contracts.length} signed contracts`);

  let created = 0;
  let skipped = 0;

  for (const contract of contracts) {
    // Check if commitment already exists
    const existing = await prisma.cVRCommitment.findFirst({
      where: {
        tenantId: contract.tenantId,
        sourceType: 'CONTRACT',
        sourceId: contract.id,
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    // Create commitments from line items
    if (contract.lineItems?.length > 0) {
      for (const line of contract.lineItems) {
        if (line.budgetLineId && line.total) {
          try {
            await prisma.cVRCommitment.create({
              data: {
                tenantId: contract.tenantId,
                projectId: contract.projectId,
                budgetLineId: line.budgetLineId,
                sourceType: 'CONTRACT',
                sourceId: contract.id,
                amount: Number(line.total),
                description: `Contract ${contract.contractRef}: ${line.description || contract.title}`,
                reference: contract.contractRef,
                costCode: line.costCode,
                status: 'ACTIVE',
                effectiveDate: contract.signedDate || contract.updatedAt || new Date(),
              },
            });
            created++;
          } catch (e) {
            console.log(`   Error creating commitment for contract ${contract.id}: ${e.message}`);
          }
        }
      }
    } else if (contract.value) {
      // No line items - try to find budget line from package
      let budgetLineId = null;
      if (contract.packageId) {
        const packageItem = await prisma.packageItem.findFirst({
          where: { packageId: contract.packageId },
          select: { budgetLineId: true },
        });
        budgetLineId = packageItem?.budgetLineId;
      }

      if (budgetLineId) {
        try {
          await prisma.cVRCommitment.create({
            data: {
              tenantId: contract.tenantId,
              projectId: contract.projectId,
              budgetLineId,
              sourceType: 'CONTRACT',
              sourceId: contract.id,
              amount: Number(contract.value),
              description: `Contract ${contract.contractRef}: ${contract.title}`,
              reference: contract.contractRef,
              status: 'ACTIVE',
              effectiveDate: contract.signedDate || contract.updatedAt || new Date(),
            },
          });
          created++;
        } catch (e) {
          console.log(`   Error creating commitment for contract ${contract.id}: ${e.message}`);
        }
      }
    }
  }

  console.log(`   Created: ${created}, Skipped (existing): ${skipped}`);
}

async function backfillPOCommitments() {
  console.log('\n📦 Backfilling CVR Commitments from Approved Purchase Orders...');

  // Find all approved/issued/invoiced/paid POs
  const pos = await prisma.purchaseOrder.findMany({
    where: {
      status: { in: ['APPROVED', 'ISSUED', 'INVOICED', 'PAID'] },
    },
    include: {
      budgetLine: true,
    },
  });

  console.log(`   Found ${pos.length} approved+ purchase orders`);

  let created = 0;
  let skipped = 0;

  for (const po of pos) {
    if (!po.budgetLineId) {
      continue;
    }

    // Check if commitment already exists
    const existing = await prisma.cVRCommitment.findFirst({
      where: {
        tenantId: po.tenantId,
        sourceType: 'PURCHASE_ORDER',
        sourceId: po.id,
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    try {
      await prisma.cVRCommitment.create({
        data: {
          tenantId: po.tenantId,
          projectId: po.projectId,
          budgetLineId: po.budgetLineId,
          sourceType: 'PURCHASE_ORDER',
          sourceId: po.id,
          amount: Number(po.total || 0),
          description: `PO ${po.code} - ${po.supplier}`,
          reference: po.code,
          costCode: po.budgetLine?.costCodeId?.toString(),
          status: po.status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE',
          effectiveDate: po.approvedDate || po.createdAt,
        },
      });
      created++;
    } catch (e) {
      console.log(`   Error creating commitment for PO ${po.id}: ${e.message}`);
    }
  }

  console.log(`   Created: ${created}, Skipped (existing): ${skipped}`);
}

async function backfillInvoiceActuals() {
  console.log('\n🧾 Backfilling CVR Actuals from Invoices...');

  // Find all invoices
  const invoices = await prisma.invoice.findMany({
    where: {
      net: { gt: 0 },
    },
  });

  console.log(`   Found ${invoices.length} invoices with amounts`);

  let created = 0;
  let skipped = 0;
  let noBudgetLine = 0;

  for (const inv of invoices) {
    // Check if actual already exists
    const existing = await prisma.cVRActual.findFirst({
      where: {
        tenantId: inv.tenantId,
        sourceType: 'INVOICE',
        sourceId: inv.id,
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    // Try to find budget line
    let budgetLineId = null;

    // From contract
    if (inv.contractId) {
      const contractLine = await prisma.contractLineItem.findFirst({
        where: { contractId: inv.contractId, budgetLineId: { not: null } },
        select: { budgetLineId: true },
      });
      budgetLineId = contractLine?.budgetLineId;
    }

    // From package
    if (!budgetLineId && inv.packageId) {
      const packageItem = await prisma.packageItem.findFirst({
        where: { packageId: inv.packageId },
        select: { budgetLineId: true },
      });
      budgetLineId = packageItem?.budgetLineId;
    }

    // From project (first budget line as fallback)
    if (!budgetLineId && inv.projectId) {
      const firstBudgetLine = await prisma.budgetLine.findFirst({
        where: { projectId: inv.projectId },
        select: { id: true },
      });
      budgetLineId = firstBudgetLine?.id;
    }

    if (!budgetLineId) {
      noBudgetLine++;
      continue;
    }

    try {
      await prisma.cVRActual.create({
        data: {
          tenantId: inv.tenantId,
          projectId: inv.projectId,
          budgetLineId,
          sourceType: 'INVOICE',
          sourceId: inv.id,
          amount: Number(inv.net),
          description: `Invoice ${inv.number}`,
          reference: inv.number,
          incurredDate: inv.issueDate || inv.createdAt,
        },
      });
      created++;
    } catch (e) {
      console.log(`   Error creating actual for invoice ${inv.id}: ${e.message}`);
    }
  }

  console.log(`   Created: ${created}, Skipped (existing): ${skipped}, No budget line: ${noBudgetLine}`);
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║       CVR Backfill Script              ║');
  console.log('╚════════════════════════════════════════╝');

  try {
    await backfillContractCommitments();
    await backfillPOCommitments();
    await backfillInvoiceActuals();

    // Print summary
    const commitmentCount = await prisma.cVRCommitment.count();
    const actualCount = await prisma.cVRActual.count();

    console.log('\n✅ Backfill Complete!');
    console.log(`   Total CVRCommitment records: ${commitmentCount}`);
    console.log(`   Total CVRActual records: ${actualCount}`);

  } catch (error) {
    console.error('Error during backfill:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
