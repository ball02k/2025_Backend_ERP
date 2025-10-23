# 🏗️ Construction ERP – UNBUILT BACKLOG
*Last updated: 20 October 2025 (Europe/London)*

This document tracks every feature, workflow, and system layer that has been **researched, planned, or prototyped** but **not yet implemented or functioning** within the Construction ERP codebase.
It serves as a bridge between design intent and shipped functionality — to ensure nothing researched or scoped is forgotten.

---

## 🔖 Status Legend
- 🟥 **Missing** – Not present in code at all.
- 🟧 **Partial** – Some UI or backend present, but incomplete.
- 🟨 **Regressed/Broken** – Previously worked but no longer functional.
- 🟦 **Open Issue** – Known technical fault or blocker.

---

## 1️⃣ Procurement, Tendering, Awards & Contracts
| Item | Status | Notes |
|------|---------|-------|
| Direct Award → Contract generation | 🟧 Partial | UI modal exists, but line selection/"Award All" logic and contract generation missing. |
| Direct Award modal (Award all / Select lines, live totals, reason codes) | 🟥 Missing | Needs validation and total calculation. |
| RFx / e-Tendering (invites, Q&A, deadlines, submissions, clarifications) | 🟥 Missing | No backend or UI yet. |
| Scoring engine (weighted criteria, auto + manual, overrides, audit) | 🟥 Missing | Planned for tender evaluation. |
| Award recommendation + tie-break rules | 🟥 Missing | To sit after scoring stage. |
| Compliance gate before award | 🟥 Missing | Block award if supplier docs expired; allow override with reason & audit. |
| Contract Repository (searchable, linked to Project/Package/Supplier) | 🟥 Missing | To include JCT/NEC metadata. |
| Procurement milestones seeded from award & lead times | 🟥 Missing | To drive procurement timeline. |

---

## 2️⃣ Budgets, Packages & CVR
| Item | Status | Notes |
|------|---------|-------|
| "Suggest Packages" AI | 🟨 Regressed | Previously existed; non-functional. |
| Drag & drop budget line items between groups | 🟨 Regressed | UI not persisting movement. |
| Qty/Rate persistently visible in all budget views | 🟨 Regressed | Displays 0 despite totals. |
| CVR auto-update from POs/invoices/variations (with explainability) | 🟥 Missing | Critical QS feature. |
| Monthly CVR snapshots & margin trend | 🟥 Missing | Needed for reports dashboard. |

---

## 3️⃣ Clients, Contacts & Cross-Links
| Item | Status | Notes |
|------|---------|-------|
| Contacts DB (Prisma + CRUD + domain auto-link) | 🟥 Missing | Separate model required. |
| /contacts + /clients/:id/contacts endpoints | 🟥 Missing | To list linked contacts. |
| Client Details – Projects tab (multi-select filters) | 🟧 Partial | UI scaffolded, filters not working. |
| Client Details – Contacts tab | 🟥 Missing | Awaiting Contacts DB. |
| Live edit + save button (writes to DB) | 🟧 Partial | Save incomplete. |
| Quick-add Client modal (dropdown + top bar) | 🟥 Missing | Planned for inline creation. |
| Cross-links between entities (≤2 clicks) | 🟧 Partial | Some links exist, not complete. |

---

## 4️⃣ Dashboard & UX
| Item | Status | Notes |
|------|---------|-------|
| Homepage component rebuild (TopBar, NotificationPanel, etc.) | 🟧 Partial | Layout in progress. |
| Widgets using live DB data (SnapshotWidgets.jsx, ModuleBlocks.jsx) | 🟧 Partial | Placeholder data only. |
| GlobalSearchBar (type-ahead, user-specific settings) | 🟧 Partial | UI complete, backend not wired. |
| Notification bell → right-side slide-out | 🟥 Missing | Needs component + endpoint. |
| Role snapshots (PM/QS) with warnings | 🟧 Partial | Basic structure only. |
| Sidebar collapse/expand control | 🟥 Missing | UX enhancement. |
| Project list mini-dashboards | 🟨 Regressed | Old widgets not rendering. |

