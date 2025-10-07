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
  return Number(this);
};

const app = express();
const prisma = new PrismaClient();
const TENANT_DEFAULT = process.env.TENANT_DEFAULT || 'demo';

console.log('[API Catalog] hash:', getCatalogHash());
console.log(getDeltaPrompt());


const variationsRouter = require('./routes/variations.cjs');
const documentsRouter = require('./routes/documents_v2.cjs');
const projectsOverviewRouter = require('./routes/projects_overview.cjs');
const projectDocumentsRouter = require('./routes/project_documents.cjs');
const healthRouter = require('./routes/health.cjs');
const authRouter = require('./routes/auth.cjs');
const meRouter = require('./routes/me.cjs');
const usersRouter = require('./routes/users.cjs');
const rolesRouter = require('./routes/roles.cjs');
const financialsRouter = require('./routes/financials.cjs');
const onboardingRouter = require('./routes/onboarding.cjs');
const suppliersRouter = require('./routes/suppliers.cjs');
const rfisRouter = require('./routes/rfis.cjs');
const qaRouter = require('./routes/qa.cjs');
const hsRouter = require('./routes/hs.cjs');
const carbonRouter = require('./routes/carbon.cjs');
const searchRouter = require('./routes/search.cjs');
const lookupsRouter = require('./routes/lookups.cjs');
const publicRoutes = require('./routes/public.cjs');
const requestsRouter = require('./routes/requests.cjs');
const spmRouter = require('./routes/spm.cjs');
const integrationsRouter = require('./routes/integrations.cjs');
const homeRoutes = require('./routes/home.cjs');
const procurementRoutes = require('./routes/procurement');
const analyticsRouter = require('./routes/analytics.cjs');
const rfxRouter = require('./routes/rfx.cjs');
const projectInvoicesRouter = require('./routes/project_invoices.cjs');
const projectBudgetRouter = require('./routes/projects.budget.cjs');
const projectPackagesRouter = require('./routes/projects.packages.cjs');
const projectContractsRouter = require('./routes/projects.contracts.cjs');
const projectOverviewRouter2 = require('./routes/projects.overview.cjs');
const costCodesRouter = require('./routes/costCodes.cjs');
const financePoRouter = require('./routes/finance.pos.cjs');
const financeInvoicesRouter = require('./routes/finance.invoices.cjs');
const financeMatchRouter = require('./routes/finance.match.cjs');
const financeOcrRouter = require('./routes/finance.ocr.cjs');
const financeInboundRouter = require('./routes/finance.inbound.cjs');
const financeReceiptsRouter = require('./routes/finance.receipts.cjs');
const afpRouter = require('./routes/afp.cjs');
const afpOpenRouter = require('./routes/afp.open.cjs');
const cvrRouter = require('./routes/financials.cvr.cjs');
const diaryRouter = require('./routes/diary.cjs');
const { ensureFeature } = require('./middleware/featureGuard.js');
const documentLinksRouter = require('./routes/document.links.cjs');
const { attachUser } = require('./middleware/auth.cjs');
const { demoGuard } = require('./middleware/demo.cjs');
const requireAuth = require('./middleware/requireAuth.cjs');
const devAuth = require('./middleware/devAuth.cjs');
const devRbac = require('./middleware/devRbac.cjs');
const authDev = require('./routes/auth.dev.cjs');
const { isDevAuthEnabled, isDevEnv } = require('./utils/devFlags.cjs');

