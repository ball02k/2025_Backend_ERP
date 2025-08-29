const express = require('express');
const { z } = require('zod');
const { requireProjectMember } = require('../middleware/membership.cjs');
const { projectBodySchema } = require('../lib/validation');
module.exports = (prisma) => {
  const router = express.Router();
  router.get('/', async (req, res) => {
    try {
      const tenant = req.user && req.user.tenantId;
      const take = Math.min(Number(req.query.limit) || 50, 100);
      const skip = Math.max(Number(req.query.offset) || 0, 0);
      const sortParam = String(req.query.sort || 'startDate:desc');
      const [field, dirRaw] = sortParam.split(':');
      const allowed = new Set(['id','code','name','status','type','startDate','endDate','createdAt','updatedAt']);
      const sortField = allowed.has(field) ? field : 'createdAt';
      const order = (dirRaw === 'asc' || dirRaw === 'ASC') ? 'asc' : 'desc';
      const orderBy = { [sortField]: order };
      const where = {
        tenantId: tenant,
        deletedAt: null,
        ...(req.query.clientId ? { clientId: Number(req.query.clientId) } : {}),
        ...(req.query.status ? { status: String(req.query.status) } : {}),
        ...(req.query.type ? { type: String(req.query.type) } : {}),
      };
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

  // GET /api/projects/:id (auth only) -> basic project payload to let page render even if overview fails
  router.get('/:id', async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid project id' });

      const projectRow = await prisma.project.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          type: true,
          startDate: true,
          endDate: true,
          client: { select: { id: true, name: true, vatNo: true, companyRegNo: true } },
        },
      });

      if (!projectRow) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });

      // Map client fields to expected names (vatNumber, registrationNumber)
      const project = {
        id: projectRow.id,
        name: projectRow.name,
        code: projectRow.code,
        status: projectRow.status,
        type: projectRow.type,
        startDate: projectRow.startDate,
        endDate: projectRow.endDate,
        client: projectRow.client
          ? {
              id: projectRow.client.id,
              name: projectRow.client.name,
              vatNumber: projectRow.client.vatNo ?? null,
              registrationNumber: projectRow.client.companyRegNo ?? null,
            }
          : null,
      };

      return res.json({ project });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load project' });
    }
  });

  // POST /api/projects
  router.post('/', async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const body = projectBodySchema.parse(req.body);
      if (!body.code) return res.status(400).json({ error: 'code is required' });

      // validate client
      const client = await prisma.client.findFirst({ where: { id: body.clientId, deletedAt: null } });
      if (!client) return res.status(400).json({ error: 'Invalid clientId' });
      // optional: validate lookups exist
      if (body.statusId) {
        const st = await prisma.projectStatus.findFirst({ where: { id: body.statusId } });
        if (!st) return res.status(400).json({ error: 'Invalid statusId' });
      }
      if (body.typeId) {
        const tp = await prisma.projectType.findFirst({ where: { id: body.typeId } });
        if (!tp) return res.status(400).json({ error: 'Invalid typeId' });
      }

      const created = await prisma.project.create({
        data: {
          tenantId,
          code: body.code,
          name: body.name,
          description: body.description ?? null,
          clientId: body.clientId,
          statusId: body.statusId,
          typeId: body.typeId,
          budget: body.budget != null ? body.budget : undefined,
          actualSpend: body.actualSpend != null ? body.actualSpend : undefined,
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          endDate: body.endDate ? new Date(body.endDate) : undefined,
        },
        include: {
          client: { select: { id: true, name: true } },
          statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
          typeRel: { select: { id: true, key: true, label: true, colorHex: true } },
        },
      });
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to create project' });
    }
  });

  // PUT /api/projects/:id
  router.put('/:id', requireProjectMember, async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      const existing = await prisma.project.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!existing) return res.status(404).json({ error: 'Project not found' });
      const body = projectBodySchema.partial().parse(req.body);

      if (body.clientId) {
        const client = await prisma.client.findFirst({ where: { id: body.clientId, deletedAt: null } });
        if (!client) return res.status(400).json({ error: 'Invalid clientId' });
      }
      if (body.statusId) {
        const st = await prisma.projectStatus.findFirst({ where: { id: body.statusId } });
        if (!st) return res.status(400).json({ error: 'Invalid statusId' });
      }
      if (body.typeId) {
        const tp = await prisma.projectType.findFirst({ where: { id: body.typeId } });
        if (!tp) return res.status(400).json({ error: 'Invalid typeId' });
      }

      const updated = await prisma.project.update({
        where: { id },
        data: {
          ...(body.code !== undefined ? { code: body.code } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.clientId !== undefined ? { clientId: body.clientId } : {}),
          ...(body.statusId !== undefined ? { statusId: body.statusId } : {}),
          ...(body.typeId !== undefined ? { typeId: body.typeId } : {}),
          ...(body.budget !== undefined ? { budget: body.budget } : {}),
          ...(body.actualSpend !== undefined ? { actualSpend: body.actualSpend } : {}),
          ...(body.startDate !== undefined ? { startDate: body.startDate ? new Date(body.startDate) : null } : {}),
          ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(body.endDate) : null } : {}),
        },
        include: {
          client: { select: { id: true, name: true } },
          statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
          typeRel: { select: { id: true, key: true, label: true, colorHex: true } },
        },
      });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to update project' });
    }
  });

  // DELETE /api/projects/:id (soft delete)
  router.delete('/:id', requireProjectMember, async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      const existing = await prisma.project.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!existing) return res.status(404).json({ error: 'Project not found' });
      await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
      res.status(204).end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to delete project' });
    }
  });
  return router;
};
