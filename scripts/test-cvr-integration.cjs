/**
 * CVR Integration Test Script
 *
 * This script tests that all financial transactions correctly update CVR:
 * 1. Contract Signing → CVRCommitment created
 * 2. Invoice Creation → CVRActual created (RECORDED)
 * 3. Invoice Approval → CVRActual updated to CERTIFIED
 * 4. AfP Certification → CVRActual created
 * 5. AfP Payment → CVRActual updated to PAID
 *
 * Usage: node scripts/test-cvr-integration.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TENANT_ID = 'demo';
const TEST_PROJECT_ID = 37; // Change to your test project ID

async function testCVRIntegration() {
  console.log('\n=================================');
  console.log('CVR INTEGRATION TEST');
  console.log('=================================\n');

  try {
    // Step 1: Get initial CVR state
    console.log('📊 STEP 1: Get initial CVR state');
    const initialCVR = await getCVRSummary(TENANT_ID, TEST_PROJECT_ID);
    console.log('Initial CVR:', {
      budget: formatCurrency(initialCVR.budget),
      committed: formatCurrency(initialCVR.committed),
      actuals: formatCurrency(initialCVR.actuals),
      remaining: formatCurrency(initialCVR.remaining),
    });

    // Step 2: Count existing CVR records
    console.log('\n📊 STEP 2: Count existing CVR records');
    const initialCommitments = await prisma.cVRCommitment.count({
      where: { tenantId: TENANT_ID, projectId: TEST_PROJECT_ID },
    });
    const initialActuals = await prisma.cVRActual.count({
      where: { tenantId: TENANT_ID, projectId: TEST_PROJECT_ID },
    });
    console.log(`Commitments: ${initialCommitments}`);
    console.log(`Actuals: ${initialActuals}`);

    // Step 3: Test Contract Signing → CVRCommitment
    console.log('\n📊 STEP 3: Test Contract Signing → CVRCommitment');
    const signedContracts = await prisma.contract.findMany({
      where: {
        tenantId: TENANT_ID,
        projectId: TEST_PROJECT_ID,
        status: 'signed',
      },
      take: 3,
    });

    console.log(`Found ${signedContracts.length} signed contracts`);

    for (const contract of signedContracts) {
      const commitment = await prisma.cVRCommitment.findFirst({
        where: {
          tenantId: TENANT_ID,
          sourceType: 'CONTRACT',
          sourceId: contract.id,
        },
      });

      const hasCommitment = !!commitment;
      console.log(`  ${hasCommitment ? '✅' : '❌'} Contract ${contract.id} (${contract.contractRef}): ${formatCurrency(contract.value)} - ${hasCommitment ? 'HAS' : 'MISSING'} CVRCommitment`);

      if (!hasCommitment && contract.value) {
        console.log(`     ⚠️  WARNING: Signed contract with value but no CVR commitment!`);
      }
    }

    // Step 4: Test Invoice Approval → CVRActual
    console.log('\n📊 STEP 4: Test Invoice Approval → CVRActual');
    const approvedInvoices = await prisma.invoice.findMany({
      where: {
        tenantId: TENANT_ID,
        projectId: TEST_PROJECT_ID,
        status: { in: ['APPROVED', 'PAID'] },
      },
      take: 3,
    });

    console.log(`Found ${approvedInvoices.length} approved invoices`);

    for (const invoice of approvedInvoices) {
      const actual = await prisma.cVRActual.findFirst({
        where: {
          tenantId: TENANT_ID,
          sourceType: 'INVOICE',
          sourceId: invoice.id,
        },
      });

      const hasActual = !!actual;
      const expectedStatus = invoice.status === 'PAID' ? 'PAID' : 'CERTIFIED';
      const statusMatch = actual?.status === expectedStatus;

      console.log(`  ${hasActual && statusMatch ? '✅' : '❌'} Invoice ${invoice.number} (${invoice.status}): ${formatCurrency(invoice.net)} - ${hasActual ? `CVRActual (${actual.status})` : 'MISSING CVRActual'}`);

      if (!hasActual) {
        console.log(`     ⚠️  WARNING: Approved invoice but no CVR actual!`);
      } else if (!statusMatch) {
        console.log(`     ⚠️  WARNING: CVR status mismatch! Expected: ${expectedStatus}, Got: ${actual.status}`);
      }
    }

    // Step 5: Test Payment Application Certification → CVRActual
    console.log('\n📊 STEP 5: Test Payment Application Certification → CVRActual');
    const certifiedAfps = await prisma.applicationForPayment.findMany({
      where: {
        tenantId: TENANT_ID,
        projectId: TEST_PROJECT_ID,
        status: { in: ['CERTIFIED', 'PAYMENT_NOTICE_SENT', 'PAY_LESS_ISSUED', 'AWAITING_PAYMENT', 'PAID'] },
      },
      take: 3,
    });

    console.log(`Found ${certifiedAfps.length} certified AfPs`);

    for (const afp of certifiedAfps) {
      const actual = await prisma.cVRActual.findFirst({
        where: {
          tenantId: TENANT_ID,
          sourceType: 'PAYMENT_APPLICATION',
          sourceId: afp.id,
        },
      });

      const hasActual = !!actual;
      const isPaid = ['PAID'].includes(afp.status);
      const expectedStatus = isPaid ? 'PAID' : 'CERTIFIED';
      const statusMatch = actual?.status === expectedStatus;

      console.log(`  ${hasActual ? '✅' : '❌'} AfP ${afp.applicationNo} (${afp.status}): ${formatCurrency(afp.certifiedThisPeriod)} - ${hasActual ? `CVRActual (${actual.status})` : 'MISSING CVRActual'}`);

      if (!hasActual) {
        console.log(`     ⚠️  WARNING: Certified AfP but no CVR actual! (This is the gap we just fixed)`);
      } else if (!statusMatch) {
        console.log(`     ⚠️  WARNING: CVR status mismatch! Expected: ${expectedStatus}, Got: ${actual.status}`);
      }
    }

    // Step 6: Final CVR state
    console.log('\n📊 STEP 6: Final CVR state');
    const finalCVR = await getCVRSummary(TENANT_ID, TEST_PROJECT_ID);
    console.log('Final CVR:', {
      budget: formatCurrency(finalCVR.budget),
      committed: formatCurrency(finalCVR.committed),
      actuals: formatCurrency(finalCVR.actuals),
      remaining: formatCurrency(finalCVR.remaining),
      percentCommitted: (finalCVR.percentCommitted * 100).toFixed(1) + '%',
      percentActual: (finalCVR.percentActual * 100).toFixed(1) + '%',
    });

    // Step 7: Final counts
    console.log('\n📊 STEP 7: Final CVR record counts');
    const finalCommitments = await prisma.cVRCommitment.count({
      where: { tenantId: TENANT_ID, projectId: TEST_PROJECT_ID },
    });
    const finalActuals = await prisma.cVRActual.count({
      where: { tenantId: TENANT_ID, projectId: TEST_PROJECT_ID },
    });
    console.log(`Commitments: ${finalCommitments} (was ${initialCommitments})`);
    console.log(`Actuals: ${finalActuals} (was ${initialActuals})`);

    // Step 8: Show breakdown by source type
    console.log('\n📊 STEP 8: CVR breakdown by source type');

    const commitmentsByType = await prisma.cVRCommitment.groupBy({
      by: ['sourceType'],
      where: { tenantId: TENANT_ID, projectId: TEST_PROJECT_ID, status: 'COMMITTED' },
      _sum: { amount: true },
      _count: { id: true },
    });

    console.log('Commitments by source:');
    for (const group of commitmentsByType) {
      console.log(`  ${group.sourceType}: ${group._count.id} records, Total: ${formatCurrency(group._sum.amount)}`);
    }

    const actualsByType = await prisma.cVRActual.groupBy({
      by: ['sourceType'],
      where: { tenantId: TENANT_ID, projectId: TEST_PROJECT_ID },
      _sum: { amount: true },
      _count: { id: true },
    });

    console.log('\nActuals by source:');
    for (const group of actualsByType) {
      console.log(`  ${group.sourceType}: ${group._count.id} records, Total: ${formatCurrency(group._sum.amount)}`);
    }

    const actualsByStatus = await prisma.cVRActual.groupBy({
      by: ['status'],
      where: { tenantId: TENANT_ID, projectId: TEST_PROJECT_ID },
      _sum: { amount: true },
      _count: { id: true },
    });

    console.log('\nActuals by status:');
    for (const group of actualsByStatus) {
      console.log(`  ${group.status}: ${group._count.id} records, Total: ${formatCurrency(group._sum.amount)}`);
    }

    console.log('\n✅ CVR INTEGRATION TEST COMPLETE\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Get CVR summary for a project
 */
