#!/usr/bin/env node
require('dotenv/config');
const { prisma } = require('../utils/prisma.cjs');

async function main() {
  console.log('[backfill] Starting backfill for DocumentLink.entityType/entityId');
  const sql = `
    UPDATE "DocumentLink" dl
    SET
      "entityType" = COALESCE(
        NULLIF(dl."entityType", ''),
        CASE
          WHEN dl."projectId" IS NOT NULL THEN 'project'
          WHEN dl."variationId" IS NOT NULL THEN 'variation'
          WHEN dl."poId" IS NOT NULL THEN 'po'
          WHEN dl."rfiId" IS NOT NULL THEN 'rfi'
          WHEN dl."qaRecordId" IS NOT NULL THEN 'qa'
          WHEN dl."hsEventId" IS NOT NULL THEN 'hs'
          WHEN dl."carbonEntryId" IS NOT NULL THEN 'carbon'
          ELSE dl."linkType"
        END
      ),
      "entityId" = COALESCE(
        dl."entityId",
        COALESCE(dl."projectId", dl."variationId", dl."poId", dl."rfiId", dl."qaRecordId", dl."hsEventId", dl."carbonEntryId")
      )
    WHERE (dl."entityType" IS NULL OR dl."entityId" IS NULL);
  `;

  const result = await prisma.$executeRawUnsafe(sql);
  console.log(`[backfill] Rows updated: ${result}`);

  // Sanity check counts
  const [nullType, nullId] = await Promise.all([
    prisma.documentLink.count({ where: { entityType: null } }),
    prisma.documentLink.count({ where: { entityId: null } }),
  ]);
  console.log(`[backfill] Remaining null entityType: ${nullType}, null entityId: ${nullId}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

