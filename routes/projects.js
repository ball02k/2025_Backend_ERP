const express = require('express');
const { z } = require('zod');
const { requireProjectMember } = require('../middleware/membership.cjs');
const { projectBodySchema } = require('../lib/validation');
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
    let i = 0, field = '', row = [], inQ = false; // basic CSV parser
    const pushField = () => { row.push(field); field = ''; };
    const pushRow = () => { rows.push(row); row = []; };
    while (i < text.length) {
      const ch = text[i++];
      if (inQ) {
        if (ch === '"') {
          if (text[i] === '"') { field += '"'; i++; } else { inQ = false; }
        } else { field += ch; }
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
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? r[idx] : ''; });
      return obj;
    });
    return { headers, rows: data };
  }

  async function readRawBuffer(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }
  async function getCsvTextFromRequest(req) {
    const ct = String(req.headers['content-type'] || '').toLowerCase();
    if (ct.startsWith('multipart/form-data')) {
      const m = /boundary=([^;]+)\b/.exec(ct);
      if (!m) return (await readRawBody(req));
      const boundary = '--' + m[1];
      const raw = await readRawBuffer(req);
      const text = raw.toString('utf8');
      const parts = text.split(boundary).filter((p) => p.trim() && p.indexOf('\r\n\r\n') !== -1);
      if (!parts.length) return '';
      const seg = parts[0];
      const splitAt = seg.indexOf('\r\n\r\n');
      if (splitAt === -1) return '';
      let body = seg.slice(splitAt + 4);
      // Trim trailing CRLF and boundary markers
      body = body.replace(/\r?\n--$/,'').replace(/\r?\n$/,'');
      return body;
    }
    // default: treat body as raw CSV text
    return (await readRawBody(req));
  }
  // GET /api/projects/summary
  // Endpoint Inventory: GET /api/projects/summary
  router.get('/summary', async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const deleted = { deletedAt: null };
      const statusesCompleted = ['Completed', 'completed', 'Closed', 'CLOSED', 'Done', 'DONE'];
      const statusesOnHold = ['On Hold', 'ON HOLD', 'Hold', 'Paused', 'PAUSED'];

      const [total, active, onHold, completed, budgetAgg, actualAgg] = await Promise.all([
        prisma.project.count({ where: { tenantId, ...deleted } }),
        prisma.project.count({ where: { tenantId, ...deleted, OR: [{ status: 'Active' }, { status: 'ACTIVE' }] } }),
        prisma.project.count({ where: { tenantId, ...deleted, OR: statusesOnHold.map((s) => ({ status: s })) } }),
        prisma.project.count({ where: { tenantId, ...deleted, OR: statusesCompleted.map((s) => ({ status: s })) } }),
        prisma.project.aggregate({ where: { tenantId, ...deleted }, _sum: { budget: true } }),
        prisma.project.aggregate({ where: { tenantId, ...deleted }, _sum: { actualSpend: true } }),
      ]);

      const sumBudget = Number(budgetAgg._sum.budget || 0);
      const sumActual = Number(actualAgg._sum.actualSpend || 0);
      const budgetRemaining = sumBudget - sumActual;
      const marginPct = sumBudget > 0 ? ((sumBudget - sumActual) / sumBudget) * 100 : null;

      res.json({
        total,
        active,
        onHold,
        completed,
        budgetRemaining,
        marginPct,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to compute project summary' });
    }
  });
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
      const projects = rows.map((p) => ({
        ...p,
        clientName: p.client ? p.client.name : null,
      }));
      res.json({ total, projects });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message || 'Failed to fetch projects' });
    }
  });

  // GET /api/projects/csv/export
  router.get('/csv/export', async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const rows = await prisma.project.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: { client: { select: { id: true, name: true } } },
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="projects.csv"');
      res.write(
        toCsvRow([
          'id','code','name','description','clientId','clientName','status','type','startDate','endDate','budget','actualSpend'
        ])
      );
      for (const p of rows) {
        res.write(
          toCsvRow([
            p.id,
            p.code,
            p.name,
            p.description ?? '',
            p.clientId ?? '',
            p.client ? p.client.name : '',
            p.status,
            p.type,
            p.startDate ? new Date(p.startDate).toISOString() : '',
            p.endDate ? new Date(p.endDate).toISOString() : '',
            p.budget ?? '',
            p.actualSpend ?? '',
          ])
        );
      }
      res.end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to export projects CSV' });
    }
  });

  // GET /api/projects/csv/template (downloadable example)
  router.get('/csv/template', async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="projects_template.csv"');
    res.write(toCsvRow(['code','name','clientId','description','status','type','statusId','typeId','startDate','endDate','budget','actualSpend']));
    res.write(toCsvRow(['P-001','Example Project','1','Optional description','Active','General','','','2025-01-01T00:00:00Z','','1500000','250000']));
    res.end();
  });

  // POST /api/projects/csv/import (role-gated: admin|pm)
  router.post('/csv/import', async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const roles = Array.isArray(req.user?.roles) ? req.user.roles : (req.user?.role ? [req.user.role] : []);
      const allowed = new Set(['admin','pm']);
      if (!roles.some(r => allowed.has(String(r)))) return res.status(403).json({ error: 'FORBIDDEN' });

      const raw = await getCsvTextFromRequest(req);
      const { headers, rows } = parseCsv(raw);
      const required = ['code','name','clientId'];
      for (const col of required) if (!headers.includes(col)) return res.status(400).json({ error: `Missing required column: ${col}` });

      let imported = 0, updated = 0, skipped = 0; const skippedRows = [];
      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx];
        const code = (r.code || '').trim();
        const name = (r.name || '').trim();
        const clientId = Number(r.clientId);
        if (!code || !name || !Number.isFinite(clientId)) { skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'INVALID_REQUIRED_FIELDS' }); continue; }
        try {
          // Validate clientId exists
          const clientOk = await prisma.client.findFirst({ where: { id: clientId, deletedAt: null } });
          if (!clientOk) { skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'CLIENT_ID_NOT_FOUND' }); continue; }
          const existing = await prisma.project.findFirst({ where: { code } });
          if (existing && existing.tenantId !== tenantId) { skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'CODE_IN_USE_OTHER_TENANT' }); continue; }
          // Optional lookup validations when provided
          const tnum = Number(tenantId);
          if (r.statusId) {
            const sid = Number(r.statusId);
            if (!Number.isFinite(sid)) { skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'INVALID_STATUS_ID' }); continue; }
            const st = await prisma.projectStatus.findFirst({ where: { id: sid } });
            if (!st) { skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'STATUS_ID_NOT_FOUND' }); continue; }
          }
          if (r.typeId) {
            const tid = Number(r.typeId);
            if (!Number.isFinite(tid)) { skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'INVALID_TYPE_ID' }); continue; }
            const tp = await prisma.projectType.findFirst({ where: { id: tid } });
            if (!tp) { skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'TYPE_ID_NOT_FOUND' }); continue; }
          }
          const data = {
            tenantId,
            code,
            name,
            description: r.description || null,
            clientId,
            status: r.status || undefined,
            type: r.type || undefined,
            statusId: r.statusId ? Number(r.statusId) : undefined,
            typeId: r.typeId ? Number(r.typeId) : undefined,
            startDate: r.startDate ? new Date(r.startDate) : undefined,
            endDate: r.endDate ? new Date(r.endDate) : undefined,
            budget: r.budget ? Number(r.budget) : undefined,
            actualSpend: r.actualSpend ? Number(r.actualSpend) : undefined,
          };
          if (!existing) {
            await prisma.project.create({ data });
            imported++;
          } else {
            await prisma.project.update({ where: { id: existing.id }, data });
            updated++;
          }
        } catch (e) {
          skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'ERROR:' + (e.code || e.message || 'UNKNOWN') });
        }
      }
      res.json({ imported, updated, skipped, skippedRows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to import projects CSV' });
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
          description: true,
          status: true,
          type: true,
          statusId: true,
          typeId: true,
          projectManagerId: true,
          budget: true,
          actualSpend: true,
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
        description: projectRow.description,
        status: projectRow.status,
        type: projectRow.type,
        statusId: projectRow.statusId,
        typeId: projectRow.typeId,
        projectManagerId: projectRow.projectManagerId,
        budget: projectRow.budget,
        actualSpend: projectRow.actualSpend,
        startDate: projectRow.startDate,
        endDate: projectRow.endDate,
        clientId: projectRow.client ? projectRow.client.id : null,
        clientName: projectRow.client ? projectRow.client.name : null,
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
      const roles = Array.isArray(req.user?.roles)
        ? req.user.roles
        : req.user?.role
        ? [req.user.role]
        : [];
      const allowed = new Set(['admin', 'pm']);
      const canCreate = roles.some((r) => allowed.has(String(r)));
      if (!canCreate) return res.status(403).json({ error: 'FORBIDDEN' });
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
      if (body.projectManagerId) {
        const pm = await prisma.user.findFirst({ where: { id: body.projectManagerId, tenantId } });
        if (!pm) return res.status(400).json({ error: 'Invalid projectManagerId' });
      }

      const created = await prisma.project.create({
        data: {
          tenantId,
          code: body.code,
          name: body.name,
          description: body.description ?? null,
          clientId: body.clientId,
          projectManagerId: body.projectManagerId,
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
      if (body.projectManagerId) {
        const pm = await prisma.user.findFirst({ where: { id: body.projectManagerId, tenantId } });
        if (!pm) return res.status(400).json({ error: 'Invalid projectManagerId' });
      }

      const updated = await prisma.project.update({
        where: { id },
        data: {
          ...(body.code !== undefined ? { code: body.code } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.clientId !== undefined ? { clientId: body.clientId } : {}),
          ...(body.projectManagerId !== undefined ? { projectManagerId: body.projectManagerId } : {}),
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

  const membershipBody = z.object({
    userId: z.number().int(),
    role: z.string().trim().min(1),
  });

  router.get('/:id/members', requireProjectMember, async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const projectId = Number(req.params.id);
      if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid id' });
      const members = await prisma.projectMembership.findMany({
        where: { tenantId, projectId },
        select: { id: true, userId: true, role: true, user: { select: { id: true, name: true, email: true } } },
      });
      res.json({ members });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list members' });
    }
  });

  router.post('/:id/members', requireProjectMember, async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const projectId = Number(req.params.id);
      if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid id' });
      const body = membershipBody.parse(req.body);

      const roles = Array.isArray(req.user?.roles)
        ? req.user.roles
        : req.user?.role
        ? [req.user.role]
        : [];
      const isAdmin = roles.includes('admin');
      const allowed = new Set(['admin', 'pm']);
      if (!isAdmin && !(req.membership && allowed.has(req.membership.role))) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }

      const user = await prisma.user.findFirst({ where: { id: body.userId, tenantId } });
      if (!user) return res.status(400).json({ error: 'Invalid userId' });

      const existing = await prisma.projectMembership.findFirst({ where: { tenantId, projectId, userId: body.userId } });
      if (existing) return res.status(400).json({ error: 'ALREADY_MEMBER' });

      const member = await prisma.projectMembership.create({
        data: { tenantId, projectId, userId: body.userId, role: body.role },
        select: { id: true, userId: true, role: true, user: { select: { id: true, name: true, email: true } } },
      });
      res.status(201).json(member);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to add member' });
    }
  });

  router.delete('/:id/members/:userId', requireProjectMember, async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const projectId = Number(req.params.id);
      const userId = Number(req.params.userId);
      if (!Number.isFinite(projectId) || !Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid id' });

      const roles = Array.isArray(req.user?.roles)
        ? req.user.roles
        : req.user?.role
        ? [req.user.role]
        : [];
      const isAdmin = roles.includes('admin');
      const allowed = new Set(['admin', 'pm']);
      if (!isAdmin && !(req.membership && allowed.has(req.membership.role))) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }

      await prisma.projectMembership.deleteMany({ where: { tenantId, projectId, userId } });
      res.status(204).end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to remove member' });
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
