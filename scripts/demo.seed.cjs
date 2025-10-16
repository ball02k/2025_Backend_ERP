#!/usr/bin/env node
/**
 * Demo seed: Budget -> Packages -> RFx -> Award -> Contracts -> Invoices -> Overview
 * Uses your real API so we exercise controllers, rollups and audit.
 * Env:
 *   BASE_URL=http://localhost:3000
 *   DEMO_TOKEN=<jwt for a demo user>  (or rely on your dev auth bypass if present)
 *   DEMO_TENANT=demo
 */
// Default to backend dev port 3001 (project standard)
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const TENANT = process.env.DEMO_TENANT || 'demo';
const TOKEN = process.env.DEMO_TOKEN || '';

const PROJECT_CODE = 'DEMO-001';
const PROJECT_NAME = 'Demo Project – HQ Fit-Out';

const fetchOpts = () => ({
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Tenant-Id': TENANT,
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  },
});

async function http(method, path, body) {
  const opts = { ...fetchOpts(), method };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  if (!text) return null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`Failed to parse JSON for ${method} ${path}: ${err.message}`);
    }
  }
  return text;
}

function asArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
  return [];
}

async function searchProjectByCode(code) {
  try {
    const res = await http('GET', `/api/search?q=${encodeURIComponent(code)}&types=projects&limit=5`);
    const match = asArray(res).find((item) =>
      String(item?.subtitle || '').toLowerCase().includes(`code ${code.toLowerCase()}`)
    );
    if (match) {
      const details = await http('GET', `/api/projects/${match.id}`);
      return { id: match.id, details: details?.project || details?.data || details };
    }
  } catch (err) {
    console.warn('Search project fallback:', err.message);
  }
  return null;
}

async function ensureProject() {
  let projectId;
  let clientId;
  const existing = await searchProjectByCode(PROJECT_CODE);
  if (existing && existing.id) {
    projectId = Number(existing.id);
    const projectDetails = existing.details || {};
    clientId = projectDetails.clientId || projectDetails.client?.id || null;
    console.log(`Found existing project ${projectId}`);
    const payload = {
      name: PROJECT_NAME,
      code: PROJECT_CODE,
      status: 'Live',
      type: 'Commercial',
      description: 'Demo dataset seeded via scripts/demo.seed.cjs',
      budget: 750000,
      actualSpend: projectDetails.actualSpend ?? 0,
      startDate: '2025-01-08T00:00:00.000Z',
      endDate: '2025-09-30T00:00:00.000Z',
      country: 'GB',
      currency: 'GBP',
    };
    try {
      await http('PUT', `/api/projects/${projectId}`, payload);
    } catch (err) {
      console.warn('Project update skipped:', err.message);
    }
    return { projectId, clientId };
  }

  console.log('Creating demo client…');
  const clientBody = {
    name: 'Demo Client Ltd',
    companyRegNo: 'DEM012345',
    vatNo: 'GB123456789',
    address1: '1 Demo Way',
    city: 'London',
    county: 'Greater London',
    postcode: 'EC1A 1AA',
  };
  const client = await http('POST', '/api/clients', clientBody);
  clientId = client?.id;

  console.log('Creating demo project…');
  const projectPayload = {
    code: PROJECT_CODE,
    name: PROJECT_NAME,
    description: 'Demo dataset seeded via scripts/demo.seed.cjs',
    clientId,
    status: 'Live',
    type: 'Commercial',
    budget: 750000,
    actualSpend: 0,
    startDate: '2025-01-08T00:00:00.000Z',
    endDate: '2025-09-30T00:00:00.000Z',
    country: 'GB',
    currency: 'GBP',
  };
  const created = await http('POST', '/api/projects', projectPayload);
  projectId = created?.id;
  console.log(`Project created with id=${projectId}`);
  return { projectId, clientId };
}

