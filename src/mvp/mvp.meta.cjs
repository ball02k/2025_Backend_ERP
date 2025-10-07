const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /mvp/meta/projects/:projectId/contracts/active
router.get('/mvp/meta/projects/:projectId/contracts/active', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const now = new Date();
    const rows = await prisma.contract.findMany({ where: { projectId } });
    const active = rows.filter((c) => !c.endDate || new Date(c.endDate) >= now).map((c) => ({ id: c.id, title: c.title }));
    res.json(active);
  } catch (e) { next(e); }
});

module.exports = router;

