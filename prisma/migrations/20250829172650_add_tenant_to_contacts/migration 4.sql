-- AlterTable
ALTER TABLE "public"."Contact" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'demo';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Contact_tenantId_clientId_idx" ON "public"."Contact"("tenantId", "clientId");
