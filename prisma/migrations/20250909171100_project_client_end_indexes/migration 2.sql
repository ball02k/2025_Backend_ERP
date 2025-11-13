-- Additive indexes for faster client-scoped project lists and planned end sorting
-- Idempotent creation to be safe on repeated deploys

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND c.relname = 'Project_tenantId_clientId_idx'
      AND n.nspname = 'public'
  ) THEN
    CREATE INDEX "Project_tenantId_clientId_idx"
      ON "public"."Project" ("tenantId", "clientId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND c.relname = 'Project_tenantId_endPlanned_idx'
      AND n.nspname = 'public'
  ) THEN
    CREATE INDEX "Project_tenantId_endPlanned_idx"
      ON "public"."Project" ("tenantId", "endPlanned");
  END IF;
END $$;

