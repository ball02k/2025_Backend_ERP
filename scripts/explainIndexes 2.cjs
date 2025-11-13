// Run EXPLAIN plans to verify new indexes are used
// Usage: node scripts/explainIndexes.cjs [tenantId]
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const tenantId = process.argv[2] || 'demo';
  console.log(`Tenant: ${tenantId}`);

  // Pick a variationId for this tenant if available
  let variationId = null;
  try {
    const v = await prisma.variation.findFirst({ where: { tenantId }, select: { id: true } });
    variationId = v?.id || 0;
  } catch {}

  console.log('\nEXPLAIN VariationStatusHistory timeline');
  const vshExplain = await prisma.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS)
     SELECT * FROM "public"."VariationStatusHistory"
     WHERE "tenantId" = $1 AND "variationId" = $2
     ORDER BY "changedAt" DESC
     LIMIT 50;`,
    tenantId,
    variationId
  );
  for (const row of vshExplain) console.log(row['QUERY PLAN']);

  console.log('\nEXPLAIN Document listing by uploadedAt');
  const docExplain = await prisma.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS)
     SELECT "id", "filename", "uploadedAt"
     FROM "public"."Document"
     WHERE "tenantId" = $1
     ORDER BY "uploadedAt" DESC
     LIMIT 50;`,
    tenantId
  );
  for (const row of docExplain) console.log(row['QUERY PLAN']);
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

