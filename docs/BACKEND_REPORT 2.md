BACKEND_REPORT.md
Overview
Runtime & ORM – Node 20.16.x; Prisma 6.14.0 for both runtime and CLI

Key scripts – dev, seed, prisma:*, smoke:docs, smoke:variations

Database target – construction_erp_vnext on port 5432 (Postgres)

Auth/RBAC – JWT (HS256) via custom crypto helper; attachUser + requireAuth middleware chain

Multi‑tenant default – tenantId sourced from header or TENANT_DEFAULT environment variable.

Data Model Map
erDiagram
  Client ||--o{ Project : projects
  Client ||--o{ Contact : contacts
  Project }o--|| Client : client
  Project ||--o{ Task : tasks
  Task }o--|| TaskStatus : statusRel
  Project ||--o{ Variation : variations
  Variation ||--o{ VariationLine : lines
  Variation ||--o{ VariationStatusHistory : statusHistory
  Project ||--|| ProjectSnapshot : snapshot
  Project ||--o{ ProjectMembership : memberships
  User ||--o{ ProjectMembership : memberships
  Project ||--o{ PurchaseOrder : purchaseOrders
  PurchaseOrder ||--o{ POLine : lines
  PurchaseOrder ||--o{ Delivery : deliveries
  Project ||--o{ BudgetLine : budgetLines
  Project ||--o{ Commitment : commitments
  Project ||--o{ ActualCost : actualCosts
  Project ||--o{ Forecast : forecasts
  Document ||--o{ DocumentLink : links
  Project ||--o{ DocumentLink : project_docs
  Variation ||--o{ DocumentLink : variation_docs
  User ||--o{ UserRole : userRoles
  Role ||--o{ UserRole : userRoles
  Role ||--o{ RolePermission : rolePermissions
  Permission ||--o{ RolePermission : rolePermissions
Index Summary (selected)
Project – @@index([tenantId, status])

Task – @@index([tenantId, projectId, status]), @@index([projectId, dueDate])

Variation – multiple including @@index([tenantId, projectId, status, updatedAt])

DocumentLink – @@index([tenantId, projectId]), @@index([tenantId, documentId]), etc.

Financial tables – BudgetLine, Commitment, ActualCost, Forecast each indexed on tenantId + projectId

No AuditLog or AIAlert models detected.

Endpoint Inventory
Method	Path	Auth	Tenant Scoped?	Membership Check?	Models
POST	/auth/login	None	✔ (body tenantId)	✖	User
GET	/me	✔	n/a	n/a	none
GET	/api/users	✔	✔ (req.user.tenantId)	✖	User
GET	/api/roles	✔	✔	✖	Role
GET	/api/reference/project-statuses	✔	✖ (no tenant)	✖	ProjectStatus
GET	/api/reference/project-types	✔	✖	✖	ProjectType
GET	/api/reference/task-statuses	✔	✖	✖	TaskStatus
GET	/api/clients	✔	✖ (header only)	✖	Client/Project
GET	/api/contacts	✔	✖	✖	Contact/Client
GET	/api/projects	✔	✔ (header)	✖	Project/Client
GET	/api/projects/:id/overview	✔	✔	✔ (requireProjectMember)	Project/ProjectSnapshot
GET	/api/tasks	✔	✔ (header)	✖	Task
Variations CRUD	/api/variations...	✔	✔	partial (missing on PUT/PATCH/DELETE)	Variation*
Documents v2	/api/documents...	✔	✔ (req.user.tenantId)	✖	Document/DocumentLink
Procurement	/api/procurement/...	✔	✔ (header)	✖	PurchaseOrder, POLine, Delivery
Financials	/api/financials/...	✔	✔ (req.user.tenantId)	✔ (assertProjectMember)	BudgetLine, Commitment, ActualCost, Forecast
GET	/api/projects/summary	✔	✔ (req.user.tenantId)	✖	Project
GET	/api/tasks/summary	✔	✔ (req.user.tenantId)	✖	Task
GET	/api/projects/csv/export	✔	✔ (req.user.tenantId)	✖	Project
POST	/api/projects/csv/import	✔	✔ (req.user.tenantId)	role admin|pm	Project
GET	/api/clients/csv/export	✔	✔ (via tenant projects)	✖	Client
POST	/api/clients/csv/import	✔	(n/a)	✖	Client
GET	/api/tasks/csv/export	✔	✔ (req.user.tenantId)	✖	Task
POST	/api/tasks/csv/import	✔	✔ (req.user.tenantId)	✔ (per-row membership)	Task
*Variation detail uses a manual membership check; other write routes skip it.

Contract Snapshots
Short-form summaries (request → response):

POST /auth/login – {email, password, tenantId?} → {token, user{id,email,name,tenantId,roles}}

GET /api/users – query none → {users:[{id,email,name,isActive,createdAt}]}

GET /api/roles – query none → {roles:[{id,name,createdAt}]}

GET /api/clients – header x-tenant-id → {clients:[{id,name,companyRegNo,projectsCount}]}

Contacts

GET /api/contacts – pagination/query filters → {page,pageSize,total,rows:[Contact+Client]}

GET /api/contacts/:id – {id} → Contact+Client

POST /api/contacts – contactBodySchema → Contact

PUT /api/contacts/:id – partial body → Contact

DELETE /api/contacts/:id – id → 204

GET /api/projects – {limit,offset,sort} → {total,projects:[Project+client+statusRel+typeRel]}

GET /api/projects/:id/overview – path {id} → {project,widgets,quickLinks,updatedAt}

GET /api/tasks – {limit,offset,sort} → {total,tasks:[Task+project+statusRel]}

Variations

GET /api/variations?projectId=... → {data:[Variation],meta}

GET /api/variations/:id → {data:Variation+lines} (membership checked)

POST /api/variations – variation payload with optional lines[] → {data:Variation}

PUT /api/variations/:id – update payload (no membership guard) → {data:Variation}

PATCH /api/variations/:id/status – {toStatus} → {data:Variation}

DELETE /api/variations/:id – none → {data:Variation}

Documents v2

POST /api/documents/init – {filename,mimeType?} → {data:{storageKey,uploadUrl[,token]}}

PUT /api/documents/upload/:key – stream upload → {data:{storageKey,size}}

POST /api/documents/complete – {storageKey,filename,mimeType,size,sha256?,projectId?,variationId?} → {data:Document}

GET /api/documents – {q?,projectId?,variationId?,limit?,offset?} → {data:[Document+links],meta}

GET /api/documents/:id/download – {id} → {url} or file download

DELETE /api/documents/:id – {id} → {data:{id}}

POST /api/documents/:id/link – {projectId? | variationId?} → {data:DocumentLink}

POST /api/documents/:id/unlink – {projectId? | variationId?} → {data:{deleted}}

Procurement – POs and deliveries CRUD with header-derived tenant and projectId fields

Financials – budgets, commitments, actuals, forecasts; each requires projectId and membership

Multi-Tenant & RBAC Gaps
Clients route ignores authenticated tenant – header-derived tenant and no tenantId filter

Suggested task
Enforce tenant scoping in clients route

Start task
Contacts routes unscope tenant – no tenantId in queries; table lacks tenant field

Suggested task
Add tenant scoping to contacts module

Start task
Projects and tasks rely on header-only tenant – potential cross-tenant access

Suggested task
Validate tenant against authenticated user for projects and tasks

Start task
Variations PUT/PATCH/DELETE lack membership guard

Suggested task
Apply requireProjectMember to all variation write routes

Start task
Procurement routes trust x-tenant-id and skip membership

Suggested task
Secure procurement routes

Start task
Reference lookups omit tenant filter – projectStatus, projectType, taskStatus tables with optional tenantId

Suggested task
Tenant-aware lookup endpoints

Start task
Legacy documents router creates links without tenant/linkType

Suggested task
Retire or fix legacy documents router

Start task
Type Integrity & BigInt Handling
assertProjectMember expects numeric userId but receives string

Suggested task
Normalize userId to number in membership checks

Start task
DocumentLink creation in legacy documents router omits tenantId

Suggested task
Provide tenantId for DocumentLink in legacy router

Start task
VariationStatusHistory lacks tenantId field

Suggested task
Add tenantId to VariationStatusHistory

Start task
Performance & Indexes
VariationStatusHistory missing composite index – currently only @@index([variationId])

Suggested task
Index VariationStatusHistory by tenant and variation

Start task
Documents listing orders by uploadedAt without supporting index

Suggested task
Index documents by tenant and uploadedAt

Start task
Module Completeness
Projects module – only list endpoint; no create/update/delete.

Suggested task
Expand project CRUD

Start task
Tasks module – read-only; lacks create/update/delete and snapshot recompute hooks.

Suggested task
Implement full task CRUD with snapshot recompute

Start task
Procurement – no supplier management endpoints.

Suggested task
Introduce supplier management API

Start task
No CVR or Carbon endpoints – only snapshot placeholders.

Suggested task
Add CVR and Carbon modules

Start task
Known Issues Reproduced
User ID type mismatch in membership middleware (see above).

Legacy documents router out of sync with schema – lacks tenantId, linkType for DocumentLink.

VariationStatusHistory not tenant-aware, risking cross-tenant leakage.

Read-only Next Steps (Backend)
Tenant & membership hardening (L) – address all multi-tenant gaps (clients, contacts, projects, tasks, procurement, reference, variations).

Schema alignment (M) – add tenantId to Client, Contact, VariationStatusHistory; migrate and index.

Auth/membership integrity (S) – numeric user IDs in JWT/middleware.

Performance tuning (S) – add Document_tenantId_uploadedAt_idx and VariationStatusHistory_tenantId_variationId_idx.

Module build-out (L) – task/project CRUD, supplier management, CVR/carbon APIs.

Each item is detailed in task stubs above.BACKEND_REPORT.md
Overview
Runtime & ORM – Node 20.16.x; Prisma 6.14.0 for both runtime and CLI

Key scripts – dev, seed, prisma:*, smoke:docs, smoke:variations

Database target – construction_erp_vnext on port 5432 (Postgres)

Auth/RBAC – JWT (HS256) via custom crypto helper; attachUser + requireAuth middleware chain

Multi‑tenant default – tenantId sourced from header or TENANT_DEFAULT environment variable.

Data Model Map
erDiagram
  Client ||--o{ Project : projects
  Client ||--o{ Contact : contacts
  Project }o--|| Client : client
  Project ||--o{ Task : tasks
  Task }o--|| TaskStatus : statusRel
  Project ||--o{ Variation : variations
  Variation ||--o{ VariationLine : lines
  Variation ||--o{ VariationStatusHistory : statusHistory
  Project ||--|| ProjectSnapshot : snapshot
  Project ||--o{ ProjectMembership : memberships
  User ||--o{ ProjectMembership : memberships
  Project ||--o{ PurchaseOrder : purchaseOrders
  PurchaseOrder ||--o{ POLine : lines
  PurchaseOrder ||--o{ Delivery : deliveries
  Project ||--o{ BudgetLine : budgetLines
  Project ||--o{ Commitment : commitments
  Project ||--o{ ActualCost : actualCosts
  Project ||--o{ Forecast : forecasts
  Document ||--o{ DocumentLink : links
  Project ||--o{ DocumentLink : project_docs
  Variation ||--o{ DocumentLink : variation_docs
  User ||--o{ UserRole : userRoles
  Role ||--o{ UserRole : userRoles
  Role ||--o{ RolePermission : rolePermissions
  Permission ||--o{ RolePermission : rolePermissions
Index Summary (selected)
Project – @@index([tenantId, status])

Task – @@index([tenantId, projectId, status]), @@index([projectId, dueDate])

Variation – multiple including @@index([tenantId, projectId, status, updatedAt])

DocumentLink – @@index([tenantId, projectId]), @@index([tenantId, documentId]), etc.

Financial tables – BudgetLine, Commitment, ActualCost, Forecast each indexed on tenantId + projectId

No AuditLog or AIAlert models detected.

Endpoint Inventory
Method	Path	Auth	Tenant Scoped?	Membership Check?	Models
POST	/auth/login	None	✔ (body tenantId)	✖	User
GET	/me	✔	n/a	n/a	none
GET	/api/users	✔	✔ (req.user.tenantId)	✖	User
GET	/api/roles	✔	✔	✖	Role
GET	/api/reference/project-statuses	✔	✖ (no tenant)	✖	ProjectStatus
GET	/api/reference/project-types	✔	✖	✖	ProjectType
GET	/api/reference/task-statuses	✔	✖	✖	TaskStatus
GET	/api/clients	✔	✖ (header only)	✖	Client/Project
GET	/api/contacts	✔	✖	✖	Contact/Client
GET	/api/projects	✔	✔ (header)	✖	Project/Client
GET	/api/projects/:id/overview	✔	✔	✔ (requireProjectMember)	Project/ProjectSnapshot
GET	/api/tasks	✔	✔ (header)	✖	Task
Variations CRUD	/api/variations...	✔	✔	partial (missing on PUT/PATCH/DELETE)	Variation*
Documents v2	/api/documents...	✔	✔ (req.user.tenantId)	✖	Document/DocumentLink
Procurement	/api/procurement/...	✔	✔ (header)	✖	PurchaseOrder, POLine, Delivery
Financials	/api/financials/...	✔	✔ (req.user.tenantId)	✔ (assertProjectMember)	BudgetLine, Commitment, ActualCost, Forecast
*Variation detail uses a manual membership check; other write routes skip it.

Contract Snapshots
Short-form summaries (request → response):

POST /auth/login – {email, password, tenantId?} → {token, user{id,email,name,tenantId,roles}}

GET /api/users – query none → {users:[{id,email,name,isActive,createdAt}]}

GET /api/roles – query none → {roles:[{id,name,createdAt}]}

GET /api/clients – header x-tenant-id → {clients:[{id,name,companyRegNo,projectsCount}]}

Contacts

GET /api/contacts – pagination/query filters → {page,pageSize,total,rows:[Contact+Client]}

GET /api/contacts/:id – {id} → Contact+Client

POST /api/contacts – contactBodySchema → Contact

PUT /api/contacts/:id – partial body → Contact

DELETE /api/contacts/:id – id → 204

GET /api/projects – {limit,offset,sort} → {total,projects:[Project+client+statusRel+typeRel]}

GET /api/projects/:id/overview – path {id} → {project,widgets,quickLinks,updatedAt}

GET /api/tasks – {limit,offset,sort} → {total,tasks:[Task+project+statusRel]}

Variations

GET /api/variations?projectId=... → {data:[Variation],meta}

GET /api/variations/:id → {data:Variation+lines} (membership checked)

POST /api/variations – variation payload with optional lines[] → {data:Variation}

PUT /api/variations/:id – update payload (no membership guard) → {data:Variation}

PATCH /api/variations/:id/status – {toStatus} → {data:Variation}

DELETE /api/variations/:id – none → {data:Variation}

Documents v2

POST /api/documents/init – {filename,mimeType?} → {data:{storageKey,uploadUrl[,token]}}

PUT /api/documents/upload/:key – stream upload → {data:{storageKey,size}}

POST /api/documents/complete – {storageKey,filename,mimeType,size,sha256?,projectId?,variationId?} → {data:Document}

GET /api/documents – {q?,projectId?,variationId?,limit?,offset?} → {data:[Document+links],meta}

GET /api/documents/:id/download – {id} → {url} or file download

DELETE /api/documents/:id – {id} → {data:{id}}

POST /api/documents/:id/link – {projectId? | variationId?} → {data:DocumentLink}

POST /api/documents/:id/unlink – {projectId? | variationId?} → {data:{deleted}}

Procurement – POs and deliveries CRUD with header-derived tenant and projectId fields

Financials – budgets, commitments, actuals, forecasts; each requires projectId and membership

Multi-Tenant & RBAC Gaps
Clients route ignores authenticated tenant – header-derived tenant and no tenantId filter

Suggested task
Enforce tenant scoping in clients route

Start task
Contacts routes unscope tenant – no tenantId in queries; table lacks tenant field

Suggested task
Add tenant scoping to contacts module

Start task
Projects and tasks rely on header-only tenant – potential cross-tenant access

Suggested task
Validate tenant against authenticated user for projects and tasks

Start task
Variations PUT/PATCH/DELETE lack membership guard

Suggested task
Apply requireProjectMember to all variation write routes

Start task
Procurement routes trust x-tenant-id and skip membership

Suggested task
Secure procurement routes

Start task
Reference lookups omit tenant filter – projectStatus, projectType, taskStatus tables with optional tenantId

Suggested task
Tenant-aware lookup endpoints

Start task
Legacy documents router creates links without tenant/linkType

Suggested task
Retire or fix legacy documents router

Start task
Type Integrity & BigInt Handling
assertProjectMember expects numeric userId but receives string

Suggested task
Normalize userId to number in membership checks

Start task
DocumentLink creation in legacy documents router omits tenantId

Suggested task
Provide tenantId for DocumentLink in legacy router

Start task
VariationStatusHistory lacks tenantId field

Suggested task
Add tenantId to VariationStatusHistory

Start task
Performance & Indexes
VariationStatusHistory missing composite index – currently only @@index([variationId])

Suggested task
Index VariationStatusHistory by tenant and variation

Start task
Documents listing orders by uploadedAt without supporting index

Suggested task
Index documents by tenant and uploadedAt

Start task
Module Completeness
Projects module – only list endpoint; no create/update/delete.

Suggested task
Expand project CRUD

Start task
Tasks module – read-only; lacks create/update/delete and snapshot recompute hooks.

Suggested task
Implement full task CRUD with snapshot recompute

Start task
Procurement – no supplier management endpoints.

Suggested task
Introduce supplier management API

Start task
No CVR or Carbon endpoints – only snapshot placeholders.

Suggested task
Add CVR and Carbon modules

Start task
Known Issues Reproduced
User ID type mismatch in membership middleware (see above).

Legacy documents router out of sync with schema – lacks tenantId, linkType for DocumentLink.

VariationStatusHistory not tenant-aware, risking cross-tenant leakage.

Read-only Next Steps (Backend)
Tenant & membership hardening (L) – address all multi-tenant gaps (clients, contacts, projects, tasks, procurement, reference, variations).

Schema alignment (M) – add tenantId to Client, Contact, VariationStatusHistory; migrate and index.

Auth/membership integrity (S) – numeric user IDs in JWT/middleware.

Performance tuning (S) – add Document_tenantId_uploadedAt_idx and VariationStatusHistory_tenantId_variationId_idx.

Module build-out (L) – task/project CRUD, supplier management, CVR/carbon APIs.

Each item is detailed in task stubs above.
