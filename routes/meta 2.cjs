const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// static options (strings, not enums) — extend as needed
const OPTIONS = {
  status: ['planning', 'tendering', 'pre-construction', 'live', 'on-hold', 'practical-completion', 'closed'],
  ribaStage: ['0', '1', '2', '3', '4', '5', '6', '7'],
  sector: ['commercial', 'residential', 'education', 'healthcare', 'infrastructure', 'fit-out', 'industrial'],
  currency: ['GBP', 'EUR', 'USD'],
  paymentTermsDays: [14, 21, 28, 30, 35],
  retentionPct: [0, 3, 5],
  contractTypes: ['NEC4', 'JCT 2016', 'JCT 2024', 'FIDIC', 'ICC'],
  contractForms: {
    NEC4: ['ECC Option A', 'ECC Option B', 'ECC Option C', 'ECC Option E'],
    'JCT 2016': ['DB', 'SBC', 'MW', 'IC'],
    'JCT 2024': ['DB', 'SBC', 'MW', 'IC'],
    FIDIC: ['Red Book', 'Yellow Book', 'Silver Book'],
    ICC: ['Measurement', 'Design & Build'],
  },
};

// GET /meta/project-options
router.get('/meta/project-options', (req, res) => {
  res.json(OPTIONS);
});

// GET /meta/users — minimal internal users for selects
router.get('/meta/users', async (req, res, next) => {
  try {
    const tenantId = req.user && req.user.tenantId;
    const users = await prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch (e) {
    next(e);
  }
});

// GET /meta/clients — minimal clients
router.get('/meta/clients', async (req, res, next) => {
  try {
    const tenantId = req.user && req.user.tenantId;
    // Client has no tenantId column; scope via related projects for this tenant
    const rows = await prisma.client.findMany({
      where: { deletedAt: null, projects: { some: { tenantId, deletedAt: null } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// GET /meta/client/:clientId/contacts — minimal contacts for that client
router.get('/meta/client/:clientId/contacts', async (req, res, next) => {
  try {
    const tenantId = req.user && req.user.tenantId;
    const clientId = Number(req.params.clientId);
    const rows = await prisma.contact.findMany({
      where: { tenantId, clientId },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    });
    // provide minimal shape including a derived name for FE convenience
    const mapped = rows.map((c) => ({ id: c.id, email: c.email, name: [c.firstName, c.lastName].filter(Boolean).join(' ').trim() }));
    res.json(mapped);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
