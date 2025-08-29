ALTER TABLE "Contact" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';

DROP INDEX IF EXISTS "Contact_clientId_email_key";
CREATE UNIQUE INDEX "Contact_tenantId_clientId_email_key" ON "Contact"("tenantId","clientId","email");
CREATE INDEX "Contact_tenantId_clientId_isPrimary_idx" ON "Contact"("tenantId","clientId","isPrimary");
CREATE INDEX "Contact_tenantId_email_idx" ON "Contact"("tenantId","email");
CREATE INDEX "Contact_tenantId_role_idx" ON "Contact"("tenantId","role");
