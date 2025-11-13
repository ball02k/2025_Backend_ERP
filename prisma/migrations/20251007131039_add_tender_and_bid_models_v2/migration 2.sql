-- CreateTable
CREATE TABLE "public"."Tender" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "projectId" INTEGER NOT NULL,
    "packageId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenderBid" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "tenderId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tender_tenantId_projectId_idx" ON "public"."Tender"("tenantId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Tender_id_tenantId_key" ON "public"."Tender"("id", "tenantId");

-- CreateIndex
CREATE INDEX "TenderBid_tenantId_tenderId_idx" ON "public"."TenderBid"("tenantId", "tenderId");

-- AddForeignKey
ALTER TABLE "public"."Tender" ADD CONSTRAINT "Tender_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Tender" ADD CONSTRAINT "Tender_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenderBid" ADD CONSTRAINT "TenderBid_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "public"."Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