async function ensureBudget(projectId) {
  const desired = [
    { code: 'S01', name: 'Structural Steel', planned: 250000 },
    { code: 'M01', name: 'Mechanical & Electrical', planned: 200000 },
    { code: 'F01', name: 'Finishes', planned: 150000 },
    { code: 'P01', name: 'Preliminaries', planned: 100000 },
    { code: 'C01', name: 'Contingency', planned: 50000 },
  ];
  let existing;
  try {
    existing = await http('GET', `/api/projects/${projectId}/budget`);
  } catch (err) {
    console.warn('Budget fetch fallback:', err.message);
    existing = { items: [] };
  }
  const byCode = new Map(asArray(existing).map((row) => [String(row.code || '').toUpperCase(), row]));
  const payload = desired.map((line) => {
    const prev = byCode.get(line.code);
    return {
      ...(prev ? { id: prev.id } : {}),
      code: line.code,
      name: line.name,
      planned: line.planned,
      description: `${line.name} planned allocation`,
    };
  });
  if (payload.length) {
    await http('POST', `/api/projects/${projectId}/budget`, { lines: payload });
  }
  const refreshed = await http('GET', `/api/projects/${projectId}/budget`);
  const items = asArray(refreshed);
  console.log(`Budget lines: ${items.length}`);
  return items;
}

async function ensurePackages(projectId, budgetLines) {
  const desired = [
    {
      key: 'S01',
      name: 'Structural Steel Package',
      scope: 'Supply and installation of structural steelwork',
      trade: 'Structural',
      budgetEstimate: 250000,
    },
    {
      key: 'M01',
      name: 'M&E Package',
      scope: 'Mechanical and electrical services installation',
      trade: 'M&E',
      budgetEstimate: 200000,
    },
    {
      key: 'F01',
      name: 'Finishes Package',
      scope: 'Interior finishes and fit-out',
      trade: 'Finishes',
      budgetEstimate: 150000,
    },
  ];
  let existing;
  try {
    existing = await http('GET', `/api/projects/${projectId}/packages`);
  } catch (err) {
    console.warn('Package fetch fallback:', err.message);
    existing = [];
  }
  const rows = asArray(existing);
  const byName = new Map(rows.map((pkg) => [String(pkg.name).toLowerCase(), pkg]));
  const result = new Map();
  const deadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  for (const pkg of desired) {
    let row = byName.get(pkg.name.toLowerCase());
    if (!row) {
      row = await http('POST', `/api/projects/${projectId}/packages`, {
        name: pkg.name,
        scopeSummary: pkg.scope,
        trade: pkg.trade,
        budgetEstimate: pkg.budgetEstimate,
        deadline,
      });
      console.log('Created package', row?.id, pkg.name);
    } else {
      console.log('Using existing package', row.id, pkg.name);
    }
    result.set(pkg.key, row);
  }

  const budgetByCode = new Map(budgetLines.map((line) => [String(line.code || '').toUpperCase(), line]));
  const relinks = [];
  for (const [key, pkg] of result.entries()) {
    const line = budgetByCode.get(key);
    if (line && line.packageId !== pkg.id) {
      relinks.push({ id: line.id, packageId: pkg.id });
    }
  }
  if (relinks.length) {
    await http('POST', `/api/projects/${projectId}/budget`, { lines: relinks });
  }

  return result;
}

async function ensureSuppliers() {
  const suppliers = [
    { key: 'steel', name: 'Steelworks UK Ltd', status: 'active', rating: 82 },
    { key: 'mep', name: 'City MEP Services', status: 'active', rating: 78 },
    { key: 'finish', name: 'Finishes & Interiors Co', status: 'active', rating: 85 },
  ];
  const map = new Map();
  for (const sup of suppliers) {
    let supplierId = null;
    try {
      const res = await http('GET', `/api/search?q=${encodeURIComponent(sup.name)}&types=suppliers&limit=1`);
      const match = asArray(res).find((item) => String(item?.title || '').toLowerCase() === sup.name.toLowerCase());
      if (match) supplierId = Number(match.id);
    } catch (_) {
      // ignore
    }
    if (!supplierId) {
      const created = await http('POST', '/api/suppliers', {
        name: sup.name,
        status: sup.status,
        rating: sup.rating,
      });
      supplierId = created?.id;
      console.log('Created supplier', supplierId, sup.name);
    } else {
      console.log('Using existing supplier', supplierId, sup.name);
    }
    map.set(sup.key, { id: supplierId, name: sup.name });
  }
  return map;
}

async function ensureInvites(packages, supplierIds) {
  const ids = Array.from(supplierIds.values()).map((s) => s.id).filter(Boolean);
  for (const pkg of packages.values()) {
    if (!pkg?.id) continue;
    try {
      await http('POST', `/api/procurement/packages/${pkg.id}/invite`, { supplierIds: ids });
      console.log('Invited suppliers to package', pkg.id);
    } catch (err) {
      if (!String(err.message).includes('Unique constraint')) {
        console.warn(`Invite suppliers warning (package ${pkg.id}):`, err.message);
      }
    }
  }
}

