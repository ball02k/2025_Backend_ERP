-- ============================================================================
-- COMPREHENSIVE CONTRACT VARIATIONS SYSTEM
-- Adds fields and tables for full UK construction variation management
-- ============================================================================

-- 1. Add new fields to existing Variation table
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "variationNumber" VARCHAR(50);
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "siteInstructionRef" VARCHAR(100);
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "instructedBy" INTEGER;
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "instructionDate" TIMESTAMP(3);
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "originatedFrom" VARCHAR(50);
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "urgency" VARCHAR(20) DEFAULT 'standard';
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "category" VARCHAR(50);

-- Financial breakdown fields
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "estimatedValue" DECIMAL(18,2);
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "quotedValue" DECIMAL(18,2);
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "negotiatedValue" DECIMAL(18,2);
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "approvedValue" DECIMAL(18,2);
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "certifiedValue" DECIMAL(18,2);
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "dayworkValue" DECIMAL(18,2);
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "breakdown" JSONB;

-- Time/programme impact
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "extensionClaimed" INTEGER;
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "extensionGranted" INTEGER;
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "timeJustification" TEXT;
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "affectedActivities" JSONB;

-- Workflow
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "approvals" JSONB;
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "implementationDate" TIMESTAMP(3);
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "completionDate" TIMESTAMP(3);

-- Related items
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "relatedVariationIds" INTEGER[];
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "affectedPackageIds" INTEGER[];

-- Audit
ALTER TABLE "Variation" ADD COLUMN IF NOT EXISTS "createdBy" INTEGER;

-- Indexes for new fields
CREATE INDEX IF NOT EXISTS "Variation_variationNumber_idx" ON "Variation"("variationNumber");
CREATE INDEX IF NOT EXISTS "Variation_contractId_variationNumber_idx" ON "Variation"("contractId", "variationNumber");
CREATE INDEX IF NOT EXISTS "Variation_urgency_idx" ON "Variation"("urgency");

-- ============================================================================
-- 2. Create VariationDocument table
-- ============================================================================
CREATE TABLE IF NOT EXISTS "VariationDocument" (
    "id" SERIAL PRIMARY KEY,
    "tenantId" VARCHAR(255) NOT NULL,
    "variationId" INTEGER NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "fileId" VARCHAR(255) NOT NULL,
    "fileName" VARCHAR(500) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "uploadedBy" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariationDocument_variationId_fkey"
        FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE CASCADE
);

CREATE INDEX "VariationDocument_variationId_idx" ON "VariationDocument"("variationId");
CREATE INDEX "VariationDocument_tenantId_idx" ON "VariationDocument"("tenantId");

-- ============================================================================
-- 3. Create VariationComment table
-- ============================================================================
CREATE TABLE IF NOT EXISTS "VariationComment" (
    "id" SERIAL PRIMARY KEY,
    "tenantId" VARCHAR(255) NOT NULL,
    "variationId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariationComment_variationId_fkey"
        FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE CASCADE
);

CREATE INDEX "VariationComment_variationId_idx" ON "VariationComment"("variationId");
CREATE INDEX "VariationComment_tenantId_idx" ON "VariationComment"("tenantId");
CREATE INDEX "VariationComment_createdAt_idx" ON "VariationComment"("createdAt" DESC);

-- ============================================================================
-- 4. Create VariationApproval table (for structured approvals)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "VariationApproval" (
    "id" SERIAL PRIMARY KEY,
    "tenantId" VARCHAR(255) NOT NULL,
    "variationId" INTEGER NOT NULL,
    "approverUserId" INTEGER,
    "approverRole" VARCHAR(100) NOT NULL,
    "sequenceOrder" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "decision" VARCHAR(50),
    "comments" TEXT,
    "conditions" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "VariationApproval_variationId_fkey"
        FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE CASCADE
);

CREATE INDEX "VariationApproval_variationId_idx" ON "VariationApproval"("variationId");
CREATE INDEX "VariationApproval_status_idx" ON "VariationApproval"("status");
CREATE INDEX "VariationApproval_approverUserId_idx" ON "VariationApproval"("approverUserId");

