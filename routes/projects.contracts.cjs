const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { safeJson } = require('../lib/serialize.cjs');

router.get('/projects/:projectId/contracts', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const rows = await prisma.contract.findMany({
      where: { projectId },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        supplier: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        package: { select: { id: true, name: true } },
      }
    });
    const data = rows.map(r => {
      try {
        const x = safeJson(r);
        x.links = buildLinks('contract', x);
        return x;
      } catch (err) {
        console.error('[projects.contracts] safeJson error:', err?.message);
        return r; // fallback to raw object
      }
    });
    res.json({ items: data, total: data.length });
  } catch (e) {
    console.error('[projects.contracts] Error:', e?.message, e?.stack);
    next(e);
  }
});

module.exports = router;

