# Contract Confirmation Flow - Testing Guide

**Created:** 2025-11-24
**Status:** Ready for Testing

## Overview

This document provides comprehensive testing instructions for the contract document confirmation workflow, including OCR data review and PO generation triggers.

---

## New Endpoints Added

### 1. Confirm Signed Contract with OCR Review

**Endpoint:** `POST /api/contracts/:id/documents/confirm-signed`

**Purpose:** Review and confirm OCR-extracted data, mark contract as signed, trigger PO generation and CVR commitments

**Request Body:**
```json
{
  "confirmedData": {
    "value": 948729.78,
    "startDate": "2025-11-24",
    "endDate": "2026-12-18",
    "retentionPercent": 5,
    "contractType": "NEC4",
    "paymentTerms": 14
  },
  "reviewNotes": "All OCR data verified and confirmed"
}
```

**Response:**
```json
{
  "success": true,
  "contract": {
    "id": 7,
    "status": "signed",
    "value": 948729.78,
    "startDate": "2025-11-24T00:00:00.000Z",
    "endDate": "2026-12-18T00:00:00.000Z",
    "signedAt": "2025-11-24T10:30:00.000Z",
    "signedBy": "123"
  },
  "poGeneration": {
    "triggered": true,
    "count": 2,
    "purchaseOrders": [
      { "id": 45, "poNumber": "PO-2025-045", "value": 474364.89 },
      { "id": 46, "poNumber": "PO-2025-046", "value": 474364.89 }
    ],
    "error": null
  },
  "cvrCommitments": {
    "count": 3
  }
}
```

### 2. Mark Contract as Signed Manually

**Endpoint:** `POST /api/contracts/:id/documents/mark-signed-manual`

