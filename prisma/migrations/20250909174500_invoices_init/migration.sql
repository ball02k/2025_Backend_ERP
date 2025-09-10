-- Create Invoice table and indexes (idempotent guards)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Invoice'
  ) THEN
    CREATE TABLE "public"."Invoice" (
      "id" SERIAL PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "projectId" INTEGER NOT NULL,
      "supplierId" INTEGER,
      "number" TEXT NOT NULL,
      "issueDate" TIMESTAMP,
      "dueDate" TIMESTAMP,
      "net" DECIMAL(18,2) DEFAULT 0,
      "vat" DECIMAL(18,2) DEFAULT 0,
      "gross" DECIMAL(18,2) DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'Open',
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

-- FKs (guarded)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema='public' AND table_name='Invoice' AND constraint_name='Invoice_projectId_fkey'
  ) THEN
    ALTER TABLE "public"."Invoice"
    ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema='public' AND table_name='Invoice' AND constraint_name='Invoice_supplierId_fkey'
  ) THEN
    ALTER TABLE "public"."Invoice"
    ADD CONSTRAINT "Invoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='i' AND c.relname='Invoice_tenantId_projectId_status_idx' AND n.nspname='public'
  ) THEN
    CREATE INDEX "Invoice_tenantId_projectId_status_idx" ON "public"."Invoice" ("tenantId","projectId","status");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='i' AND c.relname='Invoice_tenantId_supplierId_idx' AND n.nspname='public'
  ) THEN
    CREATE INDEX "Invoice_tenantId_supplierId_idx" ON "public"."Invoice" ("tenantId","supplierId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='i' AND c.relname='Invoice_tenantId_projectId_dueDate_idx' AND n.nspname='public'
  ) THEN
    CREATE INDEX "Invoice_tenantId_projectId_dueDate_idx" ON "public"."Invoice" ("tenantId","projectId","dueDate");
  END IF;
END $$;

