# CVR Integration System - Implementation Summary

## Overview
Complete CVR (Cost Value Reconciliation) system has been implemented to provide real-time financial tracking across the entire project lifecycle: **Budget → Committed → Actual**.

**Status**: Backend Complete (Phases 1-6) | Frontend Pending (Phases 7-10)

---

## ✅ Completed: Backend Implementation (Phases 1-6)

### Phase 1: Database Schema ✅
**File**: `prisma/schema.prisma`

**New Models Added**:

1. **CVRCommitment** - Tracks financial commitments
   - Links: Contract signatures, Variation approvals, PO issues
   - Fields: sourceType, sourceId, amount, status, budgetLineId
   - Status: PENDING | COMMITTED | SUPERSEDED | CANCELLED

2. **CVRActual** - Tracks actual costs
   - Links: Invoice receipts, Payment applications, Direct costs
   - Fields: sourceType, sourceId, amount, status, budgetLineId
   - Status: RECORDED | CERTIFIED | PAID | REVERSED

**Enhanced Models**:

3. **PurchaseOrder** - Added CVR integration
   - New fields: budgetLineId, submittedDate, approvedDate, approvedBy, issuedDate
   - Enhanced status: DRAFT → SUBMITTED → APPROVED → ISSUED → INVOICED → PAID

4. **Invoice** - Added CVR integration
   - New fields: budgetLineId, receivedDate, matchedDate, approvedDate, approvedBy, paidDate, paidAmount
   - Enhanced status: RECEIVED → MATCHED → APPROVED → PAID | DISPUTED | CANCELLED

**Relations Added**:
- BudgetLine → cvrCommitments[], cvrActuals[], purchaseOrders[], invoices[]
- Project → cvrCommitments[], cvrActuals[]

**Database Changes**:
```bash
npx prisma db push  # Schema synchronized
npx prisma generate # Client generated
```

---

### Phase 2: Backend Services ✅

#### **`services/cvr.cjs`** - Core CVR Service
```javascript
// Main Functions:
getCVRSummary(tenantId, projectId, budgetLineId?)
  // Returns: { budget, committed, actuals, remaining, variance, %committed, %actual }

getCVRByBudgetLine(tenantId, projectId)
  // Returns array of budget lines with CVR breakdown

createCommitment({ projectId, budgetLineId, sourceType, sourceId, amount, ... })
createActual({ projectId, budgetLineId, sourceType, sourceId, amount, ... })
updateCommitmentStatus(id, status, cancelledDate)
updateActualStatus(id, status, certifiedDate, paidDate)
getCommitmentBreakdown(tenantId, projectId)  // By source type
getActualBreakdown(tenantId, projectId)      // By source type
```

#### **`services/purchaseOrder.cjs`** - PO Workflow Service
```javascript
// CRUD + Workflow:
createPurchaseOrder({ projectId, supplierId, budgetLineId, lines, ... })
updatePurchaseOrder(id, tenantId, updates)
submitPurchaseOrder(id, tenantId, submittedBy)  // DRAFT → SUBMITTED
approvePurchaseOrder(id, tenantId, approvedBy)  // SUBMITTED → APPROVED (creates CVR commitment)
issuePurchaseOrder(id, tenantId)                 // APPROVED → ISSUED
markPurchaseOrderInvoiced(id, tenantId)          // → INVOICED
markPurchaseOrderPaid(id, tenantId)              // → PAID
cancelPurchaseOrder(id, tenantId, reason)        // Updates CVR commitment to CANCELLED
deletePurchaseOrder(id, tenantId)                // Deletes CVR commitment

// Queries:
getPurchaseOrders(tenantId, { projectId, status, supplierId, budgetLineId, limit, offset })
getPurchaseOrderById(id, tenantId)
```

