-- Additive repair migration for the payment application -> certificate -> invoice/payment workflow.
-- This intentionally uses IF NOT EXISTS / guarded constraints so it can run safely on
-- local databases that were created before the current Prisma schema caught up.

CREATE TABLE IF NOT EXISTS "UpstreamContract" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "mainContractorId" INTEGER,
  "contractValue" NUMERIC(18, 2) NOT NULL,
  "contractType" TEXT,
  "contractRef" TEXT,
  "poNumber" TEXT,
  "description" TEXT,
  "retentionPercentage" NUMERIC(5, 2) NOT NULL DEFAULT 0,
  "retentionCap" NUMERIC(18, 2),
  "retentionCapAuto" BOOLEAN NOT NULL DEFAULT true,
  "retentionReleasePC" NUMERIC(5, 2),
  "retentionReleaseDLP" NUMERIC(5, 2),
  "applicationDueDay" INTEGER,
  "applicationDueDays" INTEGER,
  "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
  "payLessNoticeDays" INTEGER,
  "paymentNoticeDays" INTEGER,
  "mainContractorDiscount" NUMERIC(5, 2) NOT NULL DEFAULT 0,
  "mcdDescription" TEXT,
  "mcDeductsCIS" BOOLEAN NOT NULL DEFAULT false,
  "startDate" TIMESTAMP(3),
  "plannedCompletionDate" TIMESTAMP(3),
  "actualCompletionDate" TIMESTAMP(3),
  "practicalCompletionDate" TIMESTAMP(3),
  "dlpMonths" INTEGER,
  "dlpEndDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "contractDocumentUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" INTEGER,
  "updatedById" INTEGER
);

ALTER TABLE "ApplicationForPayment"
  ADD COLUMN IF NOT EXISTS "paymentCertificateUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentCertificateGeneratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentCertificateSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentCertificateSentBy" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentCertificateSentMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentCertificateSentTo" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentNoticeGeneratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentNoticeSentBy" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentNoticeSentMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentNoticeSentTo" TEXT,
  ADD COLUMN IF NOT EXISTS "payLessNoticeGeneratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payLessNoticeSentBy" TEXT,
  ADD COLUMN IF NOT EXISTS "payLessNoticeSentMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "payLessNoticeSentTo" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceReceivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invoiceId" INTEGER,
  ADD COLUMN IF NOT EXISTS "totalPaid" NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS "paidInFull" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "remainingBalance" NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS "labourElement" NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS "materialsElement" NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS "cisStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "cisRate" NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS "cisDeduction" NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS "netAfterCIS" NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS "cisCalculatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cisWarnings" TEXT,
  ADD COLUMN IF NOT EXISTS "vatTreatment" TEXT,
  ADD COLUMN IF NOT EXISTS "vatRate" NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS "vatAmount" NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS "grossWithVAT" NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reverseChargeNote" TEXT,
  ADD COLUMN IF NOT EXISTS "mcdPercentage" NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS "mcdAmount" NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS "grossAfterMCD" NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'INBOUND',
  ADD COLUMN IF NOT EXISTS "recipientType" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientId" INTEGER,
  ADD COLUMN IF NOT EXISTS "recipientContactId" INTEGER,
  ADD COLUMN IF NOT EXISTS "upstreamContractId" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedVia" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedToEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "queriedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resubmittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "queriedById" TEXT,
  ADD COLUMN IF NOT EXISTS "queryDetails" TEXT,
  ADD COLUMN IF NOT EXISTS "withdrawnById" TEXT,
  ADD COLUMN IF NOT EXISTS "withdrawalReason" TEXT;

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'INBOUND',
  ADD COLUMN IF NOT EXISTS "supplierInvoiceRef" TEXT,
  ADD COLUMN IF NOT EXISTS "documentUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "documentName" TEXT,
  ADD COLUMN IF NOT EXISTS "ocrRawText" TEXT,
  ADD COLUMN IF NOT EXISTS "ocrConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "matchConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "matchedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "createdBy" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentApplicationId" INTEGER,
  ADD COLUMN IF NOT EXISTS "matchType" TEXT,
  ADD COLUMN IF NOT EXISTS "matchConfidenceNew" NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS "matchedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "matchedByUser" TEXT,
  ADD COLUMN IF NOT EXISTS "matchNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "noMatchRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "noMatchReason" TEXT;

