/*
  Minimal dev seed to make Projects, Finance, Documents, and RFx screens render.
  - Uses current Prisma schema models only
  - Safe to run multiple times (idempotent upserts where possible)
*/
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function ensureProject(tenantId) {
  let p = await prisma.project.findFirst({ where: { tenantId, code: 'DEMO-001' } }).catch(() => null);
  if (!p) {
    p = await prisma.project.create({ data: { tenantId, code: 'DEMO-001', name: 'Demo Project', status: 'Active', type: 'General' } });
  }
  return p;
}

async function ensureMembership(tenantId, projectId, userId) {
  try {
    const exists = await prisma.projectMembership.findFirst({ where: { tenantId, projectId, userId } });
    if (!exists) await prisma.projectMembership.create({ data: { tenantId, projectId, userId, role: 'PM' } });
  } catch { /* optional table */ }
}

async function ensureInvoices(tenantId, projectId) {
  const existing = await prisma.invoice.findMany({ where: { tenantId, projectId } }).catch(() => []);
  if (existing.length >= 2) return;
  const base = new Date();
  for (let i = 1; i <= 2; i++) {
    const number = `INV-DEMO-${i}`;
    const inv = await prisma.invoice.findFirst({ where: { tenantId, projectId, number } });
    if (!inv) {
      await prisma.invoice.create({
        data: {
          tenantId,
          projectId,
          number,
          issueDate: new Date(base.getTime() - i * 86400000),
          dueDate: new Date(base.getTime() + i * 86400000),
          net: 1000 * i,
          vat: 200 * i,
          gross: 1200 * i,
          status: 'Open',
        },
      });
    }
  }
}

async function ensurePoAndReceipt(tenantId, projectId) {
  let po = await prisma.purchaseOrder.findFirst({ where: { tenantId, projectId } }).catch(() => null);
  if (!po) {
    const count = await prisma.purchaseOrder.count({ where: { tenantId } });
    const code = `PO-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    po = await prisma.purchaseOrder.create({ data: { tenantId, projectId, code, supplier: 'Demo Supplier', status: 'Open', total: 0 } });
  }
  const lines = await prisma.pOLine.findMany({ where: { tenantId, poId: po.id } }).catch(() => []);
  if (lines.length === 0) {
    await prisma.pOLine.create({ data: { tenantId, poId: po.id, item: 'Demo Item', qty: 5, unit: 'ea', unitCost: 100, lineTotal: 500 } });
    await prisma.purchaseOrder.update({ where: { id: po.id }, data: { total: 500 } });
  }
  const hasReceipt = await prisma.delivery.findFirst({ where: { tenantId, poId: po.id } }).catch(() => null);
  if (!hasReceipt) {
    await prisma.delivery.create({ data: { tenantId, poId: po.id, expectedAt: new Date(), receivedAt: new Date(), note: 'Seed receipt' } });
  }
}

async function ensureDocument(tenantId, projectId) {
  // Create a dummy Document row and link to project so documents list shows something
  const existingLink = await prisma.documentLink.findFirst({ where: { tenantId, projectId } }).catch(() => null);
  if (existingLink) return;
  const doc = await prisma.document.create({
    data: {
      tenantId,
      filename: 'readme.txt',
      mimeType: 'text/plain',
      size: 12,
      storageKey: `local/demo/${Date.now()}-readme.txt`,
      uploadedById: '1',
    },
  });
  await prisma.documentLink.create({ data: { tenantId, documentId: doc.id, projectId, linkType: 'project' } });
}

async function ensureRequest(tenantId, projectId) {
  // Create a draft RFx request with one section and one question
  let req = await prisma.request.findFirst({ where: { tenantId, title: 'Demo RFx' } }).catch(() => null);
  if (!req) {
    req = await prisma.request.create({ data: { tenantId, title: 'Demo RFx', type: 'RFP', status: 'draft', deadline: new Date(Date.now() + 7*86400000) } });
  }
  const sec = await prisma.requestSection.findFirst({ where: { tenantId, requestId: req.id } }).catch(() => null);
  if (!sec) {
    const s = await prisma.requestSection.create({ data: { tenantId, requestId: req.id, title: 'General', order: 1 } });
    await prisma.requestQuestion.create({ data: { tenantId, requestId: req.id, sectionId: s.id, qType: 'text', prompt: 'Confirm scope understanding', required: true, order: 1 } });
  }
}

async function main() {
  const tenantId = process.env.SEED_TENANT || 'demo';
  const userId = Number(process.env.SEED_USER_ID || '1');
  const project = await ensureProject(tenantId);
  await ensureMembership(tenantId, project.id, userId);
  await ensureInvoices(tenantId, project.id);
  await ensurePoAndReceipt(tenantId, project.id);
  await ensureDocument(tenantId, project.id);
  await ensureRequest(tenantId, project.id);
  console.log('✔ Quick seed complete for tenant=%s project=%s', tenantId, project.code);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });

