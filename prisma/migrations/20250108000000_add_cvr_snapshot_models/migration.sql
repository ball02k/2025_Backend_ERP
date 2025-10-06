-- CreateTable
CREATE TABLE "CVRSnapshot" (
    "id" SERIAL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CVRSnapshotLine" (
    "id" SERIAL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "budgetLineId" INTEGER,
    "packageId" INTEGER,
    "contractId" BIGINT,
    "code" TEXT,
    "name" TEXT,
    "planned" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimate" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "actualToDate" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "progressPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CVRSnapshotLine_snapshotId_fkey"
      FOREIGN KEY ("snapshotId") REFERENCES "CVRSnapshot"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
);

-- CreateIndex
CREATE INDEX "CVRSnapshot_tenantId_projectId_period_idx"
  ON "CVRSnapshot"("tenantId", "projectId", "period");

-- CreateIndex
CREATE INDEX "CVRSnapshot_tenantId_status_idx"
  ON "CVRSnapshot"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CVRSnapshotLine_tenantId_snapshotId_idx"
  ON "CVRSnapshotLine"("tenantId", "snapshotId");

-- CreateIndex
CREATE INDEX "CVRSnapshotLine_tenantId_projectId_idx"
  ON "CVRSnapshotLine"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "CVRSnapshotLine_tenantId_packageId_idx"
  ON "CVRSnapshotLine"("tenantId", "packageId");

-- CreateIndex
CREATE INDEX "CVRSnapshotLine_tenantId_budgetLineId_idx"
  ON "CVRSnapshotLine"("tenantId", "budgetLineId");

-- CreateIndex
CREATE INDEX "CVRSnapshotLine_tenantId_contractId_idx"
  ON "CVRSnapshotLine"("tenantId", "contractId");
