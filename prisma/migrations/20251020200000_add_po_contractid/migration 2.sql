-- Add contractId to PurchaseOrder to link POs to contracts
ALTER TABLE "public"."PurchaseOrder" ADD COLUMN IF NOT EXISTS "contractId" INTEGER;

-- Add index for contract lookups
CREATE INDEX IF NOT EXISTS "PurchaseOrder_tenantId_contractId_idx" ON "public"."PurchaseOrder"("tenantId", "contractId");
