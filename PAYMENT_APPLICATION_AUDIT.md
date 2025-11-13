# Payment Application System Audit

**Date:** 2025-11-12
**Purpose:** Comprehensive audit of existing payment application code and identification of gaps

---

## EXISTING CODE INVENTORY

### Backend Files

**Main Routes:**
- ✅ `/routes/payment-applications.cjs` - Primary payment application routes
- ✅ `/routes/afp.cjs` - AFP (Applications for Payment) routes (alternative routing)
- ✅ `/routes/afp.open.cjs` - Open AFP routes (no feature gate)

**Services:**
- ✅ `/services/afp.service.js` - AFP business logic

**Validators:**
- ✅ `/validators/afp.js` - AFP validation logic

**Database:**
- ✅ `/prisma/schema.prisma` - Contains ApplicationForPayment and PaymentApplicationLineItem models
- ✅ `/prisma/schema-payment-apps-addition.prisma` - Additional schema definitions
- ✅ `/prisma/seed-afp.cjs` - Seed data for testing

### Frontend Files

**Components:**
- ✅ `/src/components/payment-applications/PaymentApplicationsList.jsx` - List view
- ✅ `/src/components/payment-applications/PaymentApplicationDetail.jsx` - Detail/workflow view
- ✅ `/src/components/payment-applications/PaymentApplicationForm.jsx` - Create/edit form
- ✅ `/src/components/payment-applications/PaymentApplicationCertification.jsx` - QS certification interface

### Finance Module Files

**Backend:**
- `/routes/finance.invoices.cjs` - Invoice management
- `/routes/finance.pos.cjs` - Purchase order finance
- `/routes/finance.match.cjs` - 3-way matching
- `/routes/finance.receipts.cjs` - Receipt management
- `/routes/finance.ocr.cjs` - OCR processing
- `/routes/finance.inbound.cjs` - Inbound finance

**Frontend:**
- `/src/types/finance.ts` - Finance TypeScript types
- `/src/lib/finance.ts` - Finance utilities

---

## CURRENT CAPABILITIES

### ✅ Implemented
1. Payment application CRUD operations
2. QS certification interface (line-by-line review)
3. Application list with filtering
4. Application detail view
5. Status workflow (DRAFT → SUBMITTED → UNDER_REVIEW → CERTIFIED)
6. Line item support
7. Feature gate (ENABLE_AFP=1)
8. Auto-population of form fields
9. Supplier display and tracking

### ❌ Missing Critical Features

1. **Payment Notice Issuance**
   - No endpoint to issue payment notices
   - No PDF generation for payment notices
   - No Act compliance date checking

2. **Pay-Less Notice System**
   - No pay-less notice workflow
   - No deduction tracking
   - No basis of calculation documentation

3. **Finance Integration**
   - Payment applications NOT visible in Finance module
   - No automatic ledger entries
   - No payment recording from Finance
   - No invoice linkage

4. **Payment Execution**
   - No "Record Payment" functionality
   - No payment reference tracking
   - No bank reconciliation link

5. **CVR Integration**
   - Payments don't update CVR actuals
   - No monthly cost tracking from payments

6. **Budget Integration**
   - Payments don't update package actuals
   - No budget vs actual comparison including payments

7. **Contract Updates**
   - totalCertifiedToDate not auto-updated
   - totalPaidToDate not auto-updated
   - retentionHeld not auto-updated

8. **Approval Workflow**
   - No approval requirement before payment
   - No approval workflow integration

9. **Act Compliance Monitoring**
   - No automated warnings for late notices
   - No dashboard for compliance tracking

10. **ERP-Wide Visibility**
    - Payment applications only visible in Projects
    - Not visible in Finance dashboard
    - Not visible in Supplier dashboards
    - No company-wide reporting

---

## GAPS TO FILL

### Priority 1: Critical Workflow Actions

1. **POST /api/applications/:id/payment-notice** - Issue payment notice
2. **POST /api/applications/:id/pay-less-notice** - Issue pay-less notice
3. **POST /api/applications/:id/approve** - Finance approval
4. **POST /api/applications/:id/record-payment** - Record payment made
5. **GET /api/applications/:id/check-compliance** - Act compliance check

### Priority 2: Finance Integration

1. **Finance Dashboard Widget** - Show pending payment applications
2. **Finance Payment Queue** - List of approved applications ready to pay
3. **Payment Recording Interface** - Record payment with bank reference
4. **Ledger Integration** - Auto-create ledger entries
5. **Invoice Matching** - Link to supplier invoices

### Priority 3: Auto-Updates

1. **CVR Service** - Update CVRMonthly on payment
2. **Budget Service** - Update package actuals on payment
3. **Contract Service** - Update contract cumulative totals
4. **Retention Ledger** - Track retention by contract

### Priority 4: Reporting & Visibility

1. **Finance Reports** - Include payment applications
2. **Supplier Portal** - Show payment status to suppliers
3. **Project Dashboard** - Payment application summary
4. **Compliance Dashboard** - Act compliance monitoring

---

## SCHEMA GAPS

Need to verify if these fields exist:
- [ ] ApplicationForPayment.paymentNoticeSent
- [ ] ApplicationForPayment.paymentNoticeSentAt
- [ ] ApplicationForPayment.paymentNoticeAmount
- [ ] ApplicationForPayment.payLessNoticeSent
- [ ] ApplicationForPayment.payLessNoticeSentAt
- [ ] ApplicationForPayment.payLessNoticeAmount
- [ ] ApplicationForPayment.payLessNoticeReason
- [ ] ApplicationForPayment.payLessDeductions (JSON)
- [ ] ApplicationForPayment.approvalWorkflowId
- [ ] Contract.totalCertifiedToDate
- [ ] Contract.totalPaidToDate
- [ ] Contract.retentionHeld
- [ ] Contract.paymentDueDays
- [ ] Contract.paymentFinalDays

---

## RECOMMENDED ACTION PLAN

### Phase 1: Complete Core Workflow (Days 1-2)
1. Add missing workflow endpoints to backend
2. Add workflow action buttons to frontend
3. Implement Act compliance checking
4. Add payment recording interface

### Phase 2: Finance Integration (Days 3-4)
1. Create Finance dashboard widget
2. Build payment queue interface
3. Link to invoice system
4. Auto-create ledger entries

### Phase 3: Auto-Updates (Day 5)
1. CVR update on payment
2. Budget actuals update
3. Contract totals update
4. Retention tracking

### Phase 4: ERP-Wide Visibility (Day 6)
1. Add to Finance module
2. Add to Supplier dashboards
3. Company-wide reporting
4. Compliance monitoring dashboard

---

## LEGACY CODE

### To Deprecate:
- `/routes/afp.cjs` - Replaced by `/routes/payment-applications.cjs` (keep for backward compat)
- `/routes/afp.open.cjs` - Temporary workaround for feature gate

### To Keep:
- All other files are current and in active use

---

## SUCCESS CRITERIA

✅ Payment applications visible in Finance module
✅ Finance team can record payments
✅ Payments auto-update CVR and budgets
✅ Contract totals auto-update
✅ Act compliance monitored automatically
✅ Full workflow from submission to payment complete
✅ Retention tracked properly
✅ ERP-wide reporting includes payment applications

---

**Next Steps:** Begin Phase 1 implementation
