# Contract OCR Implementation

**Created:** 2025-11-24
**Status:** ✅ Complete - Ready for Testing

## Overview

Automated contract metadata extraction from uploaded PDF documents using AWS Textract. Extracts key contract fields with confidence scores for review.

---

## Architecture

### Components Created

1. **`services/contractOcr.cjs`** - Core OCR extraction service
2. **`routes/contracts.documents.cjs`** - Upload and review endpoints
3. **`scripts/test-contract-ocr.cjs`** - Testing utility

### Database Fields (Added to Contract model)

```prisma
// Document tracking
documentSource           String?   @default("NONE")
draftDocumentUrl         String?
draftDocumentName        String?
signedDocumentUrl        String?
signedDocumentName       String?
signedDocumentUploadedAt DateTime?
signedDocumentUploadedBy String?

// OCR results
ocrStatus       String?   @default("NONE")  // NONE | PROCESSING | COMPLETED | FAILED
ocrRawText      String?   @db.Text
ocrExtractedData Json?
ocrConfidence   Float?
ocrReviewedBy   String?
ocrReviewedAt   DateTime?
ocrReviewNotes  String?
```

---

## Fields Extracted

| Field | Description | Example Value | Patterns Matched |
|-------|-------------|---------------|------------------|
| **contractValue** | Total contract sum | £948,729.78 | "Contract Sum", "Total Value", "Sum of" |
| **supplierName** | Contractor/supplier name | Birmingham M&E Ltd | "between X and Y", "Contractor:" |
| **clientName** | Client/employer name | Your Company Ltd | First party in "between", "Employer:" |
| **startDate** | Commencement date | 2025-11-24 | "Commencement Date", "Start Date" |
| **endDate** | Completion date | 2026-12-18 | "Completion Date", "Practical Completion" |
| **retentionPercent** | Retention percentage | 5 | "Retention: 5%", "5% retention" |
| **defectsLiabilityPeriod** | DLP in months | 12 | "Defects Liability Period: 12 months" |
| **contractType** | Contract form used | NEC4 Option A | "NEC4", "JCT", "FIDIC" |
| **paymentTerms** | Days for payment | 14 | "Payment within 14 days" |
| **liquidatedDamages** | LADs amount | 500 | "Liquidated Damages: £500" |

### Extraction Format

Each field returns:
```json
{
  "value": <extracted_value>,
  "confidence": 0.85,  // 0-1 score
  "source": "Contract Sum: £948,729.78"  // Where it was found
}
```

---

## API Endpoints

### 1. Upload Draft Contract

**Endpoint:** `POST /api/contracts/:id/documents/upload-draft`

**Auth:** Required

**Content-Type:** `multipart/form-data`

**Request:**
```bash
curl -X POST http://localhost:3001/api/contracts/123/documents/upload-draft \
  -H "Authorization: Bearer <token>" \
  -F "file=@contract-draft.pdf"
```

**Response:**
```json
{
  "success": true,
  "contract": {
    "id": 123,
    "documentSource": "UPLOADED_DRAFT",
    "draftDocumentUrl": "https://storage.../contract-123-draft-1732454400.pdf",
    "draftDocumentName": "contract-draft.pdf"
  }
}
```

### 2. Upload Signed Contract (with OCR)

**Endpoint:** `POST /api/contracts/:id/documents/upload-signed`

**Auth:** Required

**Content-Type:** `multipart/form-data`

**Request:**
```bash
curl -X POST http://localhost:3001/api/contracts/123/documents/upload-signed \
  -H "Authorization: Bearer <token>" \
  -F "file=@signed-contract.pdf"
```

**Response:**
```json
{
  "success": true,
  "contract": {
    "id": 123,
    "documentSource": "UPLOADED_SIGNED",
    "signedDocumentUrl": "https://storage.../contract-123-signed-1732454400.pdf",
    "signedDocumentName": "signed-contract.pdf",
    "ocrStatus": "PENDING"
  },
  "message": "Document uploaded successfully. OCR processing started."
}
```

**Notes:**
- OCR runs asynchronously in the background
- Check status with `/ocr-status` endpoint
- Typical processing time: 5-30 seconds depending on PDF size

### 3. Check OCR Status

**Endpoint:** `GET /api/contracts/:id/ocr-status`

**Auth:** Required

**Request:**
```bash
curl http://localhost:3001/api/contracts/123/ocr-status \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "success": true,
  "ocr": {
    "status": "COMPLETED",
    "confidence": 0.84,
    "extractedData": {
      "contractValue": {
        "value": 948729.78,
        "confidence": 0.92,
        "source": "Contract Sum: £948,729.78"
      },
      "supplierName": {
        "value": "Birmingham M&E Services Ltd",
        "confidence": 0.85,
        "source": "between ABC Ltd and Birmingham M&E Services Ltd"
      },
      "startDate": {
        "value": "2025-11-24",
        "confidence": 0.78,
        "source": "Commencement Date: 24 November 2025"
      }
      // ... other fields
    },
    "reviewedBy": null,
    "reviewedAt": null,
    "reviewNotes": null
  }
}
```

