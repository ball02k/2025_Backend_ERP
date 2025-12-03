# 2025 ERP Backend API Routes - Comprehensive Summary

**Generated:** 2025-11-23  
**Total Route Modules:** 123  
**Total Endpoints:** 563

---

## Executive Summary

This document provides a complete catalog of all API route files in the 2025 ERP Backend system, organized by functional domain.

### Key Statistics

| Metric | Count |
|--------|-------|
| **Total Modules** | 123 |
| **Total Endpoints** | 563 |
| **GET Endpoints** | 262 |
| **POST Endpoints** | 197 |
| **PATCH Endpoints** | 70 |
| **PUT Endpoints** | 24 |
| **DELETE Endpoints** | 10 |

---

## Core Functional Domains

### 1. Authentication & Authorization
**Related Modules:** `auth.cjs`, `auth.dev.cjs`, `roles.cjs`, `approvals.cjs`

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| **auth** | 3 | User registration, login, profile access |
| **auth.dev** | 1 | Development-only token generation |
| **roles** | 1 | Role management and permissions |
| **approvals** | 12 | Workflow approval and decision management |

**Key Endpoints:**
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/me` - Current user profile
- `GET /approvals/pending` - Get pending approvals
- `POST /approvals/:stepId/approve` - Approve decision

---

### 2. Project Management
**Related Modules:** `projects.cjs`, `projects.js`, `projects.info.cjs`, `projects.overview.cjs`, `projects.cvr.cjs`, etc.

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| **projects** | 21 | Core project CRUD and organization |
| **projects.info** | 2 | Project information and metadata |
| **projects.overview** | 1 | Project dashboard overview |
| **projects.budgets** | 11 | Budget management and allocation |
| **projects.budget** | 5 | Legacy budget endpoints |
| **projects.packages** | 9 | Package/lot management |
| **projects.contracts** | 1 | Project contract listing |
| **projects.cvr** | 5 | Cost Value Reconciliation |
| **projects.tenders** | 3 | Tender management |
| **projects.scope** | 5 | Project scope management |
| **projects.roles** | 7 | Project team roles |

**Key Endpoints:**
- `GET /projects/` - List all projects
- `POST /projects/` - Create new project
- `GET /projects/:id` - Get project details
- `GET /projects/:projectId/budgets` - Get project budgets
- `POST /projects/:projectId/packages` - Create package

---

### 3. Procurement & Purchasing
**Related Modules:** `procurement.cjs`, `purchaseOrders.cjs`, `packages.cjs`, `packages.actions.cjs`, `packages.pricing.cjs`, etc.

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| **procurement** | 4 | Purchase order management |
| **purchaseOrders** | 9 | Purchase order CRUD operations |
| **packages** | 6 | Package management |
| **packages.actions** | 3 | RFx and package actions |
| **packages.pricing** | 3 | Package pricing management |
| **packages.responses** | 3 | Supplier response handling |
| **packages.documents** | 2 | Package documentation |
| **packages.seed** | 1 | Package seeding |
| **packages.directAward** | 1 | Direct award procurement |

**Key Endpoints:**
- `GET /procurement/pos` - List purchase orders
- `POST /procurement/pos` - Create purchase order
- `GET /packages/:id` - Get package details
- `POST /packages/:id/rfx` - Create RFx from package
- `POST /packages/:id/award` - Award package

---

### 4. Tendering & RFx (Request for X)
**Related Modules:** `tenders.cjs`, `tenders.*.cjs`, `rfx.cjs`, `rfx.*.cjs`, `requests.cjs`

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| **tenders** | Legacy | Legacy tender management (deprecated) |
| **tenders.builder** | Legacy | Tender template builder |
| **tenders.*.cjs** | Various | Tender sub-modules (workflows, documents, scoring) |
| **rfx** | 7 | RFx (RFP/RFQ/RFT) management |
| **rfx.builder** | 17 | RFx template and section building |
| **rfx.state** | 4 | RFx state transitions and publishing |
| **rfx.responses** | 3 | Supplier response handling |
| **rfx.analysis** | 1 | RFx analysis and reporting |
| **rfx.email** | 1 | RFx email communication |
| **rfx.invitesSend** | 3 | RFx invitation distribution |
| **rfx.public** | 3 | Public RFx response portal |
| **requests** | 37 | New Request For Proposal (RFP) management |

**Key Endpoints:**
- `GET /rfx/:projectId/rfx` - List RFx documents
- `POST /rfx/:projectId/packages/:packageId/rfx` - Create RFx
- `POST /rfx/:rfxId/sections` - Add RFx section
- `POST /rfx/:rfxId/questions` - Add RFx question
- `POST /requests/` - Create request
- `POST /requests/:id/publish` - Publish request
- `GET /requests/:id/responses` - Get supplier responses

---

### 5. Contracts
**Related Modules:** `contracts.cjs`, `contracts.*.cjs`, `contract.templates.cjs`, `contract-valuations.cjs`

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| **contracts** | 15 | Core contract management |
| **contracts.read** | 2 | Contract document retrieval |
| **contracts.generateDoc** | 2 | Contract document generation |
| **contracts.status** | 3 | Contract status and approvals |
| **contracts.onlyoffice** | 3 | OnlyOffice document editing |
| **contract.templates** | 5 | Contract template management |
| **contract-valuations** | 7 | Contract valuation tracking |

**Key Endpoints:**
- `GET /contracts/` - List contracts
- `POST /contracts/` - Create contract
- `GET /contracts/:id` - Get contract details
- `POST /contracts/:id/issue` - Issue contract
- `POST /contracts/:id/send-for-signature` - Send for signature
- `GET /contract-templates/` - List templates

---

### 6. Finance & Payments
**Related Modules:** `payment-applications.cjs`, `finance.*.cjs`, `financials.cjs`, `invoices.cjs`, `cvr.cjs`, `allocations.cjs`

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| **payment-applications** | 22 | UK Construction Act compliant payment applications |
| **finance.dashboard** | 3 | Finance overview dashboard |
| **finance.invoices** | 6 | Invoice processing |
| **finance.pos** | 11 | Finance-related purchase orders |
| **finance.match** | 2 | Invoice-to-PO matching |
| **finance.ocr** | 1 | Invoice OCR processing |
| **finance.inbound** | 3 | Inbound finance documents |
| **finance.receipts** | 1 | Receipt tracking |
| **financials** | 26 | Core financial management (budgets, commitments, actuals, forecasts) |
| **financials.cvr** | 5 | Financial CVR reporting |
| **invoices** | 12 | Invoice management |
| **invoiceMatching** | 5 | Invoice matching and reconciliation |
| **cvr** | 17 | Cost Value Reconciliation |
| **cvr-reports** | 8 | CVR reporting |
| **allocations** | 12 | Budget line allocations and CVR |

**Key Payment Application Workflow:**
1. `POST /applications/` - Create draft application
2. `POST /applications/:id/submit` - Submit for review
3. `POST /applications/:id/review` - Start QS review
4. `POST /applications/:id/certify` - QS certification
5. `POST /applications/:id/payment-notice` - Issue payment notice
6. `POST /applications/:id/approve` - Final approval
7. `POST /applications/:id/record-payment` - Record payment

---

### 7. Variations & Change Control
**Related Modules:** `variations.cjs`, `variations-enhanced.cjs`

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| **variations** | 5 | Variation/change order management |
| **variations-enhanced** | Legacy | Enhanced variation features |

**Key Endpoints:**
- `GET /variations/` - List variations
- `POST /projects/:projectId/variations` - Create variation
- `PATCH /variations/:id/approve` - Approve variation
- `PATCH /variations/:id/reject` - Reject variation

---

### 8. Suppliers & Client Management
**Related Modules:** `suppliers.cjs`, `clients.cjs`, `contacts.cjs`

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| **suppliers** | 10 | Supplier management |
| **clients** | 10 | Client/customer management |
| **contacts** | 5 | Contact information management |

**Key Endpoints:**
- `GET /suppliers/` - List suppliers
- `POST /suppliers/` - Create supplier
- `GET /clients/` - List clients
- `POST /clients/` - Create client

---

### 9. Quality Assurance & Safety
**Related Modules:** `qa.cjs`, `hs.cjs`

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| **qa** | 10 | Quality assurance records and items |
| **hs** | 7 | Health & Safety event tracking |

**Key Endpoints:**
- `GET /qa/records/` - List QA records
- `POST /qa/records/` - Create QA record
- `GET /hs/events/` - List HS events
- `POST /hs/events/` - Create HS event

---

### 10. Documentation & Attachments
**Related Modules:** `documents.cjs`, `documents_v2.cjs`, `document.links.cjs`, `project_documents.cjs`, `packages.documents.cjs`, `tenders.documents.cjs`

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| **documents** | 8 | Core document management (legacy) |
| **documents_v2** | 9 | Modern document management |
| **document.links** | 3 | Document linking/relationships |
| **project_documents** | 2 | Project-level documents |

**Key Endpoints:**
- `POST /documents_v2/init` - Initialize document upload
- `PUT /documents_v2/upload/:key` - Upload document chunk
- `POST /documents_v2/complete` - Complete upload
- `GET /documents_v2/` - List documents
- `DELETE /documents_v2/:id` - Delete document

---

### 11. Analytics & Reporting
**Related Modules:** `analytics.cjs`, `search.cjs`, `reports.cjs` (various)

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| **analytics** | 2 | Project analytics (rollups, trends) |
| **search** | 1 | Global search functionality |
| **cvr-reports** | 8 | CVR reporting and analysis |

**Key Endpoints:**
- `GET /analytics/rollups` - Get analytics rollups
- `GET /analytics/trends` - Get trend analysis
- `GET /search/` - Global search

---

### 12. Miscellaneous & Integration
**Related Modules:** `integrations.cjs`, `equipment.cjs`, `jobs.cjs`, `jobSchedules.cjs`, `tasks.cjs`, `workers.cjs`, `timeEntries.cjs`, `budget*.cjs`, etc.

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| **integrations** | 2 | Third-party integrations (Companies House, HMRC) |
| **equipment** | 9 | Equipment management and maintenance |
| **jobs** | 7 | Job/task management |
| **jobSchedules** | 10 | Job scheduling and assignments |
| **tasks** | 4 | Task management |
| **workers** | ? | Worker management |
| **timeEntries** | ? | Time tracking and entries |
| **carbon** | 7 | Carbon emissions tracking |
| **hs** | 7 | Health & Safety events |
| **email-ingestion** | 4 | Email-based document ingestion |
| **budgetCategories** | 6 | Budget category management |
| **costCodes** | 5 | Cost code management |
| **meta** | 4 | Metadata and reference data |

---

## Route File Organization Structure

### By File Extension

**CommonJS (.cjs files):** 123 modules  
**JavaScript (.js files):** 8 modules (clients, contacts, projects, procurement, reference, tasks, etc.)

### By Category Count

| Category | Count |
|----------|-------|
| Projects & Planning | 25 |
| Procurement | 12 |
| Tendering/RFx | 18 |
| Contracts | 7 |
| Finance | 15 |
| Documents | 6 |
| QA & Safety | 2 |
| Configuration & Settings | 8 |
| Other/Dev | 20+ |

---

## HTTP Method Distribution

| Method | Count | Purpose |
|--------|-------|---------|
| GET | 262 | Data retrieval and listing |
| POST | 197 | Creating new resources |
| PATCH | 70 | Partial updates and actions |
| PUT | 24 | Full replacements |
| DELETE | 10 | Resource deletion |

---

## Authentication & Authorization

All routes (except public ones) require authentication via:
- Bearer token in `Authorization` header
- JWT token validation

### Public Routes
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /onboard/:token` - Onboarding link access
- `POST /onboard/:token` - Onboarding form submission
- `POST /respond/:responseToken` - Public RFx response