// CORS: allow dev servers and handle preflight
// Allow override via CORS_ORIGINS env (comma-separated)
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000', // common React dev server
  'http://localhost:4173', // Vite preview
  'http://localhost:4174',
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
app.use(attachUser);
// In dev, allow bypass to attach a demo user when no token is provided
app.use(devAuth); // must be before routes that use requireAuth
// Dev feature toggles via env (ENABLE_AFP=1 or ENABLE_FINANCE=1)
app.use(require('./middleware/devFeatures.cjs'));
// DEV-ONLY RBAC helper to ensure admin role and project membership
app.use(devRbac);
// Demo guard rails (block destructive or protected operations)
app.use(demoGuard);

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
// If you prefer string IDs, swap Number(value) for value.toString()
app.set('json replacer', (key, value) =>
  (typeof value === 'bigint' ? Number(value) : value)
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
app.use('/me', meRouter);
app.use('/api/users', usersRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/reference', requireAuth, require('./routes/reference')(prisma));
app.use('/api/clients', requireAuth, require('./routes/clients')(prisma));
app.use('/api/contacts', requireAuth, require('./routes/contacts')(prisma));
app.use('/api/projects', requireAuth, require('./routes/projects')(prisma));
app.use('/api/projects', requireAuth, require('./routes/project_members.cjs')(prisma));
app.use('/api/projects', requireAuth, require('./routes/project_alerts.cjs')(prisma));
// app.use('/api/projects', projectsOverviewRouter);
app.use('/api/projects', requireAuth, projectsOverviewRouter);
app.use('/api', requireAuth, projectBudgetRouter);
app.use('/api', requireAuth, projectPackagesRouter);
app.use('/api', requireAuth, projectContractsRouter);
app.use('/api', requireAuth, projectOverviewRouter2);
app.use('/api', requireAuth, costCodesRouter);
  app.use('/api/projects', requireAuth, rfxRouter(prisma));
  app.use('/api', requireAuth, rfxRouter(prisma));
app.use('/api/projects', requireAuth, cvrRouter(prisma));
app.use('/api/projects', requireAuth, diaryRouter(prisma));
app.use('/api/projects', requireAuth, projectInvoicesRouter(prisma));
app.use('/api/projects', requireAuth, projectDocumentsRouter);
app.use('/api/health', requireAuth, healthRouter);
app.use('/api/tasks', requireAuth, require('./routes/tasks')(prisma));
// Variations routes: mount under both /api and /api/variations for compatibility
app.use('/api', requireAuth, variationsRouter);
app.use('/api/variations', requireAuth, variationsRouter);
app.use('/api/documents', requireAuth, documentsRouter);
app.use('/api/onboarding', requireAuth, onboardingRouter);
app.use('/api/procurement', requireAuth, require('./routes/procurement.cjs'));
app.use('/api', requireAuth, procurementRoutes);
app.use('/api', requireAuth, cvrRouter(prisma));
app.use('/api/financials', requireAuth, financialsRouter);
// Also expose financials under /api/projects/financials for compatibility
app.use('/api/projects/financials', requireAuth, financialsRouter);
app.use('/api/suppliers', requireAuth, suppliersRouter);
app.use('/api/requests', requireAuth, requestsRouter);
app.use('/api/spm', requireAuth, spmRouter);
app.use('/api/search', requireAuth, searchRouter);
app.use('/api', requireAuth, lookupsRouter);
app.use('/api', requireAuth, documentLinksRouter);
app.use('/api/integrations', requireAuth, integrationsRouter());
// Meta, Geo, and Project Info (additive)
app.use('/api', requireAuth, require('./routes/meta.cjs'));
app.use('/api', requireAuth, require('./routes/geo.cjs'));
app.use('/api', requireAuth, require('./routes/projects.info.cjs'));
// MVP namespace (isolated under /api/mvp for FE wrapper compatibility)
app.use('/api/mvp', requireAuth, require('./src/mvp/index.cjs'));
// RFx Excel/email flows (additive)
app.use('/api', requireAuth, require('./routes/rfx.templates.cjs'));
app.use('/api', requireAuth, require('./routes/rfx.responses.cjs'));
app.use('/api', requireAuth, require('./routes/rfx.analysis.cjs'));
app.use('/api', requireAuth, require('./routes/rfx.email.cjs'));
// Demo reset route (top-level)
app.use(require('./routes/demo.cjs'));
app.use('/api/rfis', requireAuth, rfisRouter);
app.use('/api/qa', requireAuth, qaRouter);
app.use('/api/hs', requireAuth, hsRouter);
app.use('/api/carbon', requireAuth, carbonRouter);
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
app.use('/api', requireAuth, financeReceiptsRouter);
app.use('/api', financeInboundRouter);
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

// Project CVR: return an empty stub to avoid 404s when CVR module is not enabled
app.get('/api/projects/:id/cvr', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id' });
    // Try fetch minimal if tables exist, otherwise return empty
    let periods = [];
    try { periods = await prisma.cVRPeriod?.findMany?.({ where: { tenantId, projectId } }).catch(()=>[]); } catch(_) {}
    res.json({ periods: periods || [], entries: [] });
  } catch (_) { res.json({ periods: [], entries: [] }); }
});

// --------- Compatibility routes for FE variants expecting nested project endpoints ---------
// Financials summary/transactions under /api/projects/:id/financials/*
app.get('/api/projects/:id/financials/summary', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id' });
    // Basic aggregates from invoices and POs if present
    const [invAgg, poAgg] = await Promise.all([
      prisma.invoice?.aggregate?.({ where: { tenantId, projectId }, _sum: { gross: true } }).catch(()=>({ _sum: { gross: 0 } })),
      prisma.purchaseOrder?.aggregate?.({ where: { tenantId, projectId }, _sum: { total: true } }).catch(()=>({ _sum: { total: 0 } })),
    ]);
    res.json({
      totals: {
        invoices: Number(invAgg?._sum?.gross || 0),
        purchaseOrders: Number(poAgg?._sum?.total || 0),
      },
      months: [],
    });
  } catch (_) { res.json({ totals: { invoices: 0, purchaseOrders: 0 }, months: [] }); }
});

app.get('/api/projects/:id/financials/transactions', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id' });
    // Return a simple union view: invoices + POs as transactions
    const [invoices, pos] = await Promise.all([
      prisma.invoice?.findMany?.({ where: { tenantId, projectId }, select: { id: true, number: true, issueDate: true, gross: true } }).catch(()=>[]),
      prisma.purchaseOrder?.findMany?.({ where: { tenantId, projectId }, select: { id: true, code: true, orderDate: true, total: true } }).catch(()=>[]),
    ]);
    const items = [
      ...invoices.map((i) => ({ id: `inv:${i.id}`, type: 'invoice', date: i.issueDate, ref: i.number, amount: i.gross })),
      ...pos.map((p) => ({ id: `po:${p.id}`, type: 'po', date: p.orderDate, ref: p.code, amount: p.total })),
    ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    res.json({ items, total: items.length });
  } catch (_) { res.json({ items: [], total: 0 }); }
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
  app.use('/api/dev', require('./routes/dev.cjs'));
  app.use('/api/dev/snapshot', requireAuth, require('./routes/dev_snapshot.cjs'));
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
