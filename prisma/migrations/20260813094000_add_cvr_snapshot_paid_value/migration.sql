-- Additive repair for CVR snapshot payment tracking.

ALTER TABLE "CVRSnapshot"
  ADD COLUMN IF NOT EXISTS "paidValue" DECIMAL(18,2);
