require('dotenv/config');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const pkg = require('./package.json');
const { logError } = require('./utils/errors.cjs');

// BigInt JSON patch
BigInt.prototype.toJSON = function () {
  return Number(this);
};

const app = express();
const prisma = new PrismaClient();
const TENANT_DEFAULT = process.env.TENANT_DEFAULT || 'demo';

const variationsRouter = require('./routes/variations.cjs');
const documentsRouter = require('./routes/documents_v2.cjs');
const projectsOverviewRouter = require('./routes/projects_overview.cjs');
const authRouter = require('./routes/auth.cjs');
const meRouter = require('./routes/me.cjs');
const usersRouter = require('./routes/users.cjs');
const rolesRouter = require('./routes/roles.cjs');
const financialsRouter = require('./routes/financials.cjs');
const { attachUser, requireAuth } = require('./middleware/auth.cjs');

app.use(
  cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));
app.use(attachUser);

// Make BigInt values JSON-safe (Node can't stringify BigInt)
// If you prefer string IDs, swap Number(value) for value.toString()
app.set('json replacer', (key, value) =>
  (typeof value === 'bigint' ? Number(value) : value)
);

const PORT = process.env.PORT || 3001;
app.get(['/health', '/api/health'], (_req, res) =>
  res.json({ ok: true, version: pkg.version, time: new Date().toISOString() })
);

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
app.use('/api/tasks', requireAuth, require('./routes/tasks')(prisma));
app.use('/api/variations', requireAuth, variationsRouter);
app.use('/api/documents', requireAuth, documentsRouter);
app.use('/api/procurement', requireAuth, require('./routes/procurement.cjs'));
app.use('/api/financials', requireAuth, financialsRouter);

if (process.env.NODE_ENV !== 'production') {
  // Dev-only routes
  app.use('/api/dev', require('./routes/dev.cjs'));
  app.use('/api/dev/snapshot', requireAuth, require('./routes/dev_snapshot.cjs'));
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

app.listen(PORT, () => console.log(`API on :${PORT}`));

module.exports = app;
