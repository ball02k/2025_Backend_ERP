/*
  Warnings:

  - A unique constraint covering the columns `[budgetLineId]` on the table `PackageItem` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PackageItem_budgetLineId_key" ON "public"."PackageItem"("budgetLineId");
