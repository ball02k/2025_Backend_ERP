#!/usr/bin/env node
/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenantId = process.env.TENANT_DEFAULT || 'demo';
  // 1. Project
  let project = await prisma.project.findFirst({ where: { tenantId } });
  if (!project) project = await prisma.project.create({ data: { tenantId, code: 'DEMO-P1', name: 'Demo Project' } });
  // 2. Cost code
  const cc = await prisma.costCode.upsert({ where: { tenantId_code: { tenantId, code: 'BL-001' } }, update: {}, create: { tenantId, code: 'BL-001', description: 'Baseline' } });
  // 3. Budget line
  await prisma.budgetLine.upsert({ where: { tenantId_projectId_code: { tenantId, projectId: project.id, code: 'BL-001' } }, update: {}, create: { tenantId, projectId: project.id, code: 'BL-001', description: 'Main works', planned: 100000, amount: 100000, costCodeId: cc.id } }).catch(()=>{});
  // 4. Package
  const pkg = await prisma.package.create({ data: { projectId: project.id, name: 'Main Works', scope: 'Seeded by script', status: 'Draft' } });
  // 5. Tender
  const tender = await prisma.tender.create({ data: { tenantId, projectId: project.id, packageId: pkg.id, title: 'Main Works Tender', status: 'open' } });
  // 6. Supplier
  const sup = await prisma.supplier.upsert({ where: { tenantId_name: { tenantId, name: 'Demo Supplier Ltd' } }, update: {}, create: { tenantId, name: 'Demo Supplier Ltd', status: 'active' } });
  // 7. Bid
  await prisma.tenderBid.create({ data: { tenantId, tenderId: tender.id, supplierId: sup.id, price: 60000, notes: 'Bid A' } });
  // 8. Contract
  await prisma.contract.create({ data: { projectId: project.id, packageId: pkg.id, supplierId: sup.id, title: 'Main Works Contract', value: 60000, status: 'Pending' } });
  // 9. PO
  await prisma.purchaseOrder.create({ data: { tenantId, projectId: project.id, code: 'PO-0001', supplier: sup.name, supplierId: sup.id, status: 'Open', total: 5000, orderDate: new Date(), lines: { create: [{ tenantId, item: 'Concrete', qty: 10, unit: 'm3', unitCost: 100, lineTotal: 1000 }] } } });
  // 10. Invoice
  await prisma.invoice.create({ data: { tenantId, projectId: project.id, supplierId: sup.id, number: 'INV-001', issueDate: new Date(), dueDate: new Date(Date.now() + 14*86400000), net: 1000, vat: 200, gross: 1200, status: 'Open' } });
  console.log('Seeded full flow for project', project.id);
}

main().then(()=>process.exit(0)).catch((e)=>{ console.error(e); process.exit(1); });