### 4. Review OCR Results

**Endpoint:** `POST /api/contracts/:id/ocr-review`

**Auth:** Required

**Request:**
```bash
curl -X POST http://localhost:3001/api/contracts/123/ocr-review \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "reviewNotes": "Contract value corrected - OCR misread comma",
    "updatedData": {
      "contractValue": {
        "value": 948729.78,
        "confidence": 1.0,
        "source": "Manually verified"
      }
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "contract": {
    "id": 123,
    "ocrReviewedBy": "user-456",
    "ocrReviewedAt": "2025-11-24T10:30:00.000Z",
    "ocrExtractedData": {
      // Updated data
    }
  }
}
```

### 5. Retry OCR Processing

**Endpoint:** `POST /api/contracts/:id/ocr-retry`

**Auth:** Required

**Use Case:** OCR failed or needs reprocessing

**Request:**
```bash
curl -X POST http://localhost:3001/api/contracts/123/ocr-retry \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "success": true,
  "message": "OCR processing restarted"
}
```

---

## Testing

### Prerequisites

1. **AWS Credentials configured** in `.env`:
   ```env
   AWS_REGION=eu-west-2
   AWS_ACCESS_KEY_ID=your_key_here
   AWS_SECRET_ACCESS_KEY=your_secret_here
   AWS_S3_BUCKET=erp-payment-applications
   ```

2. **Database migrated** with new Contract fields

3. **Sample PDF contract** for testing

### Test with CLI Script

```bash
# Test OCR extraction on a sample PDF
node scripts/test-contract-ocr.cjs path/to/sample-contract.pdf
```

**Output:**
```
📄 Testing Contract OCR Service
================================

📂 Input file: sample-contract.pdf
📏 File size: 245.67 KB

🔍 Extracting contract metadata...

✅ OCR Extraction Successful!

📊 Overall Results
==================
Overall Confidence: 84.3%
Raw Text Length: 12,456 characters

📋 Extracted Fields
===================

Contract Value:
  Value: £948,729.78
  Confidence: 92.0%
  Source: "Contract Sum: £948,729.78"

Supplier Name:
  Value: Birmingham M&E Services Ltd
  Confidence: 85.0%
  Source: "between ABC Ltd and Birmingham M&E Services Ltd"

...

💾 Full results saved to: sample-contract-ocr-results.json

✅ Test completed successfully
```

### Test with API

1. **Start the server:**
   ```bash
   npm start
   ```

2. **Create a test contract:**
   ```bash
   curl -X POST http://localhost:3001/api/contracts \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{
       "projectId": 1,
       "supplierId": 1,
       "title": "Test Contract",
       "value": 100000,
       "status": "draft"
     }'
   ```

3. **Upload signed document:**
   ```bash
   curl -X POST http://localhost:3001/api/contracts/123/documents/upload-signed \
     -H "Authorization: Bearer <token>" \
     -F "file=@sample-contract.pdf"
   ```

4. **Wait 10-30 seconds, then check status:**
   ```bash
   curl http://localhost:3001/api/contracts/123/ocr-status \
     -H "Authorization: Bearer <token>"
   ```

---

## Service Implementation

### ContractOcrService Class

Located in `services/contractOcr.cjs`

**Key Methods:**

```javascript
// Main extraction function
async extractContractMetadata(fileBuffer, contractId)

// Process entire workflow
async processContractOcr(contractId, tenantId)

// Upload to S3
async uploadToS3(fileBuffer, s3Key)

// Extract text via Textract
async extractTextFromS3(s3Key)

// Field extraction helpers
extractContractValue(text)
extractSupplierName(text)
extractClientName(text)
extractDate(text, keywords)
extractRetention(text)
extractDefectsLiability(text)
extractContractType(text)
extractPaymentTerms(text)
extractLiquidatedDamages(text)
```

### Extraction Strategy

Each field uses **pattern matching with priority scoring**:

1. Define multiple regex patterns per field
2. Assign priority to each pattern (10 = highest confidence)
3. Try all patterns, keep best match
4. Return value + confidence + source snippet

**Example - Contract Value Extraction:**

