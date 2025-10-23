# API Catalog

Generated: 2025-09-26T13:54:38.346Z (UTC) / Friday 26 September 2025 at 14:54:38 BST (Europe/London)

Commit: 764880d

## Reminders

- JWT HS256 required on all protected routes.
- Tenant scoping required on every Prisma call.
- BigInt serialization: Document.id/documentId rendered as strings in JSON.
- No Prisma enums; use strings.
- Prisma & @prisma/client versions must match (6.14.0).

### Contributing

Any time a new route is added, run `npm run api:catalog` and commit the updated files.

### OPTIONS *

- Middlewares: corsMiddleware
- Controller: corsMiddleware
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth; Missing tenant scoping

### GET /health,/api/health

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth; Missing tenant scoping

### GET /openapi-lite.json

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth; Missing tenant scoping

### GET //?/i/api/__catalog/hash

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth; Missing tenant scoping

### GET //?/i/api/__delta

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth; Missing tenant scoping

### POST //auth/login

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //me

- Middlewares: requireAuth, <anonymous>
- Controller: anonymous
- Auth/Guards: requireAuth
- Path params: none
- Lint: Missing tenant scoping

### GET //api/users

- Middlewares: requireAuth, <anonymous>
- Controller: anonymous
- Auth/Guards: requireAuth
- Path params: none
- Lint: OK

### GET //api/roles

- Middlewares: requireAuth, <anonymous>
- Controller: anonymous
- Auth/Guards: requireAuth
- Path params: none
- Lint: OK

### GET //api/reference/project-statuses

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/reference/project-types

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/reference/task-statuses

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/clients

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/clients/csv/export

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/clients/:id/projects

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/clients/csv/template

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/clients/csv/import

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth; Missing tenant scoping

### GET //api/clients/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/clients

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### PUT //api/clients/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PATCH //api/clients/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/clients/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/contacts

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/contacts/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/contacts

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### PUT //api/contacts/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/contacts/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/projects/summary

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/projects

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/projects/csv/export

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/projects/csv/template

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/projects/csv/import

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/projects/:projectId/packages

