// Lightweight in-memory PrismaClient mock for tests
// Supports subset of models/ops used in test suite

class Decimal {
  constructor(v) { this.value = Number(v || 0); }
  toNumber() { return Number(this.value); }
  valueOf() { return this.toNumber(); }
  toJSON() { return this.toNumber(); }
}

const Prisma = { Decimal };

function makeStore() {
  return {
    supplier: [],
    supplierCapability: [],
    client: [],
    project: [],
    request: [],
    requestSection: [],
    requestQuestion: [],
    requestInvite: [],
    requestResponse: [],
    awardDecision: [],
    purchaseOrder: [],
    taxonomy: [],
    taxonomyTerm: [],
    tenantSetting: [],
    auditLog: [],
    supplierAccreditation: [],
    supplierAccreditationLink: [],
  };
}

let nextIds = {
  supplier: 1,
  supplierCapability: 1,
  client: 1,
  project: 1,
  request: 1,
  requestSection: 1,
  requestQuestion: 1,
  requestInvite: 1,
  requestResponse: 1,
  awardDecision: 1,
  purchaseOrder: 1,
  taxonomy: 1,
  taxonomyTerm: 1,
  tenantSetting: 1,
  auditLog: 1,
  supplierAccreditation: 1,
  supplierAccreditationLink: 1,
};

const db = makeStore();
// Expose for white-box assertions in tests
if (typeof global !== 'undefined') { global.__PRISMA_MOCK_DB__ = db; }

function matchWhere(row, where = {}) {
  // very small where matcher for simple equality/contains/in/NOT/OR
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR' && Array.isArray(v)) {
      if (!v.some((cond) => matchWhere(row, cond))) return false;
      continue;
    }
    if (k === 'NOT' && v && typeof v === 'object') {
      if (matchWhere(row, v)) return false;
      continue;
    }
    if (v && typeof v === 'object' && 'in' in v) {
      if (!v.in.includes(row[k])) return false;
      continue;
    }
    if (v && typeof v === 'object' && 'contains' in v) {
      const needle = String(v.contains).toLowerCase();
      const hay = String(row[k] ?? '').toLowerCase();
      if (!hay.includes(needle)) return false;
      continue;
    }
    if (v && typeof v === 'object' && 'startsWith' in v) {
      const pref = String(v.startsWith).toLowerCase();
      const hay = String(row[k] ?? '').toLowerCase();
      if (!hay.startsWith(pref)) return false;
      continue;
    }
    if (row[k] !== v) return false;
  }
  return true;
}

function orderBy(items, orderBy) {
  if (!orderBy || !Array.isArray(orderBy) || orderBy.length === 0) return items;
  const [first] = orderBy;
  const key = typeof first === 'string' ? first : Object.keys(first)[0];
  const dir = typeof first === 'string' ? 'asc' : first[key];
  return items.slice().sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === bv) return 0;
    return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
  });
}

function withInclude(model, rows, include) {
  if (!include) return rows;
  if (model === 'supplier' && include.capabilities) {
    return rows.map((s) => ({
      ...s,
      capabilities: db.supplierCapability.filter((c) => c.supplierId === s.id && c.tenantId === s.tenantId),
    }));
  }
  if (model === 'contract' && include.project) {
    return rows.map((r) => ({
      ...r,
      project: db.project.find((p) => p.id === r.projectId) || null,
    }));
  }
  return rows;
}

class Model {
  constructor(name) { this.name = name; }

  create({ data }) {
    const id = nextIds[this.name]++;
    const row = { id, ...data };
    db[this.name].push(row);
    return Promise.resolve({ ...row });
  }

  createMany({ data }) {
    const created = [];
    for (const d of data) {
      const id = nextIds[this.name]++;
      const row = { id, ...d };
      db[this.name].push(row);
      created.push(row);
    }
    return Promise.resolve({ count: created.length });
  }

