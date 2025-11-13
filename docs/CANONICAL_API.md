# Backend Canonical API

**Generated:** 2025-11-04
**Purpose:** Definitive mapping of canonical vs legacy vs orphan API endpoints to prevent duplicate implementations

## How to Use This Document

- **CANONICAL**: The modern, actively used endpoint. **Always use this endpoint.**
- **LEGACY**: Old endpoints still in code but discouraged. **Migrate away from these.**
- **ORPHAN**: Endpoints not called by frontend. **Candidates for removal.**

---

## Tenders / RFx API

### CANONICAL (Modern Tender API)

**Base:** `/api/requests` (backend refers to tenders as "requests" in `/api/requests` endpoints)

#### Core Tender Operations
- **[x] GET /api/requests**
  - **Used by:** RfxList.jsx
  - **Purpose:** List all tenders for tenant
  - **Status:** CANONICAL

- **[x] GET /api/requests/:id**
  - **Used by:** RfxDetails.jsx
  - **Purpose:** Get tender details with invites, qna, responses
  - **Status:** CANONICAL

- **[x] GET /api/requests/:id/bundle**
  - **Used by:** RfxDetails.jsx (for export)
  - **Purpose:** Get complete tender bundle for export
  - **Status:** CANONICAL

- **[x] POST /api/requests**
  - **Used by:** RfxCreate.jsx
  - **Purpose:** Create new tender
  - **Status:** CANONICAL

- **[x] PATCH /api/requests/:id**
  - **Used by:** RfxDetails.jsx, TenderEditor.jsx
  - **Purpose:** Update tender settings
  - **Status:** CANONICAL

- **[x] DELETE /api/requests/:id**
  - **Used by:** RfxList.jsx (delete action)
  - **Purpose:** Delete tender
  - **Status:** CANONICAL

- **[x] POST /api/requests/:id/publish**
  - **Used by:** RfxDetails.jsx, TenderEditor.jsx
  - **Purpose:** Publish tender to suppliers
  - **Status:** CANONICAL

- **[x] POST /api/requests/:id/deadline**
  - **Used by:** RfxDetails.jsx (extend deadline)
  - **Purpose:** Update tender deadline
  - **Status:** CANONICAL

#### Tender Structure (Questions/Sections)
- **[x] GET /api/requests/:id/sections**
  - **Used by:** QuestionBuilder component
  - **Purpose:** Get tender sections
  - **Status:** CANONICAL

- **[x] POST /api/requests/:id/sections**
  - **Used by:** QuestionBuilder component
  - **Purpose:** Add section to tender
  - **Status:** CANONICAL

- **[x] PATCH /api/requests/sections/:sectionId**
  - **Used by:** QuestionBuilder component
  - **Purpose:** Update section
  - **Status:** CANONICAL

- **[x] DELETE /api/requests/sections/:sectionId**
  - **Used by:** QuestionBuilder component
  - **Purpose:** Delete section
  - **Status:** CANONICAL

- **[x] GET /api/requests/:id/questions**
  - **Used by:** QuestionBuilder component
  - **Purpose:** Get tender questions
  - **Status:** CANONICAL

- **[x] POST /api/requests/:id/questions**
  - **Used by:** QuestionBuilder component
  - **Purpose:** Add question to tender
  - **Status:** CANONICAL

- **[x] PATCH /api/requests/questions/:questionId**
  - **Used by:** QuestionBuilder component
  - **Purpose:** Update question
  - **Status:** CANONICAL

- **[x] DELETE /api/requests/questions/:questionId**
  - **Used by:** QuestionBuilder component
  - **Purpose:** Delete question
  - **Status:** CANONICAL

#### Invites
- **[x] GET /api/requests/:id/invites**
  - **Used by:** RfxDetails.jsx (Invites tab)
  - **Purpose:** List tender invites
  - **Status:** CANONICAL

- **[x] POST /api/requests/:id/invites**
  - **Used by:** RfxDetails.jsx (Invites tab)
  - **Purpose:** Create tender invites
  - **Status:** CANONICAL

