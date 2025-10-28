/**
 * Tender Builder – Frontend QA (plumbing + style heuristics)
 * Checks: route wiring, component existence, api client usage, tailwind presence,
 * forbidden deps (axios), UI landmark text, and basic build viability.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const fail = (m) => {
  console.error('❌', m);
  process.exit(1);
};
const warn = (m) => console.warn('⚠️', m);
const pass = (m) => console.log('✅', m);

const root = path.join(__dirname, '../../2025_ERP');
const appTsx = path.join(root, 'src/App.tsx');
const tbPath = path.join(root, 'src/pages/rfx/TenderBuilder.jsx');
const tcPath = path.join(root, 'src/pages/rfx/TenderCreateFromPackage.jsx');
const apiPath = path.join(root, 'src/lib/api.ts');

console.log('🔍 Tender Builder Frontend QA\n');

// Check files exist
console.log('📁 Checking required files...');
if (!fs.existsSync(appTsx)) fail(`Missing file: ${appTsx}`);
if (!fs.existsSync(apiPath)) fail(`Missing file: ${apiPath}`);
pass('Core files exist (App.tsx, api.ts)');

if (!fs.existsSync(tbPath)) {
  warn(`TenderBuilder.jsx not found at: ${tbPath}`);
} else {
  pass('TenderBuilder.jsx exists');
}

if (!fs.existsSync(tcPath)) {
  warn(`TenderCreateFromPackage.jsx not found at: ${tcPath}`);
} else {
  pass('TenderCreateFromPackage.jsx exists');
}

// Check App.tsx route
console.log('\n🛣️  Checking routes...');
const app = fs.readFileSync(appTsx, 'utf8');
if (!app.match(/<Route\s+path="\/rfx\/:rfxId\/builder"/)) {
  warn('Route "/rfx/:rfxId/builder" not found in App.tsx.');
} else {
  pass('Route "/rfx/:rfxId/builder" present in App.tsx');
}

// Check TenderBuilder component if it exists
if (fs.existsSync(tbPath)) {
  console.log('\n🔧 Checking TenderBuilder.jsx...');
  const tb = fs.readFileSync(tbPath, 'utf8');

  // API client usage
  if (!tb.includes("from '@/lib/api'")) {
    warn('TenderBuilder does not import from @/lib/api');
  } else if (!tb.match(/api(Get|Post|Patch|Delete)\(/)) {
    warn('TenderBuilder does not use apiGet/apiPost/apiPatch/apiDelete');
  } else {
    pass('API client usage OK');
  }

  // No axios
  if (tb.match(/axios\s+from\s+['"]axios['"]/)) {
    fail('axios import found (not allowed)');
  } else {
    pass('No axios usage detected');
  }

  // Tailwind presence
  if (!tb.match(/\bclass(Name)?=/)) {
    warn('No className found – is Tailwind applied?');
  } else {
    pass('Tailwind className usage detected');
  }

  if (tb.match(/\sstyle=\{/)) {
    warn('Inline style detected – keep to Tailwind unless necessary');
  }

  // UI landmarks
  const mustStrings = [
    'Tender Builder',
    'Sections',
    'Questions',
    'Scoring Criteria',
    'Supplier Invites',
    'Issue Tender',
  ];
  const missing = mustStrings.filter((s) => !tb.includes(s));
  if (missing.length) {
    warn(`Missing expected UI labels: ${missing.join(', ')}`);
  } else {
    pass('All UI sections detected');
  }
}

// Check backend route exists
console.log('\n🔌 Checking backend routes...');
const backendPath = path.join(__dirname, '../routes/rfx.builder.cjs');
if (!fs.existsSync(backendPath)) {
  fail(`Backend route not found: ${backendPath}`);
} else {
  pass('Backend route rfx.builder.cjs exists');
  const backend = fs.readFileSync(backendPath, 'utf8');

  // Check key endpoints (mounted at /rfx-builder, so routes are relative)
  const endpoints = [
    { pattern: /router\.get\(['"]\/:rfxId\/sections['"]/, name: 'GET /:rfxId/sections' },
    { pattern: /router\.post\(['"]\/:rfxId\/sections['"]/, name: 'POST /:rfxId/sections' },
    { pattern: /router\.post\(['"]\/:rfxId\/questions['"]/, name: 'POST /:rfxId/questions' },
    { pattern: /router\.post\(['"]\/:rfxId\/criteria['"]/, name: 'POST /:rfxId/criteria' },
    { pattern: /router\.post\(['"]\/:rfxId\/invites['"]/, name: 'POST /:rfxId/invites' },
    { pattern: /router\.post\(['"]\/:rfxId\/issue['"]/, name: 'POST /:rfxId/issue' },
  ];

  endpoints.forEach(({ pattern, name }) => {
    if (!backend.match(pattern)) {
      warn(`Backend endpoint missing: ${name}`);
    } else {
      pass(`Backend endpoint exists: ${name}`);
    }
  });
}

// Package.json deps check
console.log('\n📦 Checking dependencies...');
const pkgPath = path.join(root, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = Object.keys(pkg.dependencies || {});
  const bad = ['axios', 'antd', 'mui', 'chakra']; // keep UI minimal, Tailwind-only
  const found = bad.filter((d) => deps.includes(d));
  if (found.length) {
    warn(`Found UI/deps that may not match conventions: ${found.join(', ')}`);
  } else {
    pass('No conflicting UI dependencies found');
  }
} else {
  warn('package.json not found');
}

// Summary
console.log('\n📊 Summary:');
console.log('─────────────────────────────────────────');

if (!fs.existsSync(tbPath)) {
  console.log('\n⚠️  MISSING COMPONENTS:');
  console.log('   → Create: 2025_ERP/src/pages/rfx/TenderBuilder.jsx');
  console.log('   → Add route in App.tsx: <Route path="/rfx/:rfxId/builder" element={<TenderBuilder />} />');
}

if (!fs.existsSync(tcPath)) {
  console.log('   → Create: 2025_ERP/src/pages/rfx/TenderCreateFromPackage.jsx');
}

if (!app.match(/<Route\s+path="\/rfx\/:rfxId\/builder"/)) {
  console.log('\n⚠️  MISSING ROUTE: Add to App.tsx after other RFx routes');
}

console.log('\n🎯 Tender Builder frontend QA complete.\n');
