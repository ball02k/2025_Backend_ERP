-- AlterTable
ALTER TABLE "public"."ProjectSnapshot" ADD COLUMN "financialBudget" DECIMAL NOT NULL DEFAULT 0,
    ADD COLUMN "financialCommitted" DECIMAL NOT NULL DEFAULT 0,
    ADD COLUMN "financialActual" DECIMAL NOT NULL DEFAULT 0,
    ADD COLUMN "financialForecast" DECIMAL NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."BudgetLine" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "projectId" INTEGER NOT NULL,
    "code" TEXT,
    "category" TEXT,
    "description" TEXT,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."BudgetLine" ADD CONSTRAINT "BudgetLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "BudgetLine_tenantId_projectId_idx" ON "public"."BudgetLine"("tenantId", "projectId");

-- CreateTable
CREATE TABLE "public"."Commitment" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "projectId" INTEGER NOT NULL,
    "linkedPoId" INTEGER,
    "ref" TEXT,
    "supplier" TEXT,
    "description" TEXT,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."Commitment" ADD CONSTRAINT "Commitment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Commitment_tenantId_projectId_status_idx" ON "public"."Commitment"("tenantId", "projectId", "status");

-- CreateTable
CREATE TABLE "public"."ActualCost" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "projectId" INTEGER NOT NULL,
    "ref" TEXT,
    "supplier" TEXT,
    "description" TEXT,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ActualCost_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."ActualCost" ADD CONSTRAINT "ActualCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ActualCost_tenantId_projectId_incurredAt_idx" ON "public"."ActualCost"("tenantId", "projectId", "incurredAt");

-- CreateTable
CREATE TABLE "public"."Forecast" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "projectId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Forecast_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."Forecast" ADD CONSTRAINT "Forecast_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Forecast_tenantId_projectId_period_key" ON "public"."Forecast"("tenantId", "projectId", "period");
CREATE INDEX "Forecast_tenantId_projectId_idx" ON "public"."Forecast"("tenantId", "projectId");
