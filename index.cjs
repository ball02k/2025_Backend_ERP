require('dotenv/config');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const { sign } = require('./utils/jwt.cjs');
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
  const SECRET = process.env.JWT_SECRET || 'devsecret';

  app.post('/api/dev/login', express.json(), async (req, res) => {
    try {
      const tId = req.user?.tenantId || TENANT_DEFAULT;
      const user = await prisma.user.upsert({
        where: { email: 'dev@demo.local' },
        update: { tenantId: tId, name: 'Dev User' },
        create: {
          email: 'dev@demo.local',
          name: 'Dev User',
          tenantId: tId,
          passwordSHA: '',
        },
      });
      // Ensure membership to all tenant projects for easy dev
      const projects = await prisma.project.findMany({ where: { tenantId: tId }, select: { id: true } });
      await Promise.all(
        projects.map((p) =>
          prisma.projectMembership.upsert({
            where: { tenantId_projectId_userId: { tenantId: tId, projectId: p.id, userId: user.id } },
            update: {},
            create: { tenantId: tId, projectId: p.id, userId: user.id, role: 'Member' },
          })
        )
      );
      const token = sign(
        { sub: String(user.id), tenantId: tId },
        SECRET,
        { expiresIn: 60 * 60 * 12 }
      );
      return res.json({ token, user });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Login failed' });
    }
  });

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
