-- AlterTable
ALTER TABLE "public"."PurchaseOrder" ADD COLUMN     "supplierId" INTEGER;

-- CreateTable
CREATE TABLE "public"."Supplier" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "companyRegNo" TEXT,
    "vatNo" TEXT,
    "insuranceExpiry" TIMESTAMP(3),
    "hsAccreditations" TEXT,
    "performanceScore" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_tenantId_name_idx" ON "public"."Supplier"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_status_idx" ON "public"."Supplier"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenantId_supplierId_idx" ON "public"."PurchaseOrder"("tenantId", "supplierId");
