-- DropIndex
DROP INDEX "public"."PackageItem_budgetLineId_key";

-- AlterTable
ALTER TABLE "public"."Contract" ADD COLUMN     "paymentTerms" TEXT;

-- AlterTable
ALTER TABLE "public"."Package" ADD COLUMN     "tradeCode" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'external',
ALTER COLUMN "status" SET DEFAULT 'draft';

-- CreateTable
CREATE TABLE "public"."Trade" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OcrImportJob" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "projectId" INTEGER NOT NULL,
    "documentId" BIGINT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'budget',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "resultJson" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcrImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_tenantId_name_idx" ON "public"."Trade"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_tenantId_code_key" ON "public"."Trade"("tenantId", "code");

-- CreateIndex
CREATE INDEX "OcrImportJob_tenantId_projectId_status_idx" ON "public"."OcrImportJob"("tenantId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PackageItem_tenantId_budgetLineId_key" ON "public"."PackageItem"("tenantId", "budgetLineId");

-- AddForeignKey
ALTER TABLE "public"."OcrImportJob" ADD CONSTRAINT "OcrImportJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

