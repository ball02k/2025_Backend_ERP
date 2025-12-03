/**
 * Test Script for Contract OCR Service
 *
 * Usage:
 *   node scripts/test-contract-ocr.cjs <path-to-contract-pdf>
 *
 * Example:
 *   node scripts/test-contract-ocr.cjs ./sample-contract.pdf
 */

const fs = require('fs');
const path = require('path');
const { contractOcrService } = require('../services/contractOcr.cjs');

async function testContractOcr() {
  // Get PDF path from command line argument
  const pdfPath = process.argv[2];

  if (!pdfPath) {
    console.error('❌ Error: Please provide a path to a contract PDF');
    console.error('Usage: node scripts/test-contract-ocr.cjs <path-to-contract-pdf>');
    process.exit(1);
  }

  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ Error: File not found: ${pdfPath}`);
    process.exit(1);
  }

  console.log('📄 Testing Contract OCR Service');
  console.log('================================\n');
  console.log(`📂 Input file: ${pdfPath}`);
  console.log(`📏 File size: ${(fs.statSync(pdfPath).size / 1024).toFixed(2)} KB\n`);

  try {
    // Read PDF file
    const fileBuffer = fs.readFileSync(pdfPath);

    // Extract metadata
    console.log('🔍 Extracting contract metadata...\n');
    const result = await contractOcrService.extractContractMetadata(fileBuffer, 999);

    if (result.success) {
      console.log('✅ OCR Extraction Successful!\n');

      // Display overall results
      console.log('📊 Overall Results');
      console.log('==================');
      console.log(`Overall Confidence: ${(result.overallConfidence * 100).toFixed(1)}%`);
      console.log(`Raw Text Length: ${result.rawText.length} characters\n`);

      // Display extracted fields
      console.log('📋 Extracted Fields');
      console.log('===================\n');

      const fields = [
        { key: 'contractValue', label: 'Contract Value', format: (v) => `£${v.toLocaleString()}` },
        { key: 'supplierName', label: 'Supplier Name', format: (v) => v },
        { key: 'clientName', label: 'Client Name', format: (v) => v },
        { key: 'startDate', label: 'Start Date', format: (v) => v },
        { key: 'endDate', label: 'End Date', format: (v) => v },
        { key: 'retentionPercent', label: 'Retention %', format: (v) => `${v}%` },
        { key: 'defectsLiabilityPeriod', label: 'Defects Liability', format: (v) => `${v} months` },
        { key: 'contractType', label: 'Contract Type', format: (v) => v },
        { key: 'paymentTerms', label: 'Payment Terms', format: (v) => `${v} days` },
        { key: 'liquidatedDamages', label: 'Liquidated Damages', format: (v) => `£${v.toLocaleString()}` },
      ];

      for (const field of fields) {
        const data = result.extracted[field.key];
        if (data && data.value !== null) {
          console.log(`${field.label}:`);
          console.log(`  Value: ${field.format(data.value)}`);
          console.log(`  Confidence: ${(data.confidence * 100).toFixed(1)}%`);
          console.log(`  Source: "${data.source.substring(0, 80)}..."`);
          console.log('');
        } else {
          console.log(`${field.label}: Not found`);
          console.log('');
        }
      }

      // Display raw text sample
      console.log('📝 Raw Text Sample (first 500 characters)');
      console.log('=========================================');
      console.log(result.rawText.substring(0, 500));
      if (result.rawText.length > 500) {
        console.log('...\n');
      }

      // Save full results to JSON file
      const outputPath = path.join(
        path.dirname(pdfPath),
        `${path.basename(pdfPath, '.pdf')}-ocr-results.json`
      );

      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\n💾 Full results saved to: ${outputPath}`);

    } else {
      console.error('❌ OCR Extraction Failed!');
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Test Error:', error);
    process.exit(1);
  }
}

// Run the test
testContractOcr()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
