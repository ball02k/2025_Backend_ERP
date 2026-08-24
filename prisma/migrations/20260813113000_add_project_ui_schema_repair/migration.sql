-- Additive repair for fields already referenced by the project UI/API layer.

ALTER TABLE "PurchaseOrder"
  ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'OUTBOUND';

CREATE INDEX IF NOT EXISTS "PurchaseOrder_tenantId_projectId_direction_idx"
  ON "PurchaseOrder"("tenantId", "projectId", "direction");

ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "portalEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
  ADD COLUMN IF NOT EXISTS "portalToken" TEXT,
  ADD COLUMN IF NOT EXISTS "tokenExpiry" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Contact_portalToken_idx"
  ON "Contact"("portalToken");

ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "clientType" TEXT NOT NULL DEFAULT 'CLIENT';

CREATE INDEX IF NOT EXISTS "Client_clientType_idx"
  ON "Client"("clientType");

CREATE TABLE IF NOT EXISTS "customer_portal_sessions" (
  "id" TEXT PRIMARY KEY,
  "contactId" INTEGER NOT NULL,
  "token" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_portal_sessions_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_portal_sessions_token_key"
  ON "customer_portal_sessions"("token");

CREATE INDEX IF NOT EXISTS "customer_portal_sessions_contactId_idx"
  ON "customer_portal_sessions"("contactId");

CREATE INDEX IF NOT EXISTS "customer_portal_sessions_token_idx"
  ON "customer_portal_sessions"("token");

CREATE INDEX IF NOT EXISTS "customer_portal_sessions_expiresAt_idx"
  ON "customer_portal_sessions"("expiresAt");
