require('dotenv/config');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const pkg = require('./package.json');
const { logError } = require('./utils/errors.cjs');
const { getCatalogHash, getDeltaPrompt } = require('./utils/apiCatalog.cjs');
const devDeltaRoutes = require('./routes/dev_delta.cjs');
const path = require('path');
const fs = require('fs');

// BigInt JSON patch
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const app = express();
const prisma = new PrismaClient();
const TENANT_DEFAULT = process.env.TENANT_DEFAULT || 'demo';

console.log('[API Catalog] hash:', getCatalogHash());
console.log(getDeltaPrompt());

// Request tracing logger
const { withReqId, onFinish } = require('./lib/logger.cjs');

function lazyRouter(modulePath) {
  let router;
  return (req, res, next) => {
    try {
      router ||= require(modulePath);
      return router(req, res, next);
    } catch (err) {
      return next(err);
    }
  };
}

function lazyRouteFactory(modulePath) {
  return (...factoryArgs) => {
    let router;
    return (req, res, next) => {
      try {
        router ||= require(modulePath)(...factoryArgs);
        return router(req, res, next);
      } catch (err) {
        return next(err);
      }
    };
  };
}

function lazyHandler(modulePath, exportName) {
  let mod;
  return (req, res, next) => {
    try {
      mod ||= require(modulePath);
      return mod[exportName](req, res, next);
    } catch (err) {
      return next(err);
    }
  };
}

function lazyMiddleware(modulePath) {
  let middleware;
  return (req, res, next) => {
    try {
      middleware ||= require(modulePath);
      return middleware(req, res, next);
    } catch (err) {
      return next(err);
    }
  };
}

function lazyNamedMiddleware(modulePath, exportName) {
  let middleware;
  return (req, res, next) => {
    try {
      middleware ||= require(modulePath)[exportName];
      return middleware(req, res, next);
    } catch (err) {
      return next(err);
    }
  };
}

function ensureFeature(feature) {
  let guardFactory;
  let guard;
  return (req, res, next) => {
    try {
      guardFactory ||= require('./middleware/featureGuard.js').ensureFeature;
      guard ||= guardFactory(feature);
      return guard(req, res, next);
    } catch (err) {
      return next(err);
    }
  };
}

