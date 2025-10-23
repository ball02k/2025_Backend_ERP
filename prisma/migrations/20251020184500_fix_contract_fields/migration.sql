-- Add missing Contract fields for Direct Award functionality
ALTER TABLE "public"."Contract" ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'GBP';
ALTER TABLE "public"."Contract" ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT;
ALTER TABLE "public"."Contract" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "public"."Contract" ADD COLUMN IF NOT EXISTS "internalTeam" TEXT;

-- Rename contractNumber to contractRef if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Contract' AND column_name = 'contractNumber'
  ) THEN
    ALTER TABLE "public"."Contract" RENAME COLUMN "contractNumber" TO "contractRef";
  END IF;
END $$;

-- Ensure contractRef exists
ALTER TABLE "public"."Contract" ADD COLUMN IF NOT EXISTS "contractRef" TEXT;

-- Change retentionPct from FLOAT to DECIMAL if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Contract'
    AND column_name = 'retentionPct' AND data_type = 'double precision'
  ) THEN
    ALTER TABLE "public"."Contract" ALTER COLUMN "retentionPct" TYPE DECIMAL(5,2);
  END IF;
END $$;
