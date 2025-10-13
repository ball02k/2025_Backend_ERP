MVP Guide — Backend
===================

This doc explains how the MVP “Try MVP” area in the frontend works end‑to‑end with the backend APIs, and where to find the relevant routes, models and seeders.

Where the MVP lives (frontend URL)
- Project sidebar includes a Try MVP button which links to: `/projects/:id/mvp/overview`
- The MVP pages call the additive endpoints listed below (mounted under `/api`).

Key MVP Endpoints (additive)
- Project Info (GET/PATCH):
  - GET `/api/projects/:projectId/info` — returns enriched project info including `client`, `clientContact`, `projectManager`, `quantitySurveyor`, and `links`.
  - PATCH `/api/projects/:projectId/info` — supports partial updates: `projectCode`, `name`, `status`, `labels`, `clientId`, `clientContactId`, `projectManagerUserId`, `quantitySurveyorUserId`, `contractType`, `contractForm`, `paymentTermsDays`, `retentionPct`, `currency`, `sitePostcode`, `siteLat`, `siteLng`, `country`.

- Cost Codes (tenant‑scoped dictionary):
  - GET `/api/cost-codes?search=&parentId=`
  - POST `/api/cost-codes` { code, description?, parentId? }
  - PATCH `/api/cost-codes/:id` { code?, description?, parentId? }
  - DELETE `/api/cost-codes/:id`
  - POST `/api/cost-codes/import` { rows:[{code,description,parentCode?}] }
  - Linked into:
    - Budget Lines: `costCodeId` accepted/emitted in `/api/projects/:projectId/budget` routes
    - Packages: `costCodeId` accepted/emitted in `/api/projects/:projectId/packages` routes

- Project Overview totals (financial roll‑up):
  - GET `/api/projects/:projectId/overview` — computes `baseline`, `committed`, `adjusted`, `estimate`, `actual`, `varianceVsBaseline`, `varianceVsEstimate`.

- RFx Excel flows (SpreadsheetML; no new deps):
  - POST `/api/rfx/:rfxId/template` — generate response XML with sheets: Request Details, Pricing, Questions
  - POST `/api/rfx/:rfxId/upload-response` — upload supplier XML (base64); parses into `RFxSubmission` JSON
  - GET `/api/rfx/:rfxId/analysis.xlsx.xml` — compiled Bid Analysis workbook
  - POST `/api/rfx/:rfxId/send` — simple SMTP email (uses `SMTP_HOST`, `SMTP_FROM`)
  - List/save submissions: GET `/api/rfx/:rfxId/submissions`, PATCH `/api/rfx/submissions/:submissionId` { score }

Schema highlights
- `Project` additive relations: `clientContact`, `projectManager`, `quantitySurveyor` with FK fields; indexes added.
- `CostCode` (tenant‑scoped), linked to `BudgetLine.costCodeId` and `Package.costCodeId`.
- `RFxSubmission` with JSON `pricing` and `answers`, manual `score` and timestamps.

Seeders for quick demo
- `scripts/fill_project8_dummy.cjs` — sets contact/PM/QS, site coordinates (map), and basic finance
- `scripts/fill_project8_bulk.cjs` — adds 20 tasks, 10 RFIs, QA/HS/Carbon, budget/POs/invoices/variations/forecasts/AfPs

Run
- Dev server: `npm run dev`
- Migrate + generate: `npm run migrate` / `npm run prisma:generate`
- Seed MVP data: `node scripts/fill_project8_dummy.cjs` and `node scripts/fill_project8_bulk.cjs`

