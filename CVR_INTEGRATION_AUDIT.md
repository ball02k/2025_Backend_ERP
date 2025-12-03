# CVR Integration Audit Report

## Executive Summary

This document verifies all financial transactions correctly update the CVR (Cost-Value-Reconciliation) system.

**Status**: ✅ **MOSTLY COMPLETE** - Minor enhancements needed

## CVR System Overview

The CVR system tracks:
- **Budget**: Planned spend (from budget module)
- **Commitments**: Contractual obligations (contracts, POs, variations)
- **Actuals**: Real costs incurred (invoices, payments)
- **Forecasts**: Projected final cost

Formula: `Budget - Committed - Actual = Remaining Budget`

## Integration Points Verified

### 1. ✅ Contract Signing → CVR Commitment

**Location**: `routes/contracts.cjs:846`

**Status**: ✅ WORKING

**Implementation**:
```javascript
// When contract status changes to 'signed'
await prisma.cVRCommitment.create({
  data: {
    tenantId,
    projectId: updated.projectId,
    budgetLineId: null,
    sourceType: 'CONTRACT',
    sourceId: updated.id,
    amount: updated.value,
    currency: updated.currency || 'GBP',
    status: 'COMMITTED',
    description: `Contract ${updated.contractRef || updated.id}`,
    reference: updated.contractRef,
    effectiveDate: new Date(),
  }
});
```

**Notes**:
- Creates commitment when contract status changes to 'signed'
- Only creates if contract has a value
- Direct implementation (not using cvr.hooks.cjs)

### 2. ✅ Invoice Creation → CVR Actual

**Location**: `services/invoice.cjs:56`

**Status**: ✅ WORKING

**Implementation**:
```javascript
// When invoice is created (RECEIVED status)
await createActual({
  tenantId,
  projectId,
  budgetLineId,
  sourceType: 'INVOICE',
  sourceId: invoice.id,
  amount: net, // Use net amount (excluding VAT)
  description: `Invoice ${number}`,
  reference: number,
  incurredDate: issueDate || new Date(),
  createdBy,
});
```

**Status Flow**:
- RECEIVED → CVR Actual created (status: RECORDED)
- APPROVED → CVR Actual updated to CERTIFIED
- PAID → CVR Actual updated to PAID

### 3. ✅ Invoice Approval → CVR Actual Status Update

**Location**: `services/invoice.cjs:123-134`

**Status**: ✅ WORKING

**Implementation**:
```javascript
// When invoice is approved
const actual = await prisma.cVRActual.findFirst({
  where: { tenantId, sourceType: 'INVOICE', sourceId: id }
});

if (actual) {
  await updateActualStatus(actual.id, 'CERTIFIED', new Date());
}
```

### 4. ⚠️ Payment Application Certification → CVR Actual

**Location**: `routes/payment-applications.cjs`

**Status**: ⚠️ PARTIAL - Only creates CVRActual when PAID, not when CERTIFIED

**Current Implementation**:
```javascript
// Line 1190 - Only called when payment is RECORDED (PAID status)
await updateCVRFromPayment(updated, amountPaid);
await updateBudgetActuals(updated, amountPaid); // This creates CVRActual
```

**Issue**: CVRActual should be created when AfP is CERTIFIED, not when PAID.

**Recommended Fix**:
```javascript
// In /certify endpoint (around line 850)
// After certification, create CVR actual
const cvrHooks = require('../services/cvr.hooks.cjs');
await cvrHooks.onPaymentApplicationCertified(updated, tenantId, userId);
```

### 5. ✅ Purchase Order Creation → CVR Commitment

**Location**: Not currently implemented, but CVR hooks exist for this

**Status**: ⚠️ NOT IMPLEMENTED

**Available Hook**: `services/cvr.hooks.cjs:onPurchaseOrderIssued` (if we add it)

**Recommendation**: POs should create commitments OR we rely on contracts for commitments

## CVR Data Flow Diagram

```
┌─────────────┐
│   Budget    │ ← Budget module (planned spend)
└─────────────┘
       │
       ├─────────────────┐
       │                 │
┌──────▼──────┐   ┌──────▼──────┐
│ Commitments │   │   Actuals    │
│             │   │              │
│ • Contracts │   │ • Invoices   │
│ • Variations│   │ • AfPs       │
│ • POs       │   │ • Payments   │
└─────────────┘   └──────────────┘
       │                 │
       └────────┬────────┘
                │
         ┌──────▼──────┐
         │  Remaining  │
         │   Budget    │
         └─────────────┘
```

## API Endpoints for CVR

### Get CVR Summary
```http
GET /api/projects/:projectId/cvr
GET /api/projects/:projectId/budget-lines/:lineId/cvr
```

