-- Add quantity, unit, rate columns to BudgetLine to support granular CSV imports
ALTER TABLE "BudgetLine"
  ADD COLUMN "quantity" DECIMAL(18,2),
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "rate" DECIMAL(18,2);

