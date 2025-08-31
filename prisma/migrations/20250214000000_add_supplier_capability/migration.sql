-- CreateTable
CREATE TABLE "SupplierCapability" (
    "id" SERIAL PRIMARY KEY,
    "supplierId" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "SupplierCapability_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SupplierCapability_tenantId_supplierId_tag_idx" ON "SupplierCapability"("tenantId","supplierId","tag");
