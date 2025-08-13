// routes/reference.js
const express = require('express');

module.exports = (prisma) => {
  const router = express.Router();

  router.get('/project-statuses', async (_req, res, next) => {
    try {
      const rows = await prisma.projectStatus.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        select: { id: true, key: true, label: true, colorHex: true, sortOrder: true, isActive: true }
      });
      res.json(rows);
    } catch (e) { next(e); }
  });

  router.get('/project-types', async (_req, res, next) => {
    try {
      const rows = await prisma.projectType.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        select: { id: true, key: true, label: true, colorHex: true, sortOrder: true, isActive: true }
      });
      res.json(rows);
    } catch (e) { next(e); }
  });

  router.get('/task-statuses', async (_req, res, next) => {
    try {
      const rows = await prisma.taskStatus.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        select: { id: true, key: true, label: true, colorHex: true, sortOrder: true, isActive: true }
      });
      res.json(rows);
    } catch (e) { next(e); }
  });

  return router;
};
