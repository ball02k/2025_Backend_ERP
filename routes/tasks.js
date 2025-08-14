// routes/tasks.js
const express = require('express');
const { tasksQuerySchema, taskBodySchema } = require('../lib/validation');
const { recomputeProjectSnapshot } = require("../services/projectSnapshot");

function getTenantId(req) {
  return req.headers["x-tenant-id"] || "demo";
}

module.exports = (prisma) => {
  const router = express.Router();

  // GET /api/tasks?search=&projectId=&statusId=&dueBefore=&dueAfter=&page=&pageSize=&sort=&order=
  router.get('/', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const { page, pageSize, sort, order, search, projectId, statusId, dueBefore, dueAfter } =
        tasksQuerySchema.parse(req.query);

      const where = {
        tenantId,
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
            statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
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
      const tenantId = getTenantId(req);
      const body = taskBodySchema.parse(req.body);
      const created = await prisma.task.create({
        data: {
          ...body,
          tenantId,
          ...(body.dueDate ? { dueDate: new Date(body.dueDate) } : {}),
        },
        include: {
          project: { select: { id: true, name: true } },
          statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
        },
      });
      await recomputeProjectSnapshot(Number(created.projectId), tenantId);
      res.status(201).json(created);
    } catch (e) { next(e); }
  });

  // PUT /api/tasks/:id
  router.put('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);
      const existing = await prisma.task.findFirst({
        where: { id, tenantId },
        select: { projectId: true },
      });
      if (!existing) return res.status(404).json({ error: 'Task not found' });

      const body = taskBodySchema.partial().parse(req.body);
      const updated = await prisma.task.update({
        where: { id },
        data: {
          ...body,
          ...(body.dueDate ? { dueDate: new Date(body.dueDate) } : {}),
        },
        include: {
          project: { select: { id: true, name: true } },
          statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
        },
      });
      await recomputeProjectSnapshot(Number(updated.projectId), tenantId);
      if (updated.projectId !== existing.projectId) {
        await recomputeProjectSnapshot(Number(existing.projectId), tenantId);
      }
      res.json(updated);
    } catch (e) { next(e); }
  });

  // DELETE /api/tasks/:id
  router.delete('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

      const task = await prisma.task.findFirst({
        where: { id, tenantId },
        select: { id: true, projectId: true },
      });
      if (!task) return res.status(404).json({ error: 'Task not found' });

      await prisma.task.delete({ where: { id } });
      await recomputeProjectSnapshot(Number(task.projectId), tenantId);
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
};
