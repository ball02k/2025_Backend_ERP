-- Indexes to support unified search
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'Project_tenantId_name_idx' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX "Project_tenantId_name_idx" ON "public"."Project" ("tenantId", "name");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'Task_tenantId_title_idx' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX "Task_tenantId_title_idx" ON "public"."Task" ("tenantId", "title");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'Variation_tenantId_title_idx' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX "Variation_tenantId_title_idx" ON "public"."Variation" ("tenantId", "title");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'Variation_tenantId_reference_idx' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX "Variation_tenantId_reference_idx" ON "public"."Variation" ("tenantId", "reference");
  END IF;
END $$;
