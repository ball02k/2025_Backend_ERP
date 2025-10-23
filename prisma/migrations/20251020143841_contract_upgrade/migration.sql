/*
  Warnings:

  - You are about to alter the column `contractId` on the `ApplicationForPayment` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.
  - You are about to drop the column `decidedBy` on the `AwardDecision` table. All the data in the column will be lost.
  - You are about to drop the column `requestId` on the `AwardDecision` table. All the data in the column will be lost.
  - You are about to alter the column `contractId` on the `CVRSnapshotLine` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.
  - The primary key for the `Contract` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `Contract` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.
  - You are about to alter the column `contractId` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.
  - You are about to drop the `PackageTaxonomy` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ScopeRun` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ScopeSuggestion` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `awardType` to the `AwardDecision` table without a default value. This is not possible if the table is not empty.
  - Added the required column `packageId` to the `AwardDecision` table without a default value. This is not possible if the table is not empty.
  - Added the required column `projectId` to the `AwardDecision` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `AwardDecision` table without a default value. This is not possible if the table is not empty.
  - Made the column `decidedAt` on table `AwardDecision` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."ApplicationForPayment" DROP CONSTRAINT "ApplicationForPayment_contractId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ScopeRun" DROP CONSTRAINT "ScopeRun_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ScopeSuggestion" DROP CONSTRAINT "ScopeSuggestion_budgetId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ScopeSuggestion" DROP CONSTRAINT "ScopeSuggestion_scopeRunId_fkey";

-- DropIndex
DROP INDEX "public"."AwardDecision_tenantId_requestId_decision_idx";

-- AlterTable
ALTER TABLE "public"."ApplicationForPayment" ALTER COLUMN "contractId" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "public"."AwardDecision" DROP COLUMN "decidedBy",
DROP COLUMN "requestId",
ADD COLUMN     "awardType" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "decidedById" INTEGER,
ADD COLUMN     "packageId" INTEGER NOT NULL,
ADD COLUMN     "projectId" INTEGER NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "supplierId" DROP NOT NULL,
ALTER COLUMN "decision" DROP DEFAULT,
ALTER COLUMN "decidedAt" SET NOT NULL,
ALTER COLUMN "decidedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."CVRSnapshotLine" ALTER COLUMN "contractId" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "public"."Contract" DROP CONSTRAINT "Contract_pkey";

ALTER TABLE "public"."Contract" ALTER COLUMN "id" DROP DEFAULT;
DROP SEQUENCE IF EXISTS "public"."Contract_id_seq";
CREATE SEQUENCE IF NOT EXISTS "public"."Contract_id_seq" START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE "public"."Contract_id_seq" OWNED BY "public"."Contract"."id";

ALTER TABLE "public"."Contract"
  ALTER COLUMN "id" TYPE INTEGER USING "id"::integer,
  ALTER COLUMN "tenantId" TYPE TEXT;

ALTER TABLE "public"."Contract" ALTER COLUMN "id" SET DEFAULT nextval('"public"."Contract_id_seq"');
SELECT setval('"public"."Contract_id_seq"', COALESCE((SELECT MAX("id") FROM "public"."Contract"), 0) + 1, false);

ALTER TABLE "public"."Contract" ADD CONSTRAINT "Contract_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "public"."Invoice" ALTER COLUMN "contractId" SET DATA TYPE INTEGER;

-- Align existing columns with new schema expectations
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Contract' AND column_name = 'contractNumber'
  ) THEN
    EXECUTE 'ALTER TABLE "public"."Contract" RENAME COLUMN "contractNumber" TO "contractRef"';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Contract' AND column_name = 'awardValue'
  ) THEN
    EXECUTE 'ALTER TABLE "public"."Contract" RENAME COLUMN "awardValue" TO "value"';
  END IF;
END $$;

ALTER TABLE "public"."Contract" ADD COLUMN IF NOT EXISTS "internalTeam" TEXT;
ALTER TABLE "public"."Contract" ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT;
ALTER TABLE "public"."Contract" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "public"."Contract" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "public"."Contract" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
ALTER TABLE "public"."Contract" ALTER COLUMN "value" TYPE DECIMAL(18,2) USING "value"::numeric;
ALTER TABLE "public"."Contract" ALTER COLUMN "status" TYPE TEXT;

ALTER TABLE "public"."Project" ADD COLUMN IF NOT EXISTS "sector" TEXT;
ALTER TABLE "public"."Supplier" ADD COLUMN IF NOT EXISTS "complianceStatus" TEXT;

-- DropTable
DROP TABLE "public"."PackageTaxonomy";

-- DropTable
DROP TABLE "public"."ScopeRun";

-- DropTable
DROP TABLE "public"."ScopeSuggestion";

-- CreateTable
CREATE TABLE "public"."Trade" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PackageLineItem" (
    "id" SERIAL NOT NULL,
    "packageId" INTEGER NOT NULL,
    "budgetLineItemId" INTEGER,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "rate" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "costCode" TEXT,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ComplianceOverride" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "packageId" INTEGER,
    "reason" TEXT NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ComplianceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContractLineItem" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "rate" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "costCode" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContractTemplate" (
    "id" SERIAL NOT NULL,
    "tenantId" VARCHAR(64) NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "bodyHtml" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_tenantId_name_idx" ON "public"."Trade"("tenantId", "name");

-- CreateIndex
CREATE INDEX "PackageLineItem_tenantId_packageId_idx" ON "public"."PackageLineItem"("tenantId", "packageId");

-- CreateIndex
CREATE INDEX "PackageLineItem_tenantId_costCode_idx" ON "public"."PackageLineItem"("tenantId", "costCode");

-- CreateIndex
CREATE INDEX "ComplianceOverride_tenantId_supplierId_idx" ON "public"."ComplianceOverride"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "ComplianceOverride_tenantId_packageId_idx" ON "public"."ComplianceOverride"("tenantId", "packageId");

-- CreateIndex
CREATE INDEX "ContractLineItem_tenantId_contractId_idx" ON "public"."ContractLineItem"("tenantId", "contractId");

-- CreateIndex
CREATE INDEX "ContractLineItem_tenantId_costCode_idx" ON "public"."ContractLineItem"("tenantId", "costCode");

-- CreateIndex
CREATE INDEX "ContractTemplate_tenantId_updatedAt_idx" ON "public"."ContractTemplate"("tenantId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplate_tenantId_key_key" ON "public"."ContractTemplate"("tenantId", "key");

-- CreateIndex
CREATE INDEX "AwardDecision_tenantId_projectId_idx" ON "public"."AwardDecision"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "AwardDecision_tenantId_packageId_idx" ON "public"."AwardDecision"("tenantId", "packageId");

-- CreateIndex
CREATE INDEX "AwardDecision_tenantId_supplierId_idx" ON "public"."AwardDecision"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "AwardDecision_tenantId_awardType_idx" ON "public"."AwardDecision"("tenantId", "awardType");

-- CreateIndex
CREATE INDEX "AwardDecision_tenantId_decision_idx" ON "public"."AwardDecision"("tenantId", "decision");

-- AddForeignKey
ALTER TABLE "public"."PackageLineItem" ADD CONSTRAINT "PackageLineItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AwardDecision" ADD CONSTRAINT "AwardDecision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AwardDecision" ADD CONSTRAINT "AwardDecision_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AwardDecision" ADD CONSTRAINT "AwardDecision_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ComplianceOverride" ADD CONSTRAINT "ComplianceOverride_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ComplianceOverride" ADD CONSTRAINT "ComplianceOverride_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApplicationForPayment" ADD CONSTRAINT "ApplicationForPayment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContractLineItem" ADD CONSTRAINT "ContractLineItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