ALTER TABLE "PaymentApplicationLineItem"
  ADD COLUMN IF NOT EXISTS "contractValue" NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS "budgetLineId" INTEGER;

CREATE TABLE IF NOT EXISTS "PaymentApplicationStatusHistory" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "paymentApplicationId" INTEGER NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changedById" INTEGER NOT NULL,
  "notes" TEXT,
  "metadata" JSONB
);

CREATE TABLE IF NOT EXISTS "PaymentCertificate" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "direction" TEXT NOT NULL DEFAULT 'INBOUND',
  "upstreamContractId" TEXT NOT NULL,
  "paymentApplicationId" INTEGER,
  "certificateNumber" INTEGER NOT NULL,
  "certificateRef" TEXT,
  "certificateDate" TIMESTAMP(3) NOT NULL,
  "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "certifiedGross" NUMERIC(15, 2) NOT NULL,
  "retentionPercentage" NUMERIC(5, 2),
  "retentionAmount" NUMERIC(15, 2) NOT NULL DEFAULT 0,
  "mcdPercentage" NUMERIC(5, 2),
  "mcdAmount" NUMERIC(15, 2) NOT NULL DEFAULT 0,
  "cisRate" NUMERIC(5, 2),
  "cisAmount" NUMERIC(15, 2) NOT NULL DEFAULT 0,
  "otherDeductions" NUMERIC(15, 2) NOT NULL DEFAULT 0,
  "otherDeductionsDesc" TEXT,
  "netCertified" NUMERIC(15, 2) NOT NULL,
  "cumulativeGross" NUMERIC(15, 2),
  "cumulativeRetention" NUMERIC(15, 2),
  "cumulativeNetCertified" NUMERIC(15, 2),
  "appliedGross" NUMERIC(15, 2),
  "varianceAmount" NUMERIC(15, 2),
  "variancePercentage" NUMERIC(5, 2),
  "varianceNotes" TEXT,
  "paymentDueDate" TIMESTAMP(3) NOT NULL,
  "paymentStatus" TEXT NOT NULL DEFAULT 'AWAITING',
  "totalPaid" NUMERIC(15, 2) NOT NULL DEFAULT 0,
  "totalOutstanding" NUMERIC(15, 2),
  "lastPaymentDate" TIMESTAMP(3),
  "certificateDocumentUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "disputeNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" INTEGER
);

CREATE TABLE IF NOT EXISTS "CertificatePayment" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "paymentCertificateId" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "paymentAmount" NUMERIC(15, 2) NOT NULL,
  "paymentReference" TEXT,
  "paymentMethod" TEXT,
  "bankAccountId" TEXT,
  "bankTransactionRef" TEXT,
  "isPartialPayment" BOOLEAN NOT NULL DEFAULT false,
  "remittanceDocumentUrl" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" INTEGER
);

CREATE TABLE IF NOT EXISTS "PaymentRecord" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "paymentApplicationId" INTEGER NOT NULL,
  "amount" NUMERIC(15, 2) NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "paymentReference" TEXT,
  "bankAccount" TEXT,
  "retentionDeducted" NUMERIC(15, 2),
  "cisDeducted" NUMERIC(15, 2),
  "otherDeductions" NUMERIC(15, 2),
  "otherDeductionsNote" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL,
  "notes" TEXT
);

CREATE TABLE IF NOT EXISTS "UpstreamRetentionRelease" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "upstreamContractId" TEXT NOT NULL,
  "releaseType" TEXT NOT NULL,
  "releaseAmount" NUMERIC(15, 2) NOT NULL,
  "retentionBefore" NUMERIC(15, 2) NOT NULL,
  "retentionAfter" NUMERIC(15, 2) NOT NULL,
  "releaseDate" TIMESTAMP(3),
  "requestedDate" TIMESTAMP(3),
  "expectedDate" TIMESTAMP(3),
  "claimStatus" TEXT NOT NULL DEFAULT 'NOT_CLAIMED',
  "claimReference" TEXT,
  "claimSubmittedAt" TIMESTAMP(3),
  "paymentReceivedDate" TIMESTAMP(3),
  "paymentAmount" NUMERIC(15, 2),
  "paymentReference" TEXT,
  "notes" TEXT,
  "documentUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" INTEGER
);

