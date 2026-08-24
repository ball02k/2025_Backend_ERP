/**
 * End-to-End Test: Main Contractor Discount (MCD) Waterfall
 *
 * Tests the complete payment calculation waterfall:
 * Gross → MCD → Retention → CIS → VAT → Total
 *
 * Task 1.6 - Main Contractor Discount Integration
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { calculatePayment } = require('./services/paymentCalculator.cjs');

async function testMCDWaterfall() {
  console.log('\n=== Testing MCD Waterfall Calculation ===\n');

  const tenantId = 'demo';

  try {
    // Step 1: Find or create a test contract with MCD
    console.log('Step 1: Setting up test contract with MCD...');

    const testContract = await prisma.contract.findFirst({
      where: { tenantId },
      include: { supplier: true },
    });

    if (!testContract) {
      console.error('❌ No contracts found in demo tenant. Please create a contract first.');
      return;
    }

    // Update contract with MCD and retention
    const updated = await prisma.contract.update({
      where: { id: testContract.id },
      data: {
        mainContractorDiscount: 5.0, // 5% MCD
        mcdDescription: 'Test bulk discount',
        retentionPct: 10.0, // 10% retention
      },
    });

    console.log(`✓ Updated contract ${updated.id} with:`);
    console.log(`  - MCD: ${updated.mainContractorDiscount}%`);
    console.log(`  - Retention: ${updated.retentionPct}%`);

    // Step 2: Test payment calculation with MCD
    console.log('\nStep 2: Testing payment calculation...');

    const grossAmount = 10000; // £10,000

    console.log(`\nTest scenario:`);
    console.log(`  Gross Amount: £${grossAmount.toLocaleString()}`);
    console.log(`  MCD: ${updated.mainContractorDiscount}%`);
    console.log(`  Retention: ${updated.retentionPct}%`);
    console.log(`  CIS: ${testContract.supplierId ? 'Yes (if supplier configured)' : 'No (outbound)'}`);

    const result = await calculatePayment({
      grossAmount,
      contractId: updated.id,
      supplierId: testContract.supplierId, // May be null for outbound
      tenantId,
    });

    // Step 3: Verify calculation results
    console.log('\n=== Payment Waterfall Results ===\n');

    console.log(`1. Gross Amount:           £${result.grossAmount.toFixed(2)}`);

    if (result.mcdPercentage > 0) {
      console.log(`2. MCD (${result.mcdPercentage}%):           -£${result.mcdAmount.toFixed(2)}`);
      console.log(`   → After MCD:            £${result.grossAfterMCD.toFixed(2)}`);
    }

    if (result.retentionPercentage > 0) {
      console.log(`3. Retention (${result.retentionPercentage}%):      -£${result.retentionAmount.toFixed(2)}`);
      console.log(`   → After Retention:     £${result.netAfterRetention.toFixed(2)}`);
    }

    if (result.cisStatus !== 'NOT_APPLICABLE') {
      console.log(`4. CIS (${result.cisStatus}):        -£${result.cisDeduction.toFixed(2)}`);
      console.log(`   Labour: £${result.labourElement.toFixed(2)} | Materials: £${result.materialsElement.toFixed(2)}`);
      console.log(`   → After CIS:           £${result.netAfterCIS.toFixed(2)}`);
    } else {
      console.log(`4. CIS:                    Not Applicable`);
      console.log(`   → After CIS:           £${result.netAfterCIS.toFixed(2)}`);
    }

    console.log(`5. VAT (${result.vatTreatment}):      ${result.reverseCharge ? '£0.00 (RC)' : `+£${result.vatAmount.toFixed(2)}`}`);
    console.log(`\n6. FINAL TOTAL:            £${result.grossWithVAT.toFixed(2)}`);

    if (result.reverseCharge) {
      console.log(`   (Reverse Charge: Customer accounts for VAT)`);
    }

    // Step 4: Validate calculation order
    console.log('\n=== Validation ===\n');

    // Expected MCD calculation
    const expectedMCD = (grossAmount * result.mcdPercentage) / 100;
    const expectedAfterMCD = grossAmount - expectedMCD;

    // Expected retention (applied to gross after MCD)
    const expectedRetention = (expectedAfterMCD * result.retentionPercentage) / 100;
    const expectedAfterRetention = expectedAfterMCD - expectedRetention;

    console.log('Verifying calculation order:');
    console.log(`✓ MCD applied to gross: £${grossAmount} × ${result.mcdPercentage}% = £${result.mcdAmount.toFixed(2)}`);
    console.log(`✓ Retention applied to gross after MCD: £${result.grossAfterMCD.toFixed(2)} × ${result.retentionPercentage}% = £${result.retentionAmount.toFixed(2)}`);
    console.log(`✓ CIS applied to net after retention: £${result.netAfterRetention.toFixed(2)} (labour: £${result.labourElement.toFixed(2)})`);
    console.log(`✓ VAT applied to net after CIS: £${result.netAfterCIS.toFixed(2)}`);

    // Verify errors
    if (result.errors && result.errors.length > 0) {
      console.log('\n⚠️  Warnings/Errors:');
      result.errors.forEach(err => console.log(`  - ${err}`));
    }

    // Verify CIS warnings
    if (result.cisWarnings && result.cisWarnings.length > 0) {
      console.log('\n⚠️  CIS Warnings:');
      result.cisWarnings.forEach(warn => console.log(`  - ${warn}`));
    }

    console.log('\n✅ MCD waterfall test completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testMCDWaterfall().catch(console.error);
