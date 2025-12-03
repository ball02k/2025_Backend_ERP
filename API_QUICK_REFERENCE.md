# API Quick Reference Guide

**Last Updated:** 2025-11-23  
**Version:** 1.0

---

## Most Critical API Endpoints by Use Case

### Authentication & Setup
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/register` | POST | Register new user |
| `/auth/login` | POST | User login, get JWT token |
| `/auth/me` | GET | Get current user profile |
| `/dev-token` | GET | Dev environment token (dev only) |

### Project Lifecycle
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/projects/` | GET | List all projects |
| `/projects/` | POST | Create new project |
| `/projects/:id` | GET | Get project details |
| `/projects/:id` | PUT | Update project |
| `/projects/:projectId/overview` | GET | Get project dashboard |
| `/projects/:projectId/budgets` | GET | Get project budgets |
| `/projects/:projectId/packages` | GET | List packages in project |

### Package & Procurement Setup
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/projects/:projectId/packages` | POST | Create package/lot |
| `/packages/:id` | GET | Get package details |
| `/packages/:id/check-sourcing` | GET | Check if package is sourced |
| `/packages/:id/rfx` | POST | Create RFx from package |
| `/packages/:id/award` | POST | Award package to supplier |

### RFx (RFP/RFQ/RFT) Management
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/rfx/:projectId/rfx` | GET | List RFx documents |
| `/rfx/:projectId/packages/:packageId/rfx` | POST | Create RFx |
| `/rfx/:rfxId` | GET | Get RFx details |
| `/rfx/:rfxId/publish` | POST | Publish RFx to suppliers |
| `/rfx/:rfxId/sections` | GET | Get RFx sections |
| `/rfx/:rfxId/questions` | GET | Get RFx questions |
| `/rfx/:rfxId/invites` | GET | Get supplier invitations |
| `/rfx/:rfxId/submissions` | GET | Get supplier submissions |

### Newer Request/RFP Module
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/requests/` | GET | List RFP requests |
| `/requests/` | POST | Create RFP request |
| `/requests/:id/publish` | POST | Publish request |
| `/requests/:id/sections` | GET | Get sections |
| `/requests/:id/questions` | GET | Get questions |
| `/requests/:id/invites` | POST | Send invites to suppliers |
| `/requests/:id/responses` | GET | Get supplier responses |
| `/requests/:id/award` | POST | Award request |

### Contract Management
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/contracts/` | GET | List all contracts |
| `/contracts/` | POST | Create new contract |
| `/contracts/:id` | GET | Get contract details |
| `/contracts/:id` | PUT | Update contract |
| `/contracts/:id/issue` | POST | Issue contract |
| `/contracts/:id/send-for-signature` | POST | Send for digital signature |
| `/contracts/:id/mark-signed` | POST | Mark contract as signed |
| `/contract-templates/` | GET | List contract templates |

### Payment Applications (UK Construction Act)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/contracts/:contractId/applications` | GET | List payment applications |
| `/contracts/:contractId/applications` | POST | Create payment application |
| `/applications/:id` | GET | Get application details |
| `/applications/:id/submit` | POST | Submit for review |
| `/applications/:id/review` | POST | QS starts review |
| `/applications/:id/certify` | POST | QS certifies (UNDER_REVIEW -> CERTIFIED) |
| `/applications/:id/payment-notice` | POST | Issue payment notice |
| `/applications/:id/pay-less` | POST | Issue pay-less notice |
| `/applications/:id/approve` | POST | Final approval |
| `/applications/:id/record-payment` | POST | Record actual payment |
| `/applications/:id/reject` | POST | Reject application |
| `/applications/:id/raise-dispute` | POST | Raise dispute on pay-less |

### Payment Application Status Flow
```
DRAFT -> SUBMITTED -> UNDER_REVIEW -> CERTIFIED -> PAYMENT_NOTICE_SENT -> APPROVED -> PAID
                                                    or
                                                 PAY_LESS_ISSUED -> APPROVED -> PAID
                                                    or
                                                    DISPUTED -> UNDER_REVIEW
```

### Finance & CVR (Cost Value Reconciliation)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/financials/` | GET | Get financial overview |
| `/projects/:projectId/cvr` | GET | Get CVR for project |
| `/projects/:projectId/cvr/refresh` | POST | Refresh CVR calculations |
| `/projects/:projectId/cvr/submit` | POST | Submit CVR for approval |
| `/cvr/summary` | GET | Get CVR summary |
| `/cvr/commitment` | POST | Create commitment |
| `/cvr/actual` | POST | Create actual cost record |

