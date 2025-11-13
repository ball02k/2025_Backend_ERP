-- Additive columns for buyer-entered responses and attachments
ALTER TABLE "public"."TenderResponse"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'supplier',
  ADD COLUMN IF NOT EXISTS "attachments" JSONB;

