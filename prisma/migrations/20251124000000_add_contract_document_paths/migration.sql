-- AlterTable
ALTER TABLE "Contract"
ADD COLUMN "documentSource" TEXT DEFAULT 'NONE',
ADD COLUMN "draftDocumentUrl" TEXT,
ADD COLUMN "draftDocumentName" TEXT,
ADD COLUMN "signedDocumentUrl" TEXT,
ADD COLUMN "signedDocumentName" TEXT,
ADD COLUMN "signedDocumentUploadedAt" TIMESTAMP(3),
ADD COLUMN "signedDocumentUploadedBy" TEXT,
ADD COLUMN "ocrStatus" TEXT DEFAULT 'NONE',
ADD COLUMN "ocrRawText" TEXT,
ADD COLUMN "ocrExtractedData" JSONB,
ADD COLUMN "ocrConfidence" DOUBLE PRECISION,
ADD COLUMN "ocrReviewedBy" TEXT,
ADD COLUMN "ocrReviewedAt" TIMESTAMP(3),
ADD COLUMN "ocrReviewNotes" TEXT,
ADD COLUMN "issuedAt" TIMESTAMP(3),
ADD COLUMN "issuedBy" TEXT,
ADD COLUMN "signedBy" TEXT;

-- AddComments
COMMENT ON COLUMN "Contract"."documentSource" IS 'Document source type: NONE | GENERATED | UPLOADED_DRAFT | UPLOADED_SIGNED';
COMMENT ON COLUMN "Contract"."draftDocumentUrl" IS 'URL to draft document in Oracle Cloud Storage';
COMMENT ON COLUMN "Contract"."signedDocumentUrl" IS 'URL to signed document in Oracle Cloud Storage';
COMMENT ON COLUMN "Contract"."ocrStatus" IS 'OCR processing status: NONE | PROCESSING | COMPLETED | FAILED';
COMMENT ON COLUMN "Contract"."ocrExtractedData" IS 'Parsed OCR fields with confidence scores';
