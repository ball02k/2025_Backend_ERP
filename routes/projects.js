// routes/projects.js
const express = require('express');
const { projectsQuerySchema, projectBodySchema } = require('../lib/validation');

function getTenantId(req) {
  return req.headers['x-tenant-id'] || 'demo';
}

module.exports = (prisma) => {
  const router = express.Router();

  // GET /api/projects?search=&statusId=&typeId=&clientId=&page=&pageSize=&sort=&order=
  router.get('/', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const { page, pageSize, sort, order, search, clientId, statusId, typeId } =
        projectsQuerySchema.parse(req.query);

      const where = {
        tenantId,
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

  // GET /api/projects/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

      const row = await prisma.project.findFirst({
        where: { id, tenantId },
        include: {
          client: { select: { id: true, name: true } },
          statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
          typeRel: { select: { id: true, key: true, label: true, colorHex: true } },
          tasks: {
            orderBy: { createdAt: 'desc' },
            include: {
              statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
            },
          },
        },
      });

      if (!row) return res.status(404).json({ error: 'Project not found' });
      res.json(row);
    } catch (e) { next(e); }
  });

  // POST /api/projects
  router.post('/', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const body = projectBodySchema.parse(req.body);
      const created = await prisma.project.create({
        data: {
          ...body,
          tenantId,
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
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);
      const existing = await prisma.project.findFirst({ where: { id, tenantId } });
      if (!existing) return res.status(404).json({ error: 'Project not found' });

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

  // DELETE /api/projects/:id  (safe transactional delete)
  router.delete('/:id', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

      const exists = await prisma.project.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!exists) return res.status(404).json({ error: 'Project not found' });

      await prisma.$transaction(async (tx) => {
        await tx.task.deleteMany({ where: { projectId: id, tenantId } });
        await tx.project.delete({ where: { id } });
      });

      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
};