### Budget Management
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/projects/:projectId/budgets` | GET | Get project budgets |
| `/projects/:projectId/budgets` | POST | Create budget line |
| `/projects/:projectId/budgets/:id` | PATCH | Update budget line |
| `/projects/:projectId/budgets/:id` | DELETE | Delete budget line |
| `/allocations/categories` | GET | Get allocation categories |
| `/allocations/budget-line/:budgetLineId` | GET | Get allocations |
| `/allocations/budget-line/:budgetLineId` | POST | Create/update allocations |

### Variations (Change Orders)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/projects/:projectId/variations` | GET | List variations |
| `/projects/:projectId/variations` | POST | Create variation |
| `/variations/:id/approve` | PATCH | Approve variation |
| `/variations/:id/reject` | PATCH | Reject variation |

### Invoicing
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/finance/invoices` | GET | List invoices |
| `/finance/invoices` | POST | Create invoice |
| `/finance/invoices/:id` | GET | Get invoice details |
| `/finance/invoices/:id/approve` | POST | Approve invoice |
| `/invoices/:id/match` | POST | Match to PO |

### Purchase Orders (Finance Module)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/finance/pos` | GET | List POs |
| `/finance/pos` | POST | Create PO |
| `/finance/pos/:id` | GET | Get PO details |
| `/finance/pos/:id/receipt` | POST | Record receipt |
| `/finance/pos/:id/close` | POST | Close PO |

### Quality Assurance
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/qa/records` | GET | List QA records |
| `/qa/records` | POST | Create QA record |
| `/qa/records/:id/items` | POST | Add QA item |

### Health & Safety
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/hs/events` | GET | List HS events |
| `/hs/events` | POST | Create HS event |
| `/hs/project/:projectId/summary` | GET | HS summary for project |

### Document Management
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/documents_v2/init` | POST | Initialize upload |
| `/documents_v2/upload/:key` | PUT | Upload chunk |
| `/documents_v2/complete` | POST | Complete upload |
| `/documents_v2/` | GET | List documents |
| `/documents_v2/:id` | DELETE | Delete document |

### Supplier Management
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/suppliers/` | GET | List suppliers |
| `/suppliers/` | POST | Create supplier |
| `/suppliers/:id` | GET | Get supplier details |
| `/suppliers/:id` | PUT | Update supplier |

### Project Team & Roles
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/projects/:projectId/members` | GET | Get project members |
| `/projects/:projectId/members` | POST | Add team member |
| `/projects/:projectId/roles` | GET | Get project roles |
| `/projects/:projectId/roles` | POST | Create project role |

### Approvals & Workflow
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/approvals/pending` | GET | Get my pending approvals |
| `/approvals/history` | GET | Get my approval history |
| `/approvals/:stepId/approve` | POST | Approve step |
| `/approvals/:stepId/reject` | POST | Reject step |
| `/approvals/:stepId/delegate` | POST | Delegate approval |
| `/approvals/stats/me` | GET | My approval stats |

### Analytics
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/analytics/rollups` | GET | Get analytics rollups |
| `/analytics/trends` | GET | Get trend data |
| `/search/` | GET | Global search |

---

## Common Query Parameters

### Pagination
```
?page=1          - Page number (1-based)
?pageSize=25     - Items per page
?limit=50        - Alternative to pageSize
?offset=0        - Offset for items
```

### Filtering
```
?status=open     - Filter by status
?projectId=123   - Filter by project
?tenantId=abc    - Filter by tenant
?q=search        - Search query
```

### Sorting
```
?orderBy=name    - Field to sort by
?sort=asc        - Sort direction (asc/desc)
```

---

## Response Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created |
| 204 | No Content - Success, no response body |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Not authenticated |
| 403 | Forbidden - No permission |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 500 | Server Error - Backend issue |

---

## Standard Request Headers

```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
X-Request-ID: {optional-correlation-id}
```

---

## Common Workflows

### Complete Procurement Cycle
```
1. Create Project
   POST /projects/

2. Create Package/Lot
   POST /projects/:projectId/packages

3. Create RFx/RFP
   POST /rfx/:projectId/packages/:packageId/rfx
   (or use newer: POST /requests/)

4. Publish RFx
   POST /rfx/:rfxId/publish
   
5. Send Invitations
   POST /rfx/:rfxId/invites
   
6. Evaluate Responses
   GET /rfx/:rfxId/submissions
   
