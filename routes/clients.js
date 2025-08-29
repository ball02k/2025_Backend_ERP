const express = require('express');
const { z } = require('zod');
const { clientsQuerySchema, clientBodySchema, contactBodySchema } = require('../lib/validation.clients');

module.exports = (prisma) => {
  const router = express.Router();

  // GET /api/clients
  router.get('/', async (req, res) => {
    try {
      const tenant = req.user && req.user.tenantId;
      const { page = 1, pageSize = 20, sort = 'name', order = 'asc', search } = clientsQuerySchema.parse(req.query);

      const where = {
        deletedAt: null,
        // Tenant scoping via related projects
        projects: { some: { tenantId: tenant, deletedAt: null } },
        ...(search ? {
          OR: [
            { name:         { contains: search, mode: 'insensitive' } },
            { companyRegNo: { contains: search, mode: 'insensitive' } },
            { vatNo:        { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
      };

      const [total, rows] = await Promise.all([
        prisma.client.count({ where }),
        prisma.client.findMany({
          where,
          orderBy: { [sort]: order },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            projects: {
              where: { tenantId: tenant, deletedAt: null },
              select: { id: true },
            },
          },
        }),
      ]);

      const result = rows.map(c => ({
        id: c.id,
        name: c.name,
        companyRegNo: c.companyRegNo,
        projectsCount: c.projects.length,
      }));
      res.json({ page, pageSize, total, rows: result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message || 'Failed to fetch clients' });
    }
  });

  // GET /api/clients/:id
  router.get('/:id', async (req, res) => {
    try {
      const tenant = req.user && req.user.tenantId;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      const row = await prisma.client.findFirst({
        where: { id, deletedAt: null },
        include: {
          contacts: true,
          projects: {
            where: { tenantId: tenant, deletedAt: null },
            select: { id: true, code: true, name: true, status: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!row) return res.status(404).json({ error: 'Client not found' });
      res.json(row);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to fetch client' });
    }
  });

  // POST /api/clients
  router.post('/', async (req, res) => {
    try {
      const body = clientBodySchema.parse(req.body);
      const { primaryContact, ...clientData } = body;

      const created = await prisma.client.create({
        data: {
          ...clientData,
          contacts: primaryContact ? {
            create: [{ ...primaryContact, isPrimary: true, tenantId: req.user?.tenantId }],
          } : undefined,
        },
        include: { contacts: true },
      });
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to create client' });
    }
  });

  // PUT /api/clients/:id
  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      const tenant = req.user && req.user.tenantId;
      const existing = await prisma.client.findFirst({ where: { id, deletedAt: null, projects: { some: { tenantId: tenant, deletedAt: null } } } });
      if (!existing) return res.status(404).json({ error: 'Client not found' });
      const body = clientBodySchema.partial().parse(req.body);

      // ignore `primaryContact` on update for now
      const { primaryContact: _pc, ...data } = body;
      const updated = await prisma.client.update({ where: { id }, data });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to update client' });
    }
  });

  // DELETE /api/clients/:id (soft delete)
  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      const tenant = req.user && req.user.tenantId;
      const existing = await prisma.client.findFirst({ where: { id, deletedAt: null, projects: { some: { tenantId: tenant, deletedAt: null } } } });
      if (!existing) return res.status(404).json({ error: 'Client not found' });
      await prisma.client.update({ where: { id }, data: { deletedAt: new Date() } });
      res.status(204).end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to delete client' });
    }
  });

  return router;
};
