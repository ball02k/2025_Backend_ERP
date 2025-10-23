-- Allow multiple contracts per package and link contract line items to package/budget lines

-- Drop legacy unique constraint that enforced one contract per package
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'Contract'
      AND constraint_name = 'Contract_packageId_key'
  ) THEN
    ALTER TABLE "public"."Contract" DROP CONSTRAINT "Contract_packageId_key";
  END IF;
END $$;

-- Add nullable references to package/budget lines on contract line items
ALTER TABLE "public"."ContractLineItem"
  ADD COLUMN IF NOT EXISTS "packageLineItemId" INTEGER,
  ADD COLUMN IF NOT EXISTS "budgetLineId" INTEGER;

-- Indexes to support lookups by budget/package line
CREATE INDEX IF NOT EXISTS "ContractLineItem_tenantId_budgetLineId_idx"
  ON "public"."ContractLineItem"("tenantId", "budgetLineId");

CREATE INDEX IF NOT EXISTS "ContractLineItem_tenantId_packageLineItemId_idx"
  ON "public"."ContractLineItem"("tenantId", "packageLineItemId");

-- Foreign keys (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'ContractLineItem'
      AND constraint_name = 'ContractLineItem_packageLineItemId_fkey'
  ) THEN
    ALTER TABLE "public"."ContractLineItem"
      ADD CONSTRAINT "ContractLineItem_packageLineItemId_fkey"
      FOREIGN KEY ("packageLineItemId")
      REFERENCES "public"."PackageLineItem"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'ContractLineItem'
      AND constraint_name = 'ContractLineItem_budgetLineId_fkey'
  ) THEN
    ALTER TABLE "public"."ContractLineItem"
      ADD CONSTRAINT "ContractLineItem_budgetLineId_fkey"
      FOREIGN KEY ("budgetLineId")
      REFERENCES "public"."BudgetLine"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
