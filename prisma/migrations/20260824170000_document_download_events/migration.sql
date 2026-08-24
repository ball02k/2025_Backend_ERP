CREATE TABLE "DocumentDownloadEvent" (
  "id" SERIAL NOT NULL,
  "tenantId" TEXT NOT NULL,
  "documentId" BIGINT NOT NULL,
  "entityType" TEXT,
  "entityId" INTEGER,
  "linkId" INTEGER,
  "supplierId" INTEGER,
  "userId" INTEGER,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DocumentDownloadEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentDownloadEvent_tenantId_documentId_idx"
  ON "DocumentDownloadEvent"("tenantId", "documentId");

CREATE INDEX "DocumentDownloadEvent_tenantId_entityType_entityId_idx"
  ON "DocumentDownloadEvent"("tenantId", "entityType", "entityId");

CREATE INDEX "DocumentDownloadEvent_tenantId_supplierId_idx"
  ON "DocumentDownloadEvent"("tenantId", "supplierId");

CREATE INDEX "DocumentDownloadEvent_tenantId_userId_idx"
  ON "DocumentDownloadEvent"("tenantId", "userId");

CREATE INDEX "DocumentDownloadEvent_tenantId_downloadedAt_idx"
  ON "DocumentDownloadEvent"("tenantId", "downloadedAt");
