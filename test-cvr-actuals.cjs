/**
 * Test script for CVR Phase A - Payment Application to CVR Actuals
 */

const { calculateActuals, getActualsBreakdown } = require('./services/cvrActualsService.cjs');

async function testCVRActuals() {
  const tenantId = 'demo';
  const projectId = 37;
  const endDate = new Date('2025-12-31');

  console.log('=== Testing CVR Actuals Service ===\n');
  console.log(`Tenant: ${tenantId}`);
  console.log(`Project: ${projectId}`);
  console.log(`As of Date: ${endDate.toISOString()}\n`);

  // Test 1: Calculate actuals by budget line
  console.log('--- Test 1: Calculate Actuals by Budget Line ---');
  const actualsMap = await calculateActuals(tenantId, projectId, endDate);

  console.log(`\nTotal budget lines with actuals: ${actualsMap.size}`);
  console.log('\nBreakdown by Budget Line:');

  for (const [budgetLineId, amount] of actualsMap.entries()) {
    console.log(`  Budget Line ${budgetLineId}: £${amount.toFixed(2)}`);
  }

  // Test 2: Get actuals breakdown by source
  console.log('\n--- Test 2: Actuals Breakdown by Source ---');
  const breakdown = await getActualsBreakdown(tenantId, projectId, endDate);

  console.log(`\nTotal Actuals: £${breakdown.total.toFixed(2)}`);
  console.log(`  From Invoices: £${breakdown.fromInvoices.toFixed(2)} (${breakdown.invoiceCount} invoices)`);
  console.log(`  From Payment Apps: £${breakdown.fromPaymentApplications.toFixed(2)} (${breakdown.paymentApplicationCount} PAs)`);

  // Test 3: Verify specific budget lines that should have PA actuals
  console.log('\n--- Test 3: Verify Budget Lines with PA Actuals ---');
  const expectedBudgetLines = [479, 480, 482]; // From PA #34
  const expectedAmounts = {
    479: 7400.00,  // Ceiling systems
    480: 9500.00,  // Floor finishes
    482: 8100.00,  // Structural steel
  };

  let testsPassed = 0;
  let testsFailed = 0;

  for (const budgetLineId of expectedBudgetLines) {
    const actual = actualsMap.get(budgetLineId) || 0;
    const expected = expectedAmounts[budgetLineId];

    if (Math.abs(actual - expected) < 0.01) {
      console.log(`  ✓ Budget Line ${budgetLineId}: £${actual.toFixed(2)} (expected £${expected.toFixed(2)})`);
      testsPassed++;
    } else {
      console.log(`  ✗ Budget Line ${budgetLineId}: £${actual.toFixed(2)} (expected £${expected.toFixed(2)})`);
      testsFailed++;
    }
  }

  console.log(`\n--- Test Results ---`);
  console.log(`Tests Passed: ${testsPassed}/${testsPassed + testsFailed}`);
  console.log(`Tests Failed: ${testsFailed}/${testsPassed + testsFailed}`);

  if (testsFailed === 0) {
    console.log('\n✅ All tests passed! CVR Phase A is working correctly.');
    console.log('Payment Applications are now being included in CVR Actuals! 🎉');
  } else {
    console.log('\n❌ Some tests failed. Check the implementation.');
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

testCVRActuals().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
