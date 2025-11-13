-- AlterTable
ALTER TABLE "public"."DocumentLink" ADD COLUMN     "category" TEXT,
ADD COLUMN     "entityId" INTEGER,
ADD COLUMN     "entityType" TEXT,
ADD COLUMN     "poId" INTEGER;

-- AlterTable
ALTER TABLE "public"."Invoice" ADD COLUMN     "documentId" BIGINT,
ADD COLUMN     "matchStatus" TEXT,
ADD COLUMN     "matchedPoId" INTEGER,
ADD COLUMN     "ocrResultJson" JSONB,
ADD COLUMN     "ocrStatus" TEXT,
ADD COLUMN     "poNumberRef" TEXT;

-- CreateTable
CREATE TABLE "public"."InvoiceLine" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "invoiceId" INTEGER NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "costCode" TEXT,
    "qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vatRatePct" DOUBLE PRECISION,
    "totalExVat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalVat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalIncVat" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FinanceMatch" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "varianceExVat" DECIMAL(65,30) DEFAULT 0,
    "varianceVat" DECIMAL(65,30) DEFAULT 0,
    "varianceTotal" DECIMAL(65,30) DEFAULT 0,
    "toleranceUsed" DECIMAL(65,30) DEFAULT 0,
    "poId" INTEGER,
    "invoiceId" INTEGER,
    "receiptId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "FinanceMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InboundEmail" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "inbox" TEXT NOT NULL,
    "fromAddr" TEXT NOT NULL,
    "subject" TEXT,
    "bodyText" TEXT,
    "rawId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'stored',
    "error" TEXT,

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailAttachment" (
    "id" SERIAL NOT NULL,
    "inboundEmailId" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "documentId" BIGINT,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ApplicationForPayment" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "supplierId" INTEGER,
    "contractId" BIGINT,
    "applicationNo" TEXT NOT NULL,
    "applicationDate" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "assessmentDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "grossToDate" DECIMAL(18,2) NOT NULL,
    "variationsValue" DECIMAL(18,2) NOT NULL,
    "prelimsValue" DECIMAL(18,2) NOT NULL,
    "retentionValue" DECIMAL(18,2) NOT NULL,
    "mosValue" DECIMAL(18,2) NOT NULL,
    "offsiteValue" DECIMAL(18,2) NOT NULL,
    "deductionsValue" DECIMAL(18,2) NOT NULL,
    "netClaimed" DECIMAL(18,2) NOT NULL,
    "certifiedAmount" DECIMAL(18,2),
    "certifiedDate" TIMESTAMP(3),
    "certifiedByUserId" INTEGER,
    "certificationNotes" TEXT,
    "paymentNoticeIssuedAt" TIMESTAMP(3),
    "payLessNoticeIssuedAt" TIMESTAMP(3),
    "payLessReason" TEXT,
    "status" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationForPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AfpAttachment" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "afpId" INTEGER NOT NULL,
    "documentId" BIGINT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AfpAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OcrJob" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "documentId" BIGINT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'invoice',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "provider" TEXT,
    "resultJson" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invoiceId" INTEGER,
    "poId" INTEGER,

    CONSTRAINT "OcrJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceLine_tenantId_invoiceId_idx" ON "public"."InvoiceLine"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "FinanceMatch_tenantId_type_status_idx" ON "public"."FinanceMatch"("tenantId", "type", "status");

-- CreateIndex
CREATE INDEX "FinanceMatch_tenantId_poId_idx" ON "public"."FinanceMatch"("tenantId", "poId");

-- CreateIndex
CREATE INDEX "FinanceMatch_tenantId_invoiceId_idx" ON "public"."FinanceMatch"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "InboundEmail_tenantId_inbox_receivedAt_idx" ON "public"."InboundEmail"("tenantId", "inbox", "receivedAt");

-- CreateIndex
CREATE INDEX "ApplicationForPayment_tenantId_projectId_applicationDate_idx" ON "public"."ApplicationForPayment"("tenantId", "projectId", "applicationDate");

-- CreateIndex
CREATE INDEX "ApplicationForPayment_tenantId_supplierId_idx" ON "public"."ApplicationForPayment"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "ApplicationForPayment_tenantId_status_idx" ON "public"."ApplicationForPayment"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationForPayment_tenantId_applicationNo_key" ON "public"."ApplicationForPayment"("tenantId", "applicationNo");

-- CreateIndex
CREATE INDEX "OcrJob_tenantId_status_idx" ON "public"."OcrJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DocumentLink_tenantId_entityType_entityId_idx" ON "public"."DocumentLink"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "DocumentLink_tenantId_poId_idx" ON "public"."DocumentLink"("tenantId", "poId");

-- AddForeignKey
ALTER TABLE "public"."EmailAttachment" ADD CONSTRAINT "EmailAttachment_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "public"."InboundEmail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApplicationForPayment" ADD CONSTRAINT "ApplicationForPayment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApplicationForPayment" ADD CONSTRAINT "ApplicationForPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApplicationForPayment" ADD CONSTRAINT "ApplicationForPayment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AfpAttachment" ADD CONSTRAINT "AfpAttachment_afpId_fkey" FOREIGN KEY ("afpId") REFERENCES "public"."ApplicationForPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
