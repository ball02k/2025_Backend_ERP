const express = require('express');
const { z } = require('zod');
const { clientsQuerySchema, clientBodySchema, contactBodySchema } = require('../lib/validation.clients');

module.exports = (prisma) => {
  const router = express.Router();
  function toCsvRow(values) {
    return values
      .map((v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      })
      .join(',') + '\n';
  }
  async function readRawBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
  function parseCsv(text) {
    const rows = [];
    let i = 0, field = '', row = [], inQ = false;
    const pushField = () => { row.push(field); field = ''; };
    const pushRow = () => { rows.push(row); row = []; };
    while (i < text.length) {
      const ch = text[i++];
      if (inQ) {
        if (ch === '"') { if (text[i] === '"') { field += '"'; i++; } else { inQ = false; } }
        else field += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') pushField();
        else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i] === '\n') i++; pushField(); pushRow(); }
        else field += ch;
      }
    }
    if (field.length || row.length) { pushField(); pushRow(); }
    const headers = (rows.shift() || []).map((h) => h.trim());
    const data = rows.filter(r => r.length && r.some(v => v && v.trim().length)).map((r) => {
      const obj = {}; headers.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? r[idx] : ''; }); return obj;
    });
    return { headers, rows: data };
  }

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

  // GET /api/clients/csv/export
  router.get('/csv/export', async (req, res) => {
    try {
      const tenant = req.user && req.user.tenantId;
      const rows = await prisma.client.findMany({
        where: { deletedAt: null, projects: { some: { tenantId: tenant, deletedAt: null } } },
        orderBy: { createdAt: 'desc' },
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="clients.csv"');
      res.write(toCsvRow(['id','name','companyRegNo','vatNo','address1','address2','city','county','postcode']));
      for (const c of rows) {
        res.write(toCsvRow([c.id,c.name,c.companyRegNo ?? '',c.vatNo ?? '',c.address1 ?? '',c.address2 ?? '',c.city ?? '',c.county ?? '',c.postcode ?? '']));
      }
      res.end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to export clients CSV' });
    }
  });

  // GET /api/clients/csv/template (downloadable example)
  router.get('/csv/template', async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="clients_template.csv"');
    res.write(toCsvRow(['name','companyRegNo','vatNo','address1','address2','city','county','postcode']));
    res.write(toCsvRow(['Acme Construction','01234567','GB123456789','1 High St','','London','','W1 1AA']));
    res.end();
  });

  // POST /api/clients/csv/import
  router.post('/csv/import', async (req, res) => {
    try {
      const raw = await readRawBody(req);
      const { headers, rows } = parseCsv(raw);
      const required = ['name'];
      for (const col of required) if (!headers.includes(col)) return res.status(400).json({ error: `Missing required column: ${col}` });
      let imported = 0, updated = 0, skipped = 0; const skippedRows = [];
      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx];
        const name = (r.name || '').trim();
        if (!name) { skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'INVALID_REQUIRED_FIELDS' }); continue; }
        try {
          // Upsert by id if provided, else by (name, companyRegNo) heuristics
          const id = r.id ? Number(r.id) : null;
          const where = id && Number.isFinite(id) ? { id, deletedAt: null } : { name, deletedAt: null };
          const existing = await prisma.client.findFirst({ where });
          const data = {
            name,
            companyRegNo: r.companyRegNo || null,
            vatNo: r.vatNo || null,
            address1: r.address1 || null,
            address2: r.address2 || null,
            city: r.city || null,
            county: r.county || null,
            postcode: r.postcode || null,
          };
          if (!existing) { await prisma.client.create({ data }); imported++; }
          else { await prisma.client.update({ where: { id: existing.id }, data }); updated++; }
        } catch (e) {
          skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'ERROR:' + (e.code || e.message || 'UNKNOWN') });
        }
      }
      res.json({ imported, updated, skipped, skippedRows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to import clients CSV' });
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