const variationsRouter = require('./routes/variations-enhanced.cjs');
const paymentApplicationsRouter = require('./routes/payment-applications.cjs');
const paymentApplicationsOutboundRouter = lazyRouter('./routes/payment-applications.outbound.cjs');
const paymentApplicationsActionsRouter = lazyRouter('./routes/payment-applications.actions.cjs');
const paymentCertificatesRouter = lazyRouter('./routes/payment-certificates.cjs');
const retentionRouter = lazyRouter('./routes/retention.cjs');
const emailIngestionRouter = lazyRouter('./routes/email-ingestion.cjs');
const financeDashboardRouter = lazyRouter('./routes/finance.dashboard.cjs');
const documentsRouter = lazyRouter('./routes/documents_v2.cjs');
const projectsOverviewRouter = lazyRouter('./routes/projects_overview.cjs');
const projectDocumentsRouter = lazyRouter('./routes/project_documents.cjs');
const projectExtrasRouter = lazyRouter('./routes/project-extras.cjs');
const healthRouter = lazyRouter('./routes/health.cjs');
const authRouter = lazyRouter('./routes/auth.cjs');
const meRouter = lazyRouter('./routes/me.cjs');
const usersRouter = lazyRouter('./routes/users.cjs');
const rolesRouter = lazyRouter('./routes/roles.cjs');
const financialsRouter = lazyRouter('./routes/financials.cjs');
const onboardingRouter = lazyRouter('./routes/onboarding.cjs');
const suppliersRouter = lazyRouter('./routes/suppliers.cjs');
const cisRouter = lazyRouter('./routes/cis.cjs');
const vatRouter = lazyRouter('./routes/vat.cjs');
const rfisRouter = lazyRouter('./routes/rfis.cjs');
const qaRouter = lazyRouter('./routes/qa.cjs');
const hsRouter = lazyRouter('./routes/hs.cjs');
const carbonRouter = lazyRouter('./routes/carbon.cjs');
const searchRouter = lazyRouter('./routes/search.cjs');
const lookupsRouter = lazyRouter('./routes/lookups.cjs');
const publicRoutes = lazyRouter('./routes/public.cjs');
const requestsRouter = lazyRouter('./routes/requests.cjs');
const spmRouter = lazyRouter('./routes/spm.cjs');
const integrationsRouter = lazyRouteFactory('./routes/integrations.cjs');
const homeRoutes = lazyRouteFactory('./routes/home.cjs');
const procurementRoutes = lazyRouter('./routes/procurement');
const analyticsRouter = lazyRouteFactory('./routes/analytics.cjs');
const rfxRouter = lazyRouteFactory('./routes/rfx.cjs');
const tendersRouter = lazyRouteFactory('./routes/tenders.cjs');
const tendersCombinedRouter = lazyRouter('./routes/tenders.combined.cjs');
const tendersCreateRouter = lazyRouter('./routes/tenders.create.cjs');
const tendersQnaRouter = lazyRouter('./routes/tenders.qna.cjs');
const tendersPortalQnaRouter = lazyRouter('./routes/tenders.portal.qna.cjs');
const tendersBuilderRouter = lazyRouter('./routes/tenders.builder.cjs');
const tendersDocumentsRouter = lazyRouter('./routes/tenders.documents.cjs');
const tendersWorkflowRouter = lazyRouter('./routes/tenders.workflow.cjs');
const tendersInvitationsRouter = lazyRouter('./routes/tenders.invitations.cjs');
const tendersClarificationsRouter = lazyRouter('./routes/tenders.clarifications.cjs');
const tendersPackageCopyRouter = lazyRouter('./routes/tenders.package-copy.cjs');
const packagesPricingRouter = lazyRouter('./routes/packages.pricing.cjs');
const packagesResponsesRouter = lazyRouter('./routes/packages.responses.cjs');
const rfxBuilderRouter = lazyRouter('./routes/rfx.builder.cjs');
const rfxStateRouter = lazyRouter('./routes/rfx.state.cjs');
const rfxInvitesSendRouter = lazyRouteFactory('./routes/rfx.invitesSend.cjs');
const tenderTemplatesRouter = lazyRouter('./routes/settings.tenderTemplates.cjs');
const emailTemplatesRouter = lazyRouter('./routes/settings.emailTemplates.cjs');
const projectInvoicesRouter = lazyRouteFactory('./routes/project_invoices.cjs');
const projectBudgetRouter = lazyRouter('./routes/projects.budget.cjs');
const projectPackagesRouter = lazyRouter('./routes/projects.packages.cjs');
const projectContractsRouter = lazyRouter('./routes/projects.contracts.cjs');
const projectTendersRouter = lazyRouter('./routes/projects.tenders.cjs');
const packagesRouter = lazyRouter('./routes/packages.cjs');
const packagesActionsRouter = lazyRouter('./routes/packages.actions.cjs');
const packagesDocumentsRouter = lazyRouter('./routes/packages.documents.cjs');
const contractsRouter = lazyRouter('./routes/contracts.cjs');
const projectsScopeRouter = lazyRouter('./routes/projects.scope.cjs');
const projectOverviewRouter2 = lazyRouter('./routes/projects.overview.cjs');
const costCodesRouter = lazyRouter('./routes/costCodes.cjs');
const financePoRouter = lazyRouter('./routes/finance.pos.cjs');
const financeInvoicesRouter = lazyRouter('./routes/finance.invoices.cjs');
const financeMatchRouter = lazyRouter('./routes/finance.match.cjs');
const financeOcrRouter = lazyRouter('./routes/finance.ocr.cjs');
const ocrRouter = lazyRouter('./routes/ocr.cjs');
const financeInboundRouter = lazyRouter('./routes/finance.inbound.cjs');
const financeReceiptsRouter = lazyRouter('./routes/finance.receipts.cjs');
const afpRouter = lazyRouter('./routes/afp.cjs');
const afpOpenRouter = lazyRouter('./routes/afp.open.cjs');
const cvrRouter = lazyRouteFactory('./routes/financials.cvr.cjs');
const cvrRealtimeRouter = lazyRouteFactory('./routes/cvr.cjs'); // Real-time CVR tracking
const contractValuationsRouter = lazyRouteFactory('./routes/contract-valuations.cjs'); // Contract valuations for revenue tracking
const cvrReportsRouter = lazyRouteFactory('./routes/cvr-reports.cjs'); // CVR period reports with approval workflow
const cvrSnapshotsRouter = lazyRouter('./routes/projects.cvr-snapshots.cjs'); // Task 4.3: CVR Snapshot & History
const cvrEnhancedRouter = lazyRouter('./routes/projects.cvr-enhanced.cjs'); // Task 4.1: Role-aware CVR endpoints
const cvrCostsRouter = lazyRouter('./routes/projects.cvr-costs.cjs'); // Task 4.2: Enhanced cost tracking
const oldCvrRouter = lazyRouter('./routes/projects.cvr.cjs'); // Original CVR with package/cost code breakdown
const cvrForecastRouter = lazyRouter('./routes/budgetlines.forecast.cjs'); // CVR Phase B: Forecast & Anticipated Final Cost
const allocationsRouter = lazyRouter('./routes/allocations.cjs'); // Category allocations for CVR tracking
const cashFlowRouter = lazyRouter('./routes/cashFlow.cjs'); // Cash Flow aggregation for project finance tracking
const purchaseOrdersRouter = lazyRouteFactory('./routes/purchaseOrders.cjs'); // PO CRUD with CVR integration
const invoicesRouter = lazyRouteFactory('./routes/invoices.cjs'); // Invoice CRUD with CVR integration
const diaryRouter = lazyRouteFactory('./routes/diary.cjs');
const scopeAssistRouter = lazyRouter('./routes/scope.assist.cjs');
const budgetsImportRouter = lazyRouter('./routes/budgets.import.cjs');
const budgetsImportSubcontractorRouter = lazyRouter('./routes/budgets.import-subcontractor.cjs');
const packagesSeedRouter = lazyRouter('./routes/packages.seed.cjs');
const taxonomyRouter = lazyRouter('./routes/taxonomy.cjs');
const budgetsSuggestRouter = lazyRouter('./routes/projects.budgets.suggest.cjs');
const directAwardRouter = lazyRouter('./routes/packages.directAward.cjs');
const contractsReadRouter = lazyRouter('./routes/contracts.read.cjs');
const contractsGenerateDocRouter = lazyRouter('./routes/contracts.generateDoc.cjs');
const contractsStatusRouter = lazyRouter('./routes/contracts.status.cjs');
const contractsDocumentsRouter = lazyRouter('./routes/contracts.documents.cjs');
const invoiceMatchingRouter = lazyRouter('./routes/invoiceMatching.cjs');
const contractsOnlyOfficeRouter = lazyRouter('./routes/contracts.onlyoffice.cjs');
const settingsV1Router = lazyRouter('./routes/settings.v1.cjs');
const contractTemplatesRouter = lazyRouter('./routes/contract.templates.cjs');
const tradesRouter = lazyRouteFactory('./routes/trades.cjs');
const jobsRouter = lazyRouteFactory('./routes/jobs.cjs');
const uploadRouter = lazyRouter('./routes/upload.cjs');
const workersRouter = lazyRouteFactory('./routes/workers.cjs');
const equipmentRouter = lazyRouteFactory('./routes/equipment.cjs');
const assetsRouter = lazyRouter('./routes/assets.cjs');
const jobSchedulesRouter = lazyRouteFactory('./routes/jobSchedules.cjs');
const scheduleEventsRouter = lazyRouter('./routes/schedule-events.cjs');
const timeEntriesRouter = lazyRouteFactory('./routes/timeEntries.cjs');
const recommendationConfigRouter = lazyRouteFactory('./routes/recommendationConfig.cjs');
const inventoryRouter = lazyRouteFactory('./routes/inventory.cjs');
const inventoryPurchaseOrdersRouter = lazyRouteFactory('./routes/inventory-purchase-orders.cjs');
const customerPortalRouter = lazyRouteFactory('./routes/customer-portal.cjs');
const subcontractorPortalRouter = lazyRouteFactory('./routes/subcontractor-portal.cjs');
const reportsRouter = lazyRouteFactory('./routes/reports.cjs');
const complianceReportsRouter = lazyRouteFactory('./routes/compliance-reports.cjs');
// Approval Framework
const approvalsRouter = lazyRouter('./routes/approvals.cjs');
const settingsApprovalsRouter = lazyRouter('./routes/settings.approvals.cjs');
const projectRolesRouter = lazyRouter('./routes/projects.roles.cjs');
const upstreamContractsRouter = lazyRouter('./routes/upstreamContracts.cjs');
const importMappingsRouter = lazyRouter('./routes/importMappings.cjs');
// Task 5.1: Export Layer
const exportsRouter = lazyRouter('./routes/exports.cjs');
function exportRouterTS(req, res, next) {
  try {
    return require('./dist/routes/export.js').default(req, res, next);
  } catch (err) {
    return next(err);
  }
}
function projectApplicationExportRouter(req, res, next) {
  try {
    return require('./dist/routes/projects.applications.export.js').default(req, res, next);
  } catch (err) {
    return next(err);
  }
}
// Also import handlers directly for top-level mounting
const budgetsPreview = lazyHandler('./routes/budgets.import.cjs', 'previewHandler');
const budgetsCommit = lazyHandler('./routes/budgets.import.cjs', 'commitHandler');
const documentLinksRouter = lazyRouter('./routes/document.links.cjs');
const attachUser = lazyNamedMiddleware('./middleware/auth.cjs', 'attachUser');
const demoGuard = lazyNamedMiddleware('./middleware/demo.cjs', 'demoGuard');
const requireAuth = lazyMiddleware('./middleware/requireAuth.cjs');
const devAuth = lazyMiddleware('./middleware/devAuth.cjs');
const devRbac = lazyMiddleware('./middleware/devRbac.cjs');
const authDev = lazyRouteFactory('./routes/auth.dev.cjs');
function isDevEnv() {
  return (process.env.NODE_ENV || 'development') !== 'production';
}