#### **`services/invoice.cjs`** - Invoice Workflow Service
```javascript
// CRUD + Workflow:
createInvoice({ projectId, supplierId, budgetLineId, number, net, vat, gross, ... })
  // Creates CVR actual automatically
updateInvoice(id, tenantId, updates)
matchInvoiceToPO(invoiceId, poId, tenantId)     // RECEIVED → MATCHED (updates PO to INVOICED)
approveInvoice(id, tenantId, approvedBy)         // → APPROVED (CVR actual → CERTIFIED)
markInvoicePaid(id, tenantId, paidAmount, paidDate)  // → PAID (CVR actual → PAID)
disputeInvoice(id, tenantId, disputeReason)      // → DISPUTED
cancelInvoice(id, tenantId, cancelReason)        // Reverses CVR actual
deleteInvoice(id, tenantId)                      // Deletes CVR actual

// Queries:
getInvoices(tenantId, { projectId, status, supplierId, budgetLineId, limit, offset })
getInvoicesAwaitingApproval(tenantId, projectId)
getOverdueInvoices(tenantId, projectId)
```

#### **`services/cvr.hooks.cjs`** - Integration Hooks
```javascript
// Auto-create CVR records when events occur:
onContractSigned(contract, tenantId, userId)
  // Creates CVR commitment when contract status → signed/active

onVariationApproved(variation, tenantId, userId)
  // Creates CVR commitment when variation → approved

onPaymentApplicationCertified(application, tenantId, userId)
  // Creates CVR actual when payment application → certified

onPaymentApplicationPaid(application, tenantId)
  // Updates CVR actual to PAID

// Batch migration helpers:
batchCreateContractCommitments(tenantId, projectId?)
batchCreateVariationCommitments(tenantId, projectId?)
batchCreatePaymentApplicationActuals(tenantId, projectId?)
```

---

### Phase 3: CVR API Routes ✅
**File**: `routes/cvr.cjs`
**Base Path**: `/api/cvr`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/summary?projectId=123&budgetLineId=456` | Get CVR summary |
| GET | `/by-budget-line?projectId=123` | CVR breakdown by budget line |
| GET | `/commitment-breakdown?projectId=123` | Commitments by source type |
| GET | `/actual-breakdown?projectId=123` | Actuals by source type |
| POST | `/commitment` | Create commitment (manual) |
| PATCH | `/commitment/:id` | Update commitment status |
| DELETE | `/commitment/:id` | Delete commitment |
| POST | `/actual` | Create actual (manual) |
| PATCH | `/actual/:id` | Update actual status |
| DELETE | `/actual/:id` | Delete actual |

---

### Phase 4: Purchase Order API Routes ✅
**File**: `routes/purchaseOrders.cjs`
**Base Path**: `/api/purchase-orders`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/?projectId=123&status=DRAFT` | List POs with filters |
| GET | `/:id` | Get single PO |
| POST | `/` | Create new PO (Draft) |
| PATCH | `/:id` | Update PO |
| POST | `/:id/submit` | Submit for approval |
| POST | `/:id/approve` | Approve (creates CVR commitment) |
| POST | `/:id/issue` | Issue to supplier |
| POST | `/:id/cancel` | Cancel (updates CVR) |
| DELETE | `/:id` | Delete PO and CVR |

---

### Phase 5: Invoice API Routes ✅
**File**: `routes/invoices.cjs`
**Base Path**: `/api/invoices`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/?projectId=123&status=RECEIVED` | List invoices with filters |
| GET | `/awaiting-approval?projectId=123` | Invoices needing approval |
| GET | `/overdue?projectId=123` | Overdue invoices |
| GET | `/:id` | Get single invoice |
| POST | `/` | Create invoice (creates CVR actual) |
| PATCH | `/:id` | Update invoice |
| POST | `/:id/match` | Match to PO |
| POST | `/:id/approve` | Approve (CVR → CERTIFIED) |
| POST | `/:id/pay` | Mark as paid (CVR → PAID) |
| POST | `/:id/dispute` | Dispute invoice |
| POST | `/:id/cancel` | Cancel (reverses CVR) |
| DELETE | `/:id` | Delete invoice and CVR |

---

### Phase 6: Integration Hooks ✅
**Implementation**: `services/cvr.hooks.cjs`

**How to Use**:
```javascript
// In your contract approval service:
const { onContractSigned } = require('./services/cvr.hooks.cjs');
// ... after contract is signed:
await onContractSigned(contract, tenantId, userId);