async function getCVRSummary(tenantId, projectId) {
  // Get budget data
  const budgetLines = await prisma.budgetLine.findMany({
    where: { projectId, tenantId },
    select: { total: true },
  });
  const totalBudget = budgetLines.reduce((sum, bl) => sum + Number(bl.total || 0), 0);

  // Get committed amounts
  const commitments = await prisma.cVRCommitment.findMany({
    where: { tenantId, projectId, status: 'COMMITTED' },
    select: { amount: true },
  });
  const totalCommitted = commitments.reduce((sum, c) => sum + Number(c.amount), 0);

  // Get actual amounts
  const actuals = await prisma.cVRActual.findMany({
    where: {
      tenantId,
      projectId,
      status: { in: ['RECORDED', 'CERTIFIED', 'PAID'] },
    },
    select: { amount: true },
  });
  const totalActuals = actuals.reduce((sum, a) => sum + Number(a.amount), 0);

  // Calculate metrics
  const remaining = totalBudget - totalCommitted - totalActuals;
  const variance = totalBudget - totalCommitted;
  const percentCommitted = totalBudget > 0 ? (totalCommitted / totalBudget) : 0;
  const percentActual = totalBudget > 0 ? (totalActuals / totalBudget) : 0;

  return {
    budget: totalBudget,
    committed: totalCommitted,
    actuals: totalActuals,
    remaining,
    variance,
    percentCommitted,
    percentActual,
  };
}

/**
 * Format currency
 */
function formatCurrency(amount) {
  if (!amount) return '£0.00';
  return `£${Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Run the test
testCVRIntegration();
