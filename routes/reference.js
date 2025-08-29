// routes/reference.js
const express = require('express');

module.exports = (prisma) => {
  const router = express.Router();

  router.get('/project-statuses', async (req, res, next) => {
    try {
      const tnum = Number(req.user?.tenantId);
      const rows = await prisma.projectStatus.findMany({
        where: { isActive: true, OR: [{ tenantId: null }, ...(Number.isFinite(tnum) ? [{ tenantId: tnum }] : [])] },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        select: { id: true, key: true, label: true, colorHex: true, sortOrder: true, isActive: true }
      });
      res.json(rows);
    } catch (e) { next(e); }
  });

  router.get('/project-types', async (req, res, next) => {
    try {
      const tnum = Number(req.user?.tenantId);
      const rows = await prisma.projectType.findMany({
        where: { isActive: true, OR: [{ tenantId: null }, ...(Number.isFinite(tnum) ? [{ tenantId: tnum }] : [])] },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        select: { id: true, key: true, label: true, colorHex: true, sortOrder: true, isActive: true }
      });
      res.json(rows);
    } catch (e) { next(e); }
  });

  router.get('/task-statuses', async (req, res, next) => {
    try {
      const tnum = Number(req.user?.tenantId);
      const rows = await prisma.taskStatus.findMany({
        where: { isActive: true, OR: [{ tenantId: null }, ...(Number.isFinite(tnum) ? [{ tenantId: tnum }] : [])] },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        select: { id: true, key: true, label: true, colorHex: true, sortOrder: true, isActive: true }
      });
      res.json(rows);
    } catch (e) { next(e); }
  });

  return router;
};
