const express = require('express');
const { z } = require('zod');
const { taskBodySchema } = require('../lib/validation');
const { requireProjectMember, assertProjectMember } = require('../middleware/membership.cjs');
const { recomputeProjectSnapshot } = require('../services/projectSnapshot');

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

      const tasks = rows.map((t) => ({
        ...t,
        projectName: t.project ? t.project.name : null,
      }));

      res.json({ total, tasks });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message || 'Failed to fetch tasks' });
    }
  });

  // GET /api/tasks/csv/export
  router.get('/csv/export', async (req, res) => {
    try {
      const tenant = req.user && req.user.tenantId;
      const rows = await prisma.task.findMany({
        where: { tenantId: tenant, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="tasks.csv"');
      res.write(toCsvRow(['id','projectId','title','description','assignee','statusId','status','dueDate']));
      for (const t of rows) {
        res.write(toCsvRow([t.id,t.projectId,t.title,t.description ?? '',t.assignee ?? '',t.statusId ?? '',t.status ?? '',t.dueDate ? new Date(t.dueDate).toISOString() : '']));
      }
      res.end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to export tasks CSV' });
    }
  });

  // GET /api/tasks/csv/template (downloadable example)
  router.get('/csv/template', async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tasks_template.csv"');
    res.write(toCsvRow(['projectId','title','statusId','description','assignee','dueDate']));
    res.write(toCsvRow(['1','Example task','1','Optional description','John','2025-08-31T00:00:00Z']));
    res.end();
  });

  // POST /api/tasks/csv/import (membership per row)
  router.post('/csv/import', async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const userId = Number(req.user?.id);
      const raw = await readRawBody(req);
      const { headers, rows } = parseCsv(raw);
      const required = ['projectId','title','statusId'];
      for (const col of required) if (!headers.includes(col)) return res.status(400).json({ error: `Missing required column: ${col}` });

      let imported = 0, updated = 0, skipped = 0; const skippedRows = [];
      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx];
        const projectId = Number(r.projectId);
        const title = (r.title || '').trim();
        const statusId = Number(r.statusId);
        if (!Number.isFinite(projectId) || !title || !Number.isFinite(statusId)) { skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'INVALID_REQUIRED_FIELDS' }); continue; }
        // membership check per row
        const mem = await prisma.projectMembership.findFirst({ where: { tenantId, projectId, userId }, select: { id: true } });
        if (!mem && !(Array.isArray(req.user?.roles) && req.user.roles.includes('admin'))) {
          skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'NOT_A_PROJECT_MEMBER' }); continue;
        }
        try {
          const id = r.id ? Number(r.id) : null;
          const data = {
            tenantId,
            projectId,
            title,
            description: r.description || null,
            assignee: r.assignee || null,
            statusId,
            dueDate: r.dueDate ? new Date(r.dueDate) : null,
          };
          if (id && Number.isFinite(id)) {
            const exists = await prisma.task.findFirst({ where: { id, tenantId } });
            if (!exists) { skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'TASK_NOT_FOUND' }); continue; }
            await prisma.task.update({ where: { id }, data });
            updated++;
          } else {
            await prisma.task.create({ data });
            imported++;
          }
        } catch (e) {
          skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'ERROR:' + (e.code || e.message || 'UNKNOWN') });
        }
      }
      res.json({ imported, updated, skipped, skippedRows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to import tasks CSV' });
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
      const task = {
        ...row,
        projectName: row.project ? row.project.name : null,
      };
      res.json(task);
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
      try { await recomputeProjectSnapshot(Number(created.projectId), tenantId); } catch (e) { console.warn('snapshot create failed', e?.message || e); }
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
      try { await recomputeProjectSnapshot(Number(updated.projectId), tenantId); } catch (e) { console.warn('snapshot update failed', e?.message || e); }
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
      try { await recomputeProjectSnapshot(Number(existing.projectId), tenantId); } catch (e) { console.warn('snapshot delete failed', e?.message || e); }
      res.status(204).end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to delete task' });
    }
  });

  return router;
};
