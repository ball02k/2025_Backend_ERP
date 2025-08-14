// routes/clients.js
const express = require('express');
const { clientsQuerySchema, clientBodySchema, contactBodySchema } = require('../lib/validation.clients');

module.exports = (prisma) => {
  const router = express.Router();

  // GET /api/clients?search=&page=&pageSize=&sort=&order=
  router.get('/', async (req, res, next) => {
    try {
      const { page, pageSize, sort, order, search } = clientsQuerySchema.parse(req.query);

      const where = search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { companyRegNo: { contains: search, mode: 'insensitive' } },
          { vatNo: { contains: search, mode: 'insensitive' } },
        ]
      } : {};

      const [total, rows] = await Promise.all([
        prisma.client.count({ where }),
        prisma.client.findMany({
          where,
          orderBy: { [sort]: order },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {

            _count: {
              select: {
                projects: true,
                // contacts count will work if the relation exists; if not, remove next line
                contacts: true,
              }
            },

            _count: { select: { projects: true, contacts: true } },

            contacts: {
              where: { isPrimary: true },
              take: 1,
              orderBy: { isPrimary: 'desc' },
              select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, isPrimary: true }
            },
          },
        }),
      ]);

      // normalize primaryContact field
      const mapped = rows.map(c => ({
        ...c,
        primaryContact: c.contacts?.[0] ?? null,
        contacts: undefined, // hide the internal array used to derive primary
      }));

      res.json({ page, pageSize, total, rows: mapped });
    } catch (e) { next(e); }
  });

  // GET /api/clients/:id (with contacts + light project summary)
  router.get('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = await prisma.client.findUnique({
        where: { id },
        include: {
          contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
          projects: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true, code: true, name: true, createdAt: true,
              statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
              typeRel:   { select: { id: true, key: true, label: true, colorHex: true } },
            }
          },
        },
      });
      if (!row) return res.status(404).json({ error: 'Client not found' });
      res.json(row);
    } catch (e) { next(e); }
  });

  // POST /api/clients
  router.post('/', async (req, res, next) => {
    try {
      const body = clientBodySchema.parse(req.body);
      const { primaryContact, ...clientData } = body;

      const created = await prisma.client.create({
        data: {
          ...clientData,
          ...(primaryContact ? {
            contacts: { create: { ...primaryContact, isPrimary: true } }
          } : {}),
        },
        include: {
          contacts: true,
          _count: { select: { projects: true, contacts: true } },
        },
      });
      res.status(201).json(created);
    } catch (e) { next(e); }
  });

  // PUT /api/clients/:id
  router.put('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const body = clientBodySchema.partial().parse(req.body);

      // if primaryContact is provided on update, upsert or set isPrimary
      let contactOps = undefined;
      if (body.primaryContact) {
        const pc = body.primaryContact;
        // clear previous primary, then create a new one
        contactOps = {
          updateMany: [{ where: { clientId: id, isPrimary: true }, data: { isPrimary: false } }],
          create: [{ ...pc, isPrimary: true }],
        };
      }

      const { primaryContact, ...clientData } = body;

      const updated = await prisma.client.update({
        where: { id },
        data: {
          ...clientData,
          ...(contactOps ? { contacts: contactOps } : {}),
        },
        include: { contacts: true },
      });
      res.json(updated);
    } catch (e) { next(e); }
  });

  // ===== Contacts subresource =====

  // GET /api/clients/:id/contacts
  router.get('/:id/contacts', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const contacts = await prisma.contact.findMany({
        where: { clientId: id },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });
      res.json(contacts);
    } catch (e) { next(e); }
  });

  // POST /api/clients/:id/contacts
  router.post('/:id/contacts', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const body = contactBodySchema.parse(req.body);

      // if new contact isPrimary, demote any existing primary
      if (body.isPrimary) {
        await prisma.contact.updateMany({ where: { clientId: id, isPrimary: true }, data: { isPrimary: false } });
      }

      const created = await prisma.contact.create({
        data: { ...body, clientId: id },
      });
      res.status(201).json(created);
    } catch (e) { next(e); }
  });

  // PUT /api/clients/:id/contacts/:contactId
  router.put('/:id/contacts/:contactId', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const contactId = Number(req.params.contactId);
      const body = contactBodySchema.partial().parse(req.body);

      if (body.isPrimary === true) {
        await prisma.contact.updateMany({ where: { clientId: id, isPrimary: true }, data: { isPrimary: false } });
      }

      const updated = await prisma.contact.update({
        where: { id: contactId },
        data: { ...body },
      });
      res.json(updated);
    } catch (e) { next(e); }
  });

  // DELETE /api/clients/:id/contacts/:contactId
  router.delete('/:id/contacts/:contactId', async (req, res, next) => {
    try {
      const contactId = Number(req.params.contactId);
      await prisma.contact.delete({ where: { id: contactId } });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
};
