-- AlterTable
ALTER TABLE "public"."BudgetLine" ADD COLUMN     "actual" DECIMAL(18,2),
ADD COLUMN     "estimated" DECIMAL(18,2),
ADD COLUMN     "planned" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "public"."CVRSnapshot" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."CVRSnapshotLine" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Contract" ADD COLUMN     "originalValue" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "public"."Invoice" ADD COLUMN     "contractId" BIGINT,
ADD COLUMN     "packageId" INTEGER,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "public"."Project" ADD COLUMN     "clientContactId" INTEGER,
ADD COLUMN     "contractType" TEXT,
ADD COLUMN     "paymentTermsDays" INTEGER,
ADD COLUMN     "projectManagerUserId" INTEGER,
ADD COLUMN     "quantitySurveyorUserId" INTEGER,
ADD COLUMN     "retentionPct" DECIMAL(5,2),
ADD COLUMN     "siteLat" DECIMAL(10,7),
ADD COLUMN     "siteLng" DECIMAL(10,7),
ADD COLUMN     "sitePostcode" TEXT;

-- AlterTable
ALTER TABLE "public"."Variation" ADD COLUMN     "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" INTEGER,
ADD COLUMN     "budgetLineId" INTEGER,
ADD COLUMN     "contractId" INTEGER,
ADD COLUMN     "justification" TEXT,
ADD COLUMN     "packageId" INTEGER;

-- CreateTable
CREATE TABLE "public"."CostValueReconciliation" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "budget" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "committed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "actual" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "earnedValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "costVariance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "costToComplete" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "marginPct" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "justification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostValueReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CVRLine" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cvrId" INTEGER NOT NULL,
    "packageId" INTEGER,
    "costCode" TEXT,
    "budget" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "committed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "actual" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "earnedValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "variance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "adjustment" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "variationId" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CVRLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiaryEntry" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "issues" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostValueReconciliation_tenantId_projectId_idx" ON "public"."CostValueReconciliation"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "CostValueReconciliation_tenantId_period_idx" ON "public"."CostValueReconciliation"("tenantId", "period");

-- CreateIndex
CREATE INDEX "CVRLine_tenantId_cvrId_idx" ON "public"."CVRLine"("tenantId", "cvrId");

-- CreateIndex
CREATE INDEX "CVRLine_tenantId_packageId_idx" ON "public"."CVRLine"("tenantId", "packageId");

-- CreateIndex
CREATE INDEX "DiaryEntry_tenantId_projectId_date_idx" ON "public"."DiaryEntry"("tenantId", "projectId", "date");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_projectId_idx" ON "public"."Invoice"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_packageId_idx" ON "public"."Invoice"("tenantId", "packageId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_contractId_idx" ON "public"."Invoice"("tenantId", "contractId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_projectId_source_idx" ON "public"."Invoice"("tenantId", "projectId", "source");

-- CreateIndex
CREATE INDEX "Project_tenantId_clientContactId_idx" ON "public"."Project"("tenantId", "clientContactId");

-- CreateIndex
CREATE INDEX "Project_tenantId_projectManagerUserId_idx" ON "public"."Project"("tenantId", "projectManagerUserId");

-- CreateIndex
CREATE INDEX "Project_tenantId_quantitySurveyorUserId_idx" ON "public"."Project"("tenantId", "quantitySurveyorUserId");

-- CreateIndex
CREATE INDEX "Variation_tenantId_status_idx" ON "public"."Variation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Variation_tenantId_contractId_idx" ON "public"."Variation"("tenantId", "contractId");

-- CreateIndex
CREATE INDEX "Variation_tenantId_budgetLineId_idx" ON "public"."Variation"("tenantId", "budgetLineId");

-- CreateIndex
CREATE INDEX "Variation_tenantId_packageId_idx" ON "public"."Variation"("tenantId", "packageId");

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "public"."Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_projectManagerUserId_fkey" FOREIGN KEY ("projectManagerUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_quantitySurveyorUserId_fkey" FOREIGN KEY ("quantitySurveyorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CVRLine" ADD CONSTRAINT "CVRLine_cvrId_fkey" FOREIGN KEY ("cvrId") REFERENCES "public"."CostValueReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
