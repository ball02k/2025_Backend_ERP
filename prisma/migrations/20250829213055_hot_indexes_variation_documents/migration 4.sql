-- Performance indexes for VariationStatusHistory and Document
--
-- Why these indexes?
-- - VariationStatusHistory: Queries typically filter by tenant and variation, and order by changedAt.
--   Composite index (tenantId, variationId, changedAt) accelerates lookups and time-ordered scans
--   while maintaining per-tenant isolation in multi-tenant systems.
-- - Document: Lists are usually fetched per tenant, sorted by uploadedAt. The composite index
--   (tenantId, uploadedAt) supports efficient pagination and avoids sorting on a large tenant-wide scan.
-- - DocumentLink: Existing indexes on (tenantId, projectId) and (tenantId, documentId) already in place.
--
-- Safe backfill strategy for tenantId on VariationStatusHistory:
-- 1) Add column as NULLable
-- 2) Backfill from Variation.tenantId using a single SQL UPDATE with a join
-- 3) Enforce NOT NULL to match Prisma schema

-- 1) Add column as NULLable
ALTER TABLE "public"."VariationStatusHistory" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- 2) Backfill from Variation
UPDATE "public"."VariationStatusHistory" vsh
SET "tenantId" = v."tenantId"
FROM "public"."Variation" v
WHERE v."id" = vsh."variationId" AND vsh."tenantId" IS NULL;

-- 3) Enforce NOT NULL
ALTER TABLE "public"."VariationStatusHistory"
ALTER COLUMN "tenantId" SET NOT NULL;

-- Create composite index for faster per-tenant, per-variation timelines
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND c.relname = 'VariationStatusHistory_tenantId_variationId_changedAt_idx'
      AND n.nspname = 'public'
  ) THEN
    CREATE INDEX "VariationStatusHistory_tenantId_variationId_changedAt_idx"
      ON "public"."VariationStatusHistory" ("tenantId", "variationId", "changedAt");
  END IF;
END $$;

-- Create composite index on Document for tenant feeds by upload time
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND c.relname = 'Document_tenantId_uploadedAt_idx'
      AND n.nspname = 'public'
  ) THEN
    CREATE INDEX "Document_tenantId_uploadedAt_idx"
      ON "public"."Document" ("tenantId", "uploadedAt");
  END IF;
END $$;
