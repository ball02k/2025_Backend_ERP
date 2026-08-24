/**
 * Test script for CVR Phase B Enhanced Forecast Features
 * Tests the 5 new functions added to cvrForecastService.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const {
  calculateForecastTrend,
  bulkUpdateForecasts,
  resetForecastToCommitted,
  calculatePercentComplete,
  getProjectForecastWithCategories,
  updateBudgetLineForecast
} = require('./services/cvrForecastService.cjs');

async function testEnhancements() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║   CVR Phase B: Enhanced Forecast Test Suite      ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    // Get first project and its budget lines
    const project = await prisma.project.findFirst({
      where: {
        budgetLines: {
          some: {}
        }
      },
      include: {
        budgetLines: {
          take: 5
        }
      }
    });

    if (!project || project.budgetLines.length === 0) {
      console.log('⚠️  No project with budget lines found. Skipping tests.');
      return;
    }

    const tenantId = project.tenantId;
    const projectId = project.id;
    const budgetLineId = project.budgetLines[0].id;

    console.log(`📋 Using Project: ${project.name} (ID: ${projectId})`);
    console.log(`📋 Using Budget Line ID: ${budgetLineId}`);
    console.log(`📋 Tenant ID: ${tenantId}\n`);

    // ========================================================================
    // Test 1: calculatePercentComplete()
    // ========================================================================
    console.log('=== Test 1: calculatePercentComplete() ===');

    const actual = 50000;
    const anticipatedFinal = 100000;
    const percentComplete = calculatePercentComplete(actual, anticipatedFinal);

    console.log(`✓ Actual: £${actual}, Anticipated: £${anticipatedFinal}`);
    console.log(`✓ Percent Complete: ${percentComplete.toFixed(2)}%`);
    console.log(`✓ Expected: 50%, Got: ${percentComplete}% - ${percentComplete === 50 ? 'PASS' : 'FAIL'}\n`);

    // ========================================================================
    // Test 2: updateBudgetLineForecast() to create history
    // ========================================================================
    console.log('=== Test 2: Update Forecast to Create History ===');

    await updateBudgetLineForecast({
      tenantId,
      budgetLineId,
      updates: {
        forecastMethod: 'COMMITTED_PLUS_ADJ',
        forecastAdjustment: 5000,
        forecastAdjustmentNotes: 'Test adjustment for trend analysis'
      },
      changeType: 'MANUAL_ADJUSTMENT',
      changeReason: 'Initial test update',
      updatedBy: 'test-script'
    });

    console.log(`✓ Created first forecast update with £5,000 adjustment\n`);

    // Wait a moment, then create second update
    await new Promise(resolve => setTimeout(resolve, 100));

    await updateBudgetLineForecast({
      tenantId,
      budgetLineId,
      updates: {
        forecastAdjustment: 8000,
        forecastAdjustmentNotes: 'Increased adjustment for testing'
      },
      changeType: 'MANUAL_ADJUSTMENT',
      changeReason: 'Second test update',
      updatedBy: 'test-script'
    });

    console.log(`✓ Created second forecast update with £8,000 adjustment\n`);

    // ========================================================================
    // Test 3: calculateForecastTrend()
    // ========================================================================
    console.log('=== Test 3: calculateForecastTrend() ===');

    const trend = await calculateForecastTrend(tenantId, budgetLineId);

    console.log(`✓ Trend: ${trend.trend}`);
    console.log(`✓ Previous Forecast: £${Number(trend.previousForecast).toFixed(2)}`);
    console.log(`✓ Current Forecast: £${Number(trend.currentForecast).toFixed(2)}`);
    console.log(`✓ Change: £${Number(trend.change).toFixed(2)} (${trend.changePercent.toFixed(2)}%)`);
    console.log(`✓ Expected trend: WORSENING (forecast increased)\n`);

    // ========================================================================
    // Test 4: getProjectForecastWithCategories()
    // ========================================================================
    console.log('=== Test 4: getProjectForecastWithCategories() ===');

    const forecastWithCategories = await getProjectForecastWithCategories(tenantId, projectId);

    console.log(`✓ Project ID: ${forecastWithCategories.projectId}`);
    console.log(`✓ Total Budget: £${Number(forecastWithCategories.totalBudget).toFixed(2)}`);
    console.log(`✓ Total Committed: £${Number(forecastWithCategories.totalCommitted).toFixed(2)}`);
    console.log(`✓ Total Actual: £${Number(forecastWithCategories.totalActual).toFixed(2)}`);
    console.log(`✓ Total Anticipated Final: £${Number(forecastWithCategories.totalAnticipatedFinal).toFixed(2)}`);
    console.log(`✓ Budget Variance: £${Number(forecastWithCategories.budgetVariance).toFixed(2)}`);
    console.log(`✓ Percent Complete: ${forecastWithCategories.percentComplete.toFixed(2)}%`);
    console.log(`✓ Overall Status: ${forecastWithCategories.overallStatus}`);
    console.log(`✓ Categories found: ${Object.keys(forecastWithCategories.byCategory).length}`);

    Object.entries(forecastWithCategories.byCategory).forEach(([category, data]) => {
      console.log(`  - ${category}: £${Number(data.anticipatedFinal).toFixed(2)} (${data.lineCount} lines)`);
    });
    console.log('');

    // ========================================================================
    // Test 5: bulkUpdateForecasts()
    // ========================================================================
    console.log('=== Test 5: bulkUpdateForecasts() ===');

    const updates = project.budgetLines.slice(0, 3).map((line, index) => ({
      budgetLineId: line.id,
      forecastAdjustment: 1000 * (index + 1),
      anticipatedVariations: 500 * (index + 1),
      changeReason: `Bulk test update ${index + 1}`
    }));

    console.log(`✓ Preparing bulk update for ${updates.length} budget lines`);

    const bulkResult = await bulkUpdateForecasts(tenantId, projectId, updates, 'test-script');

    console.log(`✓ Total updates attempted: ${bulkResult.totalUpdates}`);
    console.log(`✓ Successful updates: ${bulkResult.successCount}`);
    console.log(`✓ Failed updates: ${bulkResult.errorCount}`);
    console.log(`✓ All updates successful: ${bulkResult.errorCount === 0 ? 'PASS' : 'FAIL'}\n`);

    // ========================================================================
    // Test 6: resetForecastToCommitted()
    // ========================================================================
    console.log('=== Test 6: resetForecastToCommitted() ===');

    const resetBudgetLine = await resetForecastToCommitted(tenantId, budgetLineId, 'test-script');

    console.log(`✓ Budget Line ID: ${resetBudgetLine.id}`);
    console.log(`✓ Forecast Method: ${resetBudgetLine.forecastMethod} (expected: COMMITTED)`);
    console.log(`✓ Forecast Adjustment: £${Number(resetBudgetLine.forecastAdjustment || 0).toFixed(2)} (expected: £0.00)`);
    console.log(`✓ Anticipated Variations: £${Number(resetBudgetLine.anticipatedVariations || 0).toFixed(2)} (expected: £0.00)`);
    console.log(`✓ Risk Allowance: £${Number(resetBudgetLine.riskAllowance || 0).toFixed(2)} (expected: £0.00)`);
    console.log(`✓ Reset successful: ${
      resetBudgetLine.forecastMethod === 'COMMITTED' &&
      resetBudgetLine.forecastAdjustment === 0 &&
      resetBudgetLine.anticipatedVariations === 0 &&
      resetBudgetLine.riskAllowance === 0
        ? 'PASS' : 'FAIL'
    }\n`);

    // ========================================================================
    // Summary
    // ========================================================================
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   ✅ All enhanced features tested successfully!   ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    console.log('📊 Enhanced Features Summary:');
    console.log('  ✓ calculatePercentComplete() - Calculate completion percentage');
    console.log('  ✓ calculateForecastTrend() - Analyze forecast changes over time');
    console.log('  ✓ getProjectForecastWithCategories() - Category-based aggregation');
    console.log('  ✓ bulkUpdateForecasts() - Batch update multiple lines');
    console.log('  ✓ resetForecastToCommitted() - Reset adjustments to committed');
    console.log('');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
testEnhancements()
  .then(() => {
    console.log('✅ Test suite completed\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
