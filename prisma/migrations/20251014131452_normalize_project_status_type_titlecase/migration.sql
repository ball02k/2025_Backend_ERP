-- Normalize stored values to Title Case (Status, Type)
UPDATE "public"."Project" SET "status" = INITCAP("status") WHERE "status" IS NOT NULL;
UPDATE "public"."Project" SET "type" = INITCAP("type") WHERE "type" IS NOT NULL;
