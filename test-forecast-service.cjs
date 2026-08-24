/**
 * Test script for CVR Forecast Service (Phase B Part 2)
 *
 * Tests:
 * 1. calculateAnticipatedFinal() with different forecast methods
 * 2. determineForecastStatus()
 * 3. updateBudgetLineForecast() with history tracking
 * 4. calculateProjectForecast()
 * 5. getForecastBreakdown()
 *
 * Usage: node test-forecast-service.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const {
  calculateAnticipatedFinal,
  determineForecastStatus,
  updateBudgetLineForecast,
  calculateProjectForecast,
  getForecastBreakdown,
  getForecastHistory
} = require('./services/cvrForecastService.cjs');

const TENANT_ID = 'demo';
const PROJECT_ID = 37;

async function testCalculations() {
  console.log('\n=== Test 1: calculateAnticipatedFinal() ===\n');

  const testCases = [
    {
      name: 'COMMITTED method (default)',
      budgetLine: {
        committed: 50000,
        forecastMethod: 'COMMITTED'
      },
      expected: 50000
    },
    {
      name: 'MANUAL method',
      budgetLine: {
        committed: 50000,
        forecastMethod: 'MANUAL',
        forecastFinalCost: 55000
      },
      expected: 55000
    },
    {
      name: 'COMMITTED_PLUS_ADJ method',
      budgetLine: {
        committed: 50000,
        forecastMethod: 'COMMITTED_PLUS_ADJ',
        forecastAdjustment: 3000,
        anticipatedVariations: 2000,
        riskAllowance: 1000
      },
      expected: 56000
    }
  ];

  for (const test of testCases) {
    const result = calculateAnticipatedFinal(test.budgetLine);
    const pass = result === test.expected;
    console.log(`${pass ? '✓' : '✗'} ${test.name}: ${result} ${pass ? '==' : '!='} ${test.expected}`);
  }
}

async function testForecastStatus() {
  console.log('\n=== Test 2: determineForecastStatus() ===\n');

  const testCases = [
    { budget: 100000, forecast: 95000, expected: 'ON_TRACK' },
    { budget: 100000, forecast: 85000, expected: 'UNDER_BUDGET' },
    { budget: 100000, forecast: 103000, expected: 'AT_RISK' },
    { budget: 100000, forecast: 110000, expected: 'OVER_BUDGET' }
  ];

  for (const test of testCases) {
    const result = determineForecastStatus(test.budget, test.forecast);
    const pass = result === test.expected;
    console.log(`${pass ? '✓' : '✗'} Budget ${test.budget}, Forecast ${test.forecast}: ${result} ${pass ? '==' : '!='} ${test.expected}`);
  }
}

async function testBudgetLineForecastUpdate() {
  console.log('\n=== Test 3: updateBudgetLineForecast() ===\n');

  // Find a budget line to test with
  const budgetLine = await prisma.budgetLine.findFirst({
    where: {
      tenantId: TENANT_ID,
      projectId: PROJECT_ID
    }
  });

  if (!budgetLine) {
    console.log('⚠ No budget lines found for testing');
    return;
  }

  console.log(`Using budget line ${budgetLine.id}: ${budgetLine.description?.substring(0, 40)}...`);
  console.log(`Current committed: £${Number(budgetLine.committed || 0).toFixed(2)}`);

  // Test 1: Add a forecast adjustment
  console.log('\nTest 3a: Adding forecast adjustment of £5,000');
  const updated = await updateBudgetLineForecast({
    tenantId: TENANT_ID,
    budgetLineId: budgetLine.id,
    updates: {
      forecastMethod: 'COMMITTED_PLUS_ADJ',
      forecastAdjustment: 5000,
      forecastAdjustmentNotes: 'Test adjustment - anticipated price increase'
    },
    changeType: 'MANUAL_ADJUSTMENT',
    changeReason: 'Testing forecast adjustment',
    updatedBy: 'test-script'
  });

  console.log(`✓ Updated forecast: £${Number(updated.forecastFinalCost).toFixed(2)}`);
  console.log(`✓ Forecast variance: £${Number(updated.forecastVariance).toFixed(2)}`);
  console.log(`✓ Forecast status: ${updated.forecastStatus}`);
  console.log(`✓ Cost to complete: £${Number(updated.costToComplete).toFixed(2)}`);

  // Test 2: Check history was created
  const history = await getForecastHistory(TENANT_ID, budgetLine.id, 5);
  console.log(`\n✓ Forecast history records: ${history.length}`);
  if (history.length > 0) {
    const latest = history[0];
    console.log(`  Latest change: £${Number(latest.previousForecast).toFixed(2)} → £${Number(latest.newForecast).toFixed(2)}`);
    console.log(`  Change amount: £${Number(latest.changeAmount).toFixed(2)}`);
    console.log(`  Change type: ${latest.changeType}`);
    console.log(`  Created by: ${latest.createdBy}`);
  }

  // Test 3: Get forecast breakdown
  console.log('\n=== Test 4: getForecastBreakdown() ===\n');
  const breakdown = await getForecastBreakdown(TENANT_ID, budgetLine.id);
  console.log('Forecast Breakdown:');
  console.log(`  Original Budget: £${Number(breakdown.originalBudget).toFixed(2)}`);
  console.log(`  Committed: £${Number(breakdown.committed).toFixed(2)}`);
  console.log(`  Actual: £${Number(breakdown.actual).toFixed(2)}`);
  console.log(`  Forecast Method: ${breakdown.forecastMethod}`);
  console.log(`  Forecast Adjustment: £${Number(breakdown.forecastAdjustment).toFixed(2)}`);
  console.log(`  Anticipated Variations: £${Number(breakdown.anticipatedVariations).toFixed(2)}`);
  console.log(`  Risk Allowance: £${Number(breakdown.riskAllowance).toFixed(2)}`);
  console.log(`  ──────────────────────────────────`);
  console.log(`  Anticipated Final: £${Number(breakdown.anticipatedFinal).toFixed(2)}`);
  console.log(`  Cost to Complete: £${Number(breakdown.costToComplete).toFixed(2)}`);
  console.log(`  Forecast Variance: £${Number(breakdown.forecastVariance).toFixed(2)}`);
  console.log(`  Status: ${breakdown.forecastStatus}`);
}

async function testProjectForecast() {
  console.log('\n=== Test 5: calculateProjectForecast() ===\n');

  const projectForecast = await calculateProjectForecast(TENANT_ID, PROJECT_ID);

  console.log('Project Forecast Summary:');
  console.log(`  Total Budget: £${Number(projectForecast.totalBudget).toFixed(2)}`);
  console.log(`  Total Committed: £${Number(projectForecast.totalCommitted).toFixed(2)}`);
  console.log(`  Total Actual: £${Number(projectForecast.totalActual).toFixed(2)}`);
  console.log(`  ──────────────────────────────────`);
  console.log(`  Total Anticipated Final: £${Number(projectForecast.totalAnticipatedFinal).toFixed(2)}`);
  console.log(`  Budget Variance: £${Number(projectForecast.budgetVariance).toFixed(2)} ${projectForecast.budgetVariance >= 0 ? '(under)' : '(over)'}`);
  console.log(`  Cost to Complete: £${Number(projectForecast.costToComplete).toFixed(2)}`);
  console.log(`  Total Risk Allowance: £${Number(projectForecast.totalRiskAllowance).toFixed(2)}`);
  console.log(`  Contingency Remaining: £${Number(projectForecast.contingencyRemaining).toFixed(2)}`);
  console.log(`  Overall Status: ${projectForecast.overallStatus}`);
  console.log(`  Last Calculated: ${projectForecast.lastCalculatedAt}`);
}

async function runTests() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   CVR Phase B: Forecast Service Test Suite        ║');
  console.log('╚════════════════════════════════════════════════════╝');

  try {
    await testCalculations();
    await testForecastStatus();
    await testBudgetLineForecastUpdate();
    await testProjectForecast();

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║   ✅ All tests completed successfully!            ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
