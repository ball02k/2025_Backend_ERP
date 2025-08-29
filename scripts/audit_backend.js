#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

let allPassed = true;
const groups = {
  SCHEMA: [],
  ROUTES: [],
  SNAPSHOT: [],
  BFF: [],
  'TENANT SCOPING': [],
  INDEXES: [],
};

function add(group, ok, msg, fix) {
  if (!ok) {
    allPassed = false;
    groups[group].push(`FAIL: ${msg}${fix ? '\n  -> ' + fix : ''}`);
  } else {
    groups[group].push(`PASS: ${msg}`);
  }
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function stripComments(str) {
  return str.replace(/\/\/.*$/gm, '');
}

function extractBlock(content, model) {
  const pattern = new RegExp(`model\\s+${model}\\b`);
  const match = pattern.exec(content);
  if (!match) return '';
  const braceStart = content.indexOf('{', match.index);
  let i = braceStart + 1,
    depth = 1;
  while (i < content.length && depth > 0) {
    const ch = content[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    i++;
  }
  return content.slice(braceStart + 1, i - 1);
}

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const schema = read(schemaPath);
const schemaNoComments = stripComments(schema);

add('SCHEMA', !/\benum\s+/i.test(schemaNoComments), 'No enum declarations in schema.prisma', `${schemaPath}: remove enum declarations`);

const projectBlock = extractBlock(schema, 'Project');
add(
  'SCHEMA',
  /tenantId\s+String\s+@default\("demo"\)/.test(projectBlock),
  'Project tenantId default "demo"',
  `${schemaPath}: tenantId String @default("demo")`
);
add(
  'SCHEMA',
  /status\s+String\s+@default\("Active"\)/.test(projectBlock),
  'Project status default "Active"',
  `${schemaPath}: status String @default("Active")`
);
add(
  'SCHEMA',
  /type\s+String\s+@default\("General"\)/.test(projectBlock),
  'Project type default "General"',
  `${schemaPath}: type String @default("General")`
);

const taskBlock = extractBlock(schema, 'Task');
add(
  'SCHEMA',
  /tenantId\s+String\s+@default\("demo"\)/.test(taskBlock),
  'Task tenantId default "demo"',
  `${schemaPath}: tenantId String @default("demo")`
);
add(
  'SCHEMA',
  /status\s+String\s+@default\("Open"\)/.test(taskBlock),
  'Task status default "Open"',
  `${schemaPath}: status String @default("Open")`
);

const docBlock = extractBlock(schema, 'Document');
add(
  'SCHEMA',
  /id\s+BigInt\s+@id\s+@default\(autoincrement\(\)\)/.test(docBlock),
  'Document.id BigInt @id @default(autoincrement())',
  `${schemaPath}: id BigInt @id @default(autoincrement())`
);

const docLinkBlock = extractBlock(schema, 'DocumentLink');
add(
  'SCHEMA',
  /documentId\s+BigInt/.test(docLinkBlock),
  'DocumentLink.documentId BigInt',
  `${schemaPath}: documentId BigInt`
);
add(
  'SCHEMA',
  /projectId\s+Int\?/.test(docLinkBlock),
  'DocumentLink.projectId Int?',
  `${schemaPath}: projectId Int?`
);
add(
  'SCHEMA',
  /variationId\s+Int\?/.test(docLinkBlock),
  'DocumentLink.variationId Int?',
  `${schemaPath}: variationId Int?`
);

// Procurement models
const poBlock = extractBlock(schema, 'PurchaseOrder');
const poLineBlock = extractBlock(schema, 'POLine');
const deliveryBlock = extractBlock(schema, 'Delivery');
add(
  'SCHEMA',
  poBlock.length > 0 && poLineBlock.length > 0 && deliveryBlock.length > 0,
  'PurchaseOrder, POLine, Delivery models present',
  `${schemaPath}: add models PurchaseOrder, POLine, Delivery`
);

const snapBlock = extractBlock(schema, 'ProjectSnapshot');
add(
  'SNAPSHOT',
  /projectId\s+Int\s+@id/.test(snapBlock) && /updatedAt\s+DateTime/.test(snapBlock),
  'ProjectSnapshot model with projectId @id and updatedAt DateTime',
  `${schemaPath}: model ProjectSnapshot { projectId Int @id ... updatedAt DateTime }`
);

// Index checks
function has(block, str) {
  return block.includes(str);
}
add(
  'INDEXES',
  has(taskBlock, '@@index([tenantId, projectId, status])') &&
    has(taskBlock, '@@index([projectId, dueDate])'),
  'Task indexes for tenantId/projectId/status and projectId/dueDate',
  `${schemaPath}: add @@index([tenantId, projectId, status]) and @@index([projectId, dueDate])`
);
const variationBlock = extractBlock(schema, 'Variation');
add(
  'INDEXES',
  has(variationBlock, '@@index([tenantId, projectId, status])') &&
    has(variationBlock, '@@index([projectId])'),
  'Variation indexes for tenantId/projectId/status and projectId',
  `${schemaPath}: add @@index([tenantId, projectId, status]) and @@index([projectId])`
);
add(
  'INDEXES',
  has(variationBlock, '@@index([tenantId, projectId, status, updatedAt])'),
  'Variation composite index on tenantId/projectId/status/updatedAt',
  `${schemaPath}: add @@index([tenantId, projectId, status, updatedAt])`
);
add(
  'INDEXES',
  has(projectBlock, '@@index([tenantId, status])'),
  'Project index for tenantId/status',
  `${schemaPath}: add @@index([tenantId, status])`
);
add(
  'INDEXES',
  has(docLinkBlock, '@@index([projectId])') && has(docLinkBlock, '@@index([variationId])'),
  'DocumentLink indexes for projectId and variationId',
  `${schemaPath}: add @@index([projectId]) and @@index([variationId])`
);

add(
  'INDEXES',
  has(poBlock, '@@unique([tenantId, code])') && has(poBlock, '@@index([tenantId, projectId, status])'),
  'PurchaseOrder indexes for tenantId/code unique and tenantId/projectId/status',
  `${schemaPath}: add @@unique([tenantId, code]) and @@index([tenantId, projectId, status])`
);
add(
  'INDEXES',
  has(poLineBlock, '@@index([tenantId, poId])'),
  'POLine index for tenantId/poId',
  `${schemaPath}: add @@index([tenantId, poId])`
);
add(
  'INDEXES',
  has(deliveryBlock, '@@index([tenantId, poId])') && has(deliveryBlock, '@@index([poId, expectedAt])'),
  'Delivery indexes for tenantId/poId and poId/expectedAt',
  `${schemaPath}: add @@index([tenantId, poId]) and @@index([poId, expectedAt])`
);

// VariationLine checks
const varLineBlock = extractBlock(schema, 'VariationLine');
add(
  'SCHEMA',
  /tenantId\s+String/.test(varLineBlock),
  'VariationLine has tenantId String',
  `${schemaPath}: VariationLine { tenantId String }`
);
add(
  'INDEXES',
  has(varLineBlock, '@@index([variationId])') && has(varLineBlock, '@@index([tenantId])'),
  'VariationLine indexes on variationId and tenantId',
  `${schemaPath}: add @@index([variationId]) and @@index([tenantId])`
);

// Route checks
function checkImport(filePath) {
  const content = read(filePath);
  return /recomputeProjectSnapshot|recomputeProcurement/.test(content);
}
const tasksPath = path.join(__dirname, '..', 'routes', 'tasks.js');
const variationsPath = path.join(__dirname, '..', 'routes', 'variations.cjs');
const procurementPath = path.join(__dirname, '..', 'routes', 'procurement.cjs');
const tasksContent = read(tasksPath);
add(
  'ROUTES',
  (routeExists(tasksContent, "router.post('/") || routeExists(tasksContent, "router.put('/") || routeExists(tasksContent, "router.delete('/")) ? checkImport(tasksPath) : true,
  'tasks.js imports recomputeProjectSnapshot',
  `${tasksPath}: const { recomputeProjectSnapshot } = require('../services/projectSnapshot');`
);
add(
  'ROUTES',
  checkImport(variationsPath),
  'variations.cjs imports recomputeProjectSnapshot',
  `${variationsPath}: const { recomputeProjectSnapshot } = require('../services/projectSnapshot');`
);
add(
  'ROUTES',
  checkImport(procurementPath),
  'procurement.cjs imports recompute helper',
  `${procurementPath}: const { recomputeProcurement } = require('../services/projectSnapshot');`
);

function hasCall(content, routeSig) {
  const start = content.indexOf(routeSig);
  if (start === -1) return false;
  const next = content.indexOf('router.', start + 1);
  const block = content.slice(start, next === -1 ? content.length : next);
  return /recomputeProjectSnapshot/.test(block);
}
function routeExists(content, routeSig) {
  return content.includes(routeSig);
}
// Only enforce recompute checks if respective routes exist
const hasPost = routeExists(tasksContent, "router.post('/");
const hasPut = routeExists(tasksContent, "router.put('/");
const hasDel = routeExists(tasksContent, "router.delete('/");
if (hasPost) {
  add(
    'SNAPSHOT',
    hasCall(tasksContent, "router.post('/"),
    'tasks.js recomputes snapshot on create',
    `${tasksPath}: await recomputeProjectSnapshot(...)`
  );
}
if (hasPut) {
  add(
    'SNAPSHOT',
    hasCall(tasksContent, "router.put('/"),
    'tasks.js recomputes snapshot on update',
    `${tasksPath}: await recomputeProjectSnapshot(...)`
  );
}
if (hasDel) {
  add(
    'SNAPSHOT',
    hasCall(tasksContent, "router.delete('/"),
    'tasks.js recomputes snapshot on delete',
    `${tasksPath}: await recomputeProjectSnapshot(...)`
  );
}

const variationsContent = read(variationsPath);
add(
  'SNAPSHOT',
  hasCall(variationsContent, 'router.post("/"'),
  'variations.cjs recomputes snapshot on create',
  `${variationsPath}: await recomputeProjectSnapshot(...)`
);
add(
  'SNAPSHOT',
  hasCall(variationsContent, 'router.put("/:id"'),
  'variations.cjs recomputes snapshot on update',
  `${variationsPath}: await recomputeProjectSnapshot(...)`
);
add(
  'SNAPSHOT',
  hasCall(variationsContent, 'router.patch("/:id/status"'),
  'variations.cjs recomputes snapshot on status change',
  `${variationsPath}: await recomputeProjectSnapshot(...)`
);
add(
  'SNAPSHOT',
  hasCall(variationsContent, 'router.delete("/:id"'),
  'variations.cjs recomputes snapshot on delete',
  `${variationsPath}: await recomputeProjectSnapshot(...)`
);

// BFF checks
const overviewPath = path.join(__dirname, '..', 'routes', 'projects_overview.cjs');
const overviewContent = read(overviewPath);
const indexPath = path.join(__dirname, '..', 'index.cjs');
const indexContent = read(indexPath);
add(
  'BFF',
  /app\.use\(["']\/api\/projects["'],\s*projectsOverviewRouter\)/.test(indexContent),
  'projects_overview.cjs mounted under /api/projects',
  `${indexPath}: app.use('/api/projects', projectsOverviewRouter)`
);
add(
  'BFF',
  /res\.json\({\s*project[\s\S]*widgets[\s\S]*quickLinks/.test(overviewContent),
  'projects_overview.cjs returns project/widgets/quickLinks',
  `${overviewPath}: res.json({ project, widgets: ..., quickLinks: ... })`
);

// Tenant scoping
function tenantWhereBlocks(content) {
  const blocks = [];
  const re = /(where\s*(?:=|:)\s*{)/g;
  let m;
  while ((m = re.exec(content))) {
    let idx = m.index + m[0].length;
    let depth = 1;
    while (idx < content.length && depth > 0) {
      const ch = content[idx];
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      idx++;
    }
    blocks.push(content.slice(m.index, idx));
  }
  return blocks;
}
function checkTenant(filePath, content) {
  const blocks = tenantWhereBlocks(content);
  const missing = blocks.filter((b) => !/tenantId/.test(b));
  const ok = missing.length === 0;
  const fix = ok
    ? undefined
    : `${filePath}: ensure tenantId in where clause -> ${missing[0].split('\n')[0].trim()}`;
  return { ok, fix };
}
let t = checkTenant(tasksPath, tasksContent);
add('TENANT SCOPING', t.ok, 'tasks.js tenantId in all where clauses', t.fix);
t = checkTenant(variationsPath, variationsContent);
add('TENANT SCOPING', t.ok, 'variations.cjs tenantId in all where clauses', t.fix);
const procurementContent = read(procurementPath);
t = checkTenant(procurementPath, procurementContent);
add('TENANT SCOPING', t.ok, 'procurement.cjs tenantId in all where clauses', t.fix);

// Output
for (const [g, msgs] of Object.entries(groups)) {
  console.log(g);
  msgs.forEach((m) => console.log('  ' + m));
  console.log('');
}
if (allPassed) {
  console.log('All checks passed');
} else {
  console.log('Some checks failed');
}
process.exit(allPassed ? 0 : 1);
