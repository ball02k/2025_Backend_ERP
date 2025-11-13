-- AlterTable
ALTER TABLE "public"."Package" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "tradeCategory" TEXT;

-- CreateTable
CREATE TABLE "public"."PackageItem" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "packageId" INTEGER NOT NULL,
    "budgetLineId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenderQuestion" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "tenderId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "options" JSONB,

    CONSTRAINT "TenderQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenderSupplierInvite" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "tenderId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "inviteToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderSupplierInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenderResponse" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "tenderId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "priceTotal" DECIMAL(18,2) NOT NULL,
    "leadTimeDays" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answers" JSONB NOT NULL,
    "autoScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manualScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "TenderResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackageItem_tenantId_packageId_idx" ON "public"."PackageItem"("tenantId", "packageId");

-- CreateIndex
CREATE INDEX "PackageItem_tenantId_budgetLineId_idx" ON "public"."PackageItem"("tenantId", "budgetLineId");

-- CreateIndex
CREATE INDEX "TenderQuestion_tenantId_tenderId_idx" ON "public"."TenderQuestion"("tenantId", "tenderId");

-- CreateIndex
CREATE UNIQUE INDEX "TenderSupplierInvite_inviteToken_key" ON "public"."TenderSupplierInvite"("inviteToken");

-- CreateIndex
CREATE INDEX "TenderSupplierInvite_tenantId_tenderId_supplierId_idx" ON "public"."TenderSupplierInvite"("tenantId", "tenderId", "supplierId");

-- CreateIndex
CREATE INDEX "TenderResponse_tenantId_tenderId_supplierId_idx" ON "public"."TenderResponse"("tenantId", "tenderId", "supplierId");

-- AddForeignKey
ALTER TABLE "public"."PackageItem" ADD CONSTRAINT "PackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PackageItem" ADD CONSTRAINT "PackageItem_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "public"."BudgetLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenderQuestion" ADD CONSTRAINT "TenderQuestion_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "public"."Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenderSupplierInvite" ADD CONSTRAINT "TenderSupplierInvite_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "public"."Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenderSupplierInvite" ADD CONSTRAINT "TenderSupplierInvite_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenderResponse" ADD CONSTRAINT "TenderResponse_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "public"."Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenderResponse" ADD CONSTRAINT "TenderResponse_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
