-- AlterTable
ALTER TABLE "public"."ActualCost" ADD COLUMN     "category" TEXT,
ADD COLUMN     "periodMonth" TEXT;

-- AlterTable
ALTER TABLE "public"."BudgetLine" ADD COLUMN     "periodMonth" TEXT;

-- AlterTable
ALTER TABLE "public"."Commitment" ADD COLUMN     "category" TEXT,
ADD COLUMN     "periodMonth" TEXT;

-- AlterTable
ALTER TABLE "public"."Forecast" ADD COLUMN     "periodMonth" TEXT;

-- CreateIndex
CREATE INDEX "ActualCost_tenantId_projectId_periodMonth_idx" ON "public"."ActualCost"("tenantId", "projectId", "periodMonth");

-- CreateIndex
CREATE INDEX "BudgetLine_tenantId_projectId_periodMonth_idx" ON "public"."BudgetLine"("tenantId", "projectId", "periodMonth");

-- CreateIndex
CREATE INDEX "Commitment_tenantId_projectId_periodMonth_idx" ON "public"."Commitment"("tenantId", "projectId", "periodMonth");

-- CreateIndex
CREATE INDEX "Forecast_tenantId_projectId_periodMonth_idx" ON "public"."Forecast"("tenantId", "projectId", "periodMonth");
