-- Create ImportJob table (tracks budget CSV import previews/commits)
CREATE TABLE IF NOT EXISTS "public"."ImportJob" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "filename" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "preview" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- FK: projectId -> Project(id)
DO $$ BEGIN
  ALTER TABLE "public"."ImportJob"
    ADD CONSTRAINT "ImportJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helpful index for queries by tenant/project
CREATE INDEX IF NOT EXISTS "ImportJob_tenantId_projectId_idx" ON "public"."ImportJob"("tenantId", "projectId");