// In your variation approval service:
const { onVariationApproved } = require('./services/cvr.hooks.cjs');
// ... after variation is approved:
await onVariationApproved(variation, tenantId, userId);

// In your payment application service:
const { onPaymentApplicationCertified, onPaymentApplicationPaid } = require('./services/cvr.hooks.cjs');
// ... after certification:
await onPaymentApplicationCertified(application, tenantId, userId);
// ... after payment:
await onPaymentApplicationPaid(application, tenantId);
```

---

## 📋 Remaining: Frontend Implementation (Phases 7-10)

### Phase 7: Frontend CVR Components (Pending)
**Location**: `src/components/cvr/`

**Components to Create**:

1. **`CVRSummaryCard.jsx`**
   ```jsx
   // Displays budget vs committed vs actual
   // Props: projectId, budgetLineId (optional)
   // Shows: total amounts, percentages, variance
   ```

2. **`CVRBreakdownTable.jsx`**
   ```jsx
   // Shows CVR by budget line
   // Props: projectId
   // Columns: Budget Line, Budget, Committed, Actual, Remaining, %
   ```

3. **`CommitmentsList.jsx`**
   ```jsx
   // Lists all commitments with source links
   // Props: projectId, budgetLineId (optional)
   // Shows: Source (Contract/Variation/PO), Amount, Status, Date
   ```

4. **`ActualsList.jsx`**
   ```jsx
   // Lists all actuals with source links
   // Props: projectId, budgetLineId (optional)
   // Shows: Source (Invoice/Payment App), Amount, Status, Dates
   ```

5. **`PurchaseOrderForm.jsx`**
   ```jsx
   // Create/edit PO with workflow
   // Props: projectId, poId (for edit)
   // Features: Supplier select, budget line link, line items, approval flow
   ```

6. **`InvoiceForm.jsx`**
   ```jsx
   // Create/edit invoice with workflow
   // Props: projectId, invoiceId (for edit)
   // Features: Supplier select, PO matching, budget line link, approval flow
   ```

---

### Phase 8: Integrate into Project Pages (Pending)
**Files to Update**:

1. **`src/pages/project/financials/CVRTab.jsx`** (NEW)
   ```jsx
   // Main CVR page
   // Shows: CVRSummaryCard, tabs for breakdown/commitments/actuals
   ```

2. **`src/pages/project/Financials.jsx`** (UPDATE)
   ```jsx
   // Add CVR tab to existing tabs array
   const tabs = [
     { key: 'invoices', label: 'Invoices' },
     { key: 'pos', label: 'Purchase Orders' },
     { key: 'cvr', label: 'CVR' },  // ADD THIS
     { key: 'reports', label: 'Reports' },
     { key: 'payment-applications', label: 'Payment Applications' },
   ];
   ```

3. **`src/App.tsx`** (UPDATE)
   ```jsx
   // Add CVR route
   import CVRTab from './pages/project/financials/CVRTab';

   // In routes:
   <Route path="cvr" element={<CVRTab />} />
   ```

4. **`src/pages/project/financials/PurchaseOrdersTab.jsx`** (NEW)
   ```jsx
   // List/manage purchase orders
   // Uses PurchaseOrderForm component
   ```

5. **`src/pages/project/financials/InvoicesTab.jsx`** (UPDATE)
   ```jsx
   // Enhance existing invoices tab with new workflow
   // Uses InvoiceForm component
   ```

---

### Phase 9: Testing (Pending)
**Test Scenarios**:

1. **CVR Summary**
   - Create budget lines
   - Approve contract → Check commitment created
   - Approve variation → Check commitment created
   - Receive invoice → Check actual created
   - Verify CVR summary shows correct breakdown

2. **Purchase Order Workflow**
   - Create PO (Draft)
   - Submit PO (Submitted)
   - Approve PO → Check CVR commitment created
   - Issue PO (Issued)
   - Receive invoice → PO status → Invoiced
   - Pay invoice → PO status → Paid

3. **Invoice Workflow**
   - Create invoice → Check CVR actual created (RECORDED)
   - Match to PO
   - Approve invoice → Check CVR actual → CERTIFIED
   - Pay invoice → Check CVR actual → PAID

4. **Integration Hooks**
   - Sign contract → Check CVR commitment
   - Approve variation → Check CVR commitment
   - Certify payment application → Check CVR actual
   - Pay payment application → Check CVR actual → PAID

---

### Phase 10: Deployment (Pending)
**Steps**:

1. **Database Migration**
   ```bash
   # Production
   npx prisma migrate deploy
   npx prisma generate
   ```

2. **Backfill Existing Data** (Optional)
   ```javascript
   // Script to create CVR records for existing contracts/variations/invoices
   const {
     batchCreateContractCommitments,
     batchCreateVariationCommitments,
     batchCreatePaymentApplicationActuals
   } = require('./services/cvr.hooks.cjs');

   await batchCreateContractCommitments('tenantId', projectId);
   await batchCreateVariationCommitments('tenantId', projectId);
   await batchCreatePaymentApplicationActuals('tenantId', projectId);
   ```

3. **Verify Endpoints**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     "https://api.yourdomain.com/api/cvr/summary?projectId=1"

   curl -H "Authorization: Bearer $TOKEN" \
     "https://api.yourdomain.com/api/purchase-orders?projectId=1"

   curl -H "Authorization: Bearer $TOKEN" \
     "https://api.yourdomain.com/api/invoices?projectId=1"
   ```

