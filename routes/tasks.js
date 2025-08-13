module.exports = (prisma) => {
  const router = require('express').Router();

  router.get('/', async (_req, res, next) => {
    try {
      const rows = await prisma.task.findMany({
        orderBy: { id: 'asc' },
        include: {
          project: { select: { id: true, name: true } },
          statusRel: true,
        },
      });

      const out = rows.map((t) => ({
        ...t,
        statusText: t.statusRel?.label ?? null,
      }));

      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  return router;
};
