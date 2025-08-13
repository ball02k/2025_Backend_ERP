-- DropForeignKey
ALTER TABLE "public"."Project" DROP CONSTRAINT "Project_statusId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Project" DROP CONSTRAINT "Project_typeId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Task" DROP CONSTRAINT "Task_statusId_fkey";

-- AlterTable
ALTER TABLE "public"."Project" DROP COLUMN "status",
DROP COLUMN "type",
ALTER COLUMN "statusId" SET NOT NULL,
ALTER COLUMN "typeId" SET NOT NULL;

-- AlterTable
ALTER TABLE "public"."Task" DROP COLUMN "status",
ALTER COLUMN "statusId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "public"."ProjectStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "public"."ProjectType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "public"."TaskStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