- **[x] POST /api/requests/:id/invites/:inviteId/resend**
  - **Used by:** RfxDetails.jsx (resend invite action)
  - **Purpose:** Resend invite email
  - **Status:** CANONICAL

#### Q&A
- **[x] GET /api/requests/:id/qna**
  - **Used by:** RfxDetails.jsx (Q&A tab)
  - **Purpose:** Get tender Q&A threads
  - **Status:** CANONICAL

- **[x] POST /api/requests/:id/qna**
  - **Used by:** RfxDetails.jsx (Q&A tab)
  - **Purpose:** Post question or answer
  - **Status:** CANONICAL

- **[x] POST /api/requests/qna/:qnaId/answer**
  - **Used by:** RfxDetails.jsx (reply to question)
  - **Purpose:** Answer specific question
  - **Status:** CANONICAL

#### Responses (Submissions)
- **[x] GET /api/requests/:id/responses**
  - **Used by:** RfxDetails.jsx, TenderEditor.jsx (Submissions/Responses tab)
  - **Purpose:** List tender responses/submissions
  - **Status:** CANONICAL

- **[x] POST /api/requests/:id/responses/submit**
  - **Used by:** PublicRFx.jsx (supplier portal)
  - **Purpose:** Submit tender response
  - **Status:** CANONICAL

#### Scoring
- **[x] POST /api/requests/:id/scoring/activate**
  - **Used by:** RfxDetails.jsx (Scoring tab)
  - **Purpose:** Activate/deactivate scoring
  - **Status:** CANONICAL

- **[x] GET /api/requests/:id/scoring**
  - **Used by:** RfxDetails.jsx (Scoring tab)
  - **Purpose:** Get scoring configuration
  - **Status:** CANONICAL

- **[x] PATCH /api/requests/:id/scoring/scale**
  - **Used by:** RfxDetails.jsx (set weights)
  - **Purpose:** Update scoring weights
  - **Status:** CANONICAL

- **[x] PATCH /api/requests/:id/scoring/policy**
  - **Used by:** RfxDetails.jsx (scoring policy)
  - **Purpose:** Update scoring policy
  - **Status:** CANONICAL

- **[x] GET /api/requests/:id/scoring/status**
  - **Used by:** RfxDetails.jsx (scoring status)
  - **Purpose:** Get current scoring status
  - **Status:** CANONICAL

- **[x] GET /api/requests/:id/score/:supplierId/preview**
  - **Used by:** RfxDetails.jsx (preview score)
  - **Purpose:** Preview supplier score before saving
  - **Status:** CANONICAL

- **[x] POST /api/requests/:id/score/:supplierId**
  - **Used by:** RfxDetails.jsx (save score)
  - **Purpose:** Save supplier score
  - **Status:** CANONICAL

#### Award & Contract Creation
- **[x] POST /api/requests/:id/award**
  - **Used by:** RfxDetails.jsx (Decision tab)
  - **Purpose:** Award tender to supplier
  - **Status:** CANONICAL

- **[x] POST /api/requests/:id/create-po**
  - **Used by:** TenderEditor.jsx (create PO from tender)
  - **Purpose:** Create purchase order from awarded tender
  - **Status:** CANONICAL

#### Utilities
- **[x] POST /api/requests/:id/duplicate**
  - **Used by:** RfxList.jsx (duplicate action)
  - **Purpose:** Duplicate existing tender
  - **Status:** CANONICAL

- **[x] GET /api/requests/:id/export**
  - **Used by:** RfxList.jsx, RfxDetails.jsx (export action)
  - **Purpose:** Export tender data
  - **Status:** CANONICAL

- **[x] GET /api/requests/:id/suppliers/summary**
  - **Used by:** RfxDetails.jsx (suppliers summary)
  - **Purpose:** Get summary of invited suppliers
  - **Status:** CANONICAL

- **[x] POST /api/requests/import**
  - **Used by:** RfxCreate.jsx (import tender)
  - **Purpose:** Import tender from file
  - **Status:** CANONICAL

