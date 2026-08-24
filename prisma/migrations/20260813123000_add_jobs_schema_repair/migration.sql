-- Additive repair for local schemas that predate the current Job model.
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "preferredEngineerId" TEXT;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "slaResponseTime" INTEGER;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "slaDueDate" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "jobs_tenantId_slaDueDate_idx" ON "jobs"("tenantId", "slaDueDate");
CREATE INDEX IF NOT EXISTS "jobs_tenantId_preferredEngineerId_idx" ON "jobs"("tenantId", "preferredEngineerId");