**Response**:
```json
{
  "budget": 1000000,
  "committed": 750000,
  "actuals": 450000,
  "remaining": 300000,
  "variance": 250000,
  "percentCommitted": 0.75,
  "percentActual": 0.45
}
```

## Testing Checklist

### Manual Test Flow

1. **Create Budget**
   ```
   POST /api/projects/:id/budget-lines
   {
     "code": "01.01",
     "description": "Site Preparation",
     "total": 100000
   }
   ```
   ✓ Check: Budget appears in CVR

2. **Sign Contract**
   ```
   POST /api/contracts/:id/mark-signed
   ```
   ✓ Check: Commitment created
   ✓ Check: CVR shows committed amount

3. **Create & Approve Invoice**
   ```
   POST /api/invoices
   POST /api/invoices/:id/approve
   ```
   ✓ Check: Actual created (RECORDED → CERTIFIED)
   ✓ Check: CVR shows actual amount

4. **Certify Payment Application**
   ```
   POST /api/applications/:id/certify
   ```
   ⚠️ Currently: CVR actual NOT created until PAID
   ✅ Should: CVR actual created when CERTIFIED

5. **Record Payment**
   ```
   POST /api/applications/:id/record-payment
   ```
   ✓ Check: CVR actual updated to PAID

## Gaps & Recommendations

### Gap 1: AfP Certification Not Creating CVR Actuals

**Impact**: AfPs don't appear in CVR until payment is recorded

**Fix**: Add CVR hook call in certification endpoint

**Location**: `routes/payment-applications.cjs` line ~850

**Code to Add**:
```javascript
// After certification
const cvrHooks = require('../services/cvr.hooks.cjs');
await cvrHooks.onPaymentApplicationCertified(updated, tenantId, userId);
```

### Gap 2: Purchase Orders Not Creating Commitments

**Impact**: PO commitments not tracked in CVR

**Options**:
1. Add PO commitment creation (if POs are independent of contracts)
2. Rely on contract commitments only (if all POs flow from contracts)

**Recommendation**: If POs are always linked to contracts, rely on contract commitments

### Gap 3: Variations Not Creating Commitments

**Status**: Hook exists but not called

**Location**: `services/cvr.hooks.cjs:onVariationApproved`

**Fix**: Call hook when variation is approved

## CVR Models in Schema

### CVRCommitment
```prisma
model CVRCommitment {
  id            BigInt
  tenantId      String
  projectId     BigInt
  budgetLineId  BigInt?
  sourceType    String  // 'CONTRACT' | 'VARIATION' | 'PURCHASE_ORDER'
  sourceId      BigInt
  amount        Decimal
  currency      String
  status        String  // 'COMMITTED' | 'SUPERSEDED' | 'CANCELLED'
  description   String?
  reference     String?
  effectiveDate DateTime
  cancelledDate DateTime?
  createdBy     Int?
  createdAt     DateTime
  updatedAt     DateTime
}
```

### CVRActual
```prisma
model CVRActual {
  id            BigInt
  tenantId      String
  projectId     BigInt
  budgetLineId  BigInt?
  sourceType    String  // 'INVOICE' | 'PAYMENT_APPLICATION' | 'DIRECT_COST'
  sourceId      BigInt
  amount        Decimal
  currency      String
  status        String  // 'RECORDED' | 'CERTIFIED' | 'PAID' | 'REVERSED'
  description   String?
  reference     String?
  incurredDate  DateTime
  certifiedDate DateTime?
  paidDate      DateTime?
  createdBy     Int?
  createdAt     DateTime
  updatedAt     DateTime
}
```

## Backfill Scripts

If you need to backfill CVR data for existing records:

```bash
# Backfill contract commitments
node scripts/backfill-cvr-commitments.cjs

# Backfill invoice actuals
node scripts/backfill-cvr-actuals.cjs
```

Or use the batch functions:
```javascript
const cvrHooks = require('./services/cvr.hooks.cjs');

// Backfill for specific tenant
await cvrHooks.batchCreateContractCommitments('tenant-id');
await cvrHooks.batchCreatePaymentApplicationActuals('tenant-id');
```

## Conclusion

**Current State**:
- ✅ Invoices fully integrated with CVR
- ✅ Contracts create CVR commitments
- ⚠️ Payment Applications partially integrated (only on payment, not certification)
- ❌ Variations not integrated
- ❌ POs not integrated (but may not be needed)

**Priority Actions**:
1. **HIGH**: Add CVR actual creation when AfP is certified
2. **MEDIUM**: Add variation commitment creation
3. **LOW**: Decide if PO commitments are needed

**Overall Assessment**: The CVR system is well-designed and mostly implemented. The main gap is AfP certification not creating actuals immediately.
