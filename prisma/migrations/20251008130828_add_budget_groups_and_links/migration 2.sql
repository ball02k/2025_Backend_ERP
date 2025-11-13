-- AlterTable
ALTER TABLE "public"."BudgetLine" ADD COLUMN     "groupId" INTEGER,
ADD COLUMN     "sortOrder" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."BudgetGroup" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetGroup_tenantId_projectId_idx" ON "public"."BudgetGroup"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "BudgetLine_tenantId_groupId_idx" ON "public"."BudgetLine"("tenantId", "groupId");

-- AddForeignKey
ALTER TABLE "public"."BudgetLine" ADD CONSTRAINT "BudgetLine_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."BudgetGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
