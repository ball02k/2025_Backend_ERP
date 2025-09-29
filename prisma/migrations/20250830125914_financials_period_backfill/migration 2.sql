-- Backfill periodMonth fields for periodised financials
-- BudgetLine/Commitment: use updatedAt/createdAt month as fallback
-- ActualCost: use incurredAt month
-- Forecast: copy from period if matches YYYY-MM

-- BudgetLine
UPDATE "public"."BudgetLine"
SET "periodMonth" = to_char(COALESCE("updatedAt", "createdAt"), 'YYYY-MM')
WHERE "periodMonth" IS NULL;

-- Commitment
UPDATE "public"."Commitment"
SET "periodMonth" = to_char(COALESCE("updatedAt", "createdAt"), 'YYYY-MM')
WHERE "periodMonth" IS NULL;

-- ActualCost
UPDATE "public"."ActualCost"
SET "periodMonth" = to_char("incurredAt", 'YYYY-MM')
WHERE "periodMonth" IS NULL;

-- Forecast
UPDATE "public"."Forecast"
SET "periodMonth" = "period"
WHERE "periodMonth" IS NULL AND "period" ~ '^[0-9]{4}-[0-9]{2}$';