CREATE TABLE IF NOT EXISTS "UpstreamRetentionBond" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "upstreamContractId" TEXT NOT NULL,
  "bondProvider" TEXT NOT NULL,
  "bondReference" TEXT NOT NULL,
  "bondAmount" NUMERIC(15, 2) NOT NULL,
  "bondType" TEXT NOT NULL,
  "issueDate" TIMESTAMP(3) NOT NULL,
  "expiryDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "bondDocumentUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Guarded foreign keys. NOT VALID avoids blocking existing local data; future writes are still checked.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UpstreamContract_projectId_fkey') THEN
    ALTER TABLE "UpstreamContract" ADD CONSTRAINT "UpstreamContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UpstreamContract_mainContractorId_fkey') THEN
    ALTER TABLE "UpstreamContract" ADD CONSTRAINT "UpstreamContract_mainContractorId_fkey" FOREIGN KEY ("mainContractorId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApplicationForPayment_invoiceId_fkey') THEN
    ALTER TABLE "ApplicationForPayment" ADD CONSTRAINT "ApplicationForPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApplicationForPayment_upstreamContractId_fkey') THEN
    ALTER TABLE "ApplicationForPayment" ADD CONSTRAINT "ApplicationForPayment_upstreamContractId_fkey" FOREIGN KEY ("upstreamContractId") REFERENCES "UpstreamContract"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApplicationForPayment_recipientId_fkey') THEN
    ALTER TABLE "ApplicationForPayment" ADD CONSTRAINT "ApplicationForPayment_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApplicationForPayment_recipientContactId_fkey') THEN
    ALTER TABLE "ApplicationForPayment" ADD CONSTRAINT "ApplicationForPayment_recipientContactId_fkey" FOREIGN KEY ("recipientContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_paymentApplicationId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentApplicationId_fkey" FOREIGN KEY ("paymentApplicationId") REFERENCES "ApplicationForPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentApplicationLineItem_budgetLineId_fkey') THEN
    ALTER TABLE "PaymentApplicationLineItem" ADD CONSTRAINT "PaymentApplicationLineItem_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentApplicationStatusHistory_paymentApplicationId_fkey') THEN
    ALTER TABLE "PaymentApplicationStatusHistory" ADD CONSTRAINT "PaymentApplicationStatusHistory_paymentApplicationId_fkey" FOREIGN KEY ("paymentApplicationId") REFERENCES "ApplicationForPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentCertificate_projectId_fkey') THEN
    ALTER TABLE "PaymentCertificate" ADD CONSTRAINT "PaymentCertificate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentCertificate_upstreamContractId_fkey') THEN
    ALTER TABLE "PaymentCertificate" ADD CONSTRAINT "PaymentCertificate_upstreamContractId_fkey" FOREIGN KEY ("upstreamContractId") REFERENCES "UpstreamContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentCertificate_paymentApplicationId_fkey') THEN
    ALTER TABLE "PaymentCertificate" ADD CONSTRAINT "PaymentCertificate_paymentApplicationId_fkey" FOREIGN KEY ("paymentApplicationId") REFERENCES "ApplicationForPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CertificatePayment_paymentCertificateId_fkey') THEN
    ALTER TABLE "CertificatePayment" ADD CONSTRAINT "CertificatePayment_paymentCertificateId_fkey" FOREIGN KEY ("paymentCertificateId") REFERENCES "PaymentCertificate"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentRecord_paymentApplicationId_fkey') THEN
    ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_paymentApplicationId_fkey" FOREIGN KEY ("paymentApplicationId") REFERENCES "ApplicationForPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UpstreamRetentionRelease_upstreamContractId_fkey') THEN
    ALTER TABLE "UpstreamRetentionRelease" ADD CONSTRAINT "UpstreamRetentionRelease_upstreamContractId_fkey" FOREIGN KEY ("upstreamContractId") REFERENCES "UpstreamContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UpstreamRetentionBond_upstreamContractId_fkey') THEN
    ALTER TABLE "UpstreamRetentionBond" ADD CONSTRAINT "UpstreamRetentionBond_upstreamContractId_fkey" FOREIGN KEY ("upstreamContractId") REFERENCES "UpstreamContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;

-- Uniqueness and indexes used by the finance workflow.
CREATE UNIQUE INDEX IF NOT EXISTS "UpstreamContract_projectId_key" ON "UpstreamContract"("projectId");
CREATE INDEX IF NOT EXISTS "UpstreamContract_tenantId_idx" ON "UpstreamContract"("tenantId");
CREATE INDEX IF NOT EXISTS "UpstreamContract_tenantId_projectId_idx" ON "UpstreamContract"("tenantId", "projectId");
CREATE INDEX IF NOT EXISTS "UpstreamContract_tenantId_mainContractorId_idx" ON "UpstreamContract"("tenantId", "mainContractorId");
CREATE INDEX IF NOT EXISTS "UpstreamContract_tenantId_status_idx" ON "UpstreamContract"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "ApplicationForPayment_tenantId_projectId_direction_idx" ON "ApplicationForPayment"("tenantId", "projectId", "direction");
CREATE INDEX IF NOT EXISTS "Invoice_tenantId_projectId_direction_idx" ON "Invoice"("tenantId", "projectId", "direction");
CREATE INDEX IF NOT EXISTS "Invoice_paymentApplicationId_idx" ON "Invoice"("paymentApplicationId");
CREATE INDEX IF NOT EXISTS "PaymentApplicationLineItem_budgetLineId_idx" ON "PaymentApplicationLineItem"("budgetLineId");

CREATE INDEX IF NOT EXISTS "PaymentApplicationStatusHistory_paymentApplicationId_idx" ON "PaymentApplicationStatusHistory"("paymentApplicationId");
CREATE INDEX IF NOT EXISTS "PaymentApplicationStatusHistory_changedAt_idx" ON "PaymentApplicationStatusHistory"("changedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentCertificate_tenantId_projectId_certificateNumber_key" ON "PaymentCertificate"("tenantId", "projectId", "certificateNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentCertificate_paymentApplicationId_key" ON "PaymentCertificate"("paymentApplicationId") WHERE "paymentApplicationId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "PaymentCertificate_tenantId_idx" ON "PaymentCertificate"("tenantId");
CREATE INDEX IF NOT EXISTS "PaymentCertificate_projectId_idx" ON "PaymentCertificate"("projectId");
CREATE INDEX IF NOT EXISTS "PaymentCertificate_paymentStatus_idx" ON "PaymentCertificate"("paymentStatus");
CREATE INDEX IF NOT EXISTS "PaymentCertificate_paymentDueDate_idx" ON "PaymentCertificate"("paymentDueDate");
CREATE INDEX IF NOT EXISTS "PaymentCertificate_tenantId_projectId_direction_idx" ON "PaymentCertificate"("tenantId", "projectId", "direction");

CREATE INDEX IF NOT EXISTS "CertificatePayment_tenantId_idx" ON "CertificatePayment"("tenantId");
CREATE INDEX IF NOT EXISTS "CertificatePayment_paymentCertificateId_idx" ON "CertificatePayment"("paymentCertificateId");
CREATE INDEX IF NOT EXISTS "CertificatePayment_paymentDate_idx" ON "CertificatePayment"("paymentDate");

CREATE INDEX IF NOT EXISTS "PaymentRecord_tenantId_idx" ON "PaymentRecord"("tenantId");
CREATE INDEX IF NOT EXISTS "PaymentRecord_paymentApplicationId_idx" ON "PaymentRecord"("paymentApplicationId");
CREATE INDEX IF NOT EXISTS "PaymentRecord_paymentDate_idx" ON "PaymentRecord"("paymentDate");
CREATE INDEX IF NOT EXISTS "PaymentRecord_status_idx" ON "PaymentRecord"("status");

CREATE INDEX IF NOT EXISTS "UpstreamRetentionRelease_tenantId_idx" ON "UpstreamRetentionRelease"("tenantId");
CREATE INDEX IF NOT EXISTS "UpstreamRetentionRelease_projectId_idx" ON "UpstreamRetentionRelease"("projectId");
CREATE INDEX IF NOT EXISTS "UpstreamRetentionRelease_upstreamContractId_idx" ON "UpstreamRetentionRelease"("upstreamContractId");
CREATE INDEX IF NOT EXISTS "UpstreamRetentionRelease_claimStatus_idx" ON "UpstreamRetentionRelease"("claimStatus");
CREATE INDEX IF NOT EXISTS "UpstreamRetentionRelease_releaseType_idx" ON "UpstreamRetentionRelease"("releaseType");
CREATE INDEX IF NOT EXISTS "UpstreamRetentionBond_tenantId_idx" ON "UpstreamRetentionBond"("tenantId");
CREATE INDEX IF NOT EXISTS "UpstreamRetentionBond_projectId_idx" ON "UpstreamRetentionBond"("projectId");
CREATE INDEX IF NOT EXISTS "UpstreamRetentionBond_upstreamContractId_idx" ON "UpstreamRetentionBond"("upstreamContractId");
CREATE INDEX IF NOT EXISTS "UpstreamRetentionBond_status_idx" ON "UpstreamRetentionBond"("status");

-- Preserve existing certificate document references and normalize paid figures.
UPDATE "ApplicationForPayment"
SET "paymentCertificateUrl" = COALESCE("paymentCertificateUrl", "valuationDocument")
WHERE "paymentCertificateUrl" IS NULL
  AND "valuationDocument" IS NOT NULL;

INSERT INTO "PaymentRecord" (
  "tenantId",
  "paymentApplicationId",
  "amount",
  "paymentDate",
  "paymentMethod",
  "paymentReference",
  "status",
  "createdAt",
  "createdBy",
  "notes"
)
SELECT
  afp."tenantId",
  afp."id",
  afp."amountPaid",
  COALESCE(afp."paidDate", afp."updatedAt", CURRENT_TIMESTAMP),
  'LEGACY',
  afp."paymentReference",
  'COMPLETED',
  CURRENT_TIMESTAMP,
  'migration',
  'Backfilled from ApplicationForPayment.amountPaid'
FROM "ApplicationForPayment" afp
WHERE COALESCE(afp."amountPaid", 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "PaymentRecord" pr
    WHERE pr."tenantId" = afp."tenantId"
      AND pr."paymentApplicationId" = afp."id"
      AND pr."notes" = 'Backfilled from ApplicationForPayment.amountPaid'
  );

WITH paid AS (
  SELECT
    "tenantId",
    "paymentApplicationId",
    SUM("amount") AS "totalPaid",
    MAX("paymentDate") AS "lastPaymentDate"
  FROM "PaymentRecord"
  WHERE "status" <> 'REVERSED'
  GROUP BY "tenantId", "paymentApplicationId"
)
UPDATE "ApplicationForPayment" afp
SET
  "totalPaid" = paid."totalPaid",
  "paidAt" = COALESCE(afp."paidAt", paid."lastPaymentDate"),
  "paidInFull" = (
    paid."totalPaid" >= COALESCE(
      afp."paymentNoticeAmount",
      afp."certifiedThisPeriod",
      afp."certifiedNetValue",
      afp."certifiedAmount",
      COALESCE(afp."certifiedGrossValue", 0) - COALESCE(afp."certifiedRetention", 0),
      afp."claimedNetValue",
      afp."claimedThisPeriod",
      afp."netClaimed",
      0
    )
  ),
  "remainingBalance" = GREATEST(
    COALESCE(
      afp."paymentNoticeAmount",
      afp."certifiedThisPeriod",
      afp."certifiedNetValue",
      afp."certifiedAmount",
      COALESCE(afp."certifiedGrossValue", 0) - COALESCE(afp."certifiedRetention", 0),
      afp."claimedNetValue",
      afp."claimedThisPeriod",
      afp."netClaimed",
      0
    ) - paid."totalPaid",
    0
  )
FROM paid
WHERE afp."tenantId" = paid."tenantId"
  AND afp."id" = paid."paymentApplicationId";
