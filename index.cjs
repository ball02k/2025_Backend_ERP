const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

const variationsRouter = require('./routes/variations.cjs');
const documentsRouter = require('./routes/documents.cjs');
const projectsOverviewRouter = require('./routes/projects_overview');

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// Make BigInt values JSON-safe (Node can't stringify BigInt)
// If you prefer string IDs, swap Number(value) for value.toString()
app.set('json replacer', (key, value) =>
  (typeof value === 'bigint' ? Number(value) : value)
);

const PORT = process.env.PORT || 3001;
app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.use('/api/reference', require('./routes/reference')(prisma));
app.use('/api/clients', require('./routes/clients')(prisma));
app.use('/api/contacts', require('./routes/contacts')(prisma));
app.use('/api/projects', require('./routes/projects')(prisma));
app.use('/api/tasks', require('./routes/tasks')(prisma));
app.use('/api/variations', variationsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/projects', projectsOverviewRouter);

if (process.env.NODE_ENV !== 'production') {
  app.use('/api/dev/snapshot', require('./routes/dev_snapshot.cjs'));
}

// serve local uploads in dev for quick previews
if ((process.env.STORAGE_PROVIDER || 'local').toLowerCase() === 'local') {
  app.use('/files', express.static('uploads'));
}

app.listen(PORT, () => console.log(`API on :${PORT}`));

module.exports = app;
