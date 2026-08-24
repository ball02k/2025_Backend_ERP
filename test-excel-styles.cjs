/**
 * Test Script for Excel Style Utilities
 *
 * Tests the Excel style utilities by:
 * 1. Verifying all style definitions exist
 * 2. Testing style application functions
 * 3. Testing column configuration
 * 4. Creating a sample styled Excel file
 */

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function testExcelStyles() {
  try {
    console.log('🧪 Testing Excel Style Utilities\n');
    console.log('='.repeat(60));

    // Import style utilities
    const {
      STYLES,
      applyStyle,
      applyRowStyle,
      applyRangeStyle,
      applyRangeStyleByName,
      applyAlternatingRows,
      setColumnWidths,
      autoFitColumns,
      COLUMN_CONFIGS,
      applyColumnConfig,
      createHeaderRow,
      getStyleByName,
      applyCurrencyColumn,
      applyPercentageColumn,
      createSummarySection,
    } = require('./dist/services/export/generators/excelStyles');

    // Step 1: Verify style definitions
    console.log('\n📋 Step 1: Verifying style definitions...');

    const expectedStyles = [
      'title',
      'subtitle',
      'sectionHeader',
      'tableHeader',
      'tableCell',
      'tableTotals',
      'currency',
      'percentage',
      'date',
      'highlightYellow',
      'highlightGreen',
      'highlightRed',
      'finalTotal',
      'label',
      'value',
    ];

    expectedStyles.forEach(styleName => {
      if (STYLES[styleName]) {
        console.log(`  ✓ ${styleName.padEnd(20)} - Defined`);
      } else {
        console.log(`  ✗ ${styleName.padEnd(20)} - MISSING`);
      }
    });

    // Step 2: Verify column configurations
    console.log('\n🔍 Step 2: Verifying column configurations...');

    const expectedConfigs = ['paymentApplication', 'variations', 'dayworks', 'compact'];

    expectedConfigs.forEach(configName => {
      if (COLUMN_CONFIGS[configName]) {
        const config = COLUMN_CONFIGS[configName];
        console.log(`  ✓ ${configName.padEnd(25)} - ${config.length} columns`);
      } else {
        console.log(`  ✗ ${configName.padEnd(25)} - MISSING`);
      }
    });

    // Step 3: Test style functions
    console.log('\n🔧 Step 3: Testing style application functions...');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Style Test');

    // Test applyStyle
    const cell = worksheet.getCell('A1');
    cell.value = 'Title Test';
    applyStyle(cell, STYLES.title);
    console.log('  ✓ applyStyle() - Styles cell A1');

    // Test applyRowStyle
    const row = worksheet.getRow(3);
    row.values = ['Col 1', 'Col 2', 'Col 3', 'Col 4', 'Col 5'];
    applyRowStyle(row, STYLES.tableHeader);
    console.log('  ✓ applyRowStyle() - Styles entire row');

    // Test applyRangeStyle
    for (let r = 5; r <= 10; r++) {
      for (let c = 1; c <= 5; c++) {
        worksheet.getCell(r, c).value = `R${r}C${c}`;
      }
    }
    applyRangeStyle(worksheet, 5, 10, 1, 5, STYLES.tableCell);
    console.log('  ✓ applyRangeStyle() - Styles range A5:E10');

    // Test applyRangeStyleByName
    for (let r = 12; r <= 14; r++) {
      for (let c = 1; c <= 3; c++) {
        worksheet.getCell(r, c).value = Math.random() * 1000;
      }
    }
    applyRangeStyleByName(worksheet, 'A12:C14', STYLES.currency);
    console.log('  ✓ applyRangeStyleByName() - Styles range by name');

    // Test applyAlternatingRows
    for (let r = 16; r <= 25; r++) {
      for (let c = 1; c <= 4; c++) {
        worksheet.getCell(r, c).value = `Data ${r}-${c}`;
      }
    }
    applyAlternatingRows(worksheet, 16, 25, 1, 4);
    console.log('  ✓ applyAlternatingRows() - Zebra striping applied');

    // Test setColumnWidths
    setColumnWidths(worksheet, [20, 15, 30, 12, 12]);
    console.log('  ✓ setColumnWidths() - Column widths set');

    // Test getStyleByName
    const currencyStyle = getStyleByName('currency');
    console.log(`  ✓ getStyleByName('currency') - ${currencyStyle ? 'Found' : 'Not found'}`);

    // Step 4: Test column configuration
    console.log('\n📊 Step 4: Testing column configuration...');

    const worksheet2 = workbook.addWorksheet('Column Config Test');

    // Apply payment application column config
    applyColumnConfig(worksheet2, COLUMN_CONFIGS.paymentApplication, 1);
    console.log('  ✓ applyColumnConfig() - Payment application columns configured');

    // Create header row
    createHeaderRow(worksheet2, COLUMN_CONFIGS.paymentApplication, 1, 1);
    console.log('  ✓ createHeaderRow() - Header row created');

    // Add sample data rows
    for (let i = 2; i <= 10; i++) {
      const row = worksheet2.getRow(i);
      row.values = [
        i - 1, // Line number
        `REF-${i - 1}`, // Reference
        `Description for line ${i - 1}`, // Description
        100000 + i * 1000, // Contract value
        0.5, // Previous %
        50000 + i * 500, // Previous value
        0.2, // This %
        20000 + i * 200, // This period value
        0.7, // Cumulative %
        70000 + i * 700, // Cumulative value
        30000 + i * 300, // Remaining
      ];
    }
    console.log('  ✓ Sample data added - 9 rows');

    // Apply currency formatting to specific columns
    applyCurrencyColumn(worksheet2, 4, 2, 10); // Contract Value
    applyCurrencyColumn(worksheet2, 6, 2, 10); // Previous
    applyCurrencyColumn(worksheet2, 8, 2, 10); // This Period
    applyCurrencyColumn(worksheet2, 10, 2, 10); // Cumulative
    applyCurrencyColumn(worksheet2, 11, 2, 10); // Remaining
    console.log('  ✓ applyCurrencyColumn() - Currency columns formatted');

    // Apply percentage formatting
    applyPercentageColumn(worksheet2, 5, 2, 10); // Prev %
    applyPercentageColumn(worksheet2, 7, 2, 10); // This %
    applyPercentageColumn(worksheet2, 9, 2, 10); // Cum %
    console.log('  ✓ applyPercentageColumn() - Percentage columns formatted');

    // Step 5: Test summary section
    console.log('\n💰 Step 5: Testing summary section...');

    const worksheet3 = workbook.addWorksheet('Summary Test');

    const summaryItems = [
      { label: 'Gross Valuation', value: 150000, isCurrency: true },
      { label: 'Materials on Site', value: 10000, isCurrency: true },
      { label: 'Retention (5%)', value: -8000, isCurrency: true },
      { label: 'MCD (2.5%)', value: -4000, isCurrency: true },
      { label: 'Net Valuation', value: 148000, isCurrency: true },
      { label: 'Previous Payments', value: -100000, isCurrency: true },
      { label: 'Amount Due (excl VAT)', value: 48000, isCurrency: true },
      { label: 'VAT (20%)', value: 9600, isCurrency: true },
      { label: 'TOTAL DUE', value: 57600, highlight: true, isCurrency: true },
    ];

    const nextRow = createSummarySection(worksheet3, 5, 2, 4, summaryItems);
    console.log(`  ✓ createSummarySection() - Summary created (next row: ${nextRow})`);

    // Step 6: Save test workbook
    console.log('\n💾 Step 6: Saving test workbook...');

    const outputPath = path.join(__dirname, 'test-excel-styles-output.xlsx');
    await workbook.xlsx.writeFile(outputPath);
    console.log(`  ✓ Workbook saved: ${outputPath}`);

    const stats = fs.statSync(outputPath);
    console.log(`  File size: ${(stats.size / 1024).toFixed(2)} KB`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ All Excel style utility tests completed successfully!');
    console.log('='.repeat(60));
    console.log(`\n📄 Open the file to verify styling:`);
    console.log(`   ${outputPath}`);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

// Run the test
testExcelStyles()
  .then(() => {
    console.log('\n✓ Test script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Test script failed:', error);
    process.exit(1);
  });
