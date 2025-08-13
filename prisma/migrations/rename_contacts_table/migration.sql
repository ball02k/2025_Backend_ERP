-- prisma/migrations/rename_contacts_table/migration.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Contacts') THEN
    EXECUTE 'ALTER TABLE "public"."Contacts" RENAME TO "Contact"';
  END IF;
END $$;
