-- CreateTable
CREATE TABLE "public"."RfxSection" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rfxId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RfxSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RfxQuestion" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rfxId" INTEGER NOT NULL,
    "sectionId" INTEGER,
    "prompt" TEXT NOT NULL,
    "guidance" TEXT,
    "responseType" TEXT NOT NULL,
    "options" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "weight" DECIMAL(65,30),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RfxQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RfxCriterion" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rfxId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "weight" DECIMAL(65,30) NOT NULL,
    "config" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RfxCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RfxInvite" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rfxId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RfxInvite_pkey" PRIMARY KEY ("id")
);
