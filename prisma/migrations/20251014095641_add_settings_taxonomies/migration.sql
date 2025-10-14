-- CreateTable
CREATE TABLE "public"."Taxonomy" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isHierarchical" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Taxonomy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaxonomyTerm" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxonomyId" INTEGER NOT NULL,
    "code" TEXT,
    "label" TEXT NOT NULL,
    "parentId" INTEGER,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxonomyTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantSetting" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "k" TEXT NOT NULL,
    "v" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierAccreditation" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authority" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierAccreditation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierAccreditationLink" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "accreditationId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "expiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierAccreditationLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Taxonomy_tenantId_key_idx" ON "public"."Taxonomy"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Taxonomy_tenantId_key_key" ON "public"."Taxonomy"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TaxonomyTerm_tenantId_taxonomyId_parentId_idx" ON "public"."TaxonomyTerm"("tenantId", "taxonomyId", "parentId");

-- CreateIndex
CREATE INDEX "TaxonomyTerm_tenantId_taxonomyId_code_idx" ON "public"."TaxonomyTerm"("tenantId", "taxonomyId", "code");

-- CreateIndex
CREATE INDEX "TenantSetting_tenantId_k_idx" ON "public"."TenantSetting"("tenantId", "k");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSetting_tenantId_k_key" ON "public"."TenantSetting"("tenantId", "k");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierAccreditation_tenantId_name_key" ON "public"."SupplierAccreditation"("tenantId", "name");

-- CreateIndex
CREATE INDEX "SupplierAccreditationLink_tenantId_supplierId_accreditation_idx" ON "public"."SupplierAccreditationLink"("tenantId", "supplierId", "accreditationId");

-- AddForeignKey
ALTER TABLE "public"."TaxonomyTerm" ADD CONSTRAINT "TaxonomyTerm_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "public"."Taxonomy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaxonomyTerm" ADD CONSTRAINT "TaxonomyTerm_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."TaxonomyTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierAccreditationLink" ADD CONSTRAINT "SupplierAccreditationLink_accreditationId_fkey" FOREIGN KEY ("accreditationId") REFERENCES "public"."SupplierAccreditation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierAccreditationLink" ADD CONSTRAINT "SupplierAccreditationLink_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
