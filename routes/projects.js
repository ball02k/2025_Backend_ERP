const express = require('express');
module.exports = (prisma) => {
  const router = express.Router();
  router.get('/', async (req, res) => {
    try {
      const tenant = req.get('x-tenant-id') || process.env.TENANT_DEFAULT || 'demo';
      const take = Math.min(Number(req.query.limit) || 50, 100);
      const skip = Math.max(Number(req.query.offset) || 0, 0);
      const sortParam = String(req.query.sort || 'startDate:desc');
      const [field, dirRaw] = sortParam.split(':');
      const allowed = new Set(['id','code','name','status','type','startDate','endDate','createdAt','updatedAt']);
      const sortField = allowed.has(field) ? field : 'createdAt';
      const order = (dirRaw === 'asc' || dirRaw === 'ASC') ? 'asc' : 'desc';
      const orderBy = { [sortField]: order };
      const where = { tenantId: tenant };
      const [total, rows] = await Promise.all([
        prisma.project.count({ where }),
        prisma.project.findMany({
          where,
          orderBy,
          skip,
          take,
          include: {
            client: { select: { id: true, name: true } },
            statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
            typeRel: { select: { id: true, key: true, label: true, colorHex: true } },
          },
        }),
      ]);
      res.json({ total, projects: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message || 'Failed to fetch projects' });
    }
  });
  return router;
};

