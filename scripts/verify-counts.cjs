/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const results = {};
  try { results.projects = await prisma.project.count(); } catch (e) { results.projects = `err:${e.code||e.message}`; }
  try { results.tasks = await prisma.task.count(); } catch (e) { results.tasks = `err:${e.code||e.message}`; }
  try { results.rfis = await prisma.rfi.count(); } catch (e) { results.rfis = `err:${e.code||e.message}`; }
  try { results.purchaseOrders = await prisma.purchaseOrder.count(); } catch (e) { results.purchaseOrders = `err:${e.code||e.message}`; }
  try { results.suppliers = await prisma.supplier.count(); } catch (e) { results.suppliers = `err:${e.code||e.message}`; }
  try { results.packages = await prisma.package.count(); } catch (e) { results.packages = `err:${e.code||e.message}`; }
  try { results.contracts = await prisma.contract.count(); } catch (e) { results.contracts = `err:${e.code||e.message}`; }
  console.log(JSON.stringify(results, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('verify-counts error:', e);
  await prisma.$disconnect();
  process.exit(1);
});

