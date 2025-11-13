#!/usr/bin/env node
// verify-fixes.js
// Safely checks if the Prisma field errors are fixed

const fs = require('fs');
const path = require('path');

console.log('🔍 VERIFICATION: Checking Backend Fixes\n');

const BACKEND_PATH = '/Users/Baller/Documents/2025_ERP/2025_Backend_ERP';
let issuesFound = 0;

// Check 1: tenders.invitations.cjs
console.log('📝 Checking tenders.invitations.cjs...');
const invitationsFile = path.join(BACKEND_PATH, 'routes/tenders.invitations.cjs');

if (fs.existsSync(invitationsFile)) {
  const content = fs.readFileSync(invitationsFile, 'utf8');

  // Check for contactName field (should NOT exist)
  const hasContactName = /contactName:\s*true/.test(content);
  if (hasContactName) {
    console.log('   ❌ ERROR: Found `contactName: true` (field does not exist in Supplier schema)');
    issuesFound++;
  } else {
    console.log('   ✅ No contactName references found');
  }

  // Check that requestId is being used correctly
  const hasRequestId = /requestId/.test(content);
  if (hasRequestId) {
    console.log('   ✅ Using correct field: requestId (matches schema)');
  } else {
    console.log('   ⚠️  WARNING: No requestId found - check if this is intentional');
  }
} else {
  console.log('   ⚠️  File not found: tenders.invitations.cjs');
  issuesFound++;
}

// Check 2: suppliers.cjs
console.log('\n📝 Checking suppliers.cjs...');
const suppliersFile = path.join(BACKEND_PATH, 'routes/suppliers.cjs');

if (fs.existsSync(suppliersFile)) {
  const content = fs.readFileSync(suppliersFile, 'utf8');

  // Check route order: /qualified should come before /:id
  const qualifiedMatch = content.match(/router\.get\(['"]\/qualified['"]/);
  const idMatch = content.match(/router\.get\(['"]\/:id['"]/);

  if (qualifiedMatch && idMatch) {
    const qualifiedIndex = content.indexOf(qualifiedMatch[0]);
    const idIndex = content.indexOf(idMatch[0]);

    if (qualifiedIndex < idIndex) {
      console.log('   ✅ Route order correct: /qualified comes before /:id');
    } else {
      console.log('   ❌ ERROR: /qualified route comes AFTER /:id route');
      console.log('      This causes "qualified" to be treated as an ID parameter');
      issuesFound++;
    }
  } else {
    console.log('   ⚠️  Could not find route definitions');
  }

  // Check for duplicate /qualified routes
  const qualifiedRoutes = (content.match(/router\.get\(['"]\/qualified['"]/g) || []).length;
  if (qualifiedRoutes > 1) {
    console.log(`   ❌ ERROR: Found ${qualifiedRoutes} duplicate /qualified routes`);
    issuesFound++;
  } else if (qualifiedRoutes === 1) {
    console.log('   ✅ No duplicate /qualified routes');
  }

  // Check that /:id route includes id parameter
  const idRouteMatch = content.match(/router\.get\(['"]\/:id['"],[\s\S]{0,500}where:\s*\{[\s\S]{0,200}id:/);
  if (idRouteMatch) {
    console.log('   ✅ /:id route includes id parameter in query');
  } else {
    console.log('   ⚠️  WARNING: Could not verify id parameter in /:id route');
  }
} else {
  console.log('   ⚠️  File not found: suppliers.cjs');
  issuesFound++;
}

// Check 3: Verify Prisma schema
console.log('\n📝 Checking Prisma schema...');
const schemaFile = path.join(BACKEND_PATH, 'prisma/schema.prisma');

if (fs.existsSync(schemaFile)) {
  const schema = fs.readFileSync(schemaFile, 'utf8');

  // Check Supplier model
  const supplierMatch = schema.match(/model Supplier \{[\s\S]+?\}/);
  if (supplierMatch) {
    const supplierModel = supplierMatch[0];

    if (supplierModel.includes('contactName')) {
      console.log('   ✅ Supplier has contactName field in schema');
    } else {
      console.log('   ✅ Supplier does NOT have contactName field (backend code should not reference it)');
    }

    if (supplierModel.includes('phone')) {
      console.log('   ✅ Supplier has phone field in schema');
    }
  }

  // Check TenderInvitation model
  const invitationMatch = schema.match(/model TenderInvitation \{[\s\S]+?\}/);
  if (invitationMatch) {
    const invitationModel = invitationMatch[0];

    if (invitationModel.includes('requestId')) {
      console.log('   ✅ TenderInvitation uses requestId (not tenderId)');
    } else if (invitationModel.includes('tenderId')) {
      console.log('   ⚠️  TenderInvitation uses tenderId (not requestId)');
    }
  }
} else {
  console.log('   ⚠️  Schema file not found');
}

// Summary
console.log('\n' + '='.repeat(50));
if (issuesFound === 0) {
  console.log('✅ ALL CHECKS PASSED!');
  console.log('\nYour backend code is correctly configured.');
  console.log('If you\'re still seeing errors:');
  console.log('  1. Make sure the backend server is restarted');
  console.log('  2. Clear your browser cache');
  console.log('  3. Check the browser console for different errors');
} else {
  console.log(`❌ FOUND ${issuesFound} ISSUE(S)`);
  console.log('\nPlease review the errors above and fix them.');
}
console.log('='.repeat(50) + '\n');

process.exit(issuesFound);
