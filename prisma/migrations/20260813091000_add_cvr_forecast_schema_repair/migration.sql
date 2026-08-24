-- Additive local schema repair for project role, CVR snapshots, direct costs and forecast tables.
-- All changes are guarded so the migration can be applied safely to partially-updated databases.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ForecastMethod') THEN
    CREATE TYPE "ForecastMethod" AS ENUM ('COMMITTED', 'MANUAL', 'COMMITTED_PLUS_ADJ', 'CALCULATED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ForecastStatus') THEN
    CREATE TYPE "ForecastStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'OVER_BUDGET', 'UNDER_BUDGET', 'REQUIRES_REVIEW');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ForecastChangeType') THEN
    CREATE TYPE "ForecastChangeType" AS ENUM ('MANUAL_ADJUSTMENT', 'CONTRACT_AWARDED', 'VARIATION_APPROVED', 'PERIOD_END_REVIEW', 'SYSTEM_RECALCULATION', 'INITIAL_SETUP');
  END IF;
END $$;

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "projectRole" TEXT NOT NULL DEFAULT 'PRINCIPAL_CONTRACTOR',
  ADD COLUMN IF NOT EXISTS "upstreamPartyType" TEXT,
  ADD COLUMN IF NOT EXISTS "upstreamPartyId" INTEGER,
  ADD COLUMN IF NOT EXISTS "upstreamContactId" INTEGER,
  ADD COLUMN IF NOT EXISTS "upstreamContractRef" TEXT,
  ADD COLUMN IF NOT EXISTS "upstreamPoNumber" TEXT;

CREATE INDEX IF NOT EXISTS "Project_tenantId_projectRole_idx" ON "Project"("tenantId", "projectRole");

ALTER TABLE "BudgetLine"
  ADD COLUMN IF NOT EXISTS "forecastMethod" "ForecastMethod" DEFAULT 'COMMITTED',
  ADD COLUMN IF NOT EXISTS "forecastAdjustment" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "forecastAdjustmentNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "anticipatedVariations" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "riskAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "forecastUpdatedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "forecastStatus" "ForecastStatus" DEFAULT 'ON_TRACK',
  ADD COLUMN IF NOT EXISTS "costToComplete" DECIMAL(18,2);

ALTER TABLE "CVRSnapshot"
  ADD COLUMN IF NOT EXISTS "snapshotNumber" INTEGER,
  ADD COLUMN IF NOT EXISTS "snapshotRef" TEXT,
  ADD COLUMN IF NOT EXISTS "periodStart" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "periodEnd" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "snapshotType" TEXT NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS "projectRole" TEXT,
  ADD COLUMN IF NOT EXISTS "contractValue" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "valueSource" TEXT,
  ADD COLUMN IF NOT EXISTS "periodValue" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "originalBudget" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "currentBudget" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "committedCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "accruedCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "invoicedCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "paidCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "totalCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "labourCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "materialsCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "subcontractorCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "plantCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "preliminariesCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "overheadCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "otherCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "certifiedValue" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "appliedValue" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "pendingValue" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "totalValue" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "retentionHeld" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "retentionReleased" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "grossMargin" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "grossMarginPercentage" DECIMAL(9,4),
  ADD COLUMN IF NOT EXISTS "netMargin" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "netMarginPercentage" DECIMAL(9,4),
  ADD COLUMN IF NOT EXISTS "budgetVariance" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "budgetVariancePercentage" DECIMAL(9,4),
  ADD COLUMN IF NOT EXISTS "forecastFinalCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "costToComplete" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "forecastFinalMargin" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "forecastMarginVariance" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "poCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "invoiceCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "directCostCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "contractCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "applicationCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "certificateCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "keyIssues" TEXT,
  ADD COLUMN IF NOT EXISTS "mitigations" TEXT,
  ADD COLUMN IF NOT EXISTS "assumptions" TEXT,
  ADD COLUMN IF NOT EXISTS "createdBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "finalizedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalizedBy" INTEGER;

