# ERP Backend Integrations - Quick Reference

## Checklist: What's Implemented?

### Core Infrastructure
- [x] PostgreSQL Database (Prisma ORM)
- [x] Express.js Server on port 3001
- [x] Multi-tenant architecture
- [x] Health check endpoint

### Security & Authentication
- [x] JWT authentication (HS256)
- [x] Role-based access control (RBAC)
- [x] Permission-based middleware
- [x] Development auth bypass (dev mode)
- [x] Bcrypt password hashing (12 rounds)

### File Storage
- [x] Local file storage (development)
- [x] Oracle Cloud Object Storage (production)
- [x] Storage factory abstraction
- [x] Signed URL generation
- [x] File upload/download/delete

### Email Service
- [x] SMTP integration (Mailtrap - dev)
- [x] Nodemailer wrapper
- [x] Raw SMTP socket implementation
- [x] Tender invitation templates
- [x] Graceful fallback to console logging

### Document Processing
- [x] ONLYOFFICE Document Server integration
- [x] JWT token signing for ONLYOFFICE
- [x] Contract DOCX editing
- [x] File storage management

### OCR & Document Extraction
- [x] AWS Textract integration
- [x] S3 upload for OCR processing
- [x] Text extraction (lines, confidence)
- [x] Key-value pair extraction
- [x] Table extraction
- [x] Async job polling
- [x] Email ingestion webhook
- [x] OCR worker daemon

### AI/LLM Integration
- [x] Ollama support (primary)
- [x] OpenAI API support (fallback)
- [x] JSON-only response mode
- [x] Timeout handling (25s)
- [x] Multi-provider fallback logic

### Business Services
- [x] CVR (Cost-Value Reconciliation)
- [x] Budget tracking
- [x] Commitment tracking
- [x] Contract management
- [x] Invoice processing
- [x] Purchase order management
- [x] Supplier management
- [x] RFX scoring
- [x] Tender management
- [x] Project overview
- [x] Email variations
- [x] Approval workflow routing

### Compliance APIs
- [ ] Companies House API (stub - needs activation)
- [ ] HMRC VAT API (stub - needs activation)

### Webhooks
- [x] Email ingestion webhook (POST /api/email-ingestion/webhook)
- [x] Tender Q&A webhook
- [x] Finance inbound webhook

### Scheduled Jobs
- [ ] True cron scheduler (not implemented)
- [ ] Job queue (Bull/Bee-Queue) (not implemented)
- [x] OCR worker loop (manual)
- [x] One-off runners available

---

## Environment Variables Reference

### Database
```
DATABASE_URL=postgresql://user:pass@host:5432/db
SHADOW_DATABASE_URL=postgresql://user:pass@host:5432/shadow
```

### Server
```
PORT=3001
NODE_ENV=development
TENANT_DEFAULT=demo
```

### File Storage
```
FILE_STORAGE_TYPE=local|oracle
FILE_STORAGE_PATH=./uploads
FILE_STORAGE_DIR=./uploads/contracts
```

### Email (SMTP)
```
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=username
SMTP_PASS=password
SMTP_FROM="App <noreply@app.com>"
PUBLIC_APP_URL=http://localhost:5173
```

### JWT
```
JWT_SECRET=<88+ character key>
```

### LLM Providers
```
MODEL_PROVIDER=ollama|openai
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

### ONLYOFFICE Document Server
```
ONLYOFFICE_DS_URL=http://localhost:8082
ONLYOFFICE_JWT_SECRET=<32+ character key>
APP_BASE_URL=http://localhost:3001
```

### Oracle Cloud Storage
```
ORACLE_BUCKET_NAME=erp-uploads
ORACLE_REGION=uk-london-1
ORACLE_NAMESPACE=lrbond2fmprd
ORACLE_ACCESS_KEY_ID=...
ORACLE_SECRET_ACCESS_KEY=...
```

### AWS Textract (OCR)
```
AWS_REGION=eu-west-2
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=erp-payment-applications
```

### Compliance APIs (Optional)
```
COMPANIES_HOUSE_API_KEY=...
HMRC_VAT_API_KEY=...
```

### Features
```
ENABLE_AFP=1
```

---

## Key Files & Locations

### Services
```
/services/
├── email.service.cjs           # Email sending (nodemailer)
├── storage.factory.cjs          # Storage abstraction
├── cvr.cjs                      # CVR financial tracking
├── contracts.cjs                # Contract management
├── invoice.cjs                  # Invoice processing
├── purchaseOrder.cjs            # PO management
├── companiesHouse.js            # Companies House API (stub)
├── hmrcVat.js                   # HMRC VAT API (stub)
└── ocr/
    ├── textract.cjs             # AWS Textract service
    ├── index.cjs                # OCR provider factory
    ├── payment-application-parser.cjs
    └── contract-matcher.cjs
