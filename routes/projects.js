const express = require('express');
const { z } = require('zod');
const { requireProjectMember } = require('../middleware/membership.cjs');
const { projectBodySchema } = require('../lib/validation');
const PackageController = require('../controllers/packageController.js');
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
      const { buildLinks } = require('../lib/buildLinks.cjs');
      const projects = rows.map((p) => {
        const row = { ...p, clientName: p.client ? p.client.name : null };
        row.links = buildLinks('project', { ...row, client: p.client });
        return row;
      });
      res.json({ total, projects, items: projects, data: { items: projects, total } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message || 'Failed to fetch projects' });
    }
  });

  // --- MVP additive: Packages & Tenders (lightweight) ---
  // POST /api/projects/:projectId/packages → Create package (extended)
  router.post('/:projectId/packages', requireProjectMember, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const { name, description, scope, trade, tradeCategory, budget, attachments, costCodeId, budgetIds } = req.body || {};
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const pkg = await prisma.package.create({
        data: {
          projectId,
          name,
          // map description to scope (legacy)
          scope: (scope ?? description) || null,
          trade: (trade || tradeCategory) ?? null,
          status: 'Draft',
          budgetEstimate: budget ?? null,
          costCodeId: costCodeId ?? null,
        },
        select: { id: true, projectId: true, name: true, scope: true, trade: true, status: true, budgetEstimate: true, deadline: true, awardValue: true, awardSupplierId: true, createdAt: true, updatedAt: true, costCodeId: true },
      });
      // Link budget lines if table exists
      if (Array.isArray(budgetIds) && budgetIds.length) {
        try { await prisma.packageItem.createMany({ data: budgetIds.map((id) => ({ packageId: pkg.id, budgetLineId: Number(id) })) }); } catch (_) {}
      }
      res.status(201).json(pkg);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/projects/:projectId/packages → List packages (incl. budget items & tenders)
  router.get('/:projectId/packages', requireProjectMember, async (req, res) => {
    const projectId = Number(req.params.projectId);
    const packages = await prisma.package.findMany({ where: { projectId }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, projectId: true, name: true, scope: true, trade: true, status: true, budgetEstimate: true, deadline: true, awardValue: true, awardSupplierId: true, createdAt: true, updatedAt: true, costCodeId: true, tenders: true } });
    res.json(packages);
  });

  // POST /api/projects/:projectId/tenders → Create tender
  router.post('/:projectId/tenders', requireProjectMember, async (req, res) => {
    const tenantId = req.user && req.user.tenantId;
    const projectId = Number(req.params.projectId);
    const { packageId, title, description, status } = req.body || {};
    const tender = await prisma.tender.create({ data: { tenantId, projectId, packageId: packageId ? Number(packageId) : null, title, description: description || null, status: status || 'draft' } });
    res.status(201).json(tender);
  });

  // GET /api/projects/:projectId/tenders → List tenders
  router.get('/:projectId/tenders', requireProjectMember, async (req, res) => {
    const tenantId = req.user && req.user.tenantId;
    const projectId = Number(req.params.projectId);
    // Filter via the project relation's tenant to avoid missing rows when Tender.tenantId is inconsistent
    const tenders = await prisma.tender.findMany({
      where: { projectId, project: { tenantId } },
      include: { bids: true, package: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    res.json(tenders);
  });

  // GET /api/projects/tenders/:tenderId → tender with bids
  router.get('/tenders/:tenderId', requireProjectMember, async (req, res) => {
    const tenantId = req.user && req.user.tenantId;
    const tenderId = Number(req.params.tenderId);
    const tender = await prisma.tender.findFirst({ where: { id: tenderId, tenantId }, include: { bids: true, package: true, project: true } });
    if (!tender) return res.status(404).json({ error: 'Tender not found' });
    res.json(tender);
  });

  // PATCH /api/projects/tenders/:tenderId → update tender fields (title, description, status, dates)
  router.patch('/tenders/:tenderId', requireProjectMember, async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const tenderId = Number(req.params.tenderId);
      const existing = await prisma.tender.findFirst({ where: { id: tenderId, tenantId } });
      if (!existing) return res.status(404).json({ error: 'Tender not found' });
      const { title, description, status, openDate, closeDate } = req.body || {};
      const updated = await prisma.tender.update({
        where: { id: tenderId },
        data: {
          ...(title != null ? { title: String(title) } : {}),
          ...(description != null ? { description: String(description) } : {}),
          ...(status != null ? { status: String(status) } : {}),
          ...(openDate ? { openDate: new Date(openDate) } : {}),
          ...(closeDate ? { closeDate: new Date(closeDate) } : {}),
        },
      });
      res.json(updated);
    } catch (e) {
      res.status(400).json({ error: e?.message || 'Failed to update tender' });
    }
  });

  // POST /api/projects/:projectId/tenders/:tenderId/bids → add bid
  router.post('/:projectId/tenders/:tenderId/bids', requireProjectMember, async (req, res) => {
    const tenantId = req.user && req.user.tenantId;
    const projectId = Number(req.params.projectId);
    const tenderId = Number(req.params.tenderId);
    const { supplierId, price, notes } = req.body || {};
    try {
      // ensure tender belongs to project + tenant
      const t = await prisma.tender.findFirst({ where: { id: tenderId, tenantId, projectId }, select: { id: true } });
      if (!t) return res.status(404).json({ error: 'Tender not found' });
      const bid = await prisma.tenderBid.create({ data: { tenantId, tenderId, supplierId: Number(supplierId), price: price ?? 0, notes: notes || null } });
      res.status(201).json(bid);
    } catch (e) { res.status(400).json({ error: e.message }); }
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

  // Nested package and contract routes
  router.get('/:projectId/packages', PackageController.listPackages);
  router.post('/:projectId/packages', PackageController.createPackage);
  router.get('/:projectId/contracts', PackageController.listContractsByProject);

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
          country: true,
          currency: true,
          unitSystem: true,
          taxScheme: true,
          contractForm: true,
          startPlanned: true,
          endPlanned: true,
          startActual: true,
          endActual: true,
          statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
          typeRel: { select: { id: true, key: true, label: true, colorHex: true } },
          projectManagerId: true,
          budget: true,
          actualSpend: true,
          startDate: true,
          endDate: true,
          client: { select: { id: true, name: true, vatNo: true, companyRegNo: true } },
          _count: { select: { packages: true, contracts: true } },
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
        country: projectRow.country ?? null,
        currency: projectRow.currency ?? null,
        unitSystem: projectRow.unitSystem ?? null,
        taxScheme: projectRow.taxScheme ?? null,
        contractForm: projectRow.contractForm ?? null,
        startPlanned: projectRow.startPlanned ?? null,
        endPlanned: projectRow.endPlanned ?? null,
        startActual: projectRow.startActual ?? null,
        endActual: projectRow.endActual ?? null,
        statusRel: projectRow.statusRel || null,
        typeRel: projectRow.typeRel || null,
        projectManagerId: projectRow.projectManagerId,
        budget: projectRow.budget,
        actualSpend: projectRow.actualSpend,
        startDate: projectRow.startDate,
        endDate: projectRow.endDate,
        packagesCount: projectRow._count?.packages || 0,
        contractsCount: projectRow._count?.contracts || 0,
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
        // Convenience fields for FE chips
        statusLabel: projectRow.statusRel?.label ?? projectRow.status ?? null,
        statusColorHex: projectRow.statusRel?.colorHex ?? null,
        typeLabel: projectRow.typeRel?.label ?? projectRow.type ?? null,
        typeColorHex: projectRow.typeRel?.colorHex ?? null,
      };

      // Compatibility: also include { data } alias for FE variants
      return res.json({ project, data: project });
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
      if (body.projectManagerId !== undefined) {
        const pm = await prisma.user.findFirst({ where: { id: Number(body.projectManagerId), tenantId } });
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

      if (body.clientId !== undefined) {
        if (body.clientId !== null) {
          const client = await prisma.client.findFirst({ where: { id: Number(body.clientId), deletedAt: null } });
          if (!client) return res.status(400).json({ error: 'Invalid clientId' });
        }
      }
      if (body.statusId !== undefined) {
        if (body.statusId !== null) {
          const st = await prisma.projectStatus.findFirst({ where: { id: Number(body.statusId) } });
          if (!st) return res.status(400).json({ error: 'Invalid statusId' });
        }
      }
      if (body.typeId !== undefined) {
        if (body.typeId !== null) {
          const tp = await prisma.projectType.findFirst({ where: { id: Number(body.typeId) } });
          if (!tp) return res.status(400).json({ error: 'Invalid typeId' });
        }
      }
      if (body.projectManagerId !== undefined) {
        if (body.projectManagerId !== null) {
          const pm = await prisma.user.findFirst({ where: { id: Number(body.projectManagerId), tenantId } });
          if (!pm) return res.status(400).json({ error: 'Invalid projectManagerId' });
        }
      }

      const updated = await prisma.project.update({
        where: { id },
        data: {
          ...(body.code !== undefined ? { code: body.code } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.clientId !== undefined ? { clientId: body.clientId == null ? null : Number(body.clientId) } : {}),
          ...(body.projectManagerId !== undefined ? { projectManagerId: body.projectManagerId == null ? null : Number(body.projectManagerId) } : {}),
          ...(body.statusId !== undefined ? { statusId: body.statusId == null ? null : Number(body.statusId) } : {}),
          ...(body.typeId !== undefined ? { typeId: body.typeId == null ? null : Number(body.typeId) } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.type !== undefined ? { type: body.type } : {}),
          ...(body.country !== undefined ? { country: body.country } : {}),
          ...(body.currency !== undefined ? { currency: body.currency } : {}),
          ...(body.unitSystem !== undefined ? { unitSystem: body.unitSystem } : {}),
          ...(body.taxScheme !== undefined ? { taxScheme: body.taxScheme } : {}),
          ...(body.contractForm !== undefined ? { contractForm: body.contractForm } : {}),
          ...(body.startPlanned !== undefined ? { startPlanned: body.startPlanned ? new Date(body.startPlanned) : null } : {}),
          ...(body.endPlanned !== undefined ? { endPlanned: body.endPlanned ? new Date(body.endPlanned) : null } : {}),
          ...(body.startActual !== undefined ? { startActual: body.startActual ? new Date(body.startActual) : null } : {}),
          ...(body.endActual !== undefined ? { endActual: body.endActual ? new Date(body.endActual) : null } : {}),
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
      // Compatibility alias for FE variants
      res.json({ ...updated, data: updated });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to update project' });
    }
  });

  // PATCH /api/projects/:id (partial update with audit)
  router.patch('/:id', requireProjectMember, async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      const existing = await prisma.project.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!existing) return res.status(404).json({ error: 'Project not found' });
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
      // Reuse the same parsing as PUT partial
      const body = projectBodySchema.partial().parse(req.body || {});
      const updated = await prisma.project.update({
        where: { id },
        data: {
          ...(body.code !== undefined ? { code: body.code } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.clientId !== undefined ? { clientId: body.clientId == null ? null : Number(body.clientId) } : {}),
          ...(body.projectManagerId !== undefined ? { projectManagerId: body.projectManagerId == null ? null : Number(body.projectManagerId) } : {}),
          ...(body.statusId !== undefined ? { statusId: body.statusId == null ? null : Number(body.statusId) } : {}),
          ...(body.typeId !== undefined ? { typeId: body.typeId == null ? null : Number(body.typeId) } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.type !== undefined ? { type: body.type } : {}),
          ...(body.country !== undefined ? { country: body.country } : {}),
          ...(body.currency !== undefined ? { currency: body.currency } : {}),
          ...(body.unitSystem !== undefined ? { unitSystem: body.unitSystem } : {}),
          ...(body.taxScheme !== undefined ? { taxScheme: body.taxScheme } : {}),
          ...(body.contractForm !== undefined ? { contractForm: body.contractForm } : {}),
          ...(body.startPlanned !== undefined ? { startPlanned: body.startPlanned ? new Date(body.startPlanned) : null } : {}),
          ...(body.endPlanned !== undefined ? { endPlanned: body.endPlanned ? new Date(body.endPlanned) : null } : {}),
          ...(body.startActual !== undefined ? { startActual: body.startActual ? new Date(body.startActual) : null } : {}),
          ...(body.endActual !== undefined ? { endActual: body.endActual ? new Date(body.endActual) : null } : {}),
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
      try {
        await prisma.auditLog.create({
          data: {
            entity: 'Project',
            entityId: String(id),
            action: 'update',
            userId: req.user?.id ? Number(req.user.id) : null,
            changes: { set: { reason } },
          },
        });
      } catch (_) {}
      res.json({ ...updated, data: updated });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to patch project' });
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
