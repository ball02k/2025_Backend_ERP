-- AlterTable
ALTER TABLE "public"."Project" ADD COLUMN     "procurementMode" TEXT NOT NULL DEFAULT 'hybrid';

-- CreateIndex
CREATE INDEX "Project_tenantId_procurementMode_idx" ON "public"."Project"("tenantId", "procurementMode");