async function ensureSubmissions(packages, suppliers) {
  const submissions = {
    S01: [
      { supplier: suppliers.get('steel'), price: 240000, durationWeeks: 26 },
      { supplier: suppliers.get('mep'), price: 255000, durationWeeks: 28 },
      { supplier: suppliers.get('finish'), price: 262000, durationWeeks: 29 },
    ],
    M01: [
      { supplier: suppliers.get('mep'), price: 195000, durationWeeks: 24 },
      { supplier: suppliers.get('steel'), price: 205000, durationWeeks: 26 },
      { supplier: suppliers.get('finish'), price: 210000, durationWeeks: 25 },
    ],
    F01: [
      { supplier: suppliers.get('finish'), price: 142000, durationWeeks: 20 },
      { supplier: suppliers.get('mep'), price: 148000, durationWeeks: 22 },
      { supplier: suppliers.get('steel'), price: 155000, durationWeeks: 24 },
    ],
  };
  const winners = new Map();
  for (const [code, pkg] of packages.entries()) {
    const bids = submissions[code] || [];
    for (const bid of bids) {
      if (!pkg?.id || !bid?.supplier?.id) continue;
      try {
        await http('POST', `/api/procurement/packages/${pkg.id}/submit`, {
          supplierId: bid.supplier.id,
          price: bid.price,
          durationWeeks: bid.durationWeeks,
          details: { code, price: bid.price },
        });
      } catch (err) {
        const msg = String(err.message || '');
        if (!msg.includes('Unique constraint failed')) {
          console.warn(`Submission warning (package ${pkg.id}, supplier ${bid.supplier.id}):`, msg);
        }
      }
    }
    const sorted = bids.slice().sort((a, b) => a.price - b.price);
    if (sorted.length) winners.set(code, { supplier: sorted[0].supplier, value: sorted[0].price });
  }
  return winners;
}

async function ensureRequests(projectId, packages, suppliers, winners) {
  const desired = [];
  for (const [code, pkg] of packages.entries()) {
    desired.push({ code, pkg, title: `${pkg.name} RFx` });
  }
  let existing;
  try {
    existing = await http('GET', `/api/requests?projectId=${projectId}`);
  } catch (err) {
    console.warn('RFx list fallback:', err.message);
    existing = { rows: [] };
  }
  const rows = Array.isArray(existing?.rows) ? existing.rows : asArray(existing);
  const byPackage = new Map(rows.filter((r) => r.packageId).map((r) => [Number(r.packageId), r]));
  const requestMap = new Map();
  const deadline = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

  for (const item of desired) {
    let reqRow = byPackage.get(item.pkg?.id);
    if (!reqRow) {
      const created = await http('POST', '/api/requests', {
        title: item.title,
        type: 'Tender',
        deadline,
        packageId: item.pkg.id,
      });
      reqRow = created?.data || created;
      console.log('Created RFx', reqRow?.id, item.title);
    } else {
      console.log('Using existing RFx', reqRow.id, item.title);
    }
    if (reqRow?.id) {
      requestMap.set(item.code, reqRow);
      if (String(reqRow.status || '').toLowerCase() !== 'published' && String(reqRow.status || '').toLowerCase() !== 'awarded') {
        try {
          await http('POST', `/api/requests/${reqRow.id}/publish`, {});
        } catch (err) {
          console.warn('Publish RFx warning:', err.message);
        }
      }
    }
  }

  for (const [code, reqRow] of requestMap.entries()) {
    const bids = suppliers ? [suppliers.get('steel'), suppliers.get('mep'), suppliers.get('finish')] : [];
    const responses = bids.filter(Boolean).map((sup, idx) => ({
      supplierId: sup.id,
      price: winners.get(code)?.supplier?.id === sup.id ? winners.get(code).value : (200000 + idx * 5000),
    }));
    for (const resp of responses) {
      try {
        await http('POST', `/api/requests/${reqRow.id}/responses/submit`, {
          supplierId: resp.supplierId,
          answers: { price: resp.price },
        });
      } catch (err) {
        const msg = String(err.message || '');
        if (!msg.includes('REQUEST_NOT_PUBLISHED') && !msg.includes('DEADLINE_PASSED')) {
          console.warn('RFx submission warning:', msg);
        }
      }
    }
    const winner = winners.get(code);
    if (winner?.supplier?.id) {
      try {
        await http('POST', `/api/requests/${reqRow.id}/award`, {
          supplierId: winner.supplier.id,
          reason: 'Demo award',
        });
      } catch (err) {
        const msg = String(err.message || '');
        if (!msg.includes('Missing permission')) {
          console.warn('RFx award warning:', msg);
        }
      }
    }
  }

  return requestMap;
}