---

## 5️⃣ Settings, Standards & Taxonomies
| Item | Status | Notes |
|------|---------|-------|
| Taxonomies (UK construction standards, trades, cost codes) | 🟥 Missing | Populate via Settings module. |
| Contract type drives workflow (NEC/JCT logic) | 🟥 Missing | Dynamic field exposure required. |

---

## 6️⃣ Documents, OCR & Imports
| Item | Status | Notes |
|------|---------|-------|
| OCR import path (PDF → structured data) | 🟥 Missing | Planned open-source OCR integration. |
| Import dropdown (CSV or PDF OCR) on Budgets | 🟥 Missing | Replace single import button. |
| CSV upload "skipped rows" popup | 🟥 Missing | UX addition. |
| Document repository cross-links | 🟧 Partial | Base exists, links incomplete. |

---

## 7️⃣ Integrations & Data Services
| Item | Status | Notes |
|------|---------|-------|
| Companies House API integration | 🟥 Missing | For registration & turnover. |
| CreditSafe / D&B integration | 🟥 Missing | For credit scoring. |
| HMRC VAT check | 🟥 Missing | Validation endpoint. |
| Public Developer API hub (docs + tokens) | 🟥 Missing | For third-party interoperability. |

---

## 8️⃣ AI, Risk & Carbon (Future Layer)
| Item | Status | Notes |
|------|---------|-------|
| AI Risk Engine (delay, overspend, compliance, carbon predictions) | 🟥 Missing | Research complete, architecture pending. |
| Market Intelligence layer (anonymised cross-tenant data) | 🟥 Missing | For supplier benchmarking. |
| Carbon module (Scopes 1–3) | 🟥 Missing | Linked to procurement & site data. |

---

## 9️⃣ Security, Auditing & Licensing
| Item | Status | Notes |
|------|---------|-------|
| Immutable audit on every CUD | 🟧 Partial | Some models audited. |
| RBAC least-privilege (PM/QS/Buyer/Ops) | 🟧 Partial | Not enforced globally. |
| Feature flags/licensing per tenant/user | 🟥 Missing | Needed for modular packaging. |

---

## 🔟 Observability, Performance, Accessibility
| Item | Status | Notes |
|------|---------|-------|
| Structured logs (req/trace ID, tenant ID) | 🟧 Partial | Extend to all routes. |
| p95 API <300ms, pagination/indexes | 🟧 Partial | To verify per module. |
| WCAG 2.2 AA accessibility | 🟧 Partial | Needs audit & fixes. |

---

## 🧰 Build/Infra & Developer Experience
| Item | Status | Notes |
|------|---------|-------|
| Vite/Babel "£" import error | 🟦 Open Issue | Prevents build; fix import alias. |
| OpenAPI pull failing on Render build | 🟦 Open Issue | Prebuild hitting :3001 locally. |
| /api/packages/:id returning 500 | 🟦 Open Issue | Needs backend debug. |
| Prisma BigInt/Int handling consistency | 🟦 Open Issue | Follow 2025-08-15 guideline. |
| Codex guardrails (no breaking schema/routes) | 🟥 Missing | Reinstate safety script. |

---

## 🚀 Next 5 to Build (Immediate Impact)
1. **Fix Direct Award modal** → award-all/select-lines + live totals.
2. **Contract generation from Award** → Contract Repo + links + audit.
3. **Supplier compliance gate** → block/override with reason.
4. **Procurement milestones auto-seed from award lead times.**
5. **Basic e-Tendering (create RFx, send invites, track submissions).**

These unlock the full **Award → Contract** workflow and allow **predictive risk hooks** later.

---

## 🧾 Developer Instructions
- Keep this file updated as features are shipped.
- Use ✅ for completed items.
- Commit with message: `docs: update UNBUILT_BACKLOG [feature-name]`