---

## 📊 CVR Formula

```
Budget = What we planned to spend (BudgetLine.total)
Committed = What we've contractually committed (Contracts + Variations + POs)
Actual = What we've actually spent (Invoices + Payment Applications)
Remaining = Budget - Committed - Actual
Variance = Budget - Committed
```

---

## 🔗 API Endpoints Summary

### CVR Reporting
- `GET /api/cvr/summary?projectId=1` - Overall CVR summary
- `GET /api/cvr/by-budget-line?projectId=1` - CVR per budget line
- `GET /api/cvr/commitment-breakdown?projectId=1` - Commitments by type
- `GET /api/cvr/actual-breakdown?projectId=1` - Actuals by type

### Purchase Orders
- `GET /api/purchase-orders?projectId=1&status=DRAFT` - List POs
- `POST /api/purchase-orders` - Create PO
- `POST /api/purchase-orders/:id/approve` - Approve (creates CVR)

### Invoices
- `GET /api/invoices?projectId=1&status=RECEIVED` - List invoices
- `POST /api/invoices` - Create invoice (creates CVR)
- `POST /api/invoices/:id/approve` - Approve (updates CVR)

---

## 🚀 Quick Start (Backend)

### Test CVR API:
```bash
# 1. Get CVR summary
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/cvr/summary?projectId=3"

# 2. Get CVR by budget line
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/cvr/by-budget-line?projectId=3"

# 3. Create Purchase Order
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId":3,"supplierId":1,"supplier":"Test Supplier","lines":[{"item":"Test Item","qty":1,"unit":"EA","unitCost":100,"lineTotal":100}]}' \
  http://localhost:3001/api/purchase-orders

# 4. Approve Purchase Order (creates CVR commitment)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/purchase-orders/1/approve
```

---

## 📝 Notes

- All CVR hooks are **non-blocking** - they log errors but don't throw, so CVR tracking won't break main workflows
- CVR records are tenant-scoped via tenantId
- All services use Prisma Client for database operations
- Status values are strings (not enums) for flexibility
- Integration hooks can be called from existing services without modifying their main logic

---

## 🎯 Success Criteria

✅ Backend Complete:
- [x] Database schema with CVR models
- [x] CVR service with summary and tracking functions
- [x] PO service with full workflow
- [x] Invoice service with full workflow
- [x] Integration hooks for contracts, variations, payment apps
- [x] All API routes registered and accessible

⏳ Frontend Pending:
- [ ] CVR components created
- [ ] CVR integrated into project pages
- [ ] PO management UI
- [ ] Invoice management UI
- [ ] End-to-end testing
- [ ] Production deployment

---

**Implementation Date**: November 13, 2025
**Backend Status**: ✅ Complete (Phases 1-6)
**Frontend Status**: ⏳ Pending (Phases 7-10)
**Estimated Frontend Time**: 8-12 hours