---

### CANONICAL (Alternative Tender API - tenders-combined)

**Base:** `/api/tenders-combined` (used by TenderEditor.jsx)

These are alternative endpoints that provide similar functionality with a different data structure:

- **[x] GET /api/tenders-combined/:id/full**
  - **Used by:** TenderEditor.jsx
  - **Purpose:** Get full tender with invites, questions, responses
  - **Status:** CANONICAL (alternative to /api/requests/:id)

- **[x] PATCH /api/tenders-combined/:id**
  - **Used by:** TenderEditor.jsx
  - **Purpose:** Update tender
  - **Status:** CANONICAL (alternative)

- **[x] POST /api/tenders-combined/:id/publish**
  - **Used by:** TenderEditor.jsx
  - **Purpose:** Publish tender
  - **Status:** CANONICAL (alternative)

- **[x] POST /api/tenders-combined/:id/extend**
  - **Used by:** TenderEditor.jsx
  - **Purpose:** Extend deadline
  - **Status:** CANONICAL (alternative)

---

### CANONICAL (RFx Invite API)

**Base:** `/api/rfx/:id/invites` (used by RfxDetails.jsx)

- **[x] GET /api/rfx/:id/invites**
  - **Used by:** RfxDetails.jsx (Invites tab)
  - **Purpose:** Get tender invites with status
  - **Status:** CANONICAL

- **[x] POST /api/rfx/:id/send-invites**
  - **Used by:** RfxDetails.jsx (send invites button)
  - **Purpose:** Send invites to multiple suppliers
  - **Status:** CANONICAL

- **[x] POST /api/rfx/:id/quick-invite**
  - **Used by:** RfxDetails.jsx (quick invite modal)
  - **Purpose:** Quick invite supplier without adding to directory
  - **Status:** CANONICAL

---

### CANONICAL (Public Response API)

**Base:** `/api/rfx/respond/:responseToken` (public, no auth)

- **[x] GET /api/rfx/respond/:responseToken**
  - **Used by:** PublicRFx.jsx (supplier portal)
  - **Purpose:** Get tender details for supplier response
  - **Status:** CANONICAL (public endpoint)

- **[x] POST /api/rfx/respond/:responseToken/submit**
  - **Used by:** PublicRFx.jsx (submit button)
  - **Purpose:** Submit supplier response
  - **Status:** CANONICAL (public endpoint)

---

### CANONICAL (Tender Q&A API)

**Base:** `/api/tenders-qna/:id/qna` (used by TenderEditor.jsx)

- **[x] GET /api/tenders-qna/:id/qna**
  - **Used by:** TenderEditor.jsx (Q&A tab)
  - **Purpose:** Get threaded Q&A
  - **Status:** CANONICAL

- **[x] POST /api/tenders-qna/:id/qna**
  - **Used by:** TenderEditor.jsx (post question/answer)
  - **Purpose:** Post internal note or answer
  - **Status:** CANONICAL

- **[x] POST /api/tenders-qna/:id/qna/:qnaId/publish**
  - **Used by:** TenderEditor.jsx (publish to public)
  - **Purpose:** Make internal answer public
  - **Status:** CANONICAL

- **[x] POST /api/tenders-qna/:id/qna/:qnaId/lock**
  - **Used by:** TenderEditor.jsx (lock thread)
  - **Purpose:** Lock Q&A thread
  - **Status:** CANONICAL

---

### LEGACY (Old Tender API)

**Base:** `/api/tenders` (old API, still partially used)

#### Legacy Endpoints (Still in use, but discouraged)
- **[ ] GET /api/tenders/:tenderId**
  - **Used by:** Some older components
  - **Purpose:** Get tender (basic info only)
  - **Status:** LEGACY - prefer /api/requests/:id

- **[ ] GET /api/tenders/:tenderId/questions**
  - **Used by:** TenderEditor.jsx (ReviewTab)
  - **Purpose:** Get tender questions
  - **Status:** LEGACY - prefer /api/requests/:id/questions

