-- Additive models: PackageTaxonomy, ScopeRun, ScopeSuggestion

-- PackageTaxonomy: catalogue of package categories with keywords and code prefixes
CREATE TABLE IF NOT EXISTS "public"."PackageTaxonomy" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keywords" JSONB,
  "costCodePrefixes" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Unique per-tenant code
DO $$ BEGIN
  CREATE UNIQUE INDEX "PackageTaxonomy_tenantId_code_key" ON "public"."PackageTaxonomy" ("tenantId", "code");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Helpful index for listing active taxonomies
CREATE INDEX IF NOT EXISTS "PackageTaxonomy_tenantId_isActive_idx" ON "public"."PackageTaxonomy" ("tenantId", "isActive");

-- ScopeRun: a classification run per project
CREATE TABLE IF NOT EXISTS "public"."ScopeRun" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- FK: ScopeRun.projectId -> Project(id)
DO $$ BEGIN
  ALTER TABLE "public"."ScopeRun"
    ADD CONSTRAINT "ScopeRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index for querying runs by tenant/project/status
CREATE INDEX IF NOT EXISTS "ScopeRun_tenantId_projectId_status_idx" ON "public"."ScopeRun" ("tenantId", "projectId", "status");

-- ScopeSuggestion: suggested taxonomy codes per budget line for a given run
CREATE TABLE IF NOT EXISTS "public"."ScopeSuggestion" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "scopeRunId" INTEGER NOT NULL,
  "budgetId" INTEGER NOT NULL,
  "suggestedCode" TEXT NOT NULL,
  "altCode" TEXT,
  "confidence" DECIMAL(5,4) NOT NULL,
  "explain" JSONB,
  "acceptedCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- FKs: ScopeSuggestion.scopeRunId -> ScopeRun(id); ScopeSuggestion.budgetId -> BudgetLine(id)
DO $$ BEGIN
  ALTER TABLE "public"."ScopeSuggestion"
    ADD CONSTRAINT "ScopeSuggestion_scopeRunId_fkey" FOREIGN KEY ("scopeRunId") REFERENCES "public"."ScopeRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "public"."ScopeSuggestion"
    ADD CONSTRAINT "ScopeSuggestion_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "public"."BudgetLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS "ScopeSuggestion_tenantId_scopeRunId_idx" ON "public"."ScopeSuggestion" ("tenantId", "scopeRunId");
CREATE INDEX IF NOT EXISTS "ScopeSuggestion_tenantId_budgetId_idx" ON "public"."ScopeSuggestion" ("tenantId", "budgetId");

