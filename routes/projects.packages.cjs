const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { safeJson } = require('../lib/serialize.cjs');

router.get('/projects/:projectId/packages', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const rows = await prisma.package.findMany({ where: { projectId }, orderBy: [{ code: 'asc' }, { name: 'asc' }] });
    const data = rows.map(r => { const row = safeJson(r); row.links = buildLinks('package', { ...row, projectId }); return row; });
    res.json({ items: data, total: data.length });
  } catch (e) { next(e); }
});

router.post('/projects/:projectId/packages', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const { code, name, description } = req.body || {};
    const created = await prisma.package.create({ data: { projectId, code, name, description } });
    const row = safeJson(created); row.links = buildLinks('package', { ...row, projectId });
    res.json(row);
  } catch (e) { next(e); }
});

module.exports = router;

