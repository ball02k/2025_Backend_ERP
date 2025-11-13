const express = require('express');

module.exports = (prisma) => {
  const router = express.Router();

  // GET /projects/:projectId/diary
  router.get('/:projectId/diary', async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId;
      const projectId = Number(req.params.projectId);
      const { date } = req.query || {};
      const where = { tenantId, projectId };
      if (date) {
        const d = new Date(String(date));
        if (!isNaN(d.getTime())) {
          const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
          where.date = { gte: start, lt: end };
        }
      }
      const rows = await prisma.diaryEntry.findMany({ where, orderBy: [{ date: 'desc' }, { id: 'desc' }] });
      res.json({ data: rows });
    } catch (e) { next(e); }
  });

  // POST /projects/:projectId/diary
  router.post('/:projectId/diary', async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user?.id ? Number(req.user.id) : null;
      const projectId = Number(req.params.projectId);
      const { date, description, issues } = req.body || {};
      if (!description) return res.status(400).json({ error: 'description required' });
      const when = date ? new Date(date) : new Date();
      const row = await prisma.diaryEntry.create({ data: { tenantId, projectId, date: when, description: String(description), issues: issues ? String(issues) : null, createdBy: userId || 0 } });
      res.status(201).json({ data: row });
    } catch (e) { next(e); }
  });

  return router;
};