```

### Middleware
```
/middleware/
├── auth.cjs                     # JWT authentication
├── requireAuth.cjs              # Auth enforcement
├── checkPermission.cjs          # Permission checks
├── requireFinanceRole.cjs       # Role enforcement
├── tenant.cjs                   # Multi-tenancy
├── devAuth.cjs                  # Dev-only auth bypass
└── devRbac.cjs                  # Dev RBAC testing
```

### Libraries/Utilities
```
/lib/
├── llm.provider.cjs             # LLM integration (Ollama/OpenAI)
├── onlyoffice.cjs               # ONLYOFFICE signing
├── email.cjs                    # Raw SMTP implementation
├── docgen.cjs                   # Document generation
├── approvalWorkflow.cjs         # Approval routing
├── logger.cjs                   # Logging utility
└── audit.cjs                    # Audit logging

/utils/
├── jwt.cjs                      # JWT sign/verify
├── storage.cjs                  # Storage path helpers
├── prisma.cjs                   # Prisma client
└── devFlags.cjs                 # Feature flags
```

### Routes
```
/routes/
├── auth.cjs                     # Auth endpoints
├── email-ingestion.cjs          # Email webhook
├── finance.ocr.cjs              # OCR endpoints
├── contracts.onlyoffice.cjs     # Document editing
├── tenders.qna.cjs              # Q&A webhook
├── finance.inbound.cjs          # Inbound webhook
└── [100+ other route files]
```

### Workers
```
/workers/
└── ocrWorker.cjs                # OCR job processor
```

### Scripts
```
/scripts/
├── ocr-loop.cjs                 # OCR worker loop
├── deploy-onlyoffice-ubuntu.sh  # ONLYOFFICE deployment
└── [other seed/utility scripts]
```

---

## Implementation Status Details

### IMPLEMENTED (Production-Ready)
- PostgreSQL + Prisma ORM
- JWT authentication with roles
- Local & Oracle Cloud file storage
- SMTP email with nodemailer
- ONLYOFFICE document editing
- AWS Textract OCR
- Ollama & OpenAI LLM support
- CVR financial tracking
- Multi-tenancy isolation
- RBAC/permission system
- Contract management
- Invoice processing
- Email ingestion webhook
- Tender Q&A workflow
- Approval workflow routing

### PARTIAL (Needs Completion)
- Compliance API clients (code present, APIs not activated)
- OCR worker scheduling (manual loop, needs Bull queue)
- Error handling standardization
- Logging centralization
- Rate limiting

### STUB (Not Implemented)
- Companies House company lookup
- HMRC VAT verification
- AI tender question suggestions
- True cron job scheduling
- Job queue system

---

## Quick Start Commands

### Development
```bash
npm run dev              # Start dev server
npm run seed            # Seed database
npm run seed:e2e        # Seed comprehensive test data
npm run migrate         # Run migrations
```

### Email & Webhooks
```bash
# Test email ingestion
curl -X POST http://localhost:3001/api/email-ingestion/webhook \
  -F "from=sender@example.com" \
  -F "subject=Test" \
  -F "attachments=@file.pdf"
```

### OCR Processing
```bash
npm run ocr:once        # Process one OCR job
npm run ocr:loop        # Run OCR worker loop
```

### Testing
```bash
npm test                # Run jest tests
npm run smoke:docs      # Document smoke tests
npm run smoke:rfis      # RFI smoke tests
```

### Documentation
```bash
npm run api:catalog     # Generate API catalog
npm run api:openapi     # Generate OpenAPI spec
```

---

## Health Check
```bash
npm run health
# Or directly:
curl http://localhost:3001/health
```

---

## Next Steps / TODO

### High Priority
1. Activate Companies House API (requires credentials)
2. Activate HMRC VAT API (requires credentials)
3. Implement Bull queue for OCR jobs
4. Add standardized error response schema
5. Set up centralized logging (Winston/Pino)

### Medium Priority
1. Add request rate limiting middleware
2. Implement cron job scheduler
3. Add API request/response validation
4. Set up APM monitoring (New Relic, Datadog)
5. Add request signing for webhooks

### Lower Priority
1. Add Slack notifications
2. Add SMS support (Twilio)
3. Add payment gateway integration
4. Implement request caching layer
5. Add API versioning strategy

---

## Production Deployment

### Pre-Deployment Checklist
- [ ] Set all production env vars
- [ ] Configure production SMTP
- [ ] Activate Oracle Cloud credentials
- [ ] Activate AWS Textract credentials
- [ ] Activate Compliance API credentials
- [ ] Deploy ONLYOFFICE server
- [ ] Set up database backups
- [ ] Configure monitoring/alerting
- [ ] Enable SSL/TLS for all APIs
- [ ] Set up log aggregation
- [ ] Run migrations on production DB
- [ ] Test email delivery
- [ ] Test file uploads to Oracle
- [ ] Test OCR processing
- [ ] Load test the system

### Monitoring
- JWT token expiration
- Email delivery success rate
- OCR job completion rate
- Storage quota usage
- Database connection pool
- API response times
- Error rates by endpoint

---

## Support & Documentation

- Full audit report: `INTEGRATIONS_AUDIT_REPORT.md`
- API catalog: `API_CATALOG.md`
- OpenAPI spec: `openapi-lite.json`
- Auth implementation: `AUTH_IMPLEMENTATION.md`
- Email/OCR setup: `docs/EMAIL_OCR_QUICK_START.md`