7. Award Package
   POST /packages/:packageId/award

8. Create Contract
   POST /contracts/

9. Issue Contract
   POST /contracts/:id/issue
```

### Complete Payment Processing Cycle
```
1. Create Contract
   POST /contracts/

2. Create Payment Application (Draft)
   POST /contracts/:contractId/applications

3. Submit for Review
   POST /applications/:id/submit

4. QS Review
   POST /applications/:id/review

5. QS Certification
   POST /applications/:id/certify

6. Payment Notice Auto-Issues
   (automatic after certification)

7. Final Approval
   POST /applications/:id/approve

8. Record Payment
   POST /applications/:id/record-payment
```

### Project Setup Workflow
```
1. Create Project
   POST /projects/

2. Set Up Budget
   POST /projects/:projectId/budgets

3. Add Team Members
   POST /projects/:projectId/members

4. Create Packages
   POST /projects/:projectId/packages

5. Configure Roles
   POST /projects/:projectId/roles

6. Start Procurement
   POST /packages/:id/rfx
```

---

## Error Handling

Common error responses:

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable error message"
}
```

Examples:
```
{"error": "NOT_FOUND", "message": "Project not found"}
{"error": "INVALID_INPUT", "message": "Field X is required"}
{"error": "UNAUTHORIZED", "message": "User not authenticated"}
{"error": "FORBIDDEN", "message": "Insufficient permissions"}
```

---

## Authentication Flow

```
1. Register or Login
   POST /auth/register or POST /auth/login

2. Receive JWT Token
   {
     "token": "eyJhbGc...",
     "user": { "id": 1, "email": "user@example.com" }
   }

3. Include in All Requests
   Authorization: Bearer eyJhbGc...

4. Token Expiration
   Default: 7 days
   (Set via JWT_EXPIRES_IN env var)
```

---

## Data Types & Formats

### Decimal Numbers (Currency)
- Use string or number format
- Backend converts to Prisma Decimal
- Preserve precision for financial data
- Examples: "1234.56", "0.01"

### Dates
- ISO 8601 format: "2025-01-15T10:30:00Z"
- Or: "2025-01-15"
- Timestamps in milliseconds for some endpoints

### IDs
- Numeric: 123, 456, etc.
- String: "abc-123-def", etc.
- Check API docs for specific format

### Enums
- Status: "draft", "open", "closed", "approved", etc.
- Type: "RFP", "RFQ", "Tender", etc.
- Check specific endpoint docs for valid values

---

## File Upload Process

```
1. Initialize Upload
   POST /documents_v2/init
   Response: { "key": "unique-upload-key" }

2. Upload Chunks
   PUT /documents_v2/upload/{key}
   Headers: Content-Range: bytes 0-1023/5000
   Body: binary file chunk

3. Complete Upload
   POST /documents_v2/complete
   Body: { "key": "unique-upload-key", "name": "filename.pdf" }
   Response: { "id": 123, "name": "filename.pdf", "url": "..." }
```

---

## Rate Limiting & Performance Tips

1. **Batch Operations**
   - Use POST with arrays when available
   - Example: Create multiple line items in one request

2. **Pagination**
   - Always paginate large result sets
   - Default page size: 25-50 items
   - Max page size: typically 100-200

3. **Filtering**
   - Use query parameters to reduce response size
   - Filter on backend, not frontend

4. **Caching**
   - Cache read-only data (reference data, lookups)
   - Include Cache-Control headers
   - ETag support (check API implementation)

---

## Development Notes

### Test Credentials
- Use `/dev-token` endpoint for development
- Or use `/dev/login` for dev environment

### Demo Reset
- `POST /demo/reset` - Reset demo data (dev only)

### Debugging
- Enable verbose logging in backend
- Use correlation IDs (X-Request-ID header)
- Check audit logs for action history

---

## Key Files & Locations

| Item | Location |
|------|----------|
| Route Files | `/routes/` |
| Auth Middleware | `/middleware/requireAuth.cjs` |
| Permission Checks | `/middleware/checkPermission.cjs` |
| Service Layer | `/services/` |
| Database Schema | `/prisma/schema.prisma` |
| Config | `.env` or environment variables |

---

## Related Documentation

- **Full API Documentation:** `API_ROUTES_DOCUMENTATION.md`
- **API Summary by Domain:** `API_ROUTES_SUMMARY.md`
- **Backend README:** Check `/README.md`
- **Postman Collection:** (if available)

---

*Quick Reference v1.0 - 2025-11-23*