- **[ ] GET /api/tenders/:tenderId/responses**
  - **Used by:** TenderEditor.jsx (ReviewTab, ComparisonTab)
  - **Purpose:** Get tender responses
  - **Status:** LEGACY - prefer /api/requests/:id/responses

#### Legacy Endpoints (Hidden, DEV only)
- **[ ] POST /api/tenders/:tenderId/invites**
  - **Used by:** TenderManage.jsx (legacy, DEV only)
  - **Purpose:** Generate supplier invite URL
  - **Status:** LEGACY (DEV only) - prefer /api/rfx/:id/send-invites

- **[ ] POST /api/tenders/:tenderId/manual-response**
  - **Used by:** TenderManage.jsx (legacy, DEV only)
  - **Purpose:** Add manual response
  - **Status:** LEGACY (DEV only) - use UI instead

- **[ ] PATCH /api/tenders/:tenderId/responses/:id/reject**
  - **Used by:** TenderManage.jsx (legacy, DEV only)
  - **Purpose:** Reject response
  - **Status:** LEGACY (DEV only) - use award workflow

- **[ ] POST /api/tenders/:tenderId/award**
  - **Used by:** TenderManage.jsx (legacy, DEV only)
  - **Purpose:** Award tender
  - **Status:** LEGACY (DEV only) - prefer /api/requests/:id/award

- **[ ] PATCH /api/tenders/:tenderId/responses/:id/score**
  - **Used by:** TenderResponses.jsx (legacy, DEV only)
  - **Purpose:** Set manual score
  - **Status:** LEGACY (DEV only) - prefer /api/requests/:id/score/:supplierId

---

### ORPHAN (Not Called)

These endpoints exist in backend but are not called by any frontend code:

- **[ ] GET /api/tenders (without :id)**
  - **Status:** ORPHAN - prefer /api/requests
  - **Action:** Verify if needed, remove if unused

---

## Projects API

### CANONICAL

#### Core Project Operations
- **[x] GET /api/projects**
  - **Used by:** ProjectsPage.jsx
  - **Purpose:** List all projects
  - **Status:** CANONICAL

- **[x] GET /api/projects/:id**
  - **Used by:** ProjectLayout.jsx, ProjectOverview.jsx
  - **Purpose:** Get project details
  - **Status:** CANONICAL

- **[x] POST /api/projects**
  - **Used by:** ProjectsCreate.jsx
  - **Purpose:** Create new project
  - **Status:** CANONICAL

- **[x] PATCH /api/projects/:id**
  - **Used by:** ProjectSettings.jsx
  - **Purpose:** Update project
  - **Status:** CANONICAL

- **[x] DELETE /api/projects/:id**
  - **Used by:** ProjectsPage.jsx (delete action)
  - **Purpose:** Delete project
  - **Status:** CANONICAL

#### Project Tenders
- **[x] POST /api/projects/:projectId/tenders**
  - **Used by:** NewTender.jsx
  - **Purpose:** Create tender within project
  - **Status:** CANONICAL

- **[x] GET /api/projects/:projectId/tenders**
  - **Used by:** Tenders.jsx
  - **Purpose:** List project tenders
  - **Status:** CANONICAL

- **[x] GET /api/projects/tenders/:tenderId**
  - **Used by:** TenderEditor.jsx
  - **Purpose:** Get tender details
  - **Status:** CANONICAL

- **[x] PATCH /api/projects/tenders/:tenderId**
  - **Used by:** TenderEditor.jsx
  - **Purpose:** Update tender
  - **Status:** CANONICAL

- **[x] POST /api/projects/:projectId/tenders/:tenderId/bids**
  - **Used by:** Tenders.jsx
  - **Purpose:** Submit bid on tender
  - **Status:** CANONICAL

#### Project Packages
- **[x] GET /api/projects/:projectId/packages**
  - **Used by:** Packages.jsx
  - **Purpose:** List project packages
  - **Status:** CANONICAL

