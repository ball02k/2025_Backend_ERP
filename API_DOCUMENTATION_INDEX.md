# 2025 ERP Backend API Documentation Index

**Last Updated:** 2025-11-23  
**Repository:** 2025_Backend_ERP

---

## Overview

This documentation package provides comprehensive coverage of all API routes in the 2025 ERP Backend system. There are 123 route modules containing 563+ total endpoints across all functional domains.

---

## Documentation Files

### 1. API_QUICK_REFERENCE.md (14 KB)
**Best For:** Quick lookups, developers, integration testing

Contains:
- Most critical endpoints by use case
- Common workflows (procurement, payments, projects)
- Query parameters and response codes
- Authentication flow
- Error handling
- Data types and formats

**Start here if:** You need to quickly find an endpoint or understand a workflow

---

### 2. API_ROUTES_SUMMARY.md (14 KB)
**Best For:** Architecture overview, module organization, statistics

Contains:
- Executive summary with key statistics
- 12 core functional domains:
  1. Authentication & Authorization
  2. Project Management
  3. Procurement & Purchasing
  4. Tendering & RFx
  5. Contracts
  6. Finance & Payments
  7. Variations & Change Control
  8. Suppliers & Client Management
  9. Quality Assurance & Safety
  10. Documentation & Attachments
  11. Analytics & Reporting
  12. Miscellaneous & Integration
- HTTP method distribution
- Module dependencies
- Development routes

**Start here if:** You want to understand the overall system structure

---

### 3. API_ROUTES_DOCUMENTATION.md (37 KB)
**Best For:** Complete reference, detailed endpoint listings

Contains:
- Complete index of all 123 modules
- Detailed endpoint list for each module
- Endpoint count by module
- Organized by HTTP method

**Start here if:** You need a comprehensive list of all endpoints

---

### 4. API_CATALOG.md (47 KB)
**Best For:** Legacy reference, detailed specifications

Contains:
- Comprehensive endpoint catalog
- Historical documentation
- May contain outdated information
- Use in conjunction with other docs

---

## How to Use This Documentation

### Scenario 1: "I need to list all projects"
1. Start: API_QUICK_REFERENCE.md - "Project Lifecycle" section
2. Find: `GET /projects/`
3. Reference: API_ROUTES_DOCUMENTATION.md for complete endpoint details

### Scenario 2: "How do payment applications work?"
1. Start: API_QUICK_REFERENCE.md - "Payment Applications" section
2. Read: The complete workflow with status transitions
3. Deep dive: API_ROUTES_SUMMARY.md - "Finance & Payments" domain

### Scenario 3: "What modules are involved in procurement?"
1. Start: API_ROUTES_SUMMARY.md - "Procurement & Purchasing" section
2. Review: Each module and its endpoint count
3. Reference: API_ROUTES_DOCUMENTATION.md for specific endpoints

### Scenario 4: "I need to implement a complete workflow"
1. Start: API_QUICK_REFERENCE.md - "Common Workflows" section
2. Choose: Relevant workflow (procurement, payments, projects)
3. Implement: Following the step-by-step API calls

---

## Key Statistics

| Metric | Value |
|--------|-------|
| Total Route Modules | 123 |
| Total API Endpoints | 563+ |
| GET Endpoints | 262 |
| POST Endpoints | 197 |
| PATCH Endpoints | 70 |
| PUT Endpoints | 24 |
| DELETE Endpoints | 10 |
| Core Domains | 12 |

---

## Core Domains at a Glance

### 1. Authentication & Authorization
- **Modules:** auth, auth.dev, roles, approvals (4 modules)
- **Key Endpoints:** register, login, approvals workflow
- **Priority:** CRITICAL - Required for all operations

### 2. Project Management (25 modules)
- Projects, packages, budgets, CVR, team roles
- **Key Operations:** Create, list, update projects and sub-resources
- **Priority:** HIGH - Foundation for all other modules

### 3. Procurement (12 modules)
- RFx/RFP management, packages, suppliers
- **Key Operations:** Create RFx, send invitations, evaluate responses, award
- **Priority:** HIGH - Core business function

### 4. Finance & Payments (15 modules)
- Payment applications, invoices, CVR, budget allocations
- **Key Operations:** Payment workflow, invoice matching, financial reconciliation
- **Priority:** CRITICAL - Legally important (UK Construction Act)

### 5. Contracts (7 modules)
- Contract management, templates, valuations
- **Key Operations:** Create, issue, sign, archive contracts
- **Priority:** HIGH - Legal documents

### 6. Quality & Safety (2 modules)
- QA records, Health & Safety events
- **Key Operations:** Track QA/HS incidents
- **Priority:** MEDIUM

### 7. Documents (6 modules)
- Document management, links, project documents
- **Key Operations:** Upload, link, retrieve documents
- **Priority:** MEDIUM

---

## Common Workflows

### Project Setup (Time: ~15 minutes)
```
1. Create Project          → POST /projects/
2. Setup Budget           → POST /projects/:projectId/budgets
3. Add Team Members       → POST /projects/:projectId/members
4. Create Packages        → POST /projects/:projectId/packages
5. Start Procurement      → POST /packages/:id/rfx
```

### Procurement Cycle (Time: Variable, typically weeks)
```
1. Create RFx             → POST /rfx/:projectId/packages/:packageId/rfx
2. Publish RFx            → POST /rfx/:rfxId/publish
3. Send Invitations       → POST /rfx/:rfxId/invites
4. Receive Submissions    → GET /rfx/:rfxId/submissions
5. Award Package          → POST /packages/:packageId/award
```