function isDevAuthEnabled() {
  return isDevEnv() && process.env.DEV_AUTH !== '0';
}

// CORS: allow dev servers and handle preflight
// Allow override via CORS_ORIGINS env (comma-separated)
const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:3000', // common React dev server
  'http://127.0.0.1:3000', // common React dev server
  'http://localhost:4173', // Vite preview
  'http://127.0.0.1:4173', // Vite preview
  'http://localhost:4174',
  'http://127.0.0.1:4174',
  'https://two025-erp-yqs4.onrender.com',      // Render static site
  'https://two025-frontend-erp.onrender.com', // Render web service
];
const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant-Id',
      'x-tenant-id',
    ],
    exposedHeaders: ['Content-Type'],
  })
);
// Respond quickly to OPTIONS preflight
app.options('*', cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));
// Request tracing middleware - log every request with unique ID
app.use(withReqId);
app.use(onFinish);
app.use(attachUser);
// In dev, allow bypass to attach a demo user when no token is provided
app.use(devAuth); // must be before routes that use requireAuth
// Dev feature toggles via env (ENABLE_AFP=1 or ENABLE_FINANCE=1)
app.use(lazyMiddleware('./middleware/devFeatures.cjs'));
// DEV-ONLY RBAC helper to ensure admin role and project membership
app.use(devRbac);
// Demo guard rails (block destructive or protected operations)
app.use(demoGuard);

// Static file serving for contract uploads
const FILE_STORAGE_DIR = process.env.FILE_STORAGE_DIR || './uploads/contracts';
app.use('/static/contracts', express.static(path.resolve(FILE_STORAGE_DIR)));

// Serve uploaded files in development
if (process.env.NODE_ENV === 'development' || process.env.FILE_STORAGE_TYPE === 'local') {
  const uploadPath = path.resolve(process.env.FILE_STORAGE_PATH || './uploads');
  app.use('/uploads', express.static(uploadPath));
  console.log(`📁 Serving static files from: ${uploadPath}`);
}

// Rewrite common malformed URLs where the frontend missed the '?' before query params
// Example: /api/projectslimit=10&offset=0 -> /api/projects?limit=10&offset=0
app.use((req, _res, next) => {
  try {
    if (req.url && req.url.startsWith('/api/')) {
      const after = req.url.slice(5); // strip '/api/'
      // Only attempt when there is no '?' yet and there's an '=' present
      if (after && !after.includes('?') && after.includes('=')) {
        // Detect a resource immediately followed by a known param name
        const m = /^(\/?[^/?#]+?)(limit|offset|sort|status|clientId|projectId|page|pageSize|q|search|order)=/i.exec(after);
        if (m) {
          const resource = m[1];
          const rest = after.slice(resource.length);
          const fixed = `/api/${resource.replace(/^\//,'')}?${rest}`;
          console.warn('[rewrite] malformed URL', req.url, '->', fixed);
          req.url = fixed;
        }
      }
    }
  } catch (_) {
    // Non-fatal; continue
  }
  next();
});

// Make BigInt values JSON-safe (Node can't stringify BigInt)
app.set('json replacer', (key, value) =>
  (typeof value === 'bigint' ? value.toString() : value)
);

// Prefer explicit PORT; in dev we'll fall back to the next free port if the default is taken
const DEFAULT_PORT = 3001;
const EXPLICIT_PORT = process.env.PORT ? Number(process.env.PORT) : undefined;
const INITIAL_PORT = EXPLICIT_PORT || DEFAULT_PORT;
app.get(['/health', '/api/health'], (_req, res) =>
  res.json({ ok: true, version: pkg.version, time: new Date().toISOString() })
);

// Serve OpenAPI (light) so FE can fetch it at build time
app.get('/openapi-lite.json', (req, res) => {
  const p = path.join(__dirname, 'openapi-lite.json'); // written by scripts/api_inventory.js
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'openapi-lite.json not found' });
  res.setHeader('Content-Type', 'application/json');
  res.send(fs.readFileSync(p, 'utf8'));
});


app.use(devDeltaRoutes);

app.use('/auth', authRouter);
app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);

// Public RFx response API (NO auth required - uses magic link token)
app.use('/api/public/rfx', lazyRouter('./routes/rfx.public.cjs'));

