-- AlterTable
ALTER TABLE "public"."BudgetLine" ALTER COLUMN "qty" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "rate" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "public"."Contract" ALTER COLUMN "tenantId" DROP NOT NULL,
ALTER COLUMN "tenantId" DROP DEFAULT,
ALTER COLUMN "tenantId" SET DATA TYPE VARCHAR(64);


-- Backfill Contract.tenantId from related Package -> Project
UPDATE "Contract" c
SET "tenantId" = p."tenantId"
FROM "Package" pk
JOIN "Project" p ON pk."projectId" = p."id"
WHERE c."packageId" = pk."id"
  AND c."tenantId" IS NULL;

-- Optional backfill from legacy quantity/unitRate columns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='BudgetLine' AND column_name='quantity') THEN
    EXECUTE 'UPDATE "BudgetLine" SET "qty" = COALESCE("quantity", 0) WHERE "qty" = 0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='BudgetLine' AND column_name='unitRate') THEN
    EXECUTE 'UPDATE "BudgetLine" SET "rate" = COALESCE("unitRate", 0) WHERE "rate" = 0';
  END IF;
END$$;
