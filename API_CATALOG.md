# API Catalog

Generated: 2025-08-31T20:41:39.326Z (UTC) / Sunday, 31 August 2025 at 21:41:39 BST (Europe/London)

Commit: 76f39dd

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

### GET //api/financials/:projectId/periods

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth

### GET //api/financials/:projectId/cvr

- Middlewares: <anonymous>
- Controller: anonymous
- Auth/Guards: none
- Path params: projectId
- Lint: Missing requireAuth

### GET //api/financials/:projectId/cvr/:period

- Middlewares: <anonymous>
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

### GET //api/home/overview

- Middlewares: requireAuth, <anonymous>
- Controller: anonymous
- Auth/Guards: requireAuth
- Path params: none
- Lint: OK

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