  findMany({ where = {}, include, orderBy: ob } = {}) {
    let list = db[this.name].filter((r) => matchWhere(r, where));
    list = withInclude(this.name, list, include);
    list = orderBy(list, ob);
    return Promise.resolve(list.map((r) => ({ ...r })));
  }

  findFirst({ where = {}, include } = {}) {
    const row = db[this.name].find((r) => matchWhere(r, where));
    if (!row) return Promise.resolve(null);
    const [wrapped] = withInclude(this.name, [row], include);
    return Promise.resolve({ ...wrapped });
  }

  update({ where, data }) {
    const id = where.id;
    const idx = db[this.name].findIndex((r) => r.id === id);
    if (idx === -1) return Promise.reject(new Error('Not found'));
    db[this.name][idx] = { ...db[this.name][idx], ...data };
    return Promise.resolve({ ...db[this.name][idx] });
  }

  updateMany({ where = {}, data }) {
    let count = 0;
    db[this.name] = db[this.name].map((r) => {
      if (matchWhere(r, where)) { count++; return { ...r, ...data }; }
      return r;
    });
    return Promise.resolve({ count });
  }

  delete({ where }) {
    const id = where.id;
    const idx = db[this.name].findIndex((r) => r.id === id);
    if (idx === -1) return Promise.reject(new Error('Not found'));
    const [removed] = db[this.name].splice(idx, 1);
    return Promise.resolve({ ...removed });
  }

  deleteMany({ where = {} }) {
    const before = db[this.name].length;
    const keep = db[this.name].filter((r) => !matchWhere(r, where));
    const count = before - keep.length;
    db[this.name] = keep;
    return Promise.resolve({ count });
  }

  aggregate({ _sum, where = {} }) {
    if (_sum && 'total' in _sum) {
      const rows = db[this.name].filter((r) => matchWhere(r, where));
      const total = rows.reduce((acc, r) => acc + Number(r.total || 0), 0);
      return Promise.resolve({ _sum: { total } });
    }
    return Promise.resolve({});
  }

  upsert({ where, create }) {
    // Support composite unique where like { tenantId_key: { tenantId, key } }
    const keys = Object.keys(where || {});
    let row;
    if (keys.length === 1 && where[keys[0]] && typeof where[keys[0]] === 'object') {
      const nested = where[keys[0]];
      row = db[this.name].find((r) => Object.keys(nested).every((k) => r[k] === nested[k]));
    } else {
      row = db[this.name].find((r) => keys.every((k) => r[k] === where[k]));
    }
    if (row) return Promise.resolve({ ...row });
    // mimic Prisma throwing when upsert cannot match by unique where
    return Promise.reject(Object.assign(new Error('Upsert needs unique where'), { code: 'P2002' }));
  }
}

class PrismaClient {
  constructor() {
    this.supplier = new Model('supplier');
    this.supplierCapability = new Model('supplierCapability');
    this.client = new Model('client');
    this.project = new Model('project');
    this.request = new Model('request');
    this.requestSection = new Model('requestSection');
    this.requestQuestion = new Model('requestQuestion');
    this.requestInvite = new Model('requestInvite');
    this.requestResponse = new Model('requestResponse');
    this.awardDecision = new Model('awardDecision');
    this.purchaseOrder = new Model('purchaseOrder');
    this.taxonomy = new Model('taxonomy');
    this.taxonomyTerm = new Model('taxonomyTerm');
    this.tenantSetting = new Model('tenantSetting');
    this.auditLog = new Model('auditLog');
    this.supplierAccreditation = new Model('supplierAccreditation');
    this.supplierAccreditationLink = new Model('supplierAccreditationLink');
  }

  $transaction(fn) {
    // Execute with same client to allow tx.* calls
    return Promise.resolve(fn(this));
  }

  $disconnect() { return Promise.resolve(); }
}

module.exports = { PrismaClient, Prisma };
