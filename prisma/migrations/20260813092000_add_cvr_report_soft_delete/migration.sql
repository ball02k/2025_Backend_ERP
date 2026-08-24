ALTER TABLE "cvr_reports"
  ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "cvr_reports_tenantId_projectId_is_deleted_idx"
  ON "cvr_reports"("tenantId", "projectId", "is_deleted");
