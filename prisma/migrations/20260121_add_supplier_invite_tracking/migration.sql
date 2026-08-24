-- Add tracking fields to RequestInvite for supplier portal
-- Additive migration: no breaking changes

-- Add token expiry and tracking timestamps
ALTER TABLE "RequestInvite" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "RequestInvite" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);
ALTER TABLE "RequestInvite" ADD COLUMN IF NOT EXISTS "lastOpenedAt" TIMESTAMP(3);
ALTER TABLE "RequestInvite" ADD COLUMN IF NOT EXISTS "lastSavedAt" TIMESTAMP(3);
ALTER TABLE "RequestInvite" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "RequestInvite_tenantId_expiresAt_idx" ON "RequestInvite"("tenantId", "expiresAt");
CREATE INDEX IF NOT EXISTS "RequestInvite_tenantId_status_idx" ON "RequestInvite"("tenantId", "status");

-- Add submittedAt to RequestResponse if missing (should already exist)
ALTER TABLE "RequestResponse" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);

COMMENT ON COLUMN "RequestInvite"."expiresAt" IS 'Token expiry timestamp (null = never expires)';
COMMENT ON COLUMN "RequestInvite"."revokedAt" IS 'Token revocation timestamp (null = not revoked)';
COMMENT ON COLUMN "RequestInvite"."lastOpenedAt" IS 'Last time supplier opened the portal link';
COMMENT ON COLUMN "RequestInvite"."lastSavedAt" IS 'Last time supplier saved draft response';
COMMENT ON COLUMN "RequestInvite"."submittedAt" IS 'When supplier submitted final response (duplicates respondedAt for clarity)';
