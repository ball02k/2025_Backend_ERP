CREATE TABLE IF NOT EXISTS "ProjectSupplier" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "supplierId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "trade" TEXT,
  "role" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "notes" TEXT,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectSupplier_tenantId_projectId_supplierId_key"
  ON "ProjectSupplier"("tenantId", "projectId", "supplierId");

CREATE INDEX IF NOT EXISTS "ProjectSupplier_tenantId_projectId_status_idx"
  ON "ProjectSupplier"("tenantId", "projectId", "status");

CREATE INDEX IF NOT EXISTS "ProjectSupplier_tenantId_supplierId_idx"
  ON "ProjectSupplier"("tenantId", "supplierId");
