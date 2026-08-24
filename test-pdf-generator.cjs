/**
 * Test Script for PDF Generator
 *
 * Tests the PDF generator by:
 * 1. Creating sample payment application data
 * 2. Generating a PDF with all sections
 * 3. Testing with variations and certification
 * 4. Testing with watermark
 * 5. Verifying output file is created
 */

const fs = require('fs');
const path = require('path');

async function testPdfGenerator() {
  try {
    console.log('🧪 Testing PDF Generator\n');
    console.log('='.repeat(60));

    // Import PDF generator
    const { generatePdf } = require('./dist/services/export/generators/pdfGenerator');

    // Step 1: Create sample payment application data
    console.log('\n📋 Step 1: Creating sample payment application data...');

    const sampleData = {
      header: {
        applicationNumber: 5,
        applicationRef: 'APP-2025-005',
        projectName: 'Riverside Commercial Development',
        projectRef: 'RCD-2025',
        contractRef: 'CON-RCD-001',
        periodStart: new Date('2025-11-01'),
        periodEnd: new Date('2025-11-30'),
        valuationDate: new Date('2025-12-01'),
        contractor: {
          name: 'BuildCo Construction Ltd',
          address: '123 Builder Street, London, SW1A 1AA',
        },
        employer: {
          name: 'Property Developments PLC',
          address: '456 Commerce Road, London, EC1A 1BB',
        },
      },
      lines: [
        {
          lineNumber: 1,
          reference: 'A.01',
          description: 'Preliminaries and General Conditions',
          contractValue: 150000,
          previousPercentage: 0.8,
          previousCumulative: 120000,
          thisPercentage: 0.1,
          thisPeriod: 15000,
          cumulativePercentage: 0.9,
          currentCumulative: 135000,
          remaining: 15000,
        },
        {
          lineNumber: 2,
          reference: 'B.01',
          description: 'Demolitions and Site Clearance',
          contractValue: 75000,
          previousPercentage: 1.0,
          previousCumulative: 75000,
          thisPercentage: 0.0,
          thisPeriod: 0,
          cumulativePercentage: 1.0,
          currentCumulative: 75000,
          remaining: 0,
        },
        {
          lineNumber: 3,
          reference: 'C.01',
          description: 'Excavation and Earthworks',
          contractValue: 200000,
          previousPercentage: 0.6,
          previousCumulative: 120000,
          thisPercentage: 0.3,
          thisPeriod: 60000,
          cumulativePercentage: 0.9,
          currentCumulative: 180000,
          remaining: 20000,
        },
        {
          lineNumber: 4,
          reference: 'D.01',
          description: 'Concrete Works - Foundations',
          contractValue: 350000,
          previousPercentage: 0.4,
          previousCumulative: 140000,
          thisPercentage: 0.35,
          thisPeriod: 122500,
          cumulativePercentage: 0.75,
          currentCumulative: 262500,
          remaining: 87500,
        },
        {
          lineNumber: 5,
          reference: 'E.01',
          description: 'Structural Steelwork',
          contractValue: 500000,
          previousPercentage: 0.0,
          previousCumulative: 0,
          thisPercentage: 0.25,
          thisPeriod: 125000,
          cumulativePercentage: 0.25,
          currentCumulative: 125000,
          remaining: 375000,
        },
      ],
      variations: [
        {
          variationNumber: 1,
          reference: 'V001',
          description: 'Additional drainage works required by client',
          value: 25000,
          previousCumulative: 0,
          thisPeriod: 12500,
          currentCumulative: 12500,
        },
        {
          variationNumber: 2,
          reference: 'V002',
          description: 'Design change - enhanced entrance lobby',
          value: 18000,
          previousCumulative: 0,
          thisPeriod: 18000,
          currentCumulative: 18000,
        },
      ],
      summary: {
        grossThisPeriod: 322500,
        materialsOnSite: 15000,
        totalThisPeriod: 337500,
        previousCumulative: 455000,
        currentCumulative: 792500,
        retentionThisPeriod: 16875,
        retentionCumulative: 39625,
        mcdThisPeriod: 8437.5,
        mcdCumulative: 19812.5,
        netThisPeriod: 312187.5,
        previousPayments: 395562.5,
        amountDue: 337062.5,
      },
      certification: {
        certifiedAmount: 337062.5,
        certifiedDate: new Date('2025-12-01'),
        certifiedBy: 'John Smith MRICS',
        varianceNotes: 'Certified as accurate and in accordance with contract terms.',
      },
    };

    console.log('  ✓ Sample data created');
    console.log(`    - Lines: ${sampleData.lines.length}`);
    console.log(`    - Variations: ${sampleData.variations.length}`);
    console.log(`    - Amount Due: £${sampleData.summary.amountDue.toLocaleString('en-GB')}`);

    // Step 2: Create template configuration
    console.log('\n⚙️  Step 2: Creating template configuration...');

    const config = {
      name: 'Standard Payment Application',
      version: '1.0',
      sections: {
        header: true,
        lines: true,
        variations: true,
        dayworks: false,
        summary: true,
        certification: true,
      },
      pdf: {
        pageSize: 'A4',
        orientation: 'portrait',
        margins: { top: 50, right: 50, bottom: 50, left: 50 },
        currencySymbol: '£',
        footerText: 'Generated by Construction ERP System',
      },
      branding: {
        primaryColor: '#1e3a5f',
        secondaryColor: '#4a5568',
      },
    };

    console.log('  ✓ Configuration created');

    // Step 3: Generate PDF without watermark
    console.log('\n📄 Step 3: Generating PDF (without watermark)...');

    const result1 = await generatePdf(sampleData, config);

    console.log('  ✓ PDF generated successfully');
    console.log(`    - Buffer size: ${(result1.buffer.length / 1024).toFixed(2)} KB`);
    console.log(`    - MIME type: ${result1.mimeType}`);

    const outputPath1 = path.join(__dirname, 'test-pdf-output-standard.pdf');
    fs.writeFileSync(outputPath1, result1.buffer);
    console.log(`  ✓ PDF saved: ${outputPath1}`);

    // Step 4: Generate PDF with watermark
    console.log('\n🏷️  Step 4: Generating PDF (with watermark)...');

    const optionsWithWatermark = {
      watermark: 'DRAFT',
    };

    const result2 = await generatePdf(sampleData, config, optionsWithWatermark);

    console.log('  ✓ PDF with watermark generated');
    console.log(`    - Buffer size: ${(result2.buffer.length / 1024).toFixed(2)} KB`);

    const outputPath2 = path.join(__dirname, 'test-pdf-output-draft.pdf');
    fs.writeFileSync(outputPath2, result2.buffer);
    console.log(`  ✓ PDF saved: ${outputPath2}`);

    // Step 5: Generate PDF without certification
    console.log('\n📝 Step 5: Generating PDF (without certification)...');

    const dataNoCert = { ...sampleData };
    delete dataNoCert.certification;

    const configNoCert = {
      ...config,
      sections: {
        ...config.sections,
        certification: false,
      },
    };

    const result3 = await generatePdf(dataNoCert, configNoCert);

    console.log('  ✓ PDF without certification generated');
    console.log(`    - Buffer size: ${(result3.buffer.length / 1024).toFixed(2)} KB`);

    const outputPath3 = path.join(__dirname, 'test-pdf-output-no-cert.pdf');
    fs.writeFileSync(outputPath3, result3.buffer);
    console.log(`  ✓ PDF saved: ${outputPath3}`);

    // Step 6: Generate PDF with many line items (test pagination)
    console.log('\n📊 Step 6: Generating PDF (with many line items for pagination test)...');

    const manyLines = [];
    for (let i = 1; i <= 50; i++) {
      manyLines.push({
        lineNumber: i,
        reference: `L${i.toString().padStart(3, '0')}`,
        description: `Line item ${i} - Test description for pagination`,
        contractValue: 10000 + i * 1000,
        previousPercentage: 0.5,
        previousCumulative: (10000 + i * 1000) * 0.5,
        thisPercentage: 0.3,
        thisPeriod: (10000 + i * 1000) * 0.3,
        cumulativePercentage: 0.8,
        currentCumulative: (10000 + i * 1000) * 0.8,
        remaining: (10000 + i * 1000) * 0.2,
      });
    }

    const dataManyLines = {
      ...sampleData,
      lines: manyLines,
    };

    const result4 = await generatePdf(dataManyLines, config);

    console.log('  ✓ PDF with many lines generated');
    console.log(`    - Buffer size: ${(result4.buffer.length / 1024).toFixed(2)} KB`);
    console.log(`    - Line items: ${manyLines.length}`);

    const outputPath4 = path.join(__dirname, 'test-pdf-output-pagination.pdf');
    fs.writeFileSync(outputPath4, result4.buffer);
    console.log(`  ✓ PDF saved: ${outputPath4}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ All PDF generator tests completed successfully!');
    console.log('='.repeat(60));
    console.log('\n📄 Generated PDF files:');
    console.log(`   1. ${outputPath1}`);
    console.log(`   2. ${outputPath2}`);
    console.log(`   3. ${outputPath3}`);
    console.log(`   4. ${outputPath4}`);
    console.log('\n💡 Open these files to verify the PDF output is correct.');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    throw error;
  }
}

// Run the test
testPdfGenerator()
  .then(() => {
    console.log('\n✓ Test script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Test script failed:', error);
    process.exit(1);
  });
