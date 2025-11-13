-- Add additional package fields for scheduling and commercial info
ALTER TABLE "public"."Package"
  ADD COLUMN IF NOT EXISTS "targetAwardDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "requiredOnSite" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "leadTimeWeeks" INTEGER,
  ADD COLUMN IF NOT EXISTS "contractForm" TEXT,
  ADD COLUMN IF NOT EXISTS "retentionPct" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT,
  ADD COLUMN IF NOT EXISTS "currency" TEXT,
  ADD COLUMN IF NOT EXISTS "ownerUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "buyerUserId" INTEGER;

-- FKs to User
DO $$ BEGIN
  ALTER TABLE "public"."Package"
    ADD CONSTRAINT "Package_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "public"."Package"
    ADD CONSTRAINT "Package_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helpful index for status filters
CREATE INDEX IF NOT EXISTS "Package_projectId_status_idx" ON "public"."Package"("projectId", "status");

