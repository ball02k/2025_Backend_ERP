-- AlterTable
ALTER TABLE "public"."Package" ADD COLUMN     "procurementType" TEXT NOT NULL DEFAULT 'external',
ADD COLUMN     "selfDeliveringTeamId" INTEGER;

-- AlterTable
ALTER TABLE "public"."Supplier" ADD COLUMN     "isInternal" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Package_projectId_procurementType_idx" ON "public"."Package"("projectId", "procurementType");