- **[x] POST /api/projects/:projectId/packages**
  - **Used by:** PackageCreate.jsx
  - **Purpose:** Create package
  - **Status:** CANONICAL

- **[x] GET /api/projects/:projectId/packages/:packageId**
  - **Used by:** PackageDetails.jsx
  - **Purpose:** Get package details
  - **Status:** CANONICAL

- **[x] PATCH /api/projects/:projectId/packages/:packageId**
  - **Used by:** PackageDetails.jsx
  - **Purpose:** Update package
  - **Status:** CANONICAL

- **[x] POST /api/projects/:projectId/packages/:packageId/push-to-rfx**
  - **Used by:** PackageDetails.jsx
  - **Purpose:** Create tender from package
  - **Status:** CANONICAL

---

## Suppliers API

### CANONICAL

- **[x] GET /api/suppliers**
  - **Used by:** SuppliersPage.jsx, RfxDetails.jsx
  - **Purpose:** List all suppliers
  - **Status:** CANONICAL

- **[x] GET /api/suppliers/:id**
  - **Used by:** SupplierDetailsPage.jsx
  - **Purpose:** Get supplier details
  - **Status:** CANONICAL

- **[x] POST /api/suppliers**
  - **Used by:** SuppliersCreate.jsx, RfxDetails.jsx (quick add)
  - **Purpose:** Create supplier
  - **Status:** CANONICAL

- **[x] PATCH /api/suppliers/:id**
  - **Used by:** SupplierDetailsPage.jsx
  - **Purpose:** Update supplier
  - **Status:** CANONICAL

- **[x] DELETE /api/suppliers/:id**
  - **Used by:** SuppliersPage.jsx (delete action)
  - **Purpose:** Delete supplier
  - **Status:** CANONICAL

---

## Contracts API

### CANONICAL

- **[x] GET /api/contracts**
  - **Used by:** Contracts tab
  - **Purpose:** List contracts
  - **Status:** CANONICAL

- **[x] GET /api/contracts/:id**
  - **Used by:** ContractDetails.jsx
  - **Purpose:** Get contract details
  - **Status:** CANONICAL

- **[x] POST /api/contracts**
  - **Used by:** NewContractPage.jsx, ContractCreate.jsx
  - **Purpose:** Create contract
  - **Status:** CANONICAL

- **[x] PATCH /api/contracts/:id**
  - **Used by:** ContractDetails.jsx
  - **Purpose:** Update contract
  - **Status:** CANONICAL

- **[x] DELETE /api/contracts/:id**
  - **Used by:** Contracts tab (delete action)
  - **Purpose:** Delete contract
  - **Status:** CANONICAL

---

## Documents API

### CANONICAL

- **[x] GET /api/documents**
  - **Used by:** DocumentsIndex.jsx
  - **Purpose:** List documents
  - **Status:** CANONICAL

- **[x] GET /api/documents/:id**
  - **Used by:** DocumentDetails.jsx
  - **Purpose:** Get document details
  - **Status:** CANONICAL

- **[x] POST /api/documents**
  - **Used by:** EntityDocuments component
  - **Purpose:** Upload document
  - **Status:** CANONICAL

- **[x] PATCH /api/documents/:id**
  - **Used by:** DocumentDetails.jsx
  - **Purpose:** Update document metadata
  - **Status:** CANONICAL

- **[x] DELETE /api/documents/:id**
  - **Used by:** DocumentsIndex.jsx (delete action)
  - **Purpose:** Delete document
  - **Status:** CANONICAL

---

## Finance API

### Invoices
- **[x] GET /api/finance/invoices**
- **[x] GET /api/finance/invoices/:id**
- **[x] POST /api/finance/invoices**
- **[x] PATCH /api/finance/invoices/:id**
- **[x] DELETE /api/finance/invoices/:id**

### Purchase Orders
- **[x] GET /api/finance/pos**
- **[x] GET /api/finance/pos/:id**
- **[x] POST /api/finance/pos**
- **[x] PATCH /api/finance/pos/:id**
- **[x] DELETE /api/finance/pos/:id**

