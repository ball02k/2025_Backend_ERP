module.exports = (prisma) => {
  const router = require('express').Router();

  router.get('/', async (_req, res, next) => {
    try {
      const rows = await prisma.project.findMany({
        orderBy: { id: 'asc' },
        include: {
          client: true,
          statusRel: true,
          typeRel: true,
        },
      });

      const out = rows.map((p) => ({
        ...p,
        statusText: p.statusRel?.label ?? null,
        typeText: p.typeRel?.label ?? null,
      }));

      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  return router;
};
