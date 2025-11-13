-- Add optional link from Request to Package, with index and FK

-- Add column if missing
ALTER TABLE "public"."Request"
  ADD COLUMN IF NOT EXISTS "packageId" INTEGER;

-- Create index for tenant + package + status filtering
CREATE INDEX IF NOT EXISTS "Request_tenantId_packageId_status_idx"
  ON "public"."Request" ("tenantId", "packageId", "status");

-- Add foreign key to Package(id) with SET NULL on delete
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'Request'
      AND constraint_name = 'Request_packageId_fkey'
  ) THEN
    ALTER TABLE "public"."Request"
      ADD CONSTRAINT "Request_packageId_fkey"
      FOREIGN KEY ("packageId") REFERENCES "public"."Package"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

