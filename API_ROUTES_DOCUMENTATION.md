# API Routes Documentation

Generated: 2025-11-23T09:17:50.210Z

## Index by Module

- [afp](#afp)
- [afp.open](#afpopen)
- [allocations](#allocations)
- [analytics](#analytics)
- [approvals](#approvals)
- [auth](#auth)
- [auth.dev](#authdev)
- [awards](#awards)
- [budgetCategories](#budgetcategories)
- [budgets-ocr](#budgets-ocr)
- [budgets.import](#budgetsimport)
- [carbon](#carbon)
- [clients](#clients)
- [clients 2](#clients 2)
- [contacts](#contacts)
- [contacts 2](#contacts 2)
- [contract-valuations](#contract-valuations)
- [contract.templates](#contracttemplates)
- [contracts](#contracts)
- [contracts.generateDoc](#contractsgeneratedoc)
- [contracts.onlyoffice](#contractsonlyoffice)
- [contracts.read](#contractsread)
- [contracts.status](#contractsstatus)
- [costCodes](#costcodes)
- [cvr](#cvr)
- [cvr-reports](#cvr-reports)
- [demo](#demo)
- [dev](#dev)
- [dev.ai](#devai)
- [dev_delta](#dev_delta)
- [dev_snapshot](#dev_snapshot)
- [diary](#diary)
- [document.links](#documentlinks)
- [documents](#documents)
- [documents_v2](#documents_v2)
- [email-ingestion](#email-ingestion)
- [equipment](#equipment)
- [finance.dashboard](#financedashboard)
- [finance.inbound](#financeinbound)
- [finance.invoices](#financeinvoices)
- [finance.match](#financematch)
- [finance.ocr](#financeocr)
- [finance.pos](#financepos)
- [finance.receipts](#financereceipts)
- [financials](#financials)
- [financials.cvr](#financialscvr)
- [geo](#geo)
- [health](#health)
- [home](#home)
- [hs](#hs)
- [integrations](#integrations)
- [invoiceMatching](#invoicematching)
- [invoices](#invoices)
- [jobSchedules](#jobschedules)
- [jobs](#jobs)
- [lookups](#lookups)
- [me](#me)
- [meta](#meta)
- [onboarding](#onboarding)
- [packages](#packages)
- [packages.actions](#packagesactions)
- [packages.directAward](#packagesdirectaward)
- [packages.documents](#packagesdocuments)
- [packages.pricing](#packagespricing)
- [packages.responses](#packagesresponses)
- [packages.seed](#packagesseed)
- [payment-applications](#payment-applications)
- [procurement](#procurement)
- [procurement 2](#procurement 2)
- [project_alerts](#project_alerts)
- [project_documents](#project_documents)
- [project_invoices](#project_invoices)
- [project_members](#project_members)
- [projects](#projects)
- [projects 2](#projects 2)
- [projects.budget](#projectsbudget)
- [projects.budgets](#projectsbudgets)
- [projects.budgets.suggest](#projectsbudgetssuggest)
- [projects.contracts](#projectscontracts)
- [projects.cvr](#projectscvr)
- [projects.info](#projectsinfo)
- [projects.overview](#projectsoverview)
- [projects.packages](#projectspackages)
- [projects.roles](#projectsroles)
- [projects.scope](#projectsscope)
- [projects.tenders](#projectstenders)
- [projects_overview](#projects_overview)
- [public](#public)
- [purchaseOrders](#purchaseorders)
- [qa](#qa)
- [reference](#reference)
- [reference 2](#reference 2)
- [requests](#requests)
- [rfis](#rfis)
- [rfx](#rfx)
- [rfx.analysis](#rfxanalysis)
- [rfx.builder](#rfxbuilder)
- [rfx.email](#rfxemail)
- [rfx.invitesSend](#rfxinvitessend)
- [rfx.public](#rfxpublic)
- [rfx.responses](#rfxresponses)
- [rfx.state](#rfxstate)
- [rfx.templates](#rfxtemplates)
- [roles](#roles)
- [scope.assist](#scopeassist)
- [search](#search)
- [settings.approvals](#settingsapprovals)
- [settings.emailTemplates](#settingsemailtemplates)
- [settings.tenderTemplates](#settingstendertemplates)
- [settings.v1](#settingsv1)
- [spm](#spm)
- [suppliers](#suppliers)
- [tasks](#tasks)
- [tasks 2](#tasks 2)
- [taxonomy](#taxonomy)
- [tenders](#tenders)
- [tenders.builder](#tendersbuilder)
- [tenders.clarifications](#tendersclarifications)
- [tenders.combined](#tenderscombined)
- [tenders.create](#tenderscreate)
- [tenders.documents](#tendersdocuments)
- [tenders.invitations](#tendersinvitations)
- [tenders.package-copy](#tenderspackage-copy)
- [tenders.portal](#tendersportal)
- [tenders.portal.qna](#tendersportalqna)
- [tenders.qna](#tendersqna)
- [tenders.scoring](#tendersscoring)
- [tenders.workflow](#tendersworkflow)
- [timeEntries](#timeentries)
- [trades](#trades)
- [upload](#upload)
- [users](#users)
- [variations](#variations)
- [variations-enhanced](#variations-enhanced)
- [workers](#workers)

---

## afp

File: `routes/afp.cjs` or `routes/afp.js`

**Endpoints: 7**

- `GET` /
- `GET` /:id
- `POST` /
- `PATCH` /:id
- `POST` /:id/notices
- `POST` /:id/certify
- `GET` /debug/raw


## afp.open

File: `routes/afp.open.cjs` or `routes/afp.open.js`

**Endpoints: 1**

- `GET` /


## allocations

File: `routes/allocations.cjs` or `routes/allocations.js`

**Endpoints: 12**

- `GET` /categories
- `POST` /categories
- `GET` /budget-line/:budgetLineId
- `POST` /budget-line/:budgetLineId
- `PATCH` /:allocationId
- `GET` /:allocationId/cvr
- `GET` /budget-line/:budgetLineId/cvr
- `GET` /project/:projectId/cvr
- `POST` /transfers
- `POST` /transfers/:transferId/approve
- `POST` /transfers/:transferId/reject
- `GET` /budget-line/:budgetLineId/transfers


## analytics

File: `routes/analytics.cjs` or `routes/analytics.js`

**Endpoints: 2**

- `GET` /rollups
- `GET` /trends


## approvals

File: `routes/approvals.cjs` or `routes/approvals.js`

**Endpoints: 12**

- `GET` /pending
- `GET` /history
- `GET` /:workflowId
- `POST` /:stepId/approve
- `POST` /:stepId/reject
- `POST` /:stepId/changes-required
- `POST` /:stepId/refer-up
- `POST` /:stepId/delegate
- `POST` /:workflowId/override
- `POST` /:workflowId/cancel
- `GET` /stats/me
- `GET` /stats/tenant


## auth

File: `routes/auth.cjs` or `routes/auth.js`

**Endpoints: 3**

- `POST` /register
- `POST` /login
- `GET` /me


## auth.dev

File: `routes/auth.dev.cjs` or `routes/auth.dev.js`

**Endpoints: 1**

- `GET` /dev-token


## awards

File: `routes/awards.cjs` or `routes/awards.js`

**Endpoints: 1**

- `POST` /packages/:id/award


## budgetCategories

File: `routes/budgetCategories.cjs` or `routes/budgetCategories.js`

**Endpoints: 6**

- `GET` /
- `GET` /:id
- `PATCH` /budget-line/:id
- `PATCH` /budget-lines/bulk
- `GET` /project/:projectId/grouped
- `GET` /project/:projectId/cvr


## budgets-ocr

File: `routes/budgets-ocr.cjs` or `routes/budgets-ocr.js`

**Endpoints: 2**

- `POST` /preview
- `POST` /commit


## budgets.import

File: `routes/budgets.import.cjs` or `routes/budgets.import.js`

**Endpoints: 8**

- `POST` /projects/:projectId/budgets:import
- `POST` /projects/:projectId/budgets/import
- `POST` /:projectId/budgets:import
- `POST` /:projectId/budgets/import
- `POST` /projects/:projectId/budgets:commit
- `POST` /projects/:projectId/budgets/commit
- `POST` /:projectId/budgets:commit
- `POST` /:projectId/budgets/commit


## carbon

File: `routes/carbon.cjs` or `routes/carbon.js`

**Endpoints: 7**

- `GET` /project/:projectId/summary
- `GET` /entries
- `POST` /entries
- `GET` /entries/:id
- `PATCH` /entries/:id
- `DELETE` /entries/:id
- `GET` /entries/:id/documents


## clients

File: `routes/clients.cjs` or `routes/clients.js`

**Endpoints: 10**

- `GET` /
- `GET` /csv/export
- `GET` /:id/projects
- `GET` /csv/template
- `POST` /csv/import
- `GET` /:id
- `POST` /
- `PUT` /:id
- `PATCH` /:id
- `DELETE` /:id


## clients 2

File: `routes/clients 2.cjs` or `routes/clients 2.js`

**Endpoints: 10**

- `GET` /
- `GET` /csv/export
- `GET` /:id/projects
- `GET` /csv/template
- `POST` /csv/import
- `GET` /:id
- `POST` /
- `PUT` /:id
- `PATCH` /:id
- `DELETE` /:id


## contacts

File: `routes/contacts.cjs` or `routes/contacts.js`

**Endpoints: 5**

- `GET` /
- `GET` /:id
- `POST` /
- `PUT` /:id
- `DELETE` /:id


## contacts 2

File: `routes/contacts 2.cjs` or `routes/contacts 2.js`

**Endpoints: 5**

- `GET` /
- `GET` /:id
- `POST` /
- `PUT` /:id
- `DELETE` /:id


## contract-valuations

File: `routes/contract-valuations.cjs` or `routes/contract-valuations.js`

**Endpoints: 7**

- `POST` /
- `GET` /:id
- `GET` /
- `PATCH` /:id
- `PATCH` /:id/status
- `DELETE` /:id
- `GET` /contract/:contractId/summary


## contract.templates

File: `routes/contract.templates.cjs` or `routes/contract.templates.js`

**Endpoints: 5**

- `GET` /contract-templates
- `GET` /contract-templates/:id
- `POST` /contract-templates
- `PATCH` /contract-templates/:id
- `DELETE` /contract-templates/:id


## contracts

File: `routes/contracts.cjs` or `routes/contracts.js`

**Endpoints: 15**

- `GET` /contracts
- `GET` /projects/:projectId/contracts
- `GET` /contracts/:id
- `POST` /contracts
- `PUT` /contracts/:id
- `POST` /contracts/:id/line-items
- `PUT` /contract-line-items/:id
- `DELETE` /contract-line-items/:id
- `POST` /contracts/:id/documents:generate
- `POST` /contracts/:id/issue
- `POST` /contracts/:id/send-for-signature
- `POST` /contracts/:id/mark-signed
- `POST` /contracts/:id/revert-to-draft
- `POST` /contracts/:id/archive
- `DELETE` /contracts/:id


## contracts.generateDoc

File: `routes/contracts.generateDoc.cjs` or `routes/contracts.generateDoc.js`

**Endpoints: 2**

- `POST` /contracts/:id/document/version
- `PUT` /contracts/:id/document/version/:versionId/redline


## contracts.onlyoffice

File: `routes/contracts.onlyoffice.cjs` or `routes/contracts.onlyoffice.js`

**Endpoints: 3**

- `GET` /contracts/:id/onlyoffice/config
- `GET` /contracts/:id/onlyoffice/file
- `POST` /onlyoffice/callback


## contracts.read

File: `routes/contracts.read.cjs` or `routes/contracts.read.js`

**Endpoints: 2**

- `GET` /contracts/:id/document
- `GET` /contracts/:id/document/versions/:versionId


## contracts.status

File: `routes/contracts.status.cjs` or `routes/contracts.status.js`

**Endpoints: 3**

- `POST` /contracts/:id/status
- `POST` /contracts/:id/approvals/:stepId/decision
- `GET` /contracts/:id/approvals


## costCodes

File: `routes/costCodes.cjs` or `routes/costCodes.js`

**Endpoints: 5**

- `GET` /cost-codes
- `POST` /cost-codes
- `PATCH` /cost-codes/:id
- `DELETE` /cost-codes/:id
- `POST` /cost-codes/import


## cvr

File: `routes/cvr.cjs` or `routes/cvr.js`

**Endpoints: 17**

- `GET` /summary
- `GET` /by-budget-line
- `GET` /commitment-breakdown
- `GET` /actual-breakdown
- `POST` /commitment
- `PATCH` /commitment/:id
- `DELETE` /commitment/:id
- `POST` /actual
- `PATCH` /actual/:id
- `DELETE` /actual/:id
- `GET` /summary-enhanced
- `GET` /forecast
- `GET` /profit-loss
- `GET` /revenue
- `GET` /costs
- `POST` /snapshot
- `GET` /movement


## cvr-reports

File: `routes/cvr-reports.cjs` or `routes/cvr-reports.js`

**Endpoints: 8**

- `POST` /
- `GET` /:id
- `GET` /
- `PATCH` /:id
- `PATCH` /:id/status
- `DELETE` /:id
- `GET` /project/:projectId/summary
- `GET` /compare


## demo

File: `routes/demo.cjs` or `routes/demo.js`

**Endpoints: 1**

- `GET` /demo/reset


## dev

File: `routes/dev.cjs` or `routes/dev.js`

**Endpoints: 1**

- `POST` /login


## dev.ai

File: `routes/dev.ai.cjs` or `routes/dev.ai.js`

**Endpoints: 1**

- `POST` /echo


## dev_delta

File: `routes/dev_delta.cjs` or `routes/dev_delta.js`

**Endpoints: 2**

- `GET` /api/__catalog/hash
- `GET` /api/__delta


## dev_snapshot

File: `routes/dev_snapshot.cjs` or `routes/dev_snapshot.js`

**Endpoints: 1**

- `POST` /recompute/:projectId


## diary

File: `routes/diary.cjs` or `routes/diary.js`

**Endpoints: 2**

- `GET` /:projectId/diary
- `POST` /:projectId/diary


## document.links

File: `routes/document.links.cjs` or `routes/document.links.js`

**Endpoints: 3**

- `GET` /documents/links
- `POST` /documents/:documentId/link
- `DELETE` /documents/:documentId/link


## documents

File: `routes/documents.cjs` or `routes/documents.js`

**Endpoints: 8**

- `GET` /
- `GET` /:id
- `POST` /init
- `PUT` /local/upload/:key
- `POST` /complete
- `DELETE` /:id
- `POST` /:id/link
- `POST` /:id/unlink


## documents_v2

File: `routes/documents_v2.cjs` or `routes/documents_v2.js`

**Endpoints: 9**

- `POST` /init
- `PUT` /upload/:key
- `POST` /complete
- `GET` /
- `GET` /:id
- `GET` /:id/download
- `DELETE` /:id
- `POST` /:id/link
- `POST` /:id/unlink


## email-ingestion

File: `routes/email-ingestion.cjs` or `routes/email-ingestion.js`

**Endpoints: 4**

- `POST` /webhook
- `POST` /upload
- `GET` /applications/:id/ocr
- `POST` /applications/:id/review


## equipment

File: `routes/equipment.cjs` or `routes/equipment.js`

**Endpoints: 9**

- `GET` /
- `GET` /maintenance/due
- `GET` /:id
- `POST` /
- `PATCH` /:id
- `DELETE` /:id
- `GET` /:id/availability
- `POST` /:id/maintenance
- `POST` /:id/location


## finance.dashboard

File: `routes/finance.dashboard.cjs` or `routes/finance.dashboard.js`

**Endpoints: 3**

- `GET` /finance/dashboard-summary
- `GET` /finance/payment-applications
- `GET` /finance/payment-applications/export


## finance.inbound

File: `routes/finance.inbound.cjs` or `routes/finance.inbound.js`

**Endpoints: 3**

- `GET` /finance/inbound
- `GET` /finance/inbound/email/aliases
- `POST` /finance/inbound/email


## finance.invoices

File: `routes/finance.invoices.cjs` or `routes/finance.invoices.js`

**Endpoints: 6**

- `GET` /finance/invoices
- `POST` /finance/invoices
- `GET` /finance/invoices/:id
- `PUT` /finance/invoices/:id
- `POST` /finance/invoices/:id/approve
- `POST` /finance/invoices/:id/reject


## finance.match

File: `routes/finance.match.cjs` or `routes/finance.match.js`

**Endpoints: 2**

- `POST` /finance/match/attempt
- `POST` /finance/match/:poId/accept


## finance.ocr

File: `routes/finance.ocr.cjs` or `routes/finance.ocr.js`

**Endpoints: 1**

- `POST` /finance/ocr/:invoiceId/retry


## finance.pos

File: `routes/finance.pos.cjs` or `routes/finance.pos.js`

**Endpoints: 11**

- `GET` /finance/pos
- `POST` /finance/pos
- `GET` /finance/pos/:id
- `PUT` /finance/pos/:id
- `POST` /finance/pos/:id/lines
- `PUT` /finance/pos/:id/lines/:lineId
- `DELETE` /finance/pos/:id/lines/:lineId
- `POST` /finance/pos/:id/issue
- `POST` /finance/pos/:id/receipt
- `POST` /finance/pos/:id/close
- `POST` /finance/pos/:id/generate-pdf


## finance.receipts

File: `routes/finance.receipts.cjs` or `routes/finance.receipts.js`

**Endpoints: 1**

- `GET` /finance/receipts


## financials

File: `routes/financials.cjs` or `routes/financials.js`

**Endpoints: 26**

- `GET` /
- `POST` /:projectId/adjustments
- `GET` /budgets
- `POST` /budgets
- `GET` /budgets/:id
- `PUT` /budgets/:id
- `DELETE` /budgets/:id
- `GET` /commitments
- `POST` /commitments
- `GET` /commitments/:id
- `PUT` /commitments/:id
- `DELETE` /commitments/:id
- `GET` /actuals
- `POST` /actuals
- `GET` /actuals/:id
- `PUT` /actuals/:id
- `DELETE` /actuals/:id
- `GET` /forecasts
- `POST` /forecasts
- `GET` /forecasts/:id
- `PUT` /forecasts/:id
- `DELETE` /forecasts/:id
- `GET` /snapshot
- `GET` /:projectId/periods
- `GET` /:projectId/cvr
- `GET` /:projectId/cvr/:period


## financials.cvr

File: `routes/financials.cvr.cjs` or `routes/financials.cvr.js`

**Endpoints: 5**

- `POST` /:projectId/cvr
- `GET` /:projectId/cvr
- `POST` /cvr/:id/lines/import
- `PATCH` /cvr/:id
- `POST` /cvr/:id/publish


## geo

File: `routes/geo.cjs` or `routes/geo.js`

**Endpoints: 2**

- `GET` /geo/postcode/:pc
- `GET` /geo/reverse


## health

File: `routes/health.cjs` or `routes/health.js`

**Endpoints: 1**

- `GET` /overview-test


## home

File: `routes/home.cjs` or `routes/home.js`

**Endpoints: 1**

- `GET` /home/overview


## hs

File: `routes/hs.cjs` or `routes/hs.js`

**Endpoints: 7**

- `GET` /project/:projectId/summary
- `GET` /events
- `POST` /events
- `GET` /events/:id
- `PATCH` /events/:id
- `DELETE` /events/:id
- `GET` /events/:id/documents


## integrations

File: `routes/integrations.cjs` or `routes/integrations.js`

**Endpoints: 2**

- `GET` /companies-house/:companyNumber/profile
- `GET` /hmrc/vat/:vrn/check


## invoiceMatching

File: `routes/invoiceMatching.cjs` or `routes/invoiceMatching.js`

**Endpoints: 5**

- `POST` /invoices/:id/match-po
- `GET` /invoices/:id/match-suggestions
- `GET` /matching/exceptions
- `POST` /contracts/:id/calloff
- `GET` /contracts/:id/calloff-status


## invoices

File: `routes/invoices.cjs` or `routes/invoices.js`

**Endpoints: 12**

- `GET` /
- `GET` /awaiting-approval
- `GET` /overdue
- `GET` /:id
- `POST` /
- `PATCH` /:id
- `POST` /:id/match
- `POST` /:id/approve
- `POST` /:id/pay
- `POST` /:id/dispute
- `POST` /:id/cancel
- `DELETE` /:id


## jobSchedules

File: `routes/jobSchedules.cjs` or `routes/jobSchedules.js`

**Endpoints: 10**

- `GET` /
- `GET` /calendar
- `GET` /unassigned-jobs
- `GET` /worker/:workerId
- `GET` /:id
- `POST` /
- `POST` /bulk-assign
- `POST` /:id/confirm
- `PATCH` /:id
- `DELETE` /:id


## jobs

File: `routes/jobs.cjs` or `routes/jobs.js`

**Endpoints: 7**

- `GET` /
- `GET` /:id
- `POST` /
- `PATCH` /:id
- `DELETE` /:id
- `POST` /:id/status
- `POST` /:id/duplicate


## lookups

File: `routes/lookups.cjs` or `routes/lookups.js`

**Endpoints: 3**

- `GET` /lookups/project-statuses
- `GET` /lookups/project-types
- `GET` /lookups/projects


## me

File: `routes/me.cjs` or `routes/me.js`

**Endpoints: 1**

- `GET` /


## meta

File: `routes/meta.cjs` or `routes/meta.js`

**Endpoints: 4**

- `GET` /meta/project-options
- `GET` /meta/users
- `GET` /meta/clients
- `GET` /meta/client/:clientId/contacts


## onboarding

File: `routes/onboarding.cjs` or `routes/onboarding.js`

**Endpoints: 13**

- `GET` /
- `GET` /projects
- `POST` /projects
- `PATCH` /projects/:id
- `POST` /forms
- `POST` /invites
- `GET` /progress
- `POST` /responses/submit
- `PATCH` /responses/:id/review
- `GET` /forms
- `GET` /invites
- `GET` /responses
- `POST` /invites/accept


## packages

File: `routes/packages.cjs` or `routes/packages.js`

**Endpoints: 6**

- `PATCH` /packages/:id
- `GET` /packages/:id/check-sourcing
- `GET` /packages/unsourced
- `GET` /packages/:id
- `GET` /packages/:id/milestones
- `POST` /packages/:id/milestones


## packages.actions

File: `routes/packages.actions.cjs` or `routes/packages.actions.js`

**Endpoints: 3**

- `POST` /packages/:id/rfx
- `POST` /packages/:id/internal-resource
- `DELETE` /packages/:id


## packages.directAward

File: `routes/packages.directAward.cjs` or `routes/packages.directAward.js`

**Endpoints: 1**

- `POST` /packages/:id/direct-award


## packages.documents

File: `routes/packages.documents.cjs` or `routes/packages.documents.js`

**Endpoints: 2**

- `GET` /:id/documents
- `POST` /:id/documents


## packages.pricing

File: `routes/packages.pricing.cjs` or `routes/packages.pricing.js`

**Endpoints: 3**

- `GET` /:packageId
- `POST` /create
- `GET` /


## packages.responses

File: `routes/packages.responses.cjs` or `routes/packages.responses.js`

**Endpoints: 3**

- `GET` /:id
- `GET` /
- `POST` /


## packages.seed

File: `routes/packages.seed.cjs` or `routes/packages.seed.js`

**Endpoints: 1**

- `POST` /projects/:projectId/packages:seed


## payment-applications

File: `routes/payment-applications.cjs` or `routes/payment-applications.js`

**Endpoints: 22**

- `GET` /contracts/:contractId/applications
- `POST` /contracts/:contractId/applications
- `GET` /applications/:id
- `PATCH` /applications/:id
- `DELETE` /applications/:id
- `POST` /applications/:id/submit
- `POST` /applications/:id/review
- `GET` /applications/:id/line-items
- `POST` /applications/:id/save-certification-draft
- `POST` /applications/:id/certify
- `POST` /applications/:id/payment-notice
- `POST` /applications/:id/pay-less
- `POST` /applications/:id/approve
- `POST` /applications/:id/record-payment
- `POST` /applications/:id/reject
- `POST` /applications/:id/withdraw
- `POST` /applications/:id/cancel
- `POST` /applications/:id/raise-dispute
- `GET` /projects/:projectId/payment-summary
- `GET` /contracts/:contractId/financial-summary
- `GET` /applications/:id/cost-breakdown
- `GET` /payment-forecasting/:projectId


## procurement

File: `routes/procurement.cjs` or `routes/procurement.js`

**Endpoints: 4**

- `POST` /packages/:packageId/invite
- `POST` /packages/:packageId/submit
- `POST` /submissions/:submissionId/score
- `POST` /packages/:packageId/award


## procurement 2

File: `routes/procurement 2.cjs` or `routes/procurement 2.js`

**Endpoints: 4**

- `POST` /packages/:packageId/invite
- `POST` /packages/:packageId/submit
- `POST` /submissions/:submissionId/score
- `POST` /packages/:packageId/award


## project_alerts

File: `routes/project_alerts.cjs` or `routes/project_alerts.js`

**Endpoints: 1**

- `GET` /:id/alerts


## project_documents

File: `routes/project_documents.cjs` or `routes/project_documents.js`

**Endpoints: 2**

- `GET` /:id/documents
- `POST` /:id/documents


## project_invoices

File: `routes/project_invoices.cjs` or `routes/project_invoices.js`

**Endpoints: 4**

- `GET` /:projectId/invoices
- `GET` /:projectId/invoices/csv
- `POST` /:projectId/invoices
- `POST` /:projectId/invoices/csv/import


## project_members

File: `routes/project_members.cjs` or `routes/project_members.js`

**Endpoints: 3**

- `GET` /:id/members
- `POST` /:id/members
- `DELETE` /:id/members/:memberId


## projects

File: `routes/projects.cjs` or `routes/projects.js`

**Endpoints: 21**

- `GET` /summary
- `GET` /
- `POST` /:projectId/packages
- `GET` /:projectId/packages
- `POST` /:projectId/tenders
- `GET` /:projectId/tenders
- `GET` /tenders/:tenderId
- `PATCH` /tenders/:tenderId
- `GET` /:projectId/variations
- `POST` /:projectId/tenders/:tenderId/bids
- `GET` /csv/export
- `GET` /csv/template
- `POST` /csv/import
- `GET` /:projectId/packages
- `POST` /:projectId/packages
- `GET` /:projectId/contracts
- `GET` /:id
- `POST` /
- `PUT` /:id
- `PATCH` /:id
- `DELETE` /:id


## projects 2

File: `routes/projects 2.cjs` or `routes/projects 2.js`

**Endpoints: 21**

- `GET` /summary
- `GET` /
- `POST` /:projectId/packages
- `GET` /:projectId/packages
- `POST` /:projectId/tenders
- `GET` /:projectId/tenders
- `GET` /tenders/:tenderId
- `PATCH` /tenders/:tenderId
- `GET` /:projectId/variations
- `POST` /:projectId/tenders/:tenderId/bids
- `GET` /csv/export
- `GET` /csv/template
- `POST` /csv/import
- `GET` /:projectId/packages
- `POST` /:projectId/packages
- `GET` /:projectId/contracts
- `GET` /:id
- `POST` /
- `PUT` /:id
- `PATCH` /:id
- `DELETE` /:id


## projects.budget

File: `routes/projects.budget.cjs` or `routes/projects.budget.js`

**Endpoints: 5**

- `GET` /projects/:projectId/budget
- `POST` /projects/:projectId/budget
- `PATCH` /projects/:projectId/budget/:id
- `POST` /projects/:projectId/budgets/import
- `POST` /projects/:projectId/budgets/commit


## projects.budgets

File: `routes/projects.budgets.cjs` or `routes/projects.budgets.js`

**Endpoints: 11**

- `GET` /:projectId/budgets
- `POST` /:projectId/budget-groups
- `PATCH` /:projectId/budgets/:budgetLineId/group
- `POST` /:projectId/budgets
- `PATCH` /:projectId/budgets/:id
- `DELETE` /:projectId/budgets/:id
- `POST` /:projectId/budgets/backfill-amounts
- `PATCH` /:projectId/budgets/reorder
- `PATCH` /:projectId/budget-groups/reorder
- `PATCH` /:projectId/budget-groups/:groupId
- `DELETE` /:projectId/budget-groups/:groupId


## projects.budgets.suggest

File: `routes/projects.budgets.suggest.cjs` or `routes/projects.budgets.suggest.js`

**Endpoints: 2**

- `POST` /:projectId/budgets/suggest
- `POST` /:projectId/budgets/suggest/accept


## projects.contracts

File: `routes/projects.contracts.cjs` or `routes/projects.contracts.js`

**Endpoints: 1**

- `GET` /projects/:projectId/contracts


## projects.cvr

File: `routes/projects.cvr.cjs` or `routes/projects.cvr.js`

**Endpoints: 5**

- `GET` /projects/:projectId/cvr
- `PATCH` /projects/:projectId/cvr/lines/:lineId
- `POST` /projects/:projectId/cvr/refresh
- `POST` /projects/:projectId/cvr/submit
- `POST` /projects/:projectId/cvr/approve


## projects.info

File: `routes/projects.info.cjs` or `routes/projects.info.js`

**Endpoints: 2**

- `GET` /projects/:projectId/info
- `PATCH` /projects/:projectId/info


## projects.overview

File: `routes/projects.overview.cjs` or `routes/projects.overview.js`

**Endpoints: 1**

- `GET` /projects/:projectId/overview


## projects.packages

File: `routes/projects.packages.cjs` or `routes/projects.packages.js`

**Endpoints: 9**

- `GET` /projects/:projectId/packages
- `POST` /projects/:projectId/packages
- `GET` /projects/:projectId/packages/:packageId
- `PATCH` /projects/:projectId/packages/:packageId
- `POST` /projects/:projectId/packages/:packageId/create-tender
- `DELETE` /projects/:projectId/packages/:packageId
- `GET` /packages/:packageId
- `GET` /packages/:packageId/invites
- `GET` /packages/:packageId/submissions


## projects.roles

File: `routes/projects.roles.cjs` or `routes/projects.roles.js`

**Endpoints: 7**

- `GET` /:projectId/roles
- `GET` /:projectId/roles/available
- `POST` /:projectId/roles
- `PUT` /:projectId/roles/:roleId
- `DELETE` /:projectId/roles/:roleId
- `PUT` /:projectId/roles/:roleId/deputy
- `GET` /:projectId/roles/by-user/:userId


## projects.scope

File: `routes/projects.scope.cjs` or `routes/projects.scope.js`

**Endpoints: 5**

- `POST` /projects/:projectId/scope/runs
- `GET` /projects/:projectId/scope/runs/:runId
- `POST` /projects/:projectId/scope/runs/:runId/suggest
- `GET` /projects/:projectId/scope/runs/:runId/suggestions
- `PATCH` /projects/:projectId/scope/runs/:runId/accept


## projects.tenders

File: `routes/projects.tenders.cjs` or `routes/projects.tenders.js`

**Endpoints: 3**

- `GET` /:id/tenders
- `POST` /:id/tenders
- `DELETE` /:projectId/tenders/:tenderId


## projects_overview

File: `routes/projects_overview.cjs` or `routes/projects_overview.js`

**Endpoints: 1**

- `GET` /:id/overview


## public

File: `routes/public.cjs` or `routes/public.js`

**Endpoints: 2**

- `GET` /onboard/:token
- `POST` /onboard/:token


## purchaseOrders

File: `routes/purchaseOrders.cjs` or `routes/purchaseOrders.js`

**Endpoints: 9**

- `GET` /
- `GET` /:id
- `POST` /
- `PATCH` /:id
- `POST` /:id/submit
- `POST` /:id/approve
- `POST` /:id/issue
- `POST` /:id/cancel
- `DELETE` /:id


## qa

File: `routes/qa.cjs` or `routes/qa.js`

**Endpoints: 10**

- `GET` /project/:projectId/summary
- `GET` /records
- `POST` /records
- `GET` /records/:id
- `PATCH` /records/:id
- `DELETE` /records/:id
- `POST` /records/:id/items
- `PATCH` /items/:itemId
- `DELETE` /items/:itemId
- `GET` /records/:id/documents


## reference

File: `routes/reference.cjs` or `routes/reference.js`

**Endpoints: 3**

- `GET` /project-statuses
- `GET` /project-types
- `GET` /task-statuses


## reference 2

File: `routes/reference 2.cjs` or `routes/reference 2.js`

**Endpoints: 3**

- `GET` /project-statuses
- `GET` /project-types
- `GET` /task-statuses


## requests

File: `routes/requests.cjs` or `routes/requests.js`

**Endpoints: 37**

- `GET` /
- `GET` /:id
- `GET` /:id/bundle
- `POST` /
- `PATCH` /:id
- `DELETE` /:id
- `POST` /:id/publish
- `POST` /:id/deadline
- `GET` /:id/sections
- `POST` /:id/sections
- `PATCH` /sections/:sectionId
- `DELETE` /sections/:sectionId
- `GET` /:id/questions
- `POST` /:id/questions
- `PATCH` /questions/:questionId
- `DELETE` /questions/:questionId
- `GET` /:id/invites
- `POST` /:id/invites
- `POST` /:id/invites/:inviteId/resend
- `GET` /:id/qna
- `POST` /:id/qna
- `POST` /qna/:qnaId/answer
- `GET` /:id/responses
- `POST` /:id/responses/submit
- `POST` /:id/scoring/activate
- `GET` /:id/scoring
- `PATCH` /:id/scoring/scale
- `PATCH` /:id/scoring/policy
- `GET` /:id/scoring/status
- `GET` /:id/score/:supplierId/preview
- `POST` /:id/score/:supplierId
- `POST` /:id/award
- `POST` /:id/create-po
- `POST` /:id/duplicate
- `GET` /:id/export
- `GET` /:id/suppliers/summary
- `POST` /import


## rfis

File: `routes/rfis.cjs` or `routes/rfis.js`

**Endpoints: 6**

- `GET` /
- `POST` /
- `GET` /:id
- `PATCH` /:id
- `DELETE` /:id
- `GET` /:id/documents


## rfx

File: `routes/rfx.cjs` or `routes/rfx.js`

**Endpoints: 7**

- `GET` /:projectId/rfx
- `POST` /:projectId/packages/:packageId/push-to-rfx
- `POST` /:projectId/packages/:packageId/rfx
- `POST` /packages/:packageId/rfx
- `GET` /rfx/:rfxId/invites
- `POST` /rfx/:rfxId/invites
- `POST` /rfx/:rfxId/quick-invite


## rfx.analysis

File: `routes/rfx.analysis.cjs` or `routes/rfx.analysis.js`

**Endpoints: 1**

- `GET` /rfx/:rfxId/analysis.xlsx.xml


## rfx.builder

File: `routes/rfx.builder.cjs` or `routes/rfx.builder.js`

**Endpoints: 17**

- `GET` /:rfxId/sections
- `POST` /:rfxId/sections
- `PATCH` /sections/:id
- `DELETE` /sections/:id
- `GET` /:rfxId/questions
- `POST` /:rfxId/questions
- `PATCH` /questions/:id
- `DELETE` /questions/:id
- `GET` /:rfxId/criteria
- `POST` /:rfxId/criteria
- `PATCH` /criteria/:id
- `DELETE` /criteria/:id
- `GET` /:rfxId/invites
- `POST` /:rfxId/invites
- `POST` /invites/:id/send
- `POST` /:rfxId/apply-template/:templateId
- `POST` /:rfxId/issue


## rfx.email

File: `routes/rfx.email.cjs` or `routes/rfx.email.js`

**Endpoints: 1**

- `POST` /rfx/:rfxId/send


## rfx.invitesSend

File: `routes/rfx.invitesSend.cjs` or `routes/rfx.invitesSend.js`

**Endpoints: 3**

- `POST` /:rfxId/send-invites
- `POST` /invites/:inviteId/resend
- `POST` /invites/:inviteId/remove


## rfx.public

File: `routes/rfx.public.cjs` or `routes/rfx.public.js`

**Endpoints: 3**

- `GET` /respond/:responseToken
- `POST` /respond/:responseToken/save
- `POST` /respond/:responseToken/submit


## rfx.responses

File: `routes/rfx.responses.cjs` or `routes/rfx.responses.js`

**Endpoints: 3**

- `POST` /rfx/:rfxId/upload-response
- `GET` /rfx/:rfxId/submissions
- `PATCH` /rfx/submissions/:submissionId


## rfx.state

File: `routes/rfx.state.cjs` or `routes/rfx.state.js`

**Endpoints: 4**

- `GET` /:rfxId
- `POST` /:rfxId/publish
- `POST` /:rfxId/extend-deadline
- `POST` /:rfxId/invites


## rfx.templates

File: `routes/rfx.templates.cjs` or `routes/rfx.templates.js`

**Endpoints: 1**

- `POST` /rfx/:rfxId/template


## roles

File: `routes/roles.cjs` or `routes/roles.js`

**Endpoints: 1**

- `GET` /


## scope.assist

File: `routes/scope.assist.cjs` or `routes/scope.assist.js`

**Endpoints: 1**

- `POST` /scope/assist/projects/:projectId/suggest


## search

File: `routes/search.cjs` or `routes/search.js`

**Endpoints: 1**

- `GET` /


## settings.approvals

File: `routes/settings.approvals.cjs` or `routes/settings.approvals.js`

**Endpoints: 8**

- `GET` /thresholds
- `GET` /thresholds/by-entity/:entityType
- `GET` /thresholds/:id
- `POST` /thresholds
- `PUT` /thresholds/:id
- `DELETE` /thresholds/:id
- `POST` /thresholds/:id/test
- `GET` /thresholds/match/:entityType/:value


## settings.emailTemplates

File: `routes/settings.emailTemplates.cjs` or `routes/settings.emailTemplates.js`

**Endpoints: 5**

- `GET` /
- `GET` /:id
- `POST` /
- `PATCH` /:id
- `DELETE` /:id


## settings.tenderTemplates

File: `routes/settings.tenderTemplates.cjs` or `routes/settings.tenderTemplates.js`

**Endpoints: 5**

- `GET` /
- `GET` /:id
- `POST` /
- `PATCH` /:id
- `DELETE` /:id


## settings.v1

File: `routes/settings.v1.cjs` or `routes/settings.v1.js`

**Endpoints: 10**

- `GET` /taxonomies
- `GET` /taxonomies/:key
- `POST` /taxonomies
- `POST` /taxonomies/:key/terms
- `PATCH` /taxonomies/:key
- `POST` /taxonomies/:key/import
- `GET` /taxonomies/:key/export
- `GET` /tenant
- `PATCH` /tenant
- `PATCH` /tenant/self-supplier


## spm

File: `routes/spm.cjs` or `routes/spm.js`

**Endpoints: 11**

- `GET` /templates
- `GET` /templates/:id
- `POST` /templates
- `PATCH` /templates/:id
- `POST` /templates/:id/publish
- `POST` /templates/:id/unpublish
- `GET` /scorecards
- `GET` /scorecards/:id
- `POST` /scorecards
- `PATCH` /scorecards/:id/score
- `GET` /suppliers/:supplierId/trend


## suppliers

File: `routes/suppliers.cjs` or `routes/suppliers.js`

**Endpoints: 11**

- `GET` /
- `GET` /qualified
- `GET` /:id
- `GET` /:id/compliance
- `POST` /
- `PUT` /:id
- `DELETE` /:id
- `POST` /onboarding-links
- `GET` /:id/contracts
- `POST` /:id/onboarding-link
- `GET` /:id/overview


## tasks

File: `routes/tasks.cjs` or `routes/tasks.js`

**Endpoints: 9**

- `GET` /summary
- `GET` /
- `GET` /csv/export
- `GET` /csv/template
- `POST` /csv/import
- `GET` /:id
- `POST` /
- `PUT` /:id
- `DELETE` /:id


## tasks 2

File: `routes/tasks 2.cjs` or `routes/tasks 2.js`

**Endpoints: 9**

- `GET` /summary
- `GET` /
- `GET` /csv/export
- `GET` /csv/template
- `POST` /csv/import
- `GET` /:id
- `POST` /
- `PUT` /:id
- `DELETE` /:id


## taxonomy

File: `routes/taxonomy.cjs` or `routes/taxonomy.js`

**Endpoints: 4**

- `GET` /taxonomy/packages
- `POST` /taxonomy/packages
- `PATCH` /taxonomy/packages/:code
- `DELETE` /taxonomy/packages/:code


## tenders

File: `routes/tenders.cjs` or `routes/tenders.js`

**Endpoints: 13**

- `POST` /create
- `GET` /list
- `GET` /
- `POST` /:tenderId/invites
- `GET` /:tenderId/invites
- `GET` /public/rfx/:token
- `POST` /public/rfx/:token/submit
- `POST` /:tenderId/manual-response
- `PATCH` /:tenderId/responses/:responseId/reject
- `GET` /:tenderId/invites/with-links
- `GET` /:tenderId/responses
- `PATCH` /:tenderId/responses/:responseId/score
- `POST` /:tenderId/award


## tenders.builder

File: `routes/tenders.builder.cjs` or `routes/tenders.builder.js`

**Endpoints: 8**

- `GET` /:tenderId/sections
- `POST` /:tenderId/sections
- `PUT` /sections/:id
- `DELETE` /sections/:id
- `GET` /:tenderId/questions
- `POST` /:tenderId/questions
- `PUT` /questions/:id
- `DELETE` /questions/:id


## tenders.clarifications

File: `routes/tenders.clarifications.cjs` or `routes/tenders.clarifications.js`

**Endpoints: 3**

- `GET` /:tenderId/clarifications
- `POST` /:tenderId/clarifications
- `PUT` /clarifications/:id/answer


## tenders.combined

File: `routes/tenders.combined.cjs` or `routes/tenders.combined.js`

**Endpoints: 6**

- `GET` /:tenderId/full
- `PATCH` /:tenderId
- `POST` /:tenderId/publish
- `POST` /:tenderId/extend
- `POST` /:tenderId/qna
- `POST` /:tenderId/suggest-questions


## tenders.create

File: `routes/tenders.create.cjs` or `routes/tenders.create.js`

**Endpoints: 1**

- `POST` /:projectId/from-package


## tenders.documents

File: `routes/tenders.documents.cjs` or `routes/tenders.documents.js`

**Endpoints: 4**

- `GET` /:tenderId/documents
- `POST` /:tenderId/documents
- `POST` /:tenderId/documents/:documentId/track-download
- `DELETE` /:tenderId/documents/:documentId


## tenders.invitations

File: `routes/tenders.invitations.cjs` or `routes/tenders.invitations.js`

**Endpoints: 6**

- `GET` /:tenderId/invitations
- `POST` /:tenderId/invitations
- `GET` /:tenderId/invitations/:invitationId
- `DELETE` /:tenderId/invitations/:invitationId
- `PUT` /:tenderId/invitations/:invitationId/track-view
- `POST` /:tenderId/quick-invite


## tenders.package-copy

File: `routes/tenders.package-copy.cjs` or `routes/tenders.package-copy.js`

**Endpoints: 2**

- `POST` /:tenderId/copy-from-package
- `GET` /:tenderId/package-info


## tenders.portal

File: `routes/tenders.portal.cjs` or `routes/tenders.portal.js`

**Endpoints: 5**

- `GET` /portal/:token
- `POST` /portal/:token/save
- `POST` /portal/:token/submit
- `POST` /portal/:token/qna
- `GET` /portal/:token/qna


## tenders.portal.qna

File: `routes/tenders.portal.qna.cjs` or `routes/tenders.portal.qna.js`

**Endpoints: 2**

- `GET` /:token/qna
- `POST` /:token/qna


## tenders.qna

File: `routes/tenders.qna.cjs` or `routes/tenders.qna.js`

**Endpoints: 6**

- `GET` /:rfxId/qna
- `POST` /:rfxId/qna
- `PATCH` /:rfxId/qna/:id
- `POST` /:rfxId/qna/:id/publish
- `POST` /:rfxId/qna/:id/lock
- `POST` /:rfxId/qna/close-all


## tenders.scoring

File: `routes/tenders.scoring.cjs` or `routes/tenders.scoring.js`

**Endpoints: 4**

- `POST` /tenders/:id/criteria
- `POST` /tenders/:id/score/auto
- `POST` /tenders/:id/score/manual
- `GET` /tenders/:id/register


## tenders.workflow

File: `routes/tenders.workflow.cjs` or `routes/tenders.workflow.js`

**Endpoints: 8**

- `POST` /:tenderId/generate-recommendation-report
- `POST` /:tenderId/request-approval
- `POST` /:tenderId/approvals/:approvalId/respond
- `POST` /:tenderId/send-award-notifications
- `POST` /:tenderId/generate-contract
- `GET` /:tenderId/analytics
- `GET` /:tenderId/benchmarks
- `POST` /:tenderId/export-comparison


## timeEntries

File: `routes/timeEntries.cjs` or `routes/timeEntries.js`

**Endpoints: 14**

- `POST` /clock-in
- `POST` /:id/clock-out
- `POST` /:id/break-start
- `POST` /:id/break-end
- `POST` /:id/submit
- `POST` /:id/approve
- `POST` /:id/reject
- `GET` /
- `GET` /my-time
- `GET` /pending-approval
- `GET` /timesheet
- `GET` /:id
- `PATCH` /:id
- `DELETE` /:id


## trades

File: `routes/trades.cjs` or `routes/trades.js`

**Endpoints: 2**

- `GET` /trades
- `POST` /trades


## upload

File: `routes/upload.cjs` or `routes/upload.js`

**Endpoints: 3**

- `POST` /
- `GET` /:filename
- `DELETE` /:filename


## users

File: `routes/users.cjs` or `routes/users.js`

**Endpoints: 1**

- `GET` /


## variations

File: `routes/variations.cjs` or `routes/variations.js`

**Endpoints: 5**

- `GET` /variations
- `GET` /projects/:projectId/variations
- `POST` /projects/:projectId/variations
- `PATCH` /variations/:id/approve
- `PATCH` /variations/:id/reject


## variations-enhanced

File: `routes/variations-enhanced.cjs` or `routes/variations-enhanced.js`

**Endpoints: 14**

- `GET` /variations
- `GET` /contracts/:contractId/variations
- `GET` /variations/:id
- `POST` /contracts/:contractId/variations
- `PUT` /variations/:id
- `POST` /variations/:id/quotation/request
- `POST` /variations/:id/quotation/submit
- `POST` /variations/:id/approve
- `POST` /variations/:id/reject
- `POST` /variations/:id/documents
- `GET` /variations/:id/documents
- `POST` /variations/:id/comments
- `GET` /variations/:id/comments
- `DELETE` /variations/:id


## workers

File: `routes/workers.cjs` or `routes/workers.js`

**Endpoints: 12**

- `GET` /
- `GET` /:id
- `POST` /
- `PATCH` /:id
- `DELETE` /:id
- `POST` /:id/skills
- `POST` /:id/certifications
- `DELETE` /:id/certifications/:certName
- `GET` /:id/availability
- `POST` /:id/time-off
- `PATCH` /:id/time-off/:requestId
- `POST` /:id/location



## Summary Statistics

Total Modules: 135
Total Endpoints: 783

Endpoints by HTTP Method:
- DELETE: 62
- GET: 321
- PATCH: 69
- POST: 302
- PUT: 29
