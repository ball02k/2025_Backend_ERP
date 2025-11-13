-- CreateTable
CREATE TABLE "public"."Request" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'RFP',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "deadline" TIMESTAMP(3),
    "stage" INTEGER NOT NULL DEFAULT 1,
    "totalStages" INTEGER NOT NULL DEFAULT 1,
    "weighting" JSONB,
    "addenda" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RequestSection" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "weight" DECIMAL(65,30),
    "order" INTEGER NOT NULL,

    CONSTRAINT "RequestSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RequestQuestion" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "qType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "weight" DECIMAL(65,30),
    "calc" JSONB,
    "order" INTEGER NOT NULL,

    CONSTRAINT "RequestQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RequestInvite" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "RequestInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RequestResponse" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "stage" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "files" JSONB,
    "submittedAt" TIMESTAMP(3),
    "score" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'in_progress',

    CONSTRAINT "RequestResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RequestQna" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" INTEGER NOT NULL,
    "supplierId" INTEGER,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "RequestQna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AwardDecision" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "decidedBy" INTEGER,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "AwardDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Request_tenantId_status_deadline_idx" ON "public"."Request"("tenantId", "status", "deadline");

-- CreateIndex
CREATE INDEX "RequestSection_tenantId_requestId_idx" ON "public"."RequestSection"("tenantId", "requestId");

-- CreateIndex
CREATE INDEX "RequestInvite_tenantId_requestId_status_idx" ON "public"."RequestInvite"("tenantId", "requestId", "status");

-- CreateIndex
CREATE INDEX "RequestResponse_tenantId_requestId_supplierId_stage_idx" ON "public"."RequestResponse"("tenantId", "requestId", "supplierId", "stage");

-- CreateIndex
CREATE INDEX "AwardDecision_tenantId_requestId_decision_idx" ON "public"."AwardDecision"("tenantId", "requestId", "decision");
