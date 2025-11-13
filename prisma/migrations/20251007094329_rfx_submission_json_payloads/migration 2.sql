-- AlterTable
ALTER TABLE "public"."BudgetLine" ADD COLUMN     "costCodeId" INTEGER;

-- AlterTable
ALTER TABLE "public"."Package" ADD COLUMN     "costCodeId" INTEGER;

-- CreateTable
CREATE TABLE "public"."CostCode" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "parentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RFxSubmission" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rfxId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "pricing" JSONB,
    "answers" JSONB,
    "score" DECIMAL(8,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RFxSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostCode_tenantId_parentId_idx" ON "public"."CostCode"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCode_tenantId_code_key" ON "public"."CostCode"("tenantId", "code");

-- CreateIndex
CREATE INDEX "RFxSubmission_tenantId_rfxId_idx" ON "public"."RFxSubmission"("tenantId", "rfxId");

-- CreateIndex
CREATE INDEX "RFxSubmission_tenantId_supplierId_idx" ON "public"."RFxSubmission"("tenantId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "RFxSubmission_tenantId_rfxId_supplierId_key" ON "public"."RFxSubmission"("tenantId", "rfxId", "supplierId");

-- CreateIndex
CREATE INDEX "BudgetLine_tenantId_costCodeId_idx" ON "public"."BudgetLine"("tenantId", "costCodeId");

-- CreateIndex
CREATE INDEX "Package_projectId_costCodeId_idx" ON "public"."Package"("projectId", "costCodeId");

-- AddForeignKey
ALTER TABLE "public"."CostCode" ADD CONSTRAINT "CostCode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BudgetLine" ADD CONSTRAINT "BudgetLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "public"."CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Package" ADD CONSTRAINT "Package_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "public"."CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