async function ensureContracts(projectId, packages, winners) {
  let contracts;
  try {
    contracts = await http('GET', `/api/projects/${projectId}/contracts`);
  } catch (err) {
    console.warn('Contracts fetch fallback:', err.message);
    contracts = [];
  }
  const existingByPackage = new Map(asArray(contracts).map((c) => [Number(c.packageId), c]));
  for (const [code, pkg] of packages.entries()) {
    const winner = winners.get(code);
    if (!pkg?.id || !winner?.supplier?.id || !winner?.value) continue;
    if (existingByPackage.has(pkg.id)) {
      console.log('Contract already exists for package', pkg.id);
      continue;
    }
    try {
      await http('POST', `/api/procurement/packages/${pkg.id}/award`, {
        supplierId: winner.supplier.id,
        contractValue: winner.value,
        title: `${pkg.name} Contract`,
      });
      console.log('Created contract for package', pkg.id);
    } catch (err) {
      console.warn('Contract award warning:', err.message);
    }
  }
}

async function ensureInvoices(projectId, winners) {
  const invoicePlans = [
    { key: 'S01', number: 'INV-DEMO-S01-001', amount: 50000 },
    { key: 'M01', number: 'INV-DEMO-M01-001', amount: 30000 },
  ];
  let existing;
  try {
    existing = await http('GET', `/api/finance/invoices?projectId=${projectId}&limit=100`);
  } catch (err) {
    console.warn('Invoice list fallback:', err.message);
    existing = { items: [] };
  }
  const items = asArray(existing);
  for (const plan of invoicePlans) {
    const already = items.find((inv) => String(inv.number || '').toLowerCase() === plan.number.toLowerCase());
    if (already) {
      console.log('Invoice already exists', plan.number);
      continue;
    }
    const winner = winners.get(plan.key);
    try {
      await http('POST', '/api/finance/invoices', {
        projectId,
        supplierId: winner?.supplier?.id ?? null,
        number: plan.number,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        net: plan.amount,
        vat: 0,
        gross: plan.amount,
        status: 'Approved',
      });
      console.log('Created invoice', plan.number);
    } catch (err) {
      console.warn('Invoice create warning:', err.message);
    }
  }
}

async function updateBudgetActuals(projectId, budgetLines) {
  const actuals = new Map([
    ['S01', 50000],
    ['M01', 30000],
  ]);
  for (const line of budgetLines) {
    const code = String(line.code || '').toUpperCase();
    if (!actuals.has(code)) continue;
    const amount = actuals.get(code);
    try {
      await http('PATCH', `/api/projects/${projectId}/budget/${line.id}`, { actual: amount });
    } catch (err) {
      console.warn('Budget actual update warning:', err.message);
    }
  }
}

async function main() {
  console.log(`Seeding demo for tenant="${TENANT}" @ ${BASE_URL}`);
  const { projectId } = await ensureProject();
  if (!projectId) throw new Error('Project id missing');
  const budgetLines = await ensureBudget(projectId);
  const packages = await ensurePackages(projectId, budgetLines);
  const suppliers = await ensureSuppliers();
  await ensureInvites(packages, suppliers);
  const winners = await ensureSubmissions(packages, suppliers);
  await ensureRequests(projectId, packages, suppliers, winners);
  await ensureContracts(projectId, packages, winners);
  await ensureInvoices(projectId, winners);
  await updateBudgetActuals(projectId, budgetLines);
  const overview = await http('GET', `/api/projects/${projectId}/overview`).catch((err) => {
    console.warn('Overview fetch warning:', err.message);
    return null;
  });
  console.log('Overview totals:', overview?.totals || overview);
  console.log(`\n✅ Demo seed complete. Open the project in the UI: /projects/${projectId}/overview`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
