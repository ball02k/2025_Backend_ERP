// routes/tasks.js
const express = require('express');
const { tasksQuerySchema, taskBodySchema } = require('../lib/validation');

module.exports = (prisma) => {
  const router = express.Router();

  // GET /api/tasks?search=&projectId=&statusId=&dueBefore=&dueAfter=&page=&pageSize=&sort=&order=
  router.get('/', async (req, res, next) => {
    try {
      const { page, pageSize, sort, order, search, projectId, statusId, dueBefore, dueAfter } =
        tasksQuerySchema.parse(req.query);

      const where = {
        ...(projectId ? { projectId } : {}),
        ...(statusId ? { statusId } : {}),
        ...(search
          ? { OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ]}
          : {}),
        ...(dueBefore ? { dueDate: { lte: new Date(dueBefore) } } : {}),
        ...(dueAfter ? { dueDate: { gte: new Date(dueAfter) } } : {}),
      };

      const [total, rows] = await Promise.all([
        prisma.task.count({ where }),
        prisma.task.findMany({
          where,
          orderBy: { [sort]: order },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            project: { select: { id: true, name: true } },
            statusRel: true,
          },
        }),
      ]);

      res.json({
        page, pageSize, total, rows,
        rowsMapped: rows.map(t => ({
          ...t,
          statusText: t.statusRel?.label ?? null,
        })),
      });
    } catch (e) { next(e); }
  });

  // POST /api/tasks
  router.post('/', async (req, res, next) => {
    try {
      const body = taskBodySchema.parse(req.body);
      const created = await prisma.task.create({
        data: {
          ...body,
          ...(body.dueDate ? { dueDate: new Date(body.dueDate) } : {}),
        },
        include: {
          project: { select: { id: true, name: true } },
          statusRel: true,
        },
      });
      res.status(201).json(created);
    } catch (e) { next(e); }
  });

  // PUT /api/tasks/:id
  router.put('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const body = taskBodySchema.partial().parse(req.body);
      const updated = await prisma.task.update({
        where: { id },
        data: {
          ...body,
          ...(body.dueDate ? { dueDate: new Date(body.dueDate) } : {}),
        },
        include: {
          project: { select: { id: true, name: true } },
          statusRel: true,
        },
      });
      res.json(updated);
    } catch (e) { next(e); }
  });

  return router;
};
