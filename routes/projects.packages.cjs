const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { safeJson } = require('../lib/serialize.cjs');

const packageSelect = {
  id: true,
  projectId: true,
  code: true,
  name: true,
  description: true,
  scope: true,
  trade: true,
  status: true,
  budgetEstimate: true,
  deadline: true,
  awardValue: true,
  awardSupplierId: true,
  createdAt: true,
  updatedAt: true,
  costCodeId: true,
};

router.get('/projects/:projectId/packages', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const rows = await prisma.package.findMany({
      where: { projectId },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
      select: packageSelect,
    });
    const data = rows.map(r => { const row = safeJson(r); row.links = buildLinks('package', { ...row, projectId }); return row; });
    res.json({ items: data, total: data.length });
  } catch (e) { next(e); }
});

router.post('/projects/:projectId/packages', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const { code, name, description, costCodeId } = req.body || {};
    const created = await prisma.package.create({
      data: { projectId, code, name, description, costCodeId: costCodeId ?? null },
      select: packageSelect,
    });
    const row = safeJson(created); row.links = buildLinks('package', { ...row, projectId });
    res.json(row);
  } catch (e) { next(e); }
});

module.exports = router;

