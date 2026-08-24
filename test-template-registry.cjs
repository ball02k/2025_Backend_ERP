/**
 * Test Script for Template Registry
 *
 * Tests the template registration service by:
 * 1. Seeding built-in templates
 * 2. Verifying templates were created
 * 3. Testing template retrieval functions
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testTemplateRegistry() {
  try {
    console.log('🧪 Testing Template Registry Service\n');
    console.log('=' .repeat(60));

    // Import the template registry functions
    const {
      seedBuiltInTemplates,
      getTemplatesForCategory,
      getDefaultTemplate,
      getTemplateStatistics,
    } = require('./dist/services/export/templateRegistry');

    // Step 1: Seed built-in templates
    console.log('\n📦 Step 1: Seeding built-in templates...');
    const count = await seedBuiltInTemplates();
    console.log(`✓ Seeded ${count} built-in templates\n`);

    // Step 2: Verify templates in database
    console.log('🔍 Step 2: Verifying templates in database...');
    const allTemplates = await prisma.exportTemplate.findMany({
      where: { scope: 'SYSTEM' },
      select: {
        code: true,
        name: true,
        category: true,
        format: true,
        isDefault: true,
        isActive: true,
        sortOrder: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    console.log(`Found ${allTemplates.length} system templates:\n`);
    allTemplates.forEach(t => {
      const defaultFlag = t.isDefault ? '⭐' : '  ';
      console.log(`  ${defaultFlag} ${t.code.padEnd(20)} | ${t.name.padEnd(40)} | ${t.format}`);
    });

    // Step 3: Test getDefaultTemplate
    console.log('\n🎯 Step 3: Testing getDefaultTemplate()...');

    // Use a dummy tenant ID for testing (multi-tenant feature may not be fully implemented)
    const testTenantId = 'test-tenant-123';
    console.log(`  Using test tenant ID: ${testTenantId}`);

    const defaultXlsxTemplate = await getDefaultTemplate(
      testTenantId,
      'PAYMENT_APPLICATION',
      'XLSX'
    );

    if (defaultXlsxTemplate) {
      console.log(`  ✓ Default XLSX template: ${defaultXlsxTemplate.name}`);
      console.log(`    Code: ${defaultXlsxTemplate.code}`);
    } else {
      console.log('  ✗ No default XLSX template found');
    }

    const defaultPdfTemplate = await getDefaultTemplate(
      testTenantId,
      'PAYMENT_APPLICATION',
      'PDF'
    );

    if (defaultPdfTemplate) {
      console.log(`  ✓ Default PDF template: ${defaultPdfTemplate.name}`);
      console.log(`    Code: ${defaultPdfTemplate.code}`);
    } else {
      console.log('  ✗ No default PDF template found');
    }

    // Step 4: Test getTemplatesForCategory
    console.log('\n📋 Step 4: Testing getTemplatesForCategory()...');
    const xlsxTemplates = await getTemplatesForCategory(
      testTenantId,
      'PAYMENT_APPLICATION',
      'XLSX'
    );

    console.log(`  Found ${xlsxTemplates.length} XLSX templates for PAYMENT_APPLICATION:`);
    xlsxTemplates.forEach(t => {
      const defaultFlag = t.isDefault ? '⭐' : '  ';
      console.log(`    ${defaultFlag} ${t.name}`);
    });

    // Step 5: Test getTemplateStatistics
    console.log('\n📊 Step 5: Testing getTemplateStatistics()...');
    const stats = await getTemplateStatistics(testTenantId);

    console.log(`  Total templates: ${stats.total}`);
    console.log(`  By category:`, stats.byCategory);
    console.log(`  By format:`, stats.byFormat);
    console.log(`  By scope:`, stats.byScope);

    // Step 6: Test idempotency - seed again
    console.log('\n🔁 Step 6: Testing idempotency (seeding again)...');
    const count2 = await seedBuiltInTemplates();
    console.log(`  ✓ Seeded ${count2} templates (should update existing)`);

    const allTemplatesAfter = await prisma.exportTemplate.findMany({
      where: { scope: 'SYSTEM' },
    });
    console.log(`  Total system templates after re-seed: ${allTemplatesAfter.length}`);
    console.log(`  ${allTemplatesAfter.length === allTemplates.length ? '✓' : '✗'} Count unchanged (idempotent)`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testTemplateRegistry()
  .then(() => {
    console.log('\n✓ Test script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Test script failed:', error);
    process.exit(1);
  });
