const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { safeJson } = require('../lib/serialize.cjs');

router.get('/projects/:projectId/contracts', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const rows = await prisma.contract.findMany({ where: { projectId }, orderBy: [{ updatedAt: 'desc' }] });
    const data = rows.map(r => { const x = safeJson(r); x.links = buildLinks('contract', x); return x; });
    res.json({ items: data, total: data.length });
  } catch (e) { next(e); }
});

module.exports = router;

