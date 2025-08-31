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
const healthRouter = require('./routes/health.cjs');
const authRouter = require('./routes/auth.cjs');
const meRouter = require('./routes/me.cjs');
const usersRouter = require('./routes/users.cjs');
const rolesRouter = require('./routes/roles.cjs');
const financialsRouter = require('./routes/financials.cjs');
const onboardingRouter = require('./routes/onboarding.cjs');
const suppliersRouter = require('./routes/suppliers.cjs');
const searchRouter = require('./routes/search.cjs');
const requestsRouter = require('./routes/requests.cjs');
const spmRouter = require('./routes/spm.cjs');
const homeRoutes = require('./routes/home.cjs');
const { attachUser } = require('./middleware/auth.cjs');
const requireAuth = require('./middleware/requireAuth.cjs');
const devAuth = require('./middleware/devAuth.cjs');
const devRbac = require('./middleware/devRbac.cjs');
const authDev = require('./routes/auth.dev.cjs');

// CORS: allow Vite dev servers and handle preflight
const allowedOrigins = ['http://localhost:5173', 'http://localhost:5174'];
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
// DEV-ONLY RBAC helper to ensure admin role and project membership
app.use(devRbac);

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
// app.use('/api/projects', projectsOverviewRouter);
app.use('/api/projects', requireAuth, projectsOverviewRouter);
app.use('/api/health', requireAuth, healthRouter);
app.use('/api/tasks', requireAuth, require('./routes/tasks')(prisma));
app.use('/api/variations', requireAuth, variationsRouter);
app.use('/api/documents', requireAuth, documentsRouter);
app.use('/api/onboarding', requireAuth, onboardingRouter);
app.use('/api/procurement', requireAuth, require('./routes/procurement.cjs'));
app.use('/api/financials', requireAuth, financialsRouter);
app.use('/api/suppliers', requireAuth, suppliersRouter);
app.use('/api/requests', requireAuth, requestsRouter);
app.use('/api/spm', requireAuth, spmRouter);
app.use('/api/search', requireAuth, searchRouter);
app.use('/api', homeRoutes(prisma, { requireAuth }));

if (process.env.NODE_ENV !== 'production' || process.env.DEV_AUTH_BYPASS === 'true') {
  // Dev-only routes
  app.use('/api/dev', require('./routes/dev.cjs'));
  app.use('/api/dev/snapshot', requireAuth, require('./routes/dev_snapshot.cjs'));
}

// Dev-only: expose /api/dev-token when enabled
if (process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_AUTH === '1') {
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
  const server = app
    .listen(port, () => {
      console.log(`API on :${port}`);
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
