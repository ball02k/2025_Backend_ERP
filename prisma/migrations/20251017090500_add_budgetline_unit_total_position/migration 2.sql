-- Add missing columns to BudgetLine table
ALTER TABLE "BudgetLine" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "BudgetLine" ADD COLUMN IF NOT EXISTS "total" DECIMAL(18,2) DEFAULT 0 NOT NULL;
ALTER TABLE "BudgetLine" ADD COLUMN IF NOT EXISTS "position" INTEGER DEFAULT 0 NOT NULL;

-- Add missing position column to BudgetGroup table
ALTER TABLE "BudgetGroup" ADD COLUMN IF NOT EXISTS "position" INTEGER DEFAULT 0 NOT NULL;

-- Backfill total from qty * rate where total is 0
UPDATE "BudgetLine"
SET "total" = COALESCE("qty", 0) * COALESCE("rate", 0)
WHERE "total" = 0 OR "total" IS NULL;