### Payment Processing (Time: ~3-5 days)
```
1. Create Application     → POST /contracts/:contractId/applications
2. Submit for Review      → POST /applications/:id/submit
3. QS Certifies           → POST /applications/:id/certify
4. Final Approval         → POST /applications/:id/approve
5. Record Payment         → POST /applications/:id/record-payment
```

---

## Authentication & Security

### Required for All Calls
- **Authentication:** Bearer JWT token in `Authorization` header
- **Validation:** Token validated on every request
- **Expiration:** Default 7 days (configurable)

### Public Endpoints (No Auth Required)
- `POST /auth/register` - Register new user
- `POST /auth/login` - Get JWT token
- `GET /onboard/:token` - Onboarding access
- `POST /onboard/:token` - Submit onboarding
- `POST /respond/:responseToken` - Public RFx response

### Permission-Based Access
Some endpoints require specific permissions:
- `jobs:view`, `jobs:create`, `jobs:update`, `jobs:delete`
- `equipment:view`, `equipment:create`, `equipment:update`, `equipment:delete`
- `approvals_override` - Override approval workflows
- `analytics_view` - View analytics
- `project_manage` - Manage projects

---

## HTTP Methods & Patterns

### GET - Data Retrieval
- List resources with pagination
- Get single resource details
- 262 endpoints across the system

### POST - Create & Action
- Create new resources
- Perform state transitions/actions
- 197 endpoints (largest group)

### PATCH - Partial Update
- Update specific fields
- Change status
- 70 endpoints

### PUT - Full Update
- Replace entire resource
- 24 endpoints

### DELETE - Remove
- Delete resources
- 10 endpoints

---

## Error Handling

### Standard Error Response
```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description"
}
```

### HTTP Status Codes
| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 500 | Server Error |

---

## Data Formats

### Decimal (Currency)
- Format: String or number
- Precision: Preserved via Prisma Decimal
- Examples: "1234.56", "0.01"

### Dates
- Format: ISO 8601 ("2025-01-15T10:30:00Z")
- Or: "2025-01-15"

### IDs
- Numeric: 123, 456
- String: "abc-123-def"

---

## File Locations

| Item | Path |
|------|------|
| Route Files | `/routes/` (123 files) |
| Middleware | `/middleware/` |
| Services | `/services/` |
| Validators | `/validators/` |
| Database Schema | `/prisma/schema.prisma` |
| Configuration | `.env` or environment |

---

## For Different Audiences

### Frontend Developer
1. **Read:** API_QUICK_REFERENCE.md
2. **Understand:** Common workflows section
3. **Reference:** API_ROUTES_DOCUMENTATION.md for details
4. **Tools:** Use Postman with exported collection

### Backend Developer
1. **Read:** API_ROUTES_SUMMARY.md (architecture overview)
2. **Review:** Relevant route files in `/routes/`
3. **Reference:** API_ROUTES_DOCUMENTATION.md
4. **Debug:** Use `/dev-token` for local testing

### Project Manager / Business Analyst
1. **Read:** API_ROUTES_SUMMARY.md (domain organization)
2. **Focus:** Understand key workflows
3. **Reference:** Specific modules for your domain

### QA / Tester
1. **Read:** API_QUICK_REFERENCE.md
2. **Study:** Common workflows section
3. **Use:** For test case creation
4. **Reference:** Error handling section

### DevOps / Ops
1. **Read:** API_ROUTES_SUMMARY.md
2. **Check:** Public/protected endpoints
3. **Monitor:** Authentication/security related endpoints
4. **Reference:** File locations and configuration

---

## Quick Links by Domain

**Authentication:** [API_QUICK_REFERENCE.md#authentication--setup](file://)

**Projects:** [API_QUICK_REFERENCE.md#project-lifecycle](file://)

**Procurement:** [API_ROUTES_SUMMARY.md#3-procurement--purchasing](file://)

**Payment Applications:** [API_QUICK_REFERENCE.md#payment-applications](file://)

**Finance:** [API_ROUTES_SUMMARY.md#6-finance--payments](file://)

**Contracts:** [API_QUICK_REFERENCE.md#contract-management](file://)

**Workflows:** [API_QUICK_REFERENCE.md#common-workflows](file://)

---

## Updating This Documentation

### When New Endpoints Are Added
1. Update the relevant route file
2. Re-run endpoint extraction script
3. Update API_ROUTES_DOCUMENTATION.md
4. Update API_ROUTES_SUMMARY.md if adding new domain
5. Update API_QUICK_REFERENCE.md for common endpoints

### Extraction Script Location
```bash
# Script to regenerate documentation
/tmp/extract_endpoints.js
```

---

## Support & Troubleshooting

### "I can't find an endpoint"
1. Check API_ROUTES_DOCUMENTATION.md (complete list)
2. Search by keyword in API_ROUTES_SUMMARY.md
3. Check if it's a development-only endpoint

### "Authentication is failing"
1. Verify Bearer token in Authorization header
2. Check token expiration (default: 7 days)
3. Use `/auth/login` to get fresh token
4. For dev: use `/dev-token`

### "I'm getting permission denied"
1. Check if endpoint requires specific permission
2. Review user roles and permissions
3. See authentication section above

### "I don't understand a workflow"
1. Check API_QUICK_REFERENCE.md - "Common Workflows"
2. Follow step-by-step API calls
3. Review status codes and transitions

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-23 | Initial comprehensive documentation |

---

## Contact & Questions

For questions about the API:
1. Check this documentation first
2. Search existing code in `/routes/` for examples
3. Check service layer in `/services/`
4. Review database schema in `/prisma/schema.prisma`

---

**Total Documentation Pages:** 5  
**Total Content:** ~5,260 lines  
**Last Generated:** 2025-11-23  
**Route Files Analyzed:** 123 modules  
**Total Endpoints Cataloged:** 563+

*This documentation is auto-generated from source code route definitions.*
