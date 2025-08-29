const express = require('express');

module.exports = (prisma) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const tenant = req.user.tenantId;
      const take = Math.min(Number(req.query.limit) || 20, 100);
      const skip = Math.max(Number(req.query.offset) || 0, 0);

      const sortParam = String(req.query.sort || 'dueDate:desc');
      const [rawField, rawDir] = sortParam.split(':');
      const allowed = new Set(['id','projectId','tenantId','title','description','dueDate','assignee','status','statusId','createdAt','updatedAt']);
      const field = allowed.has(rawField) ? rawField : 'dueDate';
      const dir = (rawDir === 'asc' || rawDir === 'ASC') ? 'asc' : 'desc';
      const orderBy = { [field]: dir };

      const where = { tenantId: tenant };

      const [total, rows] = await Promise.all([
        prisma.task.count({ where }),
        prisma.task.findMany({
          where, orderBy, skip, take,
          include: {
            project:   { select: { id: true, name: true } },
            statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
          }
        }),
      ]);

      res.json({ total, tasks: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message || 'Failed to fetch tasks' });
    }
  });

  return router;
};