-- ============================================================================
-- 5. Function to generate variation numbers
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_variation_number(p_contract_id INTEGER, p_tenant_id VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_next_num INTEGER;
    v_number VARCHAR;
BEGIN
    -- Get the next sequence number for this contract
    SELECT COALESCE(MAX(
        CAST(REGEXP_REPLACE("variationNumber", '[^0-9]', '', 'g') AS INTEGER)
    ), 0) + 1
    INTO v_next_num
    FROM "Variation"
    WHERE "contractId" = p_contract_id
    AND "tenantId" = p_tenant_id
    AND "variationNumber" IS NOT NULL;

    -- Format as VO-XXX
    v_number := 'VO-' || LPAD(v_next_num::TEXT, 3, '0');

    RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. Update existing variations to have default values
-- ============================================================================
UPDATE "Variation"
SET
    "category" = CASE
        WHEN "type" = 'CONTRACT_VARIATION' AND "amount" > 0 THEN 'Addition'
        WHEN "type" = 'CONTRACT_VARIATION' AND "amount" < 0 THEN 'Omission'
        ELSE 'Substitution'
    END,
    "estimatedValue" = "amount",
    "urgency" = 'standard'
WHERE "category" IS NULL;

-- Set variationNumber for existing variations (per contract)
DO $$
DECLARE
    contract_rec RECORD;
    var_rec RECORD;
    counter INTEGER;
BEGIN
    FOR contract_rec IN
        SELECT DISTINCT "contractId", "tenantId"
        FROM "Variation"
        WHERE "contractId" IS NOT NULL
        AND "variationNumber" IS NULL
    LOOP
        counter := 1;
        FOR var_rec IN
            SELECT "id"
            FROM "Variation"
            WHERE "contractId" = contract_rec."contractId"
            AND "tenantId" = contract_rec."tenantId"
            AND "variationNumber" IS NULL
            ORDER BY "createdAt"
        LOOP
            UPDATE "Variation"
            SET "variationNumber" = 'VO-' || LPAD(counter::TEXT, 3, '0')
            WHERE "id" = var_rec."id";
            counter := counter + 1;
        END LOOP;
    END LOOP;
END $$;

-- ============================================================================
-- 7. Comments
-- ============================================================================
COMMENT ON COLUMN "Variation"."variationNumber" IS 'Auto-generated variation number (VO-001, VO-002, etc.)';
COMMENT ON COLUMN "Variation"."siteInstructionRef" IS 'Reference to formal site instruction';
COMMENT ON COLUMN "Variation"."instructedBy" IS 'User ID who instructed the variation';
COMMENT ON COLUMN "Variation"."originatedFrom" IS 'Client, Architect, Engineer, Main Contractor, etc.';
COMMENT ON COLUMN "Variation"."urgency" IS 'standard, urgent, critical';
COMMENT ON COLUMN "Variation"."category" IS 'Addition, Omission, Substitution, Daywork';
COMMENT ON COLUMN "Variation"."estimatedValue" IS 'Initial cost estimate';
COMMENT ON COLUMN "Variation"."quotedValue" IS 'Contractor quoted value';
COMMENT ON COLUMN "Variation"."negotiatedValue" IS 'Negotiated value after discussions';
COMMENT ON COLUMN "Variation"."approvedValue" IS 'Final approved value';
COMMENT ON COLUMN "Variation"."certifiedValue" IS 'Value certified for payment';
COMMENT ON COLUMN "Variation"."extensionClaimed" IS 'Extension of time claimed (days)';
COMMENT ON COLUMN "Variation"."extensionGranted" IS 'Extension of time granted (days)';
COMMENT ON COLUMN "Variation"."approvals" IS 'JSON array of approval records';

COMMENT ON TABLE "VariationDocument" IS 'Documents attached to variations (site instructions, quotations, drawings, photos)';
COMMENT ON TABLE "VariationComment" IS 'Internal and external comments on variations';
COMMENT ON TABLE "VariationApproval" IS 'Multi-level approval workflow for variations';