### AFP (Authorized For Payment)
- **[x] GET /api/finance/afp**
- **[x] GET /api/finance/afp/:id**
- **[x] POST /api/finance/afp**
- **[x] PATCH /api/finance/afp/:id**

### Receipts
- **[x] GET /api/finance/receipts**
- **[x] GET /api/finance/receipts/:id**
- **[x] POST /api/finance/receipts**

---

## Settings API

### CANONICAL

#### Email Templates
- **[x] GET /api/settings/email-templates**
  - **Used by:** RfxDetails.jsx (load templates)
  - **Purpose:** List email templates
  - **Status:** CANONICAL

- **[x] GET /api/settings/email-templates/:id**
  - **Used by:** RfxDetails.jsx (load template)
  - **Purpose:** Get template details
  - **Status:** CANONICAL

- **[x] POST /api/settings/email-templates**
  - **Used by:** Settings pages
  - **Purpose:** Create email template
  - **Status:** CANONICAL

- **[x] PATCH /api/settings/email-templates/:id**
  - **Used by:** Settings pages
  - **Purpose:** Update email template
  - **Status:** CANONICAL

#### Taxonomies
- **[x] GET /api/settings/taxonomies**
- **[x] POST /api/settings/taxonomies**
- **[x] PATCH /api/settings/taxonomies/:id**

#### Cost Codes
- **[x] GET /api/settings/cost-codes**
- **[x] POST /api/settings/cost-codes**
- **[x] PATCH /api/settings/cost-codes/:id**

---

## API Usage Summary

### By Domain
- **Tenders/RFx:** 45+ CANONICAL endpoints, 5 LEGACY endpoints
- **Projects:** 15+ CANONICAL endpoints
- **Suppliers:** 5 CANONICAL endpoints
- **Contracts:** 5 CANONICAL endpoints
- **Documents:** 5 CANONICAL endpoints
- **Finance:** 15+ CANONICAL endpoints
- **Settings:** 10+ CANONICAL endpoints

### API Architecture Notes

1. **Dual Tender APIs:**
   - `/api/requests/*` - Primary tender API (used by RfxDetails.jsx)
   - `/api/tenders-combined/*` - Alternative API (used by TenderEditor.jsx)
   - **Recommendation:** Consolidate to one API in future

2. **Legacy Tender Endpoints:**
   - `/api/tenders/*` - Old API, still partially used
   - **Action:** Migrate remaining usage to /api/requests

3. **Public Endpoints:**
   - `/api/rfx/respond/:responseToken` - No auth required (supplier portal)
   - All other endpoints require JWT authentication

4. **Tenant Scoping:**
   - All endpoints must filter by tenantId
   - See API_CATALOG.md for lint warnings

---

## Migration Plan

### Immediate Actions
1. Document all `/api/tenders/:id` usage in frontend
2. Create migration path to `/api/requests/:id`
3. Update TenderEditor.jsx to use `/api/requests` instead of `/api/tenders-combined`

### Short Term
1. Consolidate dual tender APIs into single `/api/requests` API
2. Remove legacy `/api/tenders` endpoints after migration
3. Remove DEV-only endpoints from TenderManage.jsx and TenderResponses.jsx

### Long Term
1. Add OpenAPI documentation for all endpoints
2. Implement API versioning
3. Add deprecation warnings to legacy endpoints

---

## Notes for AI Agents

**WHEN IMPLEMENTING NEW TENDER FEATURES:**
- Use `/api/requests/:id/*` endpoints (NOT `/api/tenders/:id`)
- Use `/api/rfx/:id/invites` for invite management
- Use `/api/tenders-qna/:id/qna` for Q&A features
- DO NOT create new tender endpoints

**WHEN IMPLEMENTING NEW PROJECT FEATURES:**
- Use `/api/projects/:projectId/*` for project-scoped features
- Use nested routes for project resources (packages, tenders, etc.)

**WHEN IN DOUBT:**
- Check this document first
- Check API_CATALOG.md for complete endpoint list
- Ask before creating new API endpoints
