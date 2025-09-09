-- CreateTable
CREATE TABLE "public"."SpmTemplate" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categories" JSONB,
    "kpis" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpmTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SpmScorecard" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "templateId" INTEGER NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "totalScore" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpmScorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SpmScore" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scorecardId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "kpi" TEXT NOT NULL,
    "weight" DECIMAL(65,30) NOT NULL,
    "value" DECIMAL(65,30),
    "comment" TEXT,

    CONSTRAINT "SpmScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpmScorecard_tenantId_supplierId_periodMonth_idx" ON "public"."SpmScorecard"("tenantId", "supplierId", "periodMonth");
