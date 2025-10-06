#!/usr/bin/env node
/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenantId = process.env.TENANT_DEFAULT || 'demo';
  const projectCode = process.env.SEED_PROJECT_CODE || 'DEMO-MVP';

  // 1) Ensure a Client (optional, schema is not tenant-scoped for Client)
  let client = await prisma.client.findFirst({ where: { name: 'Acme Demo' } }).catch(() => null);
  if (!client) client = await prisma.client.create({ data: { name: 'Acme Demo' } });

  // 2) Project
  let project = await prisma.project.findFirst({ where: { tenantId, code: projectCode } });
  if (!project) {
    project = await prisma.project.create({ data: { tenantId, code: projectCode, name: 'MVP Demo Project', status: 'Active', clientId: client?.id || null } });
  }

  // 3) Supplier
  let supplier = await prisma.supplier.findFirst({ where: { tenantId, name: 'Demo Supplier Ltd' } });
  if (!supplier) supplier = await prisma.supplier.create({ data: { tenantId, name: 'Demo Supplier Ltd', status: 'active' } });

  // 4) Package (light)
  let pkg = await prisma.package.findFirst({ where: { projectId: project.id, name: 'Main Works' } });
  if (!pkg) pkg = await prisma.package.create({ data: { projectId: project.id, code: 'PKG-MW', name: 'Main Works', description: 'Seeded main works package', status: 'Draft' } });

  // 5) Budget line (baseline) mapped to package
  let bl = await prisma.budgetLine.findFirst({ where: { tenantId, projectId: project.id, code: 'BL-001' } });
  if (!bl) bl = await prisma.budgetLine.create({ data: { tenantId, projectId: project.id, code: 'BL-001', name: 'Main Works Baseline', lineType: 'package', planned: 100000, packageId: pkg.id } });

  // 6) Contract (award) — use existing Contract model (BigInt id)
  let contract = await prisma.contract.findFirst({ where: { projectId: project.id, packageId: pkg.id } });
  if (!contract) {
    contract = await prisma.contract.create({
      data: {
        projectId: project.id,
        packageId: pkg.id,
        supplierId: supplier.id,
        title: 'Main Works Contract',
        value: 60000,
        status: 'Pending',
        contractNumber: 'CNT-MW-001',
      },
    });
  }

  // 7) Invoice (actuals), linked to package and contract
  const invNum = `INV-${Date.now()}`;
  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      projectId: project.id,
      supplierId: supplier.id,
      number: invNum,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 86400000),
      net: 20000,
      vat: 4000,
      gross: 24000,
      status: 'Open',
      source: 'seed',
      packageId: pkg.id,
      contractId: contract.id,
    },
  });

  // 8) Recompute rollups
  try {
    const { recomputeProjectFinancials } = require('../routes/hooks.recompute.cjs');
    await recomputeProjectFinancials(tenantId, project.id);
  } catch (e) {
    console.warn('recompute failed (non-fatal):', e?.message || e);
  }

  console.log('Seeded MVP project data:\n', {
    tenantId,
    project: { id: project.id, code: project.code, name: project.name },
    supplier: { id: supplier.id, name: supplier.name },
    package: { id: pkg.id, name: pkg.name },
    budgetLine: { id: bl.id, planned: bl.planned?.toString?.() || bl.planned },
    contract: { id: contract.id?.toString?.() || contract.id, value: contract.value?.toString?.() || contract.value },
    invoice: { id: invoice.id, number: invoice.number, gross: invoice.gross?.toString?.() || invoice.gross },
  });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