### Permission-Based Access
Several routes require specific permissions via `requirePerm` middleware:
- `jobs:view`, `jobs:create`, `jobs:update`, `jobs:delete`
- `equipment:view`, `equipment:create`, `equipment:update`, `equipment:delete`
- `approvals_override` - Override approval workflows
- `analytics_view` - View analytics
- `project_manage` - Manage projects

---

## Common API Patterns

### Standard CRUD Operations
```
GET    /resource/          - List with pagination
GET    /resource/:id       - Get single resource
POST   /resource/          - Create
PUT    /resource/:id       - Full update
PATCH  /resource/:id       - Partial update
DELETE /resource/:id       - Delete
```

### Action Endpoints
```
POST   /resource/:id/action          - Perform action
PATCH  /resource/:id/status          - Change status
POST   /resource/:id/workflow-action - Workflow-related action
```

### Hierarchical Resources
```
GET    /parent/:parentId/children           - List children
POST   /parent/:parentId/children           - Create child
PATCH  /:parentId/children/:childId/action - Action on child
```

---

## Module Dependencies & Cross-References

### Payment Application Workflow
- Main: `payment-applications.cjs`
- Supporting: `finance.invoices.cjs`, `finance.pos.cjs`, `contracts.cjs`

### Procurement Workflow  
- Main: `packages.cjs`, `rfx.cjs`, `requests.cjs`
- Supporting: `rfx.builder.cjs`, `rfx.responses.cjs`, `procurement.cjs`

