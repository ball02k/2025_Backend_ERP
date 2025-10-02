const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');

router.get('/demo/reset', requireAuth, async (req, res) => {
  if (process.env.DEMO_MODE !== '1') return res.status(404).end();
  const tenantId = process.env.DEMO_TENANT_ID || 'demo';
  try {
    const ops = [];
    if (prisma.documentLink?.deleteMany) ops.push(prisma.documentLink.deleteMany({ where: { tenantId } }));
    if (prisma.document?.deleteMany) ops.push(prisma.document.deleteMany({ where: { tenantId } }));
    if (prisma.invoice?.deleteMany) ops.push(prisma.invoice.deleteMany({ where: { tenantId } }));
    if (prisma.purchaseOrder?.deleteMany) ops.push(prisma.purchaseOrder.deleteMany({ where: { tenantId } }));
    if (prisma.variation?.deleteMany) ops.push(prisma.variation.deleteMany({ where: { tenantId } }));
    if (prisma.rfi?.deleteMany) ops.push(prisma.rfi.deleteMany({ where: { tenantId } }));
    if (prisma.supplier?.deleteMany) ops.push(prisma.supplier.deleteMany({ where: { tenantId } }));
    if (prisma.project?.deleteMany) ops.push(prisma.project.deleteMany({ where: { tenantId } }));
    if (ops.length) await prisma.$transaction(ops);

    await seedDemo(tenantId);
    res.json({ ok: true, message: 'Demo data reset' });
  } catch (e) {
    console.error('[demo/reset]', e);
    res.status(500).json({ message: 'Reset failed', error: String(e && e.message || e) });
  }
});

module.exports = router;

async function seedDemo(tenantId) {
  const proj = await prisma.project.create({ data: { tenantId, name: 'Demo Project A', status: 'active' } }).catch(async () => {
    return prisma.project.findFirst({ where: { tenantId, name: 'Demo Project A' } });
  });
  const supp = await prisma.supplier.create({ data: { tenantId, name: 'Demo Supplier Ltd', email: 'accounts@demo-supplier.test' } }).catch(async () => {
    return prisma.supplier.findFirst({ where: { tenantId, name: 'Demo Supplier Ltd' } });
  });
  let po;
  try {
    po = await prisma.purchaseOrder.create({
      data: { tenantId, projectId: proj?.id, supplierId: supp?.id, poNumber: 'PO-DEM-0001', issueDate: new Date(), subtotal: 10000, vatTotal: 2000, grandTotal: 12000, currency: 'GBP', notes: 'Standard demo PO' },
    });
  } catch {}
  try { await prisma.purchaseOrderLine?.create?.({ data: { tenantId, purchaseOrderId: po?.id, lineNo: 10, description: 'Materials (demo)', qty: 1, rate: 10000, totalExVat: 10000, totalVat: 2000, totalIncVat: 12000 } }); } catch {}
  try { await prisma.invoice.create({ data: { tenantId, projectId: proj?.id, supplierId: supp?.id, invoiceNumber: 'INV-DEM-1001', issueDate: new Date(), grandTotal: 12000, currency: 'GBP', poNumberRef: 'PO-DEM-0001', status: 'approved' } }); } catch {}
  try { await prisma.variation?.create?.({ data: { tenantId, projectId: proj?.id, title: 'Demo Variation +£2k', value: 2000 } }); } catch {}
  try { await prisma.document?.create?.({ data: { tenantId, filename: 'Demo.pdf', mimeType: 'application/pdf', size: 12345, storageKey: 'demo/Demo.pdf' } }); } catch {}
}