```javascript
extractContractValue(text) {
  const patterns = [
    { regex: /contract\s*sum[:\s]*£?([\d,]+\.?\d*)/i, priority: 10 },
    { regex: /total\s*(?:contract\s*)?value[:\s]*£?([\d,]+\.?\d*)/i, priority: 9 },
    { regex: /sum\s*of[:\s]*£?([\d,]+\.?\d*)/i, priority: 8 },
    // ... more patterns
  ];

  // Try all patterns, return highest priority match
  let bestMatch = null;
  let highestPriority = 0;

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match && pattern.priority > highestPriority) {
      bestMatch = {
        value: parseFloat(match[1].replace(/,/g, '')),
        confidence: pattern.priority / 10,
        source: match[0].trim(),
      };
      highestPriority = pattern.priority;
    }
  }

  return bestMatch || { value: null, confidence: 0, source: 'Not found' };
}
```

---

## Error Handling

### OCR Status Values

| Status | Description | Action |
|--------|-------------|--------|
| `NONE` | No OCR attempted yet | N/A |
| `PENDING` | Queued for processing | Wait for processing to start |
| `PROCESSING` | Currently being processed | Poll `/ocr-status` endpoint |
| `COMPLETED` | Successfully extracted | Review results |
| `FAILED` | Processing failed | Check logs, use `/ocr-retry` |

### Common Failure Scenarios

1. **AWS Credentials Invalid**
   - Check `.env` file has valid credentials
   - Verify IAM permissions for Textract and S3

2. **PDF Not Text-Based**
   - Textract handles image PDFs automatically
   - Processing takes longer for image-based PDFs

3. **S3 Upload Failed**
   - Check S3 bucket exists and is accessible
   - Verify bucket permissions

4. **No Text Extracted**
   - PDF may be encrypted or corrupted
   - Status will be `COMPLETED` with empty `extractedData`

### Logs

OCR processing logs use prefixes for easy filtering:

```
[ContractOCR] - OCR service operations
[ContractDocs] - Upload route operations
```

Example log output:
```
📄 [ContractOCR] Starting extraction for contract 123
✅ [ContractOCR] Uploaded to S3: contracts/123/1732454400-signed.pdf
✅ [ContractOCR] Extracted 12,456 characters of text
📊 [ContractOCR] Overall confidence: 84.3%
✅ [ContractOCR] Successfully processed contract 123
```

---

## Integration Points

### Storage Service

Uses `services/storage.factory.cjs` for file uploads:
- Supports both Oracle Cloud and local storage
- Handles presigned URLs for S3
- Manages file metadata

### AWS Textract

Uses `@aws-sdk/client-textract` for OCR:
- `DetectDocumentText` for simple text extraction
- Processes multi-page PDFs
- Returns text blocks with confidence scores

### Database

Updates Contract model via Prisma:
- Stores OCR status and results
- Tracks reviewer information
- Maintains audit trail

---

## Next Steps

### Frontend Integration (Phase 6-7)

Create React components for:

1. **Upload Modal** - Allow users to upload signed contracts
2. **OCR Results Viewer** - Display extracted fields with confidence scores
3. **Review Interface** - Allow users to correct OCR errors
4. **Status Polling** - Show real-time OCR processing status

### Enhancements

1. **Smart Matching** - Auto-suggest contracts based on extracted supplier/value
2. **Field Validation** - Warn if extracted values don't match expected ranges
3. **Batch Processing** - Process multiple contracts at once
4. **Enhanced Patterns** - Add more regex patterns for better extraction
5. **Multi-language Support** - Handle contracts in different languages

---

## Troubleshooting

### Issue: OCR status stuck on "PROCESSING"

**Cause:** Background process may have crashed

**Solution:**
1. Check server logs for errors
2. Verify AWS credentials are valid
3. Use `/ocr-retry` endpoint to restart processing

### Issue: Low confidence scores

**Cause:** PDF quality is poor or contract uses non-standard terminology

**Solution:**
1. Use OCR review endpoint to manually correct values
2. Add new regex patterns to `contractOcr.cjs` for specific terms
3. Encourage users to upload high-quality scanned PDFs

### Issue: Field not extracted

**Cause:** Pattern not matching contract format

**Solution:**
1. Check `ocrRawText` field to see full extracted text
2. Add new regex pattern for that field
3. Test with CLI script: `node scripts/test-contract-ocr.cjs`

---

## Files Created

```
services/
  └─ contractOcr.cjs                    ✅ Core OCR service

routes/
  └─ contracts.documents.cjs            ✅ Upload & review endpoints

scripts/
  └─ test-contract-ocr.cjs              ✅ Testing utility

prisma/
  └─ migrations/
      └─ 20251124000000_add_contract_document_paths/
          └─ migration.sql              ✅ Database migration

index.cjs                               ✅ Updated (route registration)
```

---

## Summary

✅ **Complete OCR service implementation** for extracting contract metadata from PDFs

✅ **10 key fields extracted** with confidence scores and source references

✅ **4 API endpoints** for upload, status checking, review, and retry

✅ **Comprehensive testing tools** with CLI script and detailed logs

✅ **Production-ready error handling** with status tracking and retry capability

**Ready for integration with frontend (Phase 6-7) and end-to-end testing.**