app.use('/api/users', usersRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/reference', requireAuth, lazyRouteFactory('./routes/reference')(prisma));
app.use('/api/clients', requireAuth, lazyRouteFactory('./routes/clients')(prisma));
app.use('/api/contacts', requireAuth, lazyRouteFactory('./routes/contacts')(prisma));
app.use('/api/projects', requireAuth, lazyRouteFactory('./routes/projects')(prisma));
app.use('/api/projects', requireAuth, lazyRouteFactory('./routes/project_members.cjs')(prisma));
app.use('/api/projects', requireAuth, lazyRouteFactory('./routes/project_alerts.cjs')(prisma));
app.use('/api/projects', lazyRouter('./routes/projects.info.cjs'));
// app.use('/api/projects', projectsOverviewRouter);
app.use('/api/projects', requireAuth, projectsOverviewRouter);
app.use('/api', requireAuth, projectBudgetRouter);
// Grouped budgets + budget group management
app.use('/api/projects', lazyRouter('./routes/projects.budgets.cjs'));
// AI Budget Suggestions
app.use('/api/projects', requireAuth, budgetsSuggestRouter);
app.use('/api', requireAuth, projectPackagesRouter);
app.use('/api', requireAuth, projectContractsRouter);
app.use('/api/projects', requireAuth, projectTendersRouter);
// Task 5.1 Part 6: Convenience export endpoints for applications
app.use('/api/projects/:projectId/applications', requireAuth, projectApplicationExportRouter);
app.use('/api', requireAuth, packagesRouter);
app.use('/api', packagesActionsRouter);
app.use('/api', requireAuth, contractsRouter);
app.use('/api', lazyRouter('./routes/awards.cjs'));
app.use('/api', requireAuth, projectsScopeRouter);
app.use('/api', requireAuth, projectOverviewRouter2);
app.use('/api', requireAuth, costCodesRouter);
  app.use('/api/projects', requireAuth, rfxRouter(prisma));
  app.use('/api', requireAuth, rfxRouter(prisma));
app.use('/api/rfx-builder', rfxBuilderRouter);
app.use('/api/rfx-state', rfxStateRouter);
app.use('/api/rfx', requireAuth, rfxInvitesSendRouter(prisma));
// Tenders routes (additive)
app.use('/api/tenders', tendersRouter(prisma, { requireAuth }));
// Public RFx submission
app.use('/', tendersRouter(prisma, { requireAuth }));
app.use('/api/tenders-combined', tendersCombinedRouter);
app.use('/api/tenders-create', tendersCreateRouter);
app.use('/api/tenders-qna', tendersQnaRouter);
app.use('/api/tenders-portal-qna', tendersPortalQnaRouter);
app.use('/api/tenders', tendersDocumentsRouter);
app.use('/api/tenders', tendersWorkflowRouter);
app.use('/api/tenders', tendersInvitationsRouter);
app.use('/api/tenders', tendersClarificationsRouter);
app.use('/api/tenders', tendersPackageCopyRouter);
app.use('/api/tenders', tendersBuilderRouter);
app.use('/api/packages', packagesPricingRouter);
app.use('/api/packages', requireAuth, packagesDocumentsRouter);
app.use('/api/package-responses', packagesResponsesRouter);
// DISABLED: Old snapshot-based CVR system - replaced with real-time CVR at line 488
// app.use('/api/projects', requireAuth, cvrRouter(prisma));
app.use('/api/projects', requireAuth, diaryRouter(prisma));
// Budgets CSV import preview/commit
app.use('/api', requireAuth, budgetsImportRouter);
app.use('/api/projects', requireAuth, budgetsImportRouter);
// Task 2.3: Subcontractor budget import
app.use('/api', requireAuth, budgetsImportSubcontractorRouter);
app.use('/api', requireAuth, scopeAssistRouter);
// Seed packages from budgets
app.use('/api', requireAuth, packagesSeedRouter);
// Scope assist (feature-gated routes); route-level auth inside
app.use('/api', scopeAssistRouter);
// Taxonomy admin routes
app.use('/api', taxonomyRouter);
// Top-level explicit mounts to avoid any router path ambiguity
app.post('/api/projects/:projectId/budgets/import', requireAuth, budgetsPreview);
app.post('/api/projects/:projectId/budgets/commit', requireAuth, budgetsCommit);
app.use('/api/projects', requireAuth, projectInvoicesRouter(prisma));
app.use('/api/projects', requireAuth, projectDocumentsRouter);
app.use('/api', requireAuth, projectExtrasRouter);
app.use('/api/health', requireAuth, healthRouter);
app.use('/api/tasks', requireAuth, lazyRouteFactory('./routes/tasks')(prisma));
app.use('/api/jobs', requireAuth, jobsRouter(prisma));
app.use('/api/workers', requireAuth, workersRouter(prisma));
app.use('/api/equipment', requireAuth, equipmentRouter(prisma));
app.use('/api/assets', requireAuth, assetsRouter);
app.use('/api/job-schedules', requireAuth, jobSchedulesRouter(prisma));
app.use('/api/schedules', requireAuth, scheduleEventsRouter);
app.use('/api/time-entries', requireAuth, timeEntriesRouter(prisma));
app.use('/api/recommendation-config', requireAuth, recommendationConfigRouter(prisma));
app.use('/api/inventory', requireAuth, inventoryRouter(prisma));
app.use('/api/inventory-purchase-orders', requireAuth, inventoryPurchaseOrdersRouter(prisma));
app.use('/api/customer-portal', customerPortalRouter(prisma)); // Public routes with own auth
app.use('/api/subcontractor-portal', subcontractorPortalRouter(prisma)); // Public routes with own auth
app.use('/api/reports', requireAuth, reportsRouter(prisma));
app.use('/api/compliance-reports', requireAuth, complianceReportsRouter(prisma));
// Variations routes: mount under both /api and /api/variations for compatibility
app.use('/api', requireAuth, variationsRouter);
app.use('/api/variations', requireAuth, variationsRouter);
// Payment Applications routes - UK Construction Act compliant
app.use('/api', requireAuth, paymentApplicationsRouter);
// Task 2.5: Outbound Payment Applications (Subcontractor → MC)
app.use('/api', requireAuth, paymentApplicationsOutboundRouter);
// Task 2.6: Payment Application Actions & Status Transitions
app.use('/api', requireAuth, paymentApplicationsActionsRouter);
// Task 3.1: Payment Certificates (received from MC)
app.use('/api', requireAuth, paymentCertificatesRouter);
// Task 3.4: Retention Register & Management
app.use('/api', requireAuth, retentionRouter);
// Email Ingestion & OCR for Payment Applications
app.use('/api/email-ingestion', emailIngestionRouter);
// Finance Dashboard routes - Company-wide finance views
app.use('/api', requireAuth, financeDashboardRouter);
app.use('/api/documents', requireAuth, documentsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/onboarding', requireAuth, onboardingRouter);
app.use('/api/procurement', requireAuth, lazyRouter('./routes/procurement.cjs'));
app.use('/api', requireAuth, procurementRoutes);
app.use('/api', requireAuth, cvrRouter(prisma));
app.use('/api/cvr', requireAuth, cvrRealtimeRouter(prisma)); // Real-time CVR API
app.use('/api/contract-valuations', requireAuth, contractValuationsRouter(prisma)); // Contract valuations for revenue tracking
app.use('/api/cvr-reports', requireAuth, cvrReportsRouter(prisma)); // CVR period reports with approval workflow
app.use('/api', requireAuth, cvrSnapshotsRouter); // Task 4.3: CVR Snapshot & History
app.use('/api', requireAuth, cvrEnhancedRouter); // Task 4.1: Role-aware CVR endpoints
app.use('/api', requireAuth, cvrCostsRouter); // Task 4.2: Enhanced cost tracking
app.use('/api', requireAuth, oldCvrRouter); // Original CVR with package/cost code breakdown
app.use('/api', requireAuth, cvrForecastRouter); // CVR Phase B: Forecast & Anticipated Final Cost
app.use('/api', requireAuth, cashFlowRouter); // Cash Flow aggregation (money in/out tracking)
app.use('/api/allocations', requireAuth, allocationsRouter); // Category allocations for CVR tracking
app.use('/api/purchase-orders', requireAuth, purchaseOrdersRouter(prisma)); // Purchase Orders with CVR
app.use('/api/invoices', requireAuth, invoicesRouter(prisma)); // Invoices with CVR
app.use('/api/financials', requireAuth, financialsRouter);
// Also expose financials under /api/projects/financials for compatibility
app.use('/api/projects/financials', requireAuth, financialsRouter);
app.use('/api/suppliers', requireAuth, suppliersRouter);
app.use('/api/cis', requireAuth, cisRouter);
app.use('/api/vat', requireAuth, vatRouter);
app.use('/api/requests', requireAuth, requestsRouter);
app.use('/api/spm', requireAuth, spmRouter);
app.use('/api/search', requireAuth, searchRouter);
app.use('/api', requireAuth, lookupsRouter);
app.use('/api', requireAuth, documentLinksRouter);
app.use('/api', requireAuth, tradesRouter(prisma));
app.use('/api/integrations', requireAuth, integrationsRouter());
// Meta, Geo, and Project Info (additive)
app.use('/api', requireAuth, lazyRouter('./routes/meta.cjs'));
app.use('/api', requireAuth, lazyRouter('./routes/geo.cjs'));
app.use('/api', requireAuth, lazyRouter('./routes/projects.info.cjs'));
// MVP namespace (isolated under /api/mvp for FE wrapper compatibility)
app.use('/api/mvp', requireAuth, lazyRouter('./src/mvp/index.cjs'));
// RFx Excel/email flows (additive)
app.use('/api', requireAuth, lazyRouter('./routes/rfx.templates.cjs'));
app.use('/api', requireAuth, lazyRouter('./routes/rfx.responses.cjs'));
app.use('/api', requireAuth, lazyRouter('./routes/rfx.analysis.cjs'));
app.use('/api', requireAuth, lazyRouter('./routes/rfx.email.cjs'));
// Demo reset route (top-level)
app.use(lazyRouter('./routes/demo.cjs'));
app.use('/api/rfis', requireAuth, rfisRouter);
app.use('/api/qa', requireAuth, qaRouter);
app.use('/api/hs', requireAuth, hsRouter);
app.use('/api/carbon', requireAuth, carbonRouter);
app.use('/api', lazyRouter('./routes/budgetCategories.seed.cjs')); // Seed endpoint
app.use('/api/budget-categories', requireAuth, lazyRouter('./routes/budgetCategories.cjs'));
app.use('/api/analytics', requireAuth, analyticsRouter(prisma));
app.use('/api', homeRoutes(prisma, { requireAuth }));
// Applications for Payment (AfP)
app.use('/api/applications', requireAuth, ensureFeature('afp'), afpRouter);
// Back-compat alias: some clients may call /api/afp; route to applications
// Additive: expose basic GET list without feature gate to enable FE AFP listing
app.use('/api/afp', requireAuth, afpOpenRouter);
app.use('/api/afp', requireAuth, ensureFeature('afp'), afpRouter);
// Finance (additive, gated by auth; consider role checks 'finance'|'admin' in production)
app.use('/api', requireAuth, financePoRouter);
app.use('/api', requireAuth, financeInvoicesRouter);
app.use('/api', requireAuth, financeMatchRouter);
app.use('/api', requireAuth, financeOcrRouter);
app.use('/api/ocr', requireAuth, ocrRouter);
app.use('/api', requireAuth, financeReceiptsRouter);
app.use('/api', financeInboundRouter);

app.use('/api/v1/settings', requireAuth, settingsV1Router);
app.use('/api/settings/tender-templates', requireAuth, tenderTemplatesRouter);
app.use('/api/settings/email-templates', requireAuth, emailTemplatesRouter);
app.use('/api/settings/approvals', requireAuth, settingsApprovalsRouter);

// Approval Framework
app.use('/api/approvals', requireAuth, approvalsRouter);
app.use('/api/projects', requireAuth, projectRolesRouter);
// Task 2.2: Upstream Contract routes
app.use('/api', requireAuth, upstreamContractsRouter);
// Task 2.3: Import Mapping routes
app.use('/api', requireAuth, importMappingsRouter);
// Task 5.1: Export Layer - Template management and data export
app.use('/api/exports', requireAuth, exportsRouter);
// Task 5.1 Part 5: TypeScript Export Engine with orchestration layer
app.use('/api/export', requireAuth, exportRouterTS);
app.get('/api/v1/tenants/modules', requireAuth, (req, res) => {
  const tenantId = req.user?.tenantId || TENANT_DEFAULT;
  // Return both modules array and individual boolean properties for backwards compatibility
  res.json({
    tenantId,
    modules: ['scope_suggest', 'tendering', 'rfx'],
    tendering: true,
    rfx: true
  });
});

app.use('/api', directAwardRouter);
app.use('/api', contractsReadRouter);
app.use('/api', contractsGenerateDocRouter);
app.use('/api', contractsStatusRouter);
app.use('/api', contractsDocumentsRouter); // Contract document upload & OCR
app.use('/api', invoiceMatchingRouter); // Invoice-PO matching, call-off POs
app.use('/api', contractsOnlyOfficeRouter);
app.use('/api', contractsRouter);
app.use('/api', contractTemplatesRouter);

// Public, no auth routes (e.g., supplier onboarding)
app.use('/public', publicRoutes);

// Lightweight compatibility/stub endpoints to avoid 404s on common FE calls
app.get('/api/activity', requireAuth, (req, res) => {
  const limit = Number(req.query.limit || 20);
  res.json({ total: 0, items: [], limit });
});
app.get('/api/audit/events', requireAuth, (req, res) => {
  const limit = Number(req.query.limit || 20);
  res.json({ total: 0, events: [], limit });
});
app.get(['/api/resources/utilization', '/api/planning/utilization'], requireAuth, (_req, res) => {
  res.json({ utilization: [] });
});

// Alias: /api/finance/snapshot -> /api/financials/snapshot
app.get('/api/finance/snapshot', requireAuth, (req, res) => {
  const qsIndex = req.url.indexOf('?');
  const qs = qsIndex !== -1 ? req.url.slice(qsIndex) : '';
  res.redirect(307, '/api/financials/snapshot' + qs);
});

// Compatibility: provide a minimal finance settings endpoint for FE variants
app.get('/api/settings/finance', requireAuth, (_req, res) => {
  res.json({
    vatRateDefault: 0.2,
    matchTolerance: 5,
    currency: 'GBP',
    inboundEmailEnabled: true,
  });
});

// Serve a no-op favicon to avoid 404 noise in dev
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// --------- Additional compatibility routes expected by some FE variants ---------
// Project-scoped POs: GET /api/projects/:id/pos -> mirrors /api/finance/pos with implicit projectId
app.get('/api/projects/:id/pos', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id' });
    const limit = Math.min(Number(req.query.limit || 25), 100);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const q = req.query.q ? String(req.query.q) : '';
    const where = {
      tenantId,
      projectId,
      ...(q ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { supplier: { contains: q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.purchaseOrder.findMany({ where, skip: offset, take: limit, orderBy: { orderDate: 'desc' } }),
      prisma.purchaseOrder.count({ where }),
    ]);
    res.json({ items, total });
  } catch (e) {
    res.json({ items: [], total: 0 });
  }
});

// Project CVR: Real-time calculation from budget lines, contracts, and payment applications
app.get('/api/projects/:id/cvr', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id' });

    // 1. GET BUDGET from budget lines (project-level, no packageId)
    // FIXED: Use 'total' field to match Budget page
    const budgetLines = await prisma.budgetLine.findMany({
      where: { tenantId, projectId },
      select: {
        total: true,
      },
    });
    const totalBudget = budgetLines.reduce((sum, bl) => sum + Number(bl.total || 0), 0);

    // 2. GET COMMITTED from active/signed contracts (grouped by packageId)
    const contracts = await prisma.contract.findMany({
      where: {
        tenantId,
        projectId,
        status: { in: ['active', 'signed'] },
      },
      select: {
        id: true,
        contractRef: true,
        value: true,
        packageId: true,
        package: {
          select: {
            id: true,
            trade: true,
          },
        },
      },
    });
    const totalCommitted = contracts.reduce((sum, c) => sum + Number(c.value || 0), 0);

    // 3. GET ACTUAL from certified payment applications (via contractId → packageId)
    const paymentApps = await prisma.applicationForPayment.findMany({
      where: {
        tenantId,
        projectId,
        status: { notIn: ['CANCELLED', 'REJECTED'] },
      },
      select: {
        certifiedThisPeriod: true,
        claimedThisPeriod: true,
        contractId: true,
        contract: {
          select: {
            packageId: true,
          },
        },
      },
    });
    const totalActual = paymentApps.reduce((sum, app) => {
      return sum + Number(app.certifiedThisPeriod || app.claimedThisPeriod || 0);
    }, 0);

    // Group by package for breakdown
    const packageMap = new Map();

    // Add contracts by package
    contracts.forEach((contract) => {
      const pkgId = contract.packageId;
      if (!packageMap.has(pkgId)) {
        packageMap.set(pkgId, {
          id: pkgId,
          code: contract.package?.trade || 'Unknown',
          name: contract.package?.trade || 'Unallocated',
          planned: 0, // No budget breakdown by package
          estimate: 0,
          actualToDate: 0,
        });
      }
      const pkg = packageMap.get(pkgId);
      pkg.estimate += Number(contract.value || 0);
    });

    // Add payment apps by package (via contract.packageId)
    paymentApps.forEach((app) => {
      const pkgId = app.contract?.packageId;
      if (!packageMap.has(pkgId)) {
        packageMap.set(pkgId, {
          id: pkgId,
          code: 'Unknown',
          name: 'Unallocated',
          planned: 0,
          estimate: 0,
          actualToDate: 0,
        });
      }
      const pkg = packageMap.get(pkgId);
      pkg.actualToDate += Number(app.certifiedThisPeriod || app.claimedThisPeriod || 0);
    });

    const entries = Array.from(packageMap.values()).map((pkg) => ({
      ...pkg,
      variance: pkg.estimate - pkg.actualToDate,
      costToComplete: pkg.estimate - pkg.actualToDate,
    }));

    res.json({
      totalBudget,
      totalCommitted,
      totalActual,
      variance: totalBudget - totalCommitted,
      remaining: totalBudget - totalActual,
      entries,
      items: entries, // Legacy support
      periods: [], // Legacy support
    });
  } catch (error) {
    console.error('[CVR] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --------- Compatibility routes for FE variants expecting nested project endpoints ---------
// Financials summary/transactions under /api/projects/:id/financials/*
function financeMoney(value) {
  return Number(value || 0);
}

function paymentApplicationFinanceValue(app) {
  const certifiedGrossLessRetention =
    app.certifiedGrossValue != null
      ? financeMoney(app.certifiedGrossValue) - financeMoney(app.certifiedRetention)
      : null;

  return financeMoney(
    app.paymentNoticeAmount ??
    app.certifiedThisPeriod ??
    app.certifiedNetValue ??
    app.certifiedAmount ??
    certifiedGrossLessRetention ??
    app.claimedNetValue ??
    app.claimedThisPeriod ??
    app.netClaimed ??
    app.grossToDate
  );
}

function paymentApplicationFinanceDate(app) {
  return app.paidDate || app.certifiedDate || app.dueDate || app.valuationDate || app.applicationDate || app.updatedAt || null;
}

function paymentApplicationIsActive(app) {
  return !['DRAFT', 'CANCELLED', 'REJECTED', 'VOID', 'WITHDRAWN'].includes(String(app.status || '').toUpperCase());
}

function paymentApplicationIsCertified(app) {
  return [
    'CERTIFIED',
    'PAYMENT_NOTICE_SENT',
    'PAY_LESS_ISSUED',
    'APPROVED',
    'PARTIAL_PAYMENT',
    'PARTIALLY_PAID',
    'PAID',
  ].includes(String(app.status || '').toUpperCase());
}

function recentFinanceBuckets(monthCount) {
  const now = new Date();
  const buckets = [];
  for (let i = Math.max(Number(monthCount || 6), 1) - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({
      key,
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
      committed: 0,
      actuals: 0,
      value: 0,
    });
  }
  return buckets;
}

function financeMonthKey(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function normaliseFinanceStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function financeStatusMatches(rowStatus, requestedStatus) {
  const requested = normaliseFinanceStatus(requestedStatus);
  if (!requested || requested === 'any') return true;

  const actual = normaliseFinanceStatus(rowStatus);
  if (requested === 'open') {
    return !actual || [
      'draft',
      'open',
      'received',
      'submitted',
      'issued',
      'sent',
      'acknowledged',
      'pending_review',
      'pending_match',
      'matched',
    ].includes(actual);
  }
  if (requested === 'certified') {
    return ['certified', 'payment_notice_sent', 'pay_less_issued'].includes(actual);
  }
  if (requested === 'partially_paid') {
    return ['partially_paid', 'partial_payment'].includes(actual);
  }
  if (requested === 'rejected') {
    return ['rejected', 'cancelled', 'void', 'withdrawn', 'disputed'].includes(actual);
  }
  return actual === requested;
}

function financeRowSearchText(row) {
  return [
    row.ref,
    row.reference,
    row.supplier?.name,
    row.supplierName,
    row.contract?.title,
    row.contract?.contractRef,
    row.variationTitle,
    row.status,
    row.type,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function financeRowDateValue(row) {
  const d = new Date(row.date || 0);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function sortFinanceRows(rows, orderBy) {
  const [field = 'date', direction = 'desc'] = String(orderBy || 'date.desc').split('.');
  const factor = direction === 'asc' ? 1 : -1;
  return rows.sort((a, b) => {
    let diff = 0;
    if (field === 'amount') {
      diff = financeMoney(a.amount) - financeMoney(b.amount);
    } else {
      diff = financeRowDateValue(a) - financeRowDateValue(b);
    }
    if (diff === 0) {
      diff = String(a.ref || '').localeCompare(String(b.ref || ''));
    }
    return diff * factor;
  });
}

function positiveIntParam(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  const intValue = Math.floor(parsed);
  return max ? Math.min(intValue, max) : intValue;
}

const financeApplicationSelect = {
  id: true,
  projectId: true,
  supplierId: true,
  contractId: true,
  applicationNumber: true,
  applicationNo: true,
  reference: true,
  title: true,
  status: true,
  paymentNoticeAmount: true,
  claimedNetValue: true,
  claimedThisPeriod: true,
  netClaimed: true,
  grossToDate: true,
  certifiedGrossValue: true,
  certifiedRetention: true,
  certifiedNetValue: true,
  certifiedThisPeriod: true,
  certifiedAmount: true,
  amountPaid: true,
  applicationDate: true,
  valuationDate: true,
  dueDate: true,
  certifiedDate: true,
  paidDate: true,
  updatedAt: true,
  supplier: { select: { id: true, name: true } },
  contract: { select: { id: true, title: true, contractRef: true } },
};

const financeVariationSelect = {
  id: true,
  projectId: true,
  reference: true,
  referenceCode: true,
  variationNumber: true,
  title: true,
  status: true,
  amount: true,
  value: true,
  approvedValue: true,
  certifiedValue: true,
  submittedDate: true,
  submissionDate: true,
  approvedDate: true,
  approvedAt: true,
  decisionDate: true,
  updatedAt: true,
  contract: { select: { id: true, title: true, contractRef: true } },
};

async function findFinanceApplications(tenantId, projectId) {
  try {
    return await prisma.applicationForPayment.findMany({
      where: { tenantId, projectId },
      select: financeApplicationSelect,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  } catch (error) {
    console.warn('[Financials] Payment applications unavailable for summary', error?.meta || error?.message);
    return [];
  }
}

app.get('/api/projects/:id/payment-applications', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id' });
    const applications = await findFinanceApplications(tenantId, projectId);
    const items = applications.map((app) => ({
      id: app.id,
      projectId,
      contractId: app.contractId,
      supplierId: app.supplierId,
      applicationNo: app.applicationNo || app.reference || `PA-${app.id}`,
      reference: app.reference,
      title: app.title,
      status: app.status,
      value: paymentApplicationFinanceValue(app),
      amount: paymentApplicationFinanceValue(app),
      amountPaid: financeMoney(app.amountPaid),
      applicationDate: app.applicationDate,
      valuationDate: app.valuationDate,
      dueDate: app.dueDate,
      updatedAt: app.updatedAt,
      supplier: app.supplier || null,
      contract: app.contract || null,
      href: `/finance/payment-applications/${app.id}`,
    }));
    res.json({ items, paymentApplications: items, total: items.length });
  } catch (error) {
    console.warn('[Payment Applications] Project list unavailable', error?.meta || error?.message);
    res.json({ items: [], paymentApplications: [], total: 0 });
  }
});

app.get('/api/projects/:id/financials/summary', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id' });
    const monthsRequested = Math.min(Math.max(Number(req.query.months || 6), 1), 18);
    const [invAgg, poAgg, contractAgg, applications] = await Promise.all([
      prisma.invoice?.aggregate?.({ where: { tenantId, projectId }, _sum: { gross: true } }).catch(()=>({ _sum: { gross: 0 } })),
      prisma.purchaseOrder?.aggregate?.({ where: { tenantId, projectId }, _sum: { total: true } }).catch(()=>({ _sum: { total: 0 } })),
      prisma.contract?.aggregate?.({ where: { tenantId, projectId }, _sum: { value: true } }).catch(()=>({ _sum: { value: 0 } })),
      findFinanceApplications(tenantId, projectId),
    ]);
    const invoicesTotal = financeMoney(invAgg?._sum?.gross);
    const purchaseOrdersTotal = financeMoney(poAgg?._sum?.total);
    const contractsTotal = financeMoney(contractAgg?._sum?.value);
    const certifiedApplications = applications.filter((app) => paymentApplicationIsActive(app) && paymentApplicationIsCertified(app));
    const paymentApplicationsCertified = certifiedApplications.reduce((sum, app) => sum + paymentApplicationFinanceValue(app), 0);
    const paymentApplicationsPaid = applications.reduce((sum, app) => sum + financeMoney(app.amountPaid), 0);
    const paymentApplicationsOutstanding = Math.max(paymentApplicationsCertified - paymentApplicationsPaid, 0);
    const committed = contractsTotal + purchaseOrdersTotal;
    const actuals = invoicesTotal + paymentApplicationsCertified;
    const value = 0;
    const marginPct = value > 0 ? ((value - actuals) / value) * 100 : 0;

    const buckets = recentFinanceBuckets(monthsRequested);
    const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    for (const app of certifiedApplications) {
      const bucket = bucketMap.get(financeMonthKey(paymentApplicationFinanceDate(app)));
      if (bucket) bucket.actuals += paymentApplicationFinanceValue(app);
    }
    const latestBucket = buckets[buckets.length - 1];
    if (latestBucket) {
      latestBucket.committed += committed;
      latestBucket.value += value;
    }

    res.json({
      summary: {
        committed,
        actuals,
        value,
        marginPct,
        certified: paymentApplicationsCertified,
        paid: paymentApplicationsPaid,
        outstanding: paymentApplicationsOutstanding,
      },
      totals: {
        invoices: invoicesTotal,
        purchaseOrders: purchaseOrdersTotal,
        contracts: contractsTotal,
        paymentApplicationsCertified,
        paymentApplicationsPaid,
        paymentApplicationsOutstanding,
      },
      trend: {
        months: buckets.map((bucket) => bucket.label),
        committed: buckets.map((bucket) => Math.round(bucket.committed * 100) / 100),
        actuals: buckets.map((bucket) => Math.round(bucket.actuals * 100) / 100),
        value: buckets.map((bucket) => Math.round(bucket.value * 100) / 100),
      },
      months: buckets,
    });
  } catch (_) { res.json({ totals: { invoices: 0, purchaseOrders: 0 }, months: [] }); }
});

app.get('/api/projects/:id/financials/transactions', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id' });
    const type = String(req.query.type || 'any');
    const status = String(req.query.status || 'any');
    const search = String(req.query.q || '').trim().toLowerCase();
    const offset = positiveIntParam(req.query.offset, 0, 10000);
    const limit = Math.max(1, positiveIntParam(req.query.limit, 25, 100));
    const [invoices, pos, applications, variations] = await Promise.all([
      prisma.invoice?.findMany?.({
        where: { tenantId, projectId },
        select: {
          id: true,
          projectId: true,
          number: true,
          issueDate: true,
          dueDate: true,
          gross: true,
          status: true,
          supplier: { select: { id: true, name: true } },
          contract: { select: { id: true, title: true, contractRef: true } },
        },
        take: 500,
      }).catch(()=>[]),
      prisma.purchaseOrder?.findMany?.({
        where: { tenantId, projectId },
        select: {
          id: true,
          projectId: true,
          code: true,
          supplier: true,
          supplierId: true,
          orderDate: true,
          total: true,
          status: true,
          contract: { select: { id: true, title: true, contractRef: true } },
        },
        take: 500,
      }).catch(()=>[]),
      findFinanceApplications(tenantId, projectId),
      prisma.variation?.findMany?.({
        where: { tenantId, projectId, is_deleted: false },
        select: financeVariationSelect,
        take: 500,
      }).catch(()=>[]),
    ]);
    const items = [
      ...invoices.map((i) => ({
        id: i.id,
        type: 'invoice',
        date: i.issueDate || i.dueDate,
        ref: i.number,
        amount: i.gross,
        status: i.status,
        supplier: i.supplier || null,
        projectId: i.projectId || projectId,
        contract: i.contract || null,
        href: `/invoices/${i.id}`,
      })),
      ...pos.map((p) => ({
        id: p.id,
        type: 'po',
        date: p.orderDate,
        ref: p.code,
        amount: p.total,
        status: p.status,
        supplier: p.supplierId ? { id: p.supplierId, name: p.supplier || `Supplier #${p.supplierId}` } : (p.supplier ? { name: p.supplier } : null),
        supplierName: p.supplier,
        projectId: p.projectId || projectId,
        contract: p.contract || null,
        href: `/finance/pos/${p.id}`,
      })),
      ...applications
        .filter((app) => paymentApplicationIsActive(app))
        .map((app) => ({
          id: app.id,
          type: 'payment_application',
          date: paymentApplicationFinanceDate(app),
          ref: app.applicationNo || app.reference || `PA-${app.id}`,
          amount: paymentApplicationFinanceValue(app),
          status: app.status,
          supplier: app.supplier || null,
          projectId,
          contract: app.contract || null,
          href: `/finance/payment-applications/${app.id}`,
        })),
      ...(variations || []).map((variation) => ({
        id: variation.id,
        type: 'variation',
        date: variation.approvedDate || variation.approvedAt || variation.decisionDate || variation.submittedDate || variation.submissionDate || variation.updatedAt,
        ref: variation.variationNumber || variation.reference || variation.referenceCode || `VAR-${variation.id}`,
        amount: financeMoney(variation.approvedValue ?? variation.certifiedValue ?? variation.value ?? variation.amount),
        status: variation.status,
        variationTitle: variation.title,
        projectId: variation.projectId || projectId,
        contract: variation.contract || null,
        href: `/variations/${variation.id}`,
      })),
    ];

    let filtered = items;
    if (type && type !== 'any') {
      filtered = filtered.filter((item) => item.type === type);
    }
    if (status && status !== 'any') {
      filtered = filtered.filter((item) => financeStatusMatches(item.status, status));
    }
    if (search) {
      filtered = filtered.filter((item) => financeRowSearchText(item).includes(search));
    }

    sortFinanceRows(filtered, req.query.orderBy);
    res.json({ items: filtered.slice(offset, offset + limit), total: filtered.length });
  } catch (error) {
    console.warn('[Financials] Transactions unavailable', error?.meta || error?.message);
    res.json({ items: [], total: 0 });
  }
});

// Programme data under /api/projects/:id/programme
app.get('/api/projects/:id/programme', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id' });
    const tasks = await prisma.programmeTask?.findMany?.({ where: { tenantId, projectId } }).catch(()=>[]);
    // Return an array directly — some FE hooks expect an array and call .filter on it
    res.json(Array.isArray(tasks) ? tasks : []);
  } catch (_) { res.json([]); }
});

// Carbon summary under /api/projects/:id/carbon/summary
app.get('/api/projects/:id/carbon/summary', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id' });
    const rows = await prisma.carbon?.findMany?.({ where: { tenantId, projectId } }).catch(()=>[]);
    const total = (rows || []).reduce((s, r) => s + Number(r.tco2e || 0), 0);
    res.json({ total, byScope: [], byMonth: [] });
  } catch (_) { res.json({ total: 0, byScope: [], byMonth: [] }); }
});

