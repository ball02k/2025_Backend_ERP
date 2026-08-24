-- Additive repair for Contract commercial fields present in the Prisma model
-- but missing from the local development database.

ALTER TABLE "public"."Contract"
  ADD COLUMN IF NOT EXISTS "direction" TEXT DEFAULT 'DOWNSTREAM',
  ADD COLUMN IF NOT EXISTS "labourPercentage" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "materialsPercentage" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "vatTreatment" TEXT DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS "isEndUser" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "mainContractorDiscount" DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "mcdDescription" TEXT;

UPDATE "public"."Contract"
SET "direction" = 'DOWNSTREAM'
WHERE "direction" IS NULL;

CREATE INDEX IF NOT EXISTS "Contract_tenantId_projectId_direction_idx"
  ON "public"."Contract"("tenantId", "projectId", "direction");

