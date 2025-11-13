#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const TENANT = 'demo';

  await prisma.supplier.upsert({
    where: { id: 123 },
    update: {
      tenantId: TENANT,
      name: 'ACME Steel Ltd',
      status: 'active',
      insuranceExpiry: new Date('2024-01-01'),
      hsAccreditations: null,
      complianceStatus: 'review',
    },
    create: {
      id: 123,
      tenantId: TENANT,
      name: 'ACME Steel Ltd',
      status: 'active',
      insuranceExpiry: new Date('2024-01-01'),
      hsAccreditations: null,
      complianceStatus: 'review',
    },
  });

  const project =
    (await prisma.project.findFirst({
      where: { tenantId: TENANT },
      select: { id: true },
      orderBy: { id: 'asc' },
    })) || null;

  if (!project) {
    console.warn('No project found for tenant demo; skipping package seed.');
    return;
  }

  await prisma.package.upsert({
    where: { id: 28 },
    update: {
      projectId: project.id,
      name: 'Steel Frame',
      trade: 'Structural',
      status: 'Draft',
      awardSupplierId: null,
      awardValue: null,
    },
    create: {
      id: 28,
      projectId: project.id,
      name: 'Steel Frame',
      trade: 'Structural',
      status: 'Draft',
    },
  });
}

main()
  .catch((err) => {
    console.error('Seed script failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
