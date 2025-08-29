const express = require('express');
const { z } = require('zod');
const { taskBodySchema } = require('../lib/validation');
const { requireProjectMember, assertProjectMember } = require('../middleware/membership.cjs');
const { recomputeProjectSnapshot } = require('../services/projectSnapshot');

module.exports = (prisma) => {
  const router = express.Router();

  // GET /api/tasks/summary
  // Endpoint Inventory: GET /api/tasks/summary
  router.get('/summary', async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const now = new Date();
      const dow = now.getDay() || 7; // 1..7 (treat Sunday as 7)
      const endOfWeek = new Date(now);
      endOfWeek.setHours(23, 59, 59, 999);
      endOfWeek.setDate(now.getDate() + (7 - dow));

      const notCompleted = { notIn: ['Done', 'done', 'Completed', 'completed', 'Closed', 'closed'] };
      const isCompleted = { in: ['Done', 'done', 'Completed', 'completed', 'Closed', 'closed'] };

      const [total, overdue, dueThisWeek, open, completed] = await Promise.all([
        prisma.task.count({ where: { tenantId, deletedAt: null } }),
        prisma.task.count({ where: { tenantId, deletedAt: null, status: notCompleted, dueDate: { lt: now } } }),
        prisma.task.count({ where: { tenantId, deletedAt: null, status: notCompleted, dueDate: { gte: now, lte: endOfWeek } } }),
        prisma.task.count({ where: { tenantId, deletedAt: null, status: notCompleted } }),
        prisma.task.count({ where: { tenantId, deletedAt: null, status: isCompleted } }),
      ]);

      res.json({ total, overdue, dueThisWeek, open, completed, updatedAt: new Date().toISOString() });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to compute task summary' });
    }
  });

  // GET /api/tasks
  router.get('/', async (req, res) => {
    try {
      const tenant = req.user && req.user.tenantId;
      const take = Math.min(Number(req.query.limit) || 20, 100);
      const skip = Math.max(Number(req.query.offset) || 0, 0);

      const sortParam = String(req.query.sort || 'dueDate:desc');
      const [rawField, rawDir] = sortParam.split(':');
      const allowed = new Set(['id','projectId','tenantId','title','description','dueDate','assignee','status','statusId','createdAt','updatedAt']);
      const field = allowed.has(rawField) ? rawField : 'dueDate';
      const dir = (rawDir === 'asc' || rawDir === 'ASC') ? 'asc' : 'desc';
      const orderBy = { [field]: dir };

      const where = {
        tenantId: tenant,
        deletedAt: null,
        ...(req.query.projectId ? { projectId: Number(req.query.projectId) } : {}),
        ...(req.query.statusId ? { statusId: Number(req.query.statusId) } : {}),
      };

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

  // GET /api/tasks/:id
  router.get('/:id', async (req, res) => {
    try {
      const tenant = req.user && req.user.tenantId;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      const row = await prisma.task.findFirst({
        where: { id, tenantId: tenant, deletedAt: null },
        include: {
          project:   { select: { id: true, name: true } },
          statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
        }
      });
      if (!row) return res.status(404).json({ error: 'Task not found' });
      res.json(row);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to fetch task' });
    }
  });

  // POST /api/tasks
  router.post('/', requireProjectMember, async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const body = taskBodySchema.parse(req.body);

      const project = await prisma.project.findFirst({ where: { id: body.projectId, tenantId, deletedAt: null } });
      if (!project) return res.status(400).json({ error: 'Invalid projectId' });
      const tnum = Number(tenantId);
      const statusWhere = { id: body.statusId, OR: [{ tenantId: null }] };
      if (Number.isFinite(tnum)) statusWhere.OR.push({ tenantId: tnum });
      const status = await prisma.taskStatus.findFirst({ where: statusWhere });
      if (!status) return res.status(400).json({ error: 'Invalid statusId' });

      const created = await prisma.task.create({
        data: {
          tenantId,
          projectId: body.projectId,
          title: body.title,
          description: body.description ?? null,
          assignee: body.assignee ?? null,
          statusId: body.statusId,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
        },
        include: {
          project:   { select: { id: true, name: true } },
          statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
        },
      });
      await recomputeProjectSnapshot(Number(created.projectId), tenantId);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to create task' });
    }
  });

  // PUT /api/tasks/:id
  router.put('/:id', async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      const existing = await prisma.task.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!existing) return res.status(404).json({ error: 'Task not found' });
      // Membership check (cannot rely on generic middleware for task id)
      const mem = await assertProjectMember({ userId: Number(req.user.id), projectId: existing.projectId, tenantId });
      if (!mem && !(Array.isArray(req.user?.roles) && req.user.roles.includes('admin'))) {
        return res.status(403).json({ error: 'NOT_A_PROJECT_MEMBER' });
      }
      const body = taskBodySchema.partial().parse(req.body);

      if (body.projectId) {
        const project = await prisma.project.findFirst({ where: { id: body.projectId, tenantId, deletedAt: null } });
        if (!project) return res.status(400).json({ error: 'Invalid projectId' });
      }
      if (body.statusId) {
        const tnum = Number(tenantId);
        const statusWhere = { id: body.statusId, OR: [{ tenantId: null }] };
        if (Number.isFinite(tnum)) statusWhere.OR.push({ tenantId: tnum });
        const status = await prisma.taskStatus.findFirst({ where: statusWhere });
        if (!status) return res.status(400).json({ error: 'Invalid statusId' });
      }

      await prisma.task.updateMany({
        where: { id, tenantId },
        data: {
          ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.assignee !== undefined ? { assignee: body.assignee } : {}),
          ...(body.statusId !== undefined ? { statusId: body.statusId } : {}),
          ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(body.dueDate) : null } : {}),
        },
      });
      const updated = await prisma.task.findFirst({
        where: { id, tenantId },
        include: {
          project:   { select: { id: true, name: true } },
          statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
        },
      });
      await recomputeProjectSnapshot(Number(updated.projectId), tenantId);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to update task' });
    }
  });

  // DELETE /api/tasks/:id (soft delete)
  router.delete('/:id', async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      const existing = await prisma.task.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!existing) return res.status(404).json({ error: 'Task not found' });
      // Membership check
      const mem = await assertProjectMember({ userId: Number(req.user.id), projectId: existing.projectId, tenantId });
      if (!mem && !(Array.isArray(req.user?.roles) && req.user.roles.includes('admin'))) {
        return res.status(403).json({ error: 'NOT_A_PROJECT_MEMBER' });
      }
      await prisma.task.updateMany({ where: { id, tenantId }, data: { deletedAt: new Date() } });
      await recomputeProjectSnapshot(Number(existing.projectId), tenantId);
      res.status(204).end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to delete task' });
    }
  });

  return router;
};
