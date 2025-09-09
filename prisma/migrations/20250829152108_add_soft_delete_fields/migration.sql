-- AlterTable
ALTER TABLE "public"."Client" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Project" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