- Middlewares: <anonymous>
- Controller: anonymous (/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/controllers/packageController.js#listPackages)
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/projects/:projectId/packages

- Middlewares: <anonymous>
- Controller: anonymous (/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/controllers/packageController.js#createPackage)
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth; Missing tenant scoping

### GET //api/projects/:projectId/contracts

- Middlewares: <anonymous>
- Controller: anonymous (/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/controllers/packageController.js#listContractsByProject)
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth; Missing tenant scoping

### GET //api/projects/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/projects

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### PUT //api/projects/:id

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PATCH //api/projects/:id

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/projects/:id

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/projects/:id/members

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/projects/:id/members

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/projects/:id/members/:memberId

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id, memberId
- Lint: Missing requireAuth

### GET //api/projects/:id/alerts

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/projects/:id/overview

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/projects/:projectId/packages/:packageId/push-to-rfx

- Middlewares: requireProjectMember, <anonymous>, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId, packageId
- Lint: Missing requireAuth

### GET //api/projects/:projectId/invoices

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth

### GET //api/projects/:projectId/invoices/csv

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth

### POST //api/projects/:projectId/invoices

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth

### GET //api/projects/:id/documents

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/projects/:id/documents

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/health/overview-test

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/tasks/summary

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/tasks

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/tasks/csv/export

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/tasks/csv/template

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/tasks/csv/import

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/tasks/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/tasks

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### PUT //api/tasks/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/tasks/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/variations

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/variations/csv/export

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/variations/csv/template

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/variations/csv/import

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/variations/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/variations

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### PUT //api/variations/:id

- Middlewares: <anonymous>, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PATCH //api/variations/:id/status

- Middlewares: <anonymous>, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/variations/:id

- Middlewares: <anonymous>, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/documents/init

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth; Missing tenant scoping

### PUT //api/documents/upload/:key

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: key
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/documents/complete

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/documents

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/documents/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/documents/:id/download

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/documents/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/documents/:id/link

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/documents/:id/unlink

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/onboarding

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/onboarding/projects

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/onboarding/projects

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### PATCH //api/onboarding/projects/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/onboarding/forms

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/onboarding/invites

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/onboarding/progress

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/onboarding/responses/submit

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### PATCH //api/onboarding/responses/:id/review

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/onboarding/forms

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/onboarding/invites

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/onboarding/responses

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/onboarding/invites/accept

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/procurement

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/procurement/pos

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/procurement/pos/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/procurement/pos

- Middlewares: requireProjectMember, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### PUT //api/procurement/pos/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/procurement/pos/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/procurement/deliveries

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### PUT //api/procurement/deliveries/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/procurement/pos/bulk-map-suppliers

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/procurement/pos/bulk-map-suppliers-preview

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/procurement/pos/bulk-map-suppliers-preview-tenant

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/procurement/pos/bulk-map-suppliers-tenant

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/packages/:packageId/invite

- Middlewares: <anonymous>
- Controller: anonymous (/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/controllers/procurementController.js#inviteSuppliers)
- Auth/Guards: none
- Path params: packageId
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/packages/:packageId/submit

- Middlewares: <anonymous>
- Controller: anonymous (/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/controllers/procurementController.js#submitBid)
- Auth/Guards: none
- Path params: packageId
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/submissions/:submissionId/score

- Middlewares: <anonymous>
- Controller: anonymous (/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/controllers/procurementController.js#scoreSubmission)
- Auth/Guards: none
- Path params: submissionId
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/packages/:packageId/award

- Middlewares: requireAuth, (inline) requireTenant
- Controller: awardsRouter (/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/routes/awards.cjs#createPackageAward)
- Auth/Guards: requireAuth
- Path params: packageId
- Responses: 201 { awardId, contractId, packageId, supplierId, committed }, 404 { code: "NOT_FOUND" }, 409 { code: "ALREADY_AWARDED" | "COMPLIANCE_MISSING" }

### GET //api/financials

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/financials/:projectId/adjustments

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth

### GET //api/financials/budgets

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/financials/budgets

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/financials/budgets/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PUT //api/financials/budgets/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/financials/budgets/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/financials/commitments

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/financials/commitments

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/financials/commitments/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PUT //api/financials/commitments/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/financials/commitments/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/financials/actuals

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/financials/actuals

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/financials/actuals/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PUT //api/financials/actuals/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/financials/actuals/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/financials/forecasts

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/financials/forecasts

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/financials/forecasts/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PUT //api/financials/forecasts/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/financials/forecasts/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/financials/snapshot

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/financials/:projectId/periods

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth

### GET //api/financials/:projectId/cvr

- Middlewares: <anonymous>, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth

### GET //api/financials/:projectId/cvr/:period

- Middlewares: <anonymous>, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId, period
- Lint: Missing requireAuth

### GET //api/projects/financials

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/projects/financials/:projectId/adjustments

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth

### GET //api/projects/financials/budgets

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/projects/financials/budgets

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/projects/financials/budgets/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PUT //api/projects/financials/budgets/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/projects/financials/budgets/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/projects/financials/commitments

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/projects/financials/commitments

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/projects/financials/commitments/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PUT //api/projects/financials/commitments/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/projects/financials/commitments/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/projects/financials/actuals

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/projects/financials/actuals

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/projects/financials/actuals/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PUT //api/projects/financials/actuals/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/projects/financials/actuals/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/projects/financials/forecasts

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/projects/financials/forecasts

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/projects/financials/forecasts/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PUT //api/projects/financials/forecasts/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/projects/financials/forecasts/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/projects/financials/snapshot

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/projects/financials/:projectId/periods

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth

### GET //api/projects/financials/:projectId/cvr

- Middlewares: <anonymous>, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth

### GET //api/projects/financials/:projectId/cvr/:period

- Middlewares: <anonymous>, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId, period
- Lint: Missing requireAuth

### GET //api/suppliers

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/suppliers/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/suppliers

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### PUT //api/suppliers/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/suppliers/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/suppliers/onboarding-links

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/suppliers/:id/contracts

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/suppliers/:id/onboarding-link

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/requests

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/requests/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/requests/:id/bundle

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/requests

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### PATCH //api/requests/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/requests/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/requests/:id/publish

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/requests/:id/deadline

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/requests/:id/sections

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/requests/:id/sections

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PATCH //api/requests/sections/:sectionId

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: sectionId
- Lint: Missing requireAuth

### DELETE //api/requests/sections/:sectionId

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: sectionId
- Lint: Missing requireAuth

### GET //api/requests/:id/questions

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/requests/:id/questions

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PATCH //api/requests/questions/:questionId

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: questionId
- Lint: Missing requireAuth

### DELETE //api/requests/questions/:questionId

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: questionId
- Lint: Missing requireAuth

### GET //api/requests/:id/invites

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/requests/:id/invites

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/requests/:id/invites/:inviteId/resend

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id, inviteId
- Lint: Missing requireAuth

### GET //api/requests/:id/qna

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/requests/:id/qna

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/requests/qna/:qnaId/answer

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: qnaId
- Lint: Missing requireAuth

### GET //api/requests/:id/responses

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/requests/:id/responses/submit

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/requests/:id/scoring/activate

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/requests/:id/scoring

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PATCH //api/requests/:id/scoring/scale

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PATCH //api/requests/:id/scoring/policy

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/requests/:id/scoring/status

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/requests/:id/score/:supplierId/preview

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id, supplierId
- Lint: Missing requireAuth

### POST //api/requests/:id/score/:supplierId

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id, supplierId
- Lint: Missing requireAuth

### POST //api/requests/:id/award

- Middlewares: <anonymous>, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/requests/:id/create-po

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/requests/:id/duplicate

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/requests/:id/export

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/requests/:id/suppliers/summary

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/requests/import

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/spm/templates

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/spm/templates/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/spm/templates

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### PATCH //api/spm/templates/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/spm/templates/:id/publish

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/spm/templates/:id/unpublish

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/spm/scorecards

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/spm/scorecards/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/spm/scorecards

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### PATCH //api/spm/scorecards/:id/score

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/spm/suppliers/:supplierId/trend

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: supplierId
- Lint: Missing requireAuth

### GET //api/search

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/lookups/project-statuses

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/lookups/project-types

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/lookups/projects

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/integrations/companies-house/:companyNumber/profile

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: companyNumber
- Lint: Missing requireAuth; Missing tenant scoping

### GET //api/integrations/hmrc/vat/:vrn/check

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: vrn
- Lint: Missing requireAuth; Missing tenant scoping

### GET //api/rfis

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/rfis

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/rfis/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PATCH //api/rfis/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/rfis/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/rfis/:id/documents

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/qa/records

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/qa/records

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/qa/records/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PATCH //api/qa/records/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/qa/records/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/qa/records/:id/items

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PATCH //api/qa/items/:itemId

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: itemId
- Lint: Missing requireAuth

### DELETE //api/qa/items/:itemId

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: itemId
- Lint: Missing requireAuth

### GET //api/qa/records/:id/documents

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/hs/events

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/hs/events

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/hs/events/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PATCH //api/hs/events/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/hs/events/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/hs/events/:id/documents

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/carbon/entries

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/carbon/entries

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/carbon/entries/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PATCH //api/carbon/entries/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### DELETE //api/carbon/entries/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/carbon/entries/:id/documents

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/analytics/rollups

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/analytics/trends

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/home/overview

- Middlewares: requireAuth, <anonymous>
- Controller: anonymous
- Auth/Guards: requireAuth
- Path params: none
- Lint: OK

### GET //api/features

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/admin/features/grants

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/admin/features/grants

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### DELETE //api/admin/features/grants

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/finance/pos

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/finance/pos

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/finance/pos/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PUT //api/finance/pos/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/finance/pos/:id/lines

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PUT //api/finance/pos/:id/lines/:lineId

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id, lineId
- Lint: Missing requireAuth; Missing tenant scoping

### DELETE //api/finance/pos/:id/lines/:lineId

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id, lineId
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/finance/pos/:id/issue

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/finance/pos/:id/receipt

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### POST //api/finance/pos/:id/close

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/finance/pos/:id/generate-pdf

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### GET //api/finance/invoices

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/finance/invoices

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### GET //api/finance/invoices/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth

### PUT //api/finance/invoices/:id

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/finance/invoices/:id/approve

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/finance/invoices/:id/reject

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: id
- Lint: Missing requireAuth; Missing tenant scoping

### POST //api/finance/match/attempt

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/finance/match/:poId/accept

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: poId
- Lint: Missing requireAuth

### POST //api/finance/ocr/:invoiceId/retry

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: invoiceId
- Lint: Missing requireAuth; Missing tenant scoping

### GET //api/finance/inbound/email/aliases

- Middlewares: requireAuth, requireFinanceRole, <anonymous>, <anonymous>, <anonymous>
- Controller: anonymous
- Auth/Guards: requireAuth, guard
- Path params: none
- Lint: OK

### POST //api/finance/inbound/email

- Middlewares: <anonymous>, <anonymous>, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth; Missing tenant scoping

### GET //public/onboard/:token

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: token
- Lint: Missing requireAuth

### POST //public/onboard/:token

- Middlewares: jsonParser, <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: token
- Lint: Missing requireAuth

### GET /api/activity

- Middlewares: requireAuth, <anonymous>
- Controller: anonymous
- Auth/Guards: requireAuth
- Path params: none
- Lint: Missing tenant scoping

### GET /api/audit/events

- Middlewares: requireAuth, <anonymous>
- Controller: anonymous
- Auth/Guards: requireAuth
- Path params: none
- Lint: Missing tenant scoping

### GET /api/resources/utilization,/api/planning/utilization

- Middlewares: requireAuth, <anonymous>
- Controller: anonymous
- Auth/Guards: requireAuth
- Path params: none
- Lint: Missing tenant scoping

### GET /api/finance/snapshot

- Middlewares: requireAuth, <anonymous>
- Controller: anonymous
- Auth/Guards: requireAuth
- Path params: none
- Lint: Missing tenant scoping

### POST //api/dev/login

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth

### POST //api/dev/snapshot/recompute/:projectId

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth; Missing tenant scoping

### GET //api/dev-token

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: none
- Lint: Missing requireAuth
