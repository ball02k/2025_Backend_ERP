const express = require('express');
const { z } = require('zod');

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  sort: z.string().optional().default('createdAt'),
  order: z.enum(['asc','desc']).optional().default('desc'),
});
const contactsQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  clientId: z.coerce.number().int().optional(),
  isPrimary: z.coerce.boolean().optional(),
});
const contactBodySchema = z.object({
  clientId: z.number().int(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().optional(),
  role: z.string().trim().optional(),
  isPrimary: z.coerce.boolean().optional().default(false),
});

module.exports = (prisma) => {
  const router = express.Router();

  // GET /api/contacts
  router.get('/', async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId;
      const { page, pageSize, sort, order, search, clientId, isPrimary } =
        contactsQuerySchema.parse(req.query);

      const where = {
        tenantId,
        ...(clientId ? { clientId } : {}),
        ...(typeof isPrimary === 'boolean' ? { isPrimary } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { role: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const [total, rows] = await Promise.all([
        prisma.contact.count({ where }),
        prisma.contact.findMany({
          where,
          orderBy: { [sort]: order },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { client: { select: { id: true, name: true } } },
        }),
      ]);

      res.json({ page, pageSize, total, rows });
    } catch (e) { next(e); }
  });

  // GET /api/contacts/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId;
      const id = Number(req.params.id);
      const row = await prisma.contact.findFirst({
        where: { id, tenantId },
        include: { client: { select: { id: true, name: true } } },
      });
      if (!row) return res.status(404).json({ error: 'Contact not found' });
      res.json(row);
    } catch (e) { next(e); }
  });

  // POST /api/contacts
  router.post('/', async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId;
      const body = contactBodySchema.parse(req.body);
      if (body.isPrimary) {
        await prisma.contact.updateMany({ where: { tenantId, clientId: body.clientId, isPrimary: true }, data: { isPrimary: false } });
      }
      const created = await prisma.contact.create({ data: { ...body, tenantId } });
      res.status(201).json(created);
    } catch (e) { next(e); }
  });

  // PUT /api/contacts/:id
  router.put('/:id', async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId;
      const id = Number(req.params.id);
      const body = contactBodySchema.partial().parse(req.body);

      const current = await prisma.contact.findFirst({ where: { id, tenantId } });
      if (!current) return res.status(404).json({ error: 'Contact not found' });

      if (body.isPrimary === true) {
        const targetClientId = body.clientId ?? current.clientId;
        await prisma.contact.updateMany({ where: { tenantId, clientId: targetClientId, isPrimary: true }, data: { isPrimary: false } });
      }

      const updated = await prisma.contact.update({ where: { id, tenantId }, data: body });
      res.json(updated);
    } catch (e) { next(e); }
  });

  // DELETE /api/contacts/:id
  router.delete('/:id', async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId;
      const id = Number(req.params.id);
      const deleted = await prisma.contact.deleteMany({ where: { id, tenantId } });
      if (deleted.count === 0) return res.status(404).json({ error: 'Contact not found' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
};
