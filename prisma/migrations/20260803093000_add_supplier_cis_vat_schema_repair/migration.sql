-- Additive repair for supplier compliance fields already present in the
-- Prisma model but missing from the local development database.

ALTER TABLE "public"."Supplier"
  ADD COLUMN IF NOT EXISTS "cisRegistered" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cisVerificationStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "cisVerificationDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cisVerificationExpiry" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "utr" TEXT,
  ADD COLUMN IF NOT EXISTS "companyUtr" TEXT,
  ADD COLUMN IF NOT EXISTS "niNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "cisNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "defaultLabourPercentage" DECIMAL(65,30) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "vatRegistered" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "vatNumber" TEXT;

