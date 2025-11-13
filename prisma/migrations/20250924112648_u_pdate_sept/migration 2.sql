/*
  Warnings:

  - Made the column `net` on table `Invoice` required. This step will fail if there are existing NULL values in that column.
  - Made the column `vat` on table `Invoice` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gross` on table `Invoice` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_supplierId_fkey";

-- AlterTable
ALTER TABLE "public"."DocumentLink" ADD COLUMN     "carbonEntryId" INTEGER,
ADD COLUMN     "hsEventId" INTEGER,
ADD COLUMN     "qaRecordId" INTEGER,
ADD COLUMN     "rfiId" INTEGER;

-- AlterTable
ALTER TABLE "public"."Invoice" ALTER COLUMN "issueDate" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "dueDate" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "net" SET NOT NULL,
ALTER COLUMN "net" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "vat" SET NOT NULL,
ALTER COLUMN "vat" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "gross" SET NOT NULL,
ALTER COLUMN "gross" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Supplier" ADD COLUMN     "email" TEXT,
ADD COLUMN     "insurancePolicyNumber" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "public"."Rfi" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "rfiNumber" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'med',
    "discipline" TEXT,
    "packageId" INTEGER,
    "requestedByUserId" TEXT,
    "assignedToUserId" TEXT,
    "toCompanyId" INTEGER,
    "dueDate" TIMESTAMP(3),
    "responseText" TEXT,
    "responseByUserId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "costImpact" TEXT,
    "scheduleImpact" TEXT,
    "changeRequired" BOOLEAN,
    "ccEmails" TEXT,
    "tags" TEXT,
    "location" TEXT,
    "originatorRef" TEXT,
    "closedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rfi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QaRecord" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "trade" TEXT,
    "location" TEXT,
    "lot" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "raisedByUserId" TEXT,
    "assignedToUserId" TEXT,
    "dueDate" TIMESTAMP(3),
    "itpRef" TEXT,
    "testMethod" TEXT,
    "acceptanceCriteria" TEXT,
    "remedialAction" TEXT,
    "targetClose" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "tags" TEXT,
    "reference" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QaItem" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "qaRecordId" INTEGER NOT NULL,
    "item" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "responsibleParty" TEXT,
    "dueDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HsEvent" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "reportedByUserId" TEXT,
    "assignedToUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "severity" TEXT,
    "initialRiskRating" TEXT,
    "residualRiskRating" TEXT,
    "personsInvolved" JSONB,
    "lostTimeHours" INTEGER,
    "isRIDDOR" BOOLEAN,
    "riddorRef" TEXT,
    "regulatorNotified" BOOLEAN,
    "regulatorName" TEXT,
    "notificationDate" TIMESTAMP(3),
    "immediateAction" TEXT,
    "rootCause" TEXT,
    "correctiveActions" TEXT,
    "targetClose" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "tags" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CarbonEntry" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "activityDate" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "emissionFactor" DECIMAL(18,6) NOT NULL,
    "factorUnit" TEXT NOT NULL,
    "calculatedKgCO2e" DECIMAL(18,6) NOT NULL,
    "supplierId" INTEGER,
    "purchaseOrderId" INTEGER,
    "poLineId" INTEGER,
    "deliveryId" INTEGER,
    "factorSource" TEXT,
    "factorRef" TEXT,
    "materialOrFuel" TEXT,
    "vehicleType" TEXT,
    "fuelType" TEXT,
    "notes" TEXT,
    "periodMonth" INTEGER,
    "periodYear" INTEGER,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarbonEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierOnboardingToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierOnboardingToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rfi_tenantId_projectId_status_idx" ON "public"."Rfi"("tenantId", "projectId", "status");

-- CreateIndex
CREATE INDEX "Rfi_tenantId_rfiNumber_idx" ON "public"."Rfi"("tenantId", "rfiNumber");

-- CreateIndex
CREATE INDEX "QaRecord_tenantId_projectId_status_type_idx" ON "public"."QaRecord"("tenantId", "projectId", "status", "type");

-- CreateIndex
CREATE INDEX "QaItem_tenantId_qaRecordId_idx" ON "public"."QaItem"("tenantId", "qaRecordId");

-- CreateIndex
CREATE INDEX "HsEvent_tenantId_projectId_type_status_idx" ON "public"."HsEvent"("tenantId", "projectId", "type", "status");

-- CreateIndex
CREATE INDEX "CarbonEntry_tenantId_projectId_scope_periodYear_periodMonth_idx" ON "public"."CarbonEntry"("tenantId", "projectId", "scope", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOnboardingToken_token_key" ON "public"."SupplierOnboardingToken"("token");

-- CreateIndex
CREATE INDEX "SupplierOnboardingToken_supplierId_idx" ON "public"."SupplierOnboardingToken"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierOnboardingToken_tenantId_idx" ON "public"."SupplierOnboardingToken"("tenantId");

-- CreateIndex
CREATE INDEX "SupplierOnboardingToken_expiresAt_idx" ON "public"."SupplierOnboardingToken"("expiresAt");

-- CreateIndex
CREATE INDEX "DocumentLink_tenantId_rfiId_idx" ON "public"."DocumentLink"("tenantId", "rfiId");

-- CreateIndex
CREATE INDEX "DocumentLink_tenantId_qaRecordId_idx" ON "public"."DocumentLink"("tenantId", "qaRecordId");

-- CreateIndex
CREATE INDEX "DocumentLink_tenantId_hsEventId_idx" ON "public"."DocumentLink"("tenantId", "hsEventId");

-- CreateIndex
CREATE INDEX "DocumentLink_tenantId_carbonEntryId_idx" ON "public"."DocumentLink"("tenantId", "carbonEntryId");

-- AddForeignKey
ALTER TABLE "public"."Rfi" ADD CONSTRAINT "Rfi_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QaRecord" ADD CONSTRAINT "QaRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QaItem" ADD CONSTRAINT "QaItem_qaRecordId_fkey" FOREIGN KEY ("qaRecordId") REFERENCES "public"."QaRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HsEvent" ADD CONSTRAINT "HsEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CarbonEntry" ADD CONSTRAINT "CarbonEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierOnboardingToken" ADD CONSTRAINT "SupplierOnboardingToken_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