### Finance Management
- Main: `financials.cjs`, `finance.dashboard.cjs`
- Supporting: `cvr.cjs`, `allocations.cjs`, `invoices.cjs`, `payment-applications.cjs`

### Project Setup
- Main: `projects.cjs`
- Supporting: `projects.info.cjs`, `projects.budgets.cjs`, `projects.packages.cjs`, `project_members.cjs`

---

## Testing & Development Routes

### Development-Only Routes
- `POST /dev/login` - Dev token generation
- `POST /dev-token` - Dev token (auth.dev)
- `POST /dev.ai/echo` - AI testing
- `POST /demo/reset` - Demo data reset
- `POST /dev_snapshot/recompute/:projectId` - Snapshot recomputation

### QA Routes
- `/qa/` - Quality assurance endpoints

---

## Rate Limiting & Performance

No explicit rate limiting documented in route definitions. Consider implementing:
- Per-user rate limits on payment approvals
- Bulk operation limits for imports
- File upload size limits for documents

---

## Future Enhancements

1. Add API versioning (v1, v2)
2. Implement OpenAPI/Swagger documentation
3. Add request/response examples
4. Document query parameters and filters
5. Add webhook event documentation
6. Document pagination parameters
7. Add error code reference

---

## File Locations

All route files are located in:  
`/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/routes/`

Full route documentation with all endpoints:  
`/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/API_ROUTES_DOCUMENTATION.md`

---

*Generated: 2025-11-23*  
*Backend Version: 2025*  
*Total Routes Analyzed: 123 modules, 563 endpoints*