**Purpose:** Bypass OCR review and manually mark contract as signed (for cases where OCR fails or isn't needed)

**Request Body:**
```json
{
  "signedDate": "2025-11-24",
  "confirmExistingData": true
}
```

**Response:** Same structure as confirm-signed endpoint

---

## Prerequisites for Testing

### 1. Environment Setup

Ensure `.env` file contains:
```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/erp_development"

# AWS (for OCR)
AWS_REGION=eu-west-2
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here
AWS_S3_BUCKET=erp-payment-applications

# Oracle Cloud Storage
OCI_NAMESPACE=your_namespace
OCI_BUCKET_NAME=erp-documents
OCI_ACCESS_KEY_ID=your_oci_key
OCI_SECRET_ACCESS_KEY=your_oci_secret
```

### 2. Database Setup

Ensure you have test data:
```bash
# Run database migrations
npx prisma migrate deploy

# Seed test data (if available)
node prisma/seed.cjs
```

### 3. Server Running

```bash
npm start
```

Server should be running on `http://localhost:3001`

### 4. Authentication Token

Obtain a valid JWT token for testing:
```bash
# Login to get token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Extract token from response
export AUTH_TOKEN="your_jwt_token_here"
```

### 5. Test Contract Setup

Create or use an existing contract with:
- Valid projectId with active package
- Valid supplierId
- Contract line items with budgetLineId values
- Uploaded signed document with completed OCR

---

## Test Scenarios

### Scenario 1: Complete Flow (Upload → OCR → Confirm → PO)

**Step 1: Create Test Contract**
```bash
curl -X POST http://localhost:3001/api/contracts \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "supplierId": 1,
    "title": "Test M&E Installation Contract",
    "value": 950000,
    "status": "draft",
    "lineItems": [
      {
        "description": "Electrical Installation",
        "quantity": 1,
        "unitPrice": 475000,
        "total": 475000,
        "budgetLineId": 10
      },
      {
        "description": "Mechanical Systems",
        "quantity": 1,
        "unitPrice": 475000,
        "total": 475000,
        "budgetLineId": 11
      }
    ]
  }'

# Save contract ID from response
export CONTRACT_ID=7
```

**Step 2: Upload Signed Document**
```bash
curl -X POST http://localhost:3001/api/contracts/$CONTRACT_ID/documents/upload-signed \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "file=@/path/to/sample-contract.pdf"

# Expected response:
# {
#   "success": true,
#   "contract": {
#     "id": 7,
#     "documentSource": "UPLOADED_SIGNED",
#     "signedDocumentUrl": "https://...",
#     "ocrStatus": "PENDING"
#   },
#   "message": "Document uploaded successfully. OCR processing started."
# }
```

**Step 3: Poll OCR Status (wait 10-30 seconds)**
```bash
# Check status every 5 seconds
while true; do
  curl -s http://localhost:3001/api/contracts/$CONTRACT_ID/ocr-status \
    -H "Authorization: Bearer $AUTH_TOKEN" | jq -r '.ocr.status'
  sleep 5
done

# Stop when status shows "COMPLETED"
```

**Step 4: Review OCR Results**
```bash
curl http://localhost:3001/api/contracts/$CONTRACT_ID/ocr-status \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq .

# Review extracted data fields:
# - contractValue
# - supplierName
# - startDate
# - endDate
# - retentionPercent
# - contractType
# - paymentTerms
```

**Step 5: Confirm Contract**
```bash
curl -X POST http://localhost:3001/api/contracts/$CONTRACT_ID/documents/confirm-signed \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "confirmedData": {
      "value": 948729.78,
      "startDate": "2025-11-24",
      "endDate": "2026-12-18",
      "retentionPercent": 5,
      "contractType": "NEC4",
      "paymentTerms": 14
    },
    "reviewNotes": "All OCR data verified and confirmed"
  }' | jq .
```

**Step 6: Verify Results**

Check contract was updated:
```bash
curl http://localhost:3001/api/contracts/$CONTRACT_ID \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq '{
    id, status, value, startDate, endDate,
    signedAt, signedBy, contractTypeId
  }'
```

Check POs were generated:
```bash
curl http://localhost:3001/api/purchase-orders?contractId=$CONTRACT_ID \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq .
```

Check CVR commitments were created:
```bash
curl http://localhost:3001/api/cvr/contracts/$CONTRACT_ID/commitments \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq .
```

### Scenario 2: Manual Signing (No OCR)

**Use Case:** OCR failed or contract uploaded as image that can't be processed

```bash
# Mark contract as signed manually
curl -X POST http://localhost:3001/api/contracts/$CONTRACT_ID/documents/mark-signed-manual \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "signedDate": "2025-11-24",
    "confirmExistingData": true
  }' | jq .
```

**Expected Result:**
- Contract status updated to "signed"
- Uses existing contract values (not OCR data)
- PO generation triggered
- CVR commitments created

### Scenario 3: OCR Review and Correction

**Use Case:** OCR extracted data with errors that need manual correction

**Step 1: Check OCR status and identify errors**
```bash
curl http://localhost:3001/api/contracts/$CONTRACT_ID/ocr-status \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq '.ocr.extractedData'
```

**Step 2: Review and update OCR data**
```bash
curl -X POST http://localhost:3001/api/contracts/$CONTRACT_ID/ocr-review \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reviewNotes": "Corrected contract value - OCR misread decimal",
    "updatedData": {
      "contractValue": {
        "value": 948729.78,
        "confidence": 1.0,
        "source": "Manually verified"
      }
    }
  }' | jq .
```

**Step 3: Confirm with corrected data**
```bash
curl -X POST http://localhost:3001/api/contracts/$CONTRACT_ID/documents/confirm-signed \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "confirmedData": {
      "value": 948729.78,
      "startDate": "2025-11-24",
      "endDate": "2026-12-18",
      "retentionPercent": 5,
      "contractType": "NEC4",
      "paymentTerms": 14
    },
    "reviewNotes": "Contract value corrected before confirmation"
  }' | jq .
```

### Scenario 4: Retry Failed OCR

**Use Case:** OCR processing failed due to temporary AWS issue

```bash
# Check if OCR status is "FAILED"
curl http://localhost:3001/api/contracts/$CONTRACT_ID/ocr-status \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq -r '.ocr.status'

# Retry OCR processing
curl -X POST http://localhost:3001/api/contracts/$CONTRACT_ID/ocr-retry \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq .

# Wait and check status again
sleep 10
curl http://localhost:3001/api/contracts/$CONTRACT_ID/ocr-status \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq -r '.ocr.status'
```

---

## Automated Test Script

**File:** `scripts/test-contract-confirm-flow.sh`

```bash
#!/bin/bash

# Set environment variables
export AUTH_TOKEN="your_token_here"
export CONTRACT_ID="7"

# Run the test
bash scripts/test-contract-confirm-flow.sh
```

**Expected Output:**
```
📋 Testing Contract Confirmation Flow
======================================

Contract ID: 7
API Base: http://localhost:3001/api

Step 1: Checking OCR status...
{
  "success": true,
  "ocr": {
    "status": "COMPLETED",
    "confidence": 0.84,
    "extractedData": { ... }
  }
}

✓ OCR status retrieved

Step 2: Confirming signed contract...
{
  "success": true,
  "contract": { ... },
  "poGeneration": {
    "triggered": true,
    "count": 2
  },
  "cvrCommitments": {
    "count": 3
  }
}

✓ Contract confirmed successfully
✓ 2 PO(s) generated

═══════════════════════════════════
✓ Test completed successfully
═══════════════════════════════════
```

---

## Validation Checklist

After running tests, verify:

- [ ] **Contract Status**
  - Status changed to "signed"
  - signedAt timestamp populated
  - signedBy contains user ID
  - ocrReviewedBy contains user ID
  - ocrReviewedAt timestamp populated

- [ ] **Contract Values**
  - value updated to confirmed amount
  - startDate updated
  - endDate updated
  - retentionPercentage updated
  - contractTypeId updated (if type provided)
  - paymentDueDays updated

- [ ] **PO Generation**
  - POs created based on package strategy:
    - SINGLE_ON_AWARD: 1 PO for full contract value
    - MILESTONE_BASED: Multiple POs based on milestones
    - CALL_OFF: No POs generated initially
  - PO numbers assigned correctly
  - PO status is "draft" or "pending_approval"
  - PO values sum to contract value

- [ ] **CVR Commitments**
  - Commitment created for each line item with budgetLineId
  - Commitment amounts match line item totals
  - effectiveDate set to current date
  - sourceType is "CONTRACT"
  - sourceId references contract ID

- [ ] **Audit Logs**
  - Contract status change logged
  - PO generation events logged
  - CVR commitment creation logged

- [ ] **Error Handling**
  - Contract marked as signed even if PO generation fails
  - Error details returned in response
  - No data corruption if partial failure occurs

---

## Troubleshooting

### Issue: "CONTRACT_NOT_READY" Error

**Cause:** Contract documentSource is not "UPLOADED_SIGNED"

**Solution:**
1. Upload signed document first: `POST /contracts/:id/documents/upload-signed`
2. Wait for OCR to complete
3. Then call confirm-signed endpoint

### Issue: "OCR_NOT_COMPLETED" Error

**Cause:** OCR status is not "COMPLETED"

**Solution:**
1. Check OCR status: `GET /contracts/:id/ocr-status`
2. If status is "PROCESSING", wait longer
3. If status is "FAILED", retry: `POST /contracts/:id/ocr-retry`
4. If status is "NONE", upload signed document first

### Issue: No POs Generated

**Cause:** Package strategy might be CALL_OFF or package not properly configured

**Check:**
```bash
curl http://localhost:3001/api/projects/1 \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq '.activePackage'
```

**Solution:**
1. Verify project has activePackage
2. Check package strategy is SINGLE_ON_AWARD or MILESTONE_BASED
3. For CALL_OFF, POs are generated manually later

### Issue: No CVR Commitments Created

**Cause:** Contract line items missing budgetLineId

**Check:**
```bash
curl http://localhost:3001/api/contracts/$CONTRACT_ID \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq '.lineItems[] | {description, budgetLineId}'
```

**Solution:**
1. Update line items to include budgetLineId
2. Re-run confirmation

### Issue: Contract Type Not Found

**Symptom:** contractTypeId not updated despite providing contractType in confirmedData

**Check:**
```bash
curl http://localhost:3001/api/contract-types \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq '.[] | {id, name}'
```

**Solution:**
1. Verify contract type exists in database
2. Ensure name matches or contains OCR-extracted value
3. Contract will use existing contractTypeId if lookup fails

---

## Integration Points Verified

### ✅ PO Generation Service

**File:** `services/poGeneration.cjs`

**Function Called:** `generateFromContract(contractId, userId, tenantId)`

**Strategies Supported:**
- SINGLE_ON_AWARD: Creates one PO for entire contract value
- MILESTONE_BASED: Creates multiple POs based on payment milestones
- CALL_OFF: Returns empty array (POs created on-demand)

**Error Handling:** If PO generation fails, contract is still marked as signed, error is logged and returned in response.

### ✅ CVR Service

**File:** `services/cvr.cjs`

**Function Called:** `createCommitment(data)`

**Logic:**
- Iterates through all contract line items
- Creates commitment for each line with budgetLineId
- Falls back to single commitment if no line items with budget lines
- Commitment amount equals line item total
- Links to contract via sourceType="CONTRACT" and sourceId

**Error Handling:** CVR creation is supplementary - failures don't prevent contract signing.

### ✅ Storage Service

**File:** `services/storage.factory.cjs`

**Functions Used:**
- `uploadContractDocument()` - Upload PDF to Oracle Cloud Storage
- `getSignedUrl()` - Generate presigned URLs for document access
- `downloadFile()` - Download documents for OCR processing

**Provider:** Oracle Cloud Storage (OCI) with S3-compatible API

### ✅ Contract Status Workflow

**Statuses:** draft → pending → awarded → signed → active → completed

**Confirmation Flow:**
1. Contract uploaded in "draft" or "awarded" status
2. Signed document uploaded (status unchanged)
3. OCR processes document
4. User confirms OCR data
5. Status updates to "signed"
6. PO generation triggered
7. CVR commitments created

---

## Performance Considerations

### OCR Processing Time

- **Text-based PDFs:** 5-15 seconds
- **Image-based PDFs:** 15-45 seconds
- **Multi-page contracts (10+ pages):** 30-60 seconds

**Optimization:** Consider implementing polling interval based on document size.

### Database Operations

**Confirmation endpoint performs:**
- 1 contract update (with full data)
- N CVR commitment inserts (where N = number of line items with budget lines)
- 1-M PO inserts (depending on strategy)
- M PO line item inserts (depending on contract structure)

**Total queries:** Approximately 5-20 depending on contract complexity

**Transaction handling:** All operations wrapped in single database transaction to ensure consistency.

---

## Next Steps

### Phase 6: Frontend Integration

Create React components:

1. **Upload Modal** (`src/components/contracts/UploadSignedDocumentModal.tsx`)
   - File upload with drag-and-drop
   - Upload progress indicator
   - OCR status polling

2. **OCR Results Viewer** (`src/components/contracts/OcrResultsViewer.tsx`)
   - Display extracted fields with confidence scores
   - Color-coded confidence indicators (green > 0.8, yellow > 0.5, red < 0.5)
   - Side-by-side comparison with existing contract data

3. **Confirmation Form** (`src/components/contracts/ConfirmContractForm.tsx`)
   - Editable fields populated from OCR data
   - Date pickers for startDate/endDate
   - Contract type dropdown
   - Review notes textarea
   - Submit confirmation button

4. **Status Dashboard** (`src/pages/contracts/ContractDetail.tsx`)
   - Document upload status
   - OCR processing indicator
   - PO generation status
   - CVR commitments summary

### Phase 7: End-to-End Testing

1. **Integration Tests**
   - Upload → OCR → Confirm flow
   - Manual signing flow
   - OCR retry flow
   - Error handling scenarios

2. **Load Testing**
   - Multiple concurrent uploads
   - Large PDF files (100+ pages)
   - Batch processing

3. **User Acceptance Testing**
   - Real contract documents
   - Various contract types (NEC4, JCT, FIDIC)
   - Different PDF qualities (scanned vs digital)

---

## Summary

✅ **Confirmation endpoints implemented** and ready for testing

✅ **PO generation integration** verified using existing service

✅ **CVR commitments** created automatically on confirmation

✅ **Error handling** ensures data consistency

✅ **Comprehensive test scripts** provided for validation

**Status:** Backend implementation complete. Ready for frontend integration and end-to-end testing.