if (isDevEnv()) {
  // Dev-only routes
  app.use('/api/dev', lazyRouter('./routes/dev.cjs'));
  app.use('/api/dev/snapshot', requireAuth, lazyRouter('./routes/dev_snapshot.cjs'));
  app.use('/api/dev/ai', lazyRouter('./routes/dev.ai.cjs'));
}

// Dev-only: expose /api/dev-token when enabled
if (isDevAuthEnabled()) {
  app.use('/api', authDev(prisma));
}

// serve local uploads in dev for quick previews
if ((process.env.STORAGE_PROVIDER || 'local').toLowerCase() === 'local') {
  app.use('/files', express.static('uploads'));
}

/* JSON error handler (keep last) */
app.use((err, _req, res, _next) => {
  logError(err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ error: message });
});

// Start server with friendly EADDRINUSE handling during development
function startServer(port, allowRetry) {
  const host = '0.0.0.0';
  const server = app
    .listen(port, host, () => {
      console.log(`API on ${host}:${port}`);
    })
    .on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        // If an explicit PORT is set (e.g., 3001 must be used), check if it's our API already running
        if (EXPLICIT_PORT) {
          const url = `http://127.0.0.1:${port}/health`;
          // Use a short timeout to avoid hanging
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 500);
          globalThis
            .fetch(url, { signal: controller.signal })
            .then((r) => (clearTimeout(t), r.ok ? r.json() : null))
            .then((data) => {
              if (data && data.ok) {
                console.log(
                  `Another instance is already running on :${port}. Leaving it running.`
                );
                process.exit(0);
              } else {
                console.error(
                  `Port :${port} is already in use. Set a different PORT or stop the other process.`
                );
                process.exit(1);
              }
            })
            .catch(() => {
              console.error(
                `Port :${port} is already in use. Set a different PORT or stop the other process.`
              );
              process.exit(1);
            });
          return;
        }
        if (allowRetry) {
          const nextPort = port + 1;
          console.warn(`Port :${port} in use. Trying :${nextPort}...`);
          setTimeout(() => startServer(nextPort, true), 100);
          return;
        }
        console.error(
          `Port :${port} is already in use. Set a different PORT or stop the other process.`
        );
        process.exit(1);
      }
      throw err;
    });
  return server;
}

// Only auto-retry when no explicit PORT is set and not production
const allowRetry = !EXPLICIT_PORT && process.env.NODE_ENV !== 'production';
// Avoid binding to a port during Jest tests
if (process.env.JEST_WORKER_ID == null) {
  startServer(INITIAL_PORT, allowRetry);
}

module.exports = app;
