-- AlterTable
ALTER TABLE "public"."Contract" ADD COLUMN     "rfxId" INTEGER;

-- CreateTable
CREATE TABLE "public"."Rfx" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "packageId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deadline" TIMESTAMP(3),
    "budget" DECIMAL(18,2),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewers" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rfx_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RfxQna" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rfxId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "content" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RfxQna_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rfx_tenantId_projectId_idx" ON "public"."Rfx"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "Rfx_tenantId_packageId_idx" ON "public"."Rfx"("tenantId", "packageId");

-- CreateIndex
CREATE INDEX "RfxQna_tenantId_rfxId_idx" ON "public"."RfxQna"("tenantId", "rfxId");

-- CreateIndex
CREATE INDEX "RfxQna_tenantId_parentId_idx" ON "public"."RfxQna"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_rfxId_key" ON "public"."Contract"("rfxId");

-- CreateIndex
CREATE INDEX "RfxSection_tenantId_rfxId_idx" ON "public"."RfxSection"("tenantId", "rfxId");

-- CreateIndex
CREATE INDEX "RfxQuestion_tenantId_rfxId_idx" ON "public"."RfxQuestion"("tenantId", "rfxId");

-- CreateIndex
CREATE INDEX "RfxQuestion_tenantId_sectionId_idx" ON "public"."RfxQuestion"("tenantId", "sectionId");

-- CreateIndex
CREATE INDEX "RfxCriterion_tenantId_rfxId_idx" ON "public"."RfxCriterion"("tenantId", "rfxId");

-- CreateIndex
CREATE INDEX "RfxInvite_tenantId_rfxId_idx" ON "public"."RfxInvite"("tenantId", "rfxId");

-- AddForeignKey
ALTER TABLE "public"."Rfx" ADD CONSTRAINT "Rfx_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Rfx" ADD CONSTRAINT "Rfx_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RFxSubmission" ADD CONSTRAINT "RFxSubmission_rfxId_fkey" FOREIGN KEY ("rfxId") REFERENCES "public"."Rfx"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contract" ADD CONSTRAINT "Contract_rfxId_fkey" FOREIGN KEY ("rfxId") REFERENCES "public"."Rfx"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RfxSection" ADD CONSTRAINT "RfxSection_rfxId_fkey" FOREIGN KEY ("rfxId") REFERENCES "public"."Rfx"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RfxQuestion" ADD CONSTRAINT "RfxQuestion_rfxId_fkey" FOREIGN KEY ("rfxId") REFERENCES "public"."Rfx"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RfxQuestion" ADD CONSTRAINT "RfxQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "public"."RfxSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RfxCriterion" ADD CONSTRAINT "RfxCriterion_rfxId_fkey" FOREIGN KEY ("rfxId") REFERENCES "public"."Rfx"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RfxInvite" ADD CONSTRAINT "RfxInvite_rfxId_fkey" FOREIGN KEY ("rfxId") REFERENCES "public"."Rfx"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RfxQna" ADD CONSTRAINT "RfxQna_rfxId_fkey" FOREIGN KEY ("rfxId") REFERENCES "public"."Rfx"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RfxQna" ADD CONSTRAINT "RfxQna_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."RfxQna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

