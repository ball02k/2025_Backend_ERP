-- CreateTable
CREATE TABLE "FinancialItem" (
    "id" SERIAL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CreateIndex
CREATE INDEX "FinancialItem_tenantId_projectId_idx" ON "FinancialItem"("tenantId","projectId");

-- AddForeignKey
ALTER TABLE "FinancialItem" ADD CONSTRAINT "FinancialItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
