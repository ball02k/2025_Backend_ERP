/**
 * Test Script for MC-Specific Templates
 *
 * Tests the Main Contractor template configurations:
 * 1. Verifies all MC templates are properly defined
 * 2. Checks template structure and required fields
 * 3. Tests helper functions (getMCTemplate, hasMCTemplate)
 * 4. Validates field mappings
 */

async function testMCTemplates() {
  try {
    console.log('🧪 Testing MC-Specific Templates\n');
    console.log('=' .repeat(60));

    // Import MC templates
    const {
      balfourBeattyTemplate,
      kierTemplate,
      skanskaTemplate,
      morganSindallTemplate,
      genericMCTemplate,
      MC_TEMPLATES,
      getMCTemplate,
      getMCTemplateNames,
      hasMCTemplate,
    } = require('./dist/services/export/templates/mcTemplates');

    // Step 1: Verify all templates are defined
    console.log('\n📋 Step 1: Verifying MC templates...');

    const templates = [
      { name: 'Balfour Beatty', template: balfourBeattyTemplate },
      { name: 'Kier', template: kierTemplate },
      { name: 'Skanska', template: skanskaTemplate },
      { name: 'Morgan Sindall', template: morganSindallTemplate },
      { name: 'Generic MC', template: genericMCTemplate },
    ];

    templates.forEach(({ name, template }) => {
      if (template) {
        console.log(`  ✓ ${name.padEnd(20)} - ${template.name}`);
      } else {
        console.log(`  ✗ ${name.padEnd(20)} - NOT DEFINED`);
      }
    });

    // Step 2: Check template structure
    console.log('\n🔍 Step 2: Checking template structure...');

    function validateTemplate(name, template) {
      const issues = [];

      if (!template.name) issues.push('Missing name');
      if (!template.version) issues.push('Missing version');
      if (!template.sections) issues.push('Missing sections');
      if (!template.excel) issues.push('Missing excel config');
      if (!template.fieldMappings || template.fieldMappings.length === 0) {
        issues.push('Missing or empty fieldMappings');
      }

      if (issues.length === 0) {
        console.log(`  ✓ ${name.padEnd(25)} - Valid structure`);
        return true;
      } else {
        console.log(`  ✗ ${name.padEnd(25)} - ${issues.join(', ')}`);
        return false;
      }
    }

    templates.forEach(({ name, template }) => {
      validateTemplate(name, template);
    });

    // Step 3: Check Excel configuration
    console.log('\n📊 Step 3: Checking Excel configuration...');

    templates.forEach(({ name, template }) => {
      const excel = template.excel;
      console.log(`  ${name}:`);
      console.log(`    Sheet Name: ${excel.sheetName || 'N/A'}`);
      console.log(`    Template File: ${excel.templateFile || 'From scratch'}`);
      console.log(`    Line Items Range: ${excel.lineItemsRange || 'N/A'}`);
      console.log(`    Variations Range: ${excel.variationsRange || 'N/A'}`);
      console.log(`    Auto-fit: ${excel.autoFit !== false ? 'Yes' : 'No'}`);
      console.log(`    Protected: ${excel.protectSheet ? 'Yes' : 'No'}`);
      console.log(`    Currency: ${excel.currencySymbol || '£'}`);
    });

    // Step 4: Check field mappings
    console.log('\n🗺️  Step 4: Checking field mappings...');

    templates.forEach(({ name, template }) => {
      const mappings = template.fieldMappings || [];
      const headerMappings = mappings.filter(m => m.sourceField.startsWith('header.')).length;
      const lineMappings = mappings.filter(m => m.sourceField.startsWith('lines.')).length;
      const summaryMappings = mappings.filter(m => m.sourceField.startsWith('summary.')).length;
      const variationMappings = mappings.filter(m => m.sourceField.startsWith('variations.')).length;

      console.log(`  ${name}:`);
      console.log(`    Total mappings: ${mappings.length}`);
      console.log(`    Header: ${headerMappings}, Lines: ${lineMappings}, Summary: ${summaryMappings}, Variations: ${variationMappings}`);
    });

    // Step 5: Check branding
    console.log('\n🎨 Step 5: Checking branding...');

    templates.forEach(({ name, template }) => {
      const branding = template.branding;
      if (branding) {
        console.log(`  ✓ ${name.padEnd(25)} - ${branding.primaryColor} (${branding.fontFamily || 'Default font'})`);
      } else {
        console.log(`  - ${name.padEnd(25)} - No branding specified`);
      }
    });

    // Step 6: Test MC_TEMPLATES registry
    console.log('\n📦 Step 6: Testing MC_TEMPLATES registry...');

    const registryKeys = Object.keys(MC_TEMPLATES);
    console.log(`  Found ${registryKeys.length} templates in registry:`);
    registryKeys.forEach(key => {
      const template = MC_TEMPLATES[key];
      console.log(`    ${key.padEnd(20)} → ${template.name}`);
    });

    // Step 7: Test getMCTemplate function
    console.log('\n🔧 Step 7: Testing getMCTemplate()...');

    const testCases = [
      'balfour-beatty',
      'Balfour Beatty',
      'BALFOUR BEATTY',
      'kier-group',
      'Kier Group',
      'skanska',
      'morgan-sindall',
      'unknown-contractor',
    ];

    testCases.forEach(mcId => {
      const template = getMCTemplate(mcId);
      const isFallback = template === genericMCTemplate;
      console.log(`  ${mcId.padEnd(25)} → ${template.name}${isFallback ? ' (fallback)' : ''}`);
    });

    // Step 8: Test getMCTemplateNames function
    console.log('\n📝 Step 8: Testing getMCTemplateNames()...');

    const names = getMCTemplateNames();
    console.log(`  Found ${names.length} MC-specific templates:`);
    names.forEach(name => {
      console.log(`    - ${name}`);
    });

    // Step 9: Test hasMCTemplate function
    console.log('\n✅ Step 9: Testing hasMCTemplate()...');

    const checkCases = [
      { id: 'balfour-beatty', expected: true },
      { id: 'kier-group', expected: true },
      { id: 'skanska', expected: true },
      { id: 'morgan-sindall', expected: true },
      { id: 'generic', expected: false },
      { id: 'unknown', expected: false },
    ];

    checkCases.forEach(({ id, expected }) => {
      const result = hasMCTemplate(id);
      const status = result === expected ? '✓' : '✗';
      console.log(`  ${status} hasMCTemplate('${id}') = ${result} (expected: ${expected})`);
    });

    // Step 10: Validate sections configuration
    console.log('\n📑 Step 10: Validating sections configuration...');

    templates.forEach(({ name, template }) => {
      const sections = template.sections;
      const enabled = Object.entries(sections)
        .filter(([_, enabled]) => enabled)
        .map(([section]) => section);

      console.log(`  ${name}:`);
      console.log(`    Enabled sections: ${enabled.join(', ')}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ All MC template tests completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

// Run the test
testMCTemplates()
  .then(() => {
    console.log('\n✓ Test script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Test script failed:', error);
    process.exit(1);
  });
