// routes/projects.js
const express = require('express');
const { projectsQuerySchema, projectBodySchema } = require('../lib/validation');

module.exports = (prisma) => {
  const router = express.Router();

  // GET /api/projects?search=&statusId=&typeId=&clientId=&page=&pageSize=&sort=&order=
  router.get('/', async (req, res, next) => {
    try {
      const { page, pageSize, sort, order, search, clientId, statusId, typeId } =
        projectsQuerySchema.parse(req.query);

      const where = {
        ...(clientId ? { clientId } : {}),
        ...(statusId ? { statusId } : {}),
        ...(typeId ? { typeId } : {}),
        ...(search
          ? { OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ]}
          : {}),
      };

      const [total, rows] = await Promise.all([
        prisma.project.count({ where }),
        prisma.project.findMany({
          where,
          orderBy: { [sort]: order },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            client: true,
            statusRel: true,
            typeRel: true,
          },
        }),
      ]);

      res.json({
        page, pageSize, total, rows,
        // backward-compat convenience mapping
        rowsMapped: rows.map(p => ({
          ...p,
          statusText: p.statusRel?.label ?? null,
          typeText: p.typeRel?.label ?? null,
        })),
      });
    } catch (e) { next(e); }
  });

  // POST /api/projects
  router.post('/', async (req, res, next) => {
    try {
      const body = projectBodySchema.parse(req.body);
      const created = await prisma.project.create({
        data: {
          ...body,
          // convert numeric budget/actualSpend to Prisma.Decimal if present
          ...(body.budget != null ? { budget: body.budget } : {}),
          ...(body.actualSpend != null ? { actualSpend: body.actualSpend } : {}),
          ...(body.startDate ? { startDate: new Date(body.startDate) } : {}),
          ...(body.endDate ? { endDate: new Date(body.endDate) } : {}),
        },
        include: { client: true, statusRel: true, typeRel: true },
      });
      res.status(201).json(created);
    } catch (e) { next(e); }
  });

  // PUT /api/projects/:id
  router.put('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const body = projectBodySchema.partial().parse(req.body);
      const updated = await prisma.project.update({
        where: { id },
        data: {
          ...body,
          ...(body.budget != null ? { budget: body.budget } : {}),
          ...(body.actualSpend != null ? { actualSpend: body.actualSpend } : {}),
          ...(body.startDate ? { startDate: new Date(body.startDate) } : {}),
          ...(body.endDate ? { endDate: new Date(body.endDate) } : {}),
        },
        include: { client: true, statusRel: true, typeRel: true },
      });
      res.json(updated);
    } catch (e) { next(e); }
  });

  return router;
};
