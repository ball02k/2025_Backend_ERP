-- 1) Add required columns first
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "tenantId" VARCHAR(64);
CREATE INDEX IF NOT EXISTS "Contract_tenantId_idx" ON "Contract" ("tenantId");

ALTER TABLE "BudgetLine" ADD COLUMN IF NOT EXISTS "qty"  DECIMAL(18,2) DEFAULT 0 NOT NULL;
ALTER TABLE "BudgetLine" ADD COLUMN IF NOT EXISTS "rate" DECIMAL(18,4) DEFAULT 0 NOT NULL;

-- 2) Guarded backfills (safe for shadow DB)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Project' AND column_name = 'tenantId'
  ) THEN
    UPDATE "Contract" c
    SET "tenantId" = p."tenantId"
    FROM "Package" pk
    JOIN "Project" p ON pk."projectId" = p."id"
    WHERE c."packageId" = pk."id"
      AND c."tenantId" IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'BudgetLine' AND column_name = 'quantity'
  ) THEN
    UPDATE "BudgetLine"
    SET "qty" = COALESCE("quantity", 0)
    WHERE "qty" = 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'BudgetLine' AND column_name = 'unitRate'
  ) THEN
    UPDATE "BudgetLine"
    SET "rate" = COALESCE("unitRate", 0)
    WHERE "rate" = 0;
  END IF;
END$$;