UPDATE "CVRSnapshot"
SET
  "snapshotNumber" = COALESCE("snapshotNumber", "id"),
  "snapshotRef" = COALESCE("snapshotRef", CONCAT('CVR-', "period", '-', "id")),
  "periodStart" = COALESCE("periodStart", to_date("period" || '-01', 'YYYY-MM-DD')::timestamp),
  "periodEnd" = COALESCE("periodEnd", (to_date("period" || '-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 day')::timestamp),
  "status" = COALESCE("status", 'DRAFT');

ALTER TABLE "CVRSnapshot"
  ALTER COLUMN "snapshotNumber" SET NOT NULL,
  ALTER COLUMN "snapshotRef" SET NOT NULL,
  ALTER COLUMN "periodStart" SET NOT NULL,
  ALTER COLUMN "periodEnd" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

CREATE UNIQUE INDEX IF NOT EXISTS "CVRSnapshot_tenantId_projectId_snapshotNumber_key" ON "CVRSnapshot"("tenantId", "projectId", "snapshotNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "CVRSnapshot_tenantId_projectId_snapshotRef_key" ON "CVRSnapshot"("tenantId", "projectId", "snapshotRef");
CREATE INDEX IF NOT EXISTS "CVRSnapshot_tenantId_projectId_period_idx" ON "CVRSnapshot"("tenantId", "projectId", "period");
CREATE INDEX IF NOT EXISTS "CVRSnapshot_tenantId_projectId_periodEnd_idx" ON "CVRSnapshot"("tenantId", "projectId", "periodEnd");
CREATE INDEX IF NOT EXISTS "CVRSnapshot_tenantId_status_idx" ON "CVRSnapshot"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "CVRSnapshot_snapshotDate_idx" ON "CVRSnapshot"("snapshotDate");
CREATE INDEX IF NOT EXISTS "CVRSnapshot_snapshotType_idx" ON "CVRSnapshot"("snapshotType");

CREATE TABLE IF NOT EXISTS "project_costs" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "budgetLineId" INTEGER,
  "costCategory" TEXT NOT NULL,
  "costType" TEXT NOT NULL,
  "costStatus" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "vatAmount" DECIMAL(18,2),
  "totalAmount" DECIMAL(18,2),
  "description" TEXT NOT NULL,
  "reference" TEXT,
  "costCode" TEXT,
  "notes" TEXT,
  "sourceType" TEXT,
  "sourceReference" TEXT,
  "incurredDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "committedDate" TIMESTAMP(3),
  "invoicedDate" TIMESTAMP(3),
  "paidDate" TIMESTAMP(3),
  "periodMonth" TEXT,
  "supplierName" TEXT,
  "supplierId" INTEGER,
  "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
  "approvedBy" INTEGER,
  "approvedAt" TIMESTAMP(3),
  "rejectedReason" TEXT,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "project_costs_tenantId_projectId_idx" ON "project_costs"("tenantId", "projectId");
CREATE INDEX IF NOT EXISTS "project_costs_tenantId_budgetLineId_idx" ON "project_costs"("tenantId", "budgetLineId");
CREATE INDEX IF NOT EXISTS "project_costs_projectId_costCategory_idx" ON "project_costs"("projectId", "costCategory");
CREATE INDEX IF NOT EXISTS "project_costs_projectId_costStatus_idx" ON "project_costs"("projectId", "costStatus");
CREATE INDEX IF NOT EXISTS "project_costs_projectId_periodMonth_idx" ON "project_costs"("projectId", "periodMonth");
CREATE INDEX IF NOT EXISTS "project_costs_incurredDate_idx" ON "project_costs"("incurredDate");
CREATE INDEX IF NOT EXISTS "project_costs_costCategory_costStatus_idx" ON "project_costs"("costCategory", "costStatus");

CREATE TABLE IF NOT EXISTS "ProjectForecast" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL UNIQUE,
  "totalBudget" DECIMAL(18,2) NOT NULL,
  "totalCommitted" DECIMAL(18,2) NOT NULL,
  "totalActual" DECIMAL(18,2) NOT NULL,
  "totalAnticipatedFinal" DECIMAL(18,2) NOT NULL,
  "budgetVariance" DECIMAL(18,2) NOT NULL,
  "commitmentVariance" DECIMAL(18,2) NOT NULL,
  "costToComplete" DECIMAL(18,2) NOT NULL,
  "totalRiskAllowance" DECIMAL(18,2) NOT NULL,
  "contingencyRemaining" DECIMAL(18,2) NOT NULL,
  "overallStatus" "ForecastStatus" NOT NULL,
  "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastReviewedAt" TIMESTAMP(3),
  "lastReviewedBy" TEXT
);

CREATE INDEX IF NOT EXISTS "ProjectForecast_tenantId_idx" ON "ProjectForecast"("tenantId");

CREATE TABLE IF NOT EXISTS "BudgetLineForecastHistory" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "budgetLineId" INTEGER NOT NULL,
  "previousForecast" DECIMAL(18,2) NOT NULL,
  "newForecast" DECIMAL(18,2) NOT NULL,
  "changeAmount" DECIMAL(18,2) NOT NULL,
  "changeReason" TEXT,
  "changeType" "ForecastChangeType" NOT NULL,
  "committed" DECIMAL(18,2) NOT NULL,
  "actual" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "BudgetLineForecastHistory_budgetLineId_idx" ON "BudgetLineForecastHistory"("budgetLineId");
CREATE INDEX IF NOT EXISTS "BudgetLineForecastHistory_tenantId_createdAt_idx" ON "BudgetLineForecastHistory"("tenantId", "createdAt");
