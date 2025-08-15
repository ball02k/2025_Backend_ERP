const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

const variationsRouter = require('./routes/variations.cjs');
const documentsRouter = require('./routes/documents.cjs');
const projectsOverviewRouter = require('./routes/projects_overview.cjs');
const authRouter = require('./routes/auth.cjs');
const meRouter = require('./routes/me.cjs');
const usersRouter = require('./routes/users.cjs');
const rolesRouter = require('./routes/roles.cjs');
const { attachUser, requireAuth } = require('./middleware/auth.cjs');

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));
app.use(attachUser);

// Make BigInt values JSON-safe (Node can't stringify BigInt)
// If you prefer string IDs, swap Number(value) for value.toString()
app.set('json replacer', (key, value) =>
  (typeof value === 'bigint' ? Number(value) : value)
);

const PORT = process.env.PORT || 3001;
app.get('/health', (_req, res) => res.json({ ok: true }));

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

if (process.env.NODE_ENV !== 'production') {
  app.use('/api/dev/snapshot', requireAuth, require('./routes/dev_snapshot.cjs'));
}

// serve local uploads in dev for quick previews
if ((process.env.STORAGE_PROVIDER || 'local').toLowerCase() === 'local') {
  app.use('/files', express.static('uploads'));
}

/* JSON error handler (keep last) */
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => console.log(`API on :${PORT}`));

module.exports = app;
