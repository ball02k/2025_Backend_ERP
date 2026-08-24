-- Additive project risk and simple approval request stores for project tabs.

CREATE TABLE IF NOT EXISTS "project_risks" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL DEFAULT 'technical',
  "probability" TEXT NOT NULL DEFAULT 'medium',
  "impact" TEXT NOT NULL DEFAULT 'medium',
  "status" TEXT NOT NULL DEFAULT 'identified',
  "mitigation" TEXT,
  "owner" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "project_risks_tenantId_projectId_isDeleted_idx"
  ON "project_risks"("tenantId", "projectId", "isDeleted");
CREATE INDEX IF NOT EXISTS "project_risks_tenantId_projectId_status_idx"
  ON "project_risks"("tenantId", "projectId", "status");
CREATE INDEX IF NOT EXISTS "project_risks_tenantId_projectId_category_idx"
  ON "project_risks"("tenantId", "projectId", "category");

CREATE TABLE IF NOT EXISTS "project_approval_requests" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL DEFAULT 'document',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "amount" DECIMAL(18,2),
  "requester" TEXT,
  "approver" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "project_approval_requests_tenantId_projectId_isDeleted_idx"
  ON "project_approval_requests"("tenantId", "projectId", "isDeleted");
CREATE INDEX IF NOT EXISTS "project_approval_requests_tenantId_projectId_status_idx"
  ON "project_approval_requests"("tenantId", "projectId", "status");
CREATE INDEX IF NOT EXISTS "project_approval_requests_tenantId_projectId_type_idx"
  ON "project_approval_requests"("tenantId", "projectId", "type");
