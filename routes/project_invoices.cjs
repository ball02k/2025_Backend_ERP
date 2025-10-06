const express = require('express');
const { requireProjectMember } = require('../middleware/membership.cjs');

module.exports = (prisma) => {
  const router = express.Router();
  function toCsvRow(values) {
    return values.map((v)=>{
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    }).join(',') + '\n';
  }
  async function readRawBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
  async function readRawBuffer(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on('end', () => resolve(Buffer.concat(chunks)));
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
        if (ch === '"') inQ = true; else if (ch === ',') pushField();
        else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i] === '\n') i++; pushField(); pushRow(); }
        else field += ch;
      }
    }
    if (field.length || row.length) { pushField(); pushRow(); }
    const headers = (rows.shift() || []).map(h => h.trim());
    const data = rows.filter(r => r.length && r.some(v => v && v.trim().length)).map(r => {
      const obj = {}; headers.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? r[idx] : ''; }); return obj;
    });
    return { headers, rows: data };
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
      body = body.replace(/\r?\n--$/,'').replace(/\r?\n$/,'');
      return body;
    }
    return (await readRawBody(req));
  }

  // GET /api/projects/:projectId/invoices
  // Additive, tenant-scoped; optional filters and returns supplier { id, name } for pill labels
  router.get('/:projectId/invoices', requireProjectMember, async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const projectId = Number(req.params.projectId);
      if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

      const limit = Math.min(Number(req.query.limit) || 25, 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const toList = (v) =>
        (v == null || v === '') ? null : String(v).split(',').map((s) => s.trim()).filter(Boolean);
      const statusList = toList(req.query.status);
      const supplierId = Number(req.query.supplierId);
      const from = req.query.from ? new Date(String(req.query.from)) : null; // dueDate from
      const to = req.query.to ? new Date(String(req.query.to)) : null;       // dueDate to

      const where = { tenantId, projectId };
      if (statusList) where.status = { in: statusList };
      if (Number.isFinite(supplierId)) where.supplierId = supplierId;
      if (from || to) {
        where.dueDate = {};
        if (from) where.dueDate.gte = from;
        if (to) where.dueDate.lte = to;
      }
      const [total, rows] = await Promise.all([
        prisma.invoice.count({ where }),
        prisma.invoice.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }],
          skip: offset,
          take: limit,
          select: {
            id: true,
            number: true,
            status: true,
            supplierId: true,
            issueDate: true,
            dueDate: true,
            net: true,
            vat: true,
            gross: true,
            source: true,
            projectId: true,
            project: { select: { id: true, code: true, name: true } },
            supplier: { select: { id: true, name: true } },
          },
        }),
      ]);
      // Batch-fetch AFPs linked to these invoice ids (no N+1)
      const { buildLinks } = require('../lib/buildLinks.cjs');
      const ids = rows.map(r => r.id);
      let afpByInvoice = new Map();
      try {
        const afps = await prisma.applicationForPayment.findMany({ where: { tenantId, invoiceId: { in: ids } }, select: { id: true, projectId: true, invoiceId: true, periodStart: true, periodEnd: true, status: true } });
        afpByInvoice = new Map(afps.map(a => [a.invoiceId, a]));
      } catch (_) {}
      const items = rows.map((r) => {
        const supplier = r.supplier ? { id: r.supplier.id, name: r.supplier.name } : (r.supplierId ? { id: r.supplierId, name: null } : null);
        const proj = r.project ? { id: r.project.id, code: r.project.code, name: r.project.name } : null;
        const afp = afpByInvoice.get(r.id) || null;
        const row = {
          id: r.id,
          number: r.number,
          status: r.status,
          projectId: r.projectId,
          project: proj,
          supplierId: r.supplierId || null,
          supplier,
          issueDate: r.issueDate,
          dueDate: r.dueDate,
          net: r.net,
          vat: r.vat,
          gross: r.gross,
          source: r.source || null,
        };
        if (afp) row.afp = { id: afp.id, projectId: afp.projectId, status: afp.status };
        row.links = buildLinks('invoice', { ...row, afp });
        return row;
      });
      return res.json({ total, items });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to list invoices' });
    }
  });

  // GET /api/projects/:projectId/invoices/csv (export)
  router.get('/:projectId/invoices/csv', requireProjectMember, async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const projectId = Number(req.params.projectId);
      if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

      const toList = (v) => (v == null || v === '') ? null : String(v).split(',').map((s) => s.trim()).filter(Boolean);
      const statusList = toList(req.query.status);
      const supplierId = Number(req.query.supplierId);
      const from = req.query.from ? new Date(String(req.query.from)) : null;
      const to = req.query.to ? new Date(String(req.query.to)) : null;

      const where = { tenantId, projectId };
      if (statusList) where.status = { in: statusList };
      if (Number.isFinite(supplierId)) where.supplierId = supplierId;
      if (from || to) {
        where.dueDate = {};
        if (from) where.dueDate.gte = from;
        if (to) where.dueDate.lte = to;
      }

      const rows = await prisma.invoice.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        select: {
          number: true,
          supplierId: true,
          issueDate: true,
          dueDate: true,
          net: true,
          vat: true,
          gross: true,
          status: true,
          supplier: { select: { id: true, name: true } },
        },
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="invoices-${projectId}.csv"`);
      const headers = ['number','supplierId','supplierName','issueDate','dueDate','net','vat','gross','status'];
      res.write(headers.join(',') + '\n');
      for (const r of rows) {
        const vals = [
          r.number,
          r.supplierId != null ? r.supplierId : '',
          (r.supplier?.name || ''),
          r.issueDate ? new Date(r.issueDate).toISOString() : '',
          r.dueDate ? new Date(r.dueDate).toISOString() : '',
          r.net != null ? r.net : '',
          r.vat != null ? r.vat : '',
          r.gross != null ? r.gross : '',
          r.status || '',
        ];
        res.write(vals.map((v)=>{
          const s = v == null ? '' : String(v);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
        }).join(',') + '\n');
      }
      return res.end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to export invoices CSV' });
    }
  });

  // POST /api/projects/:projectId/invoices
  router.post('/:projectId/invoices', requireProjectMember, async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const projectId = Number(req.params.projectId);
      if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
      const b = req.body || {};

      const created = await prisma.invoice.create({
        data: {
          tenantId,
          projectId,
          number: String(b.number || '').trim() || `INV-${Date.now()}`,
          supplierId: b.supplierId != null ? Number(b.supplierId) : null,
          issueDate: b.issueDate ? new Date(b.issueDate) : null,
          dueDate: b.dueDate ? new Date(b.dueDate) : null,
          net: b.net != null ? b.net : 0,
          vat: b.vat != null ? b.vat : 0,
          gross: b.gross != null ? b.gross : (Number(b.net || 0) + Number(b.vat || 0)),
          status: b.status ? String(b.status) : 'Open',
          source: b.source ? String(b.source) : null,
        },
        select: {
          id: true,
          number: true,
          status: true,
          supplierId: true,
          issueDate: true,
          dueDate: true,
          net: true,
          vat: true,
          gross: true,
          supplier: { select: { id: true, name: true } },
        },
      });
      return res.status(201).json(created);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to create invoice' });
    }
  });

  // POST /api/projects/:projectId/invoices/csv/import
  router.post('/:projectId/invoices/csv/import', requireProjectMember, async (req, res) => {
    try {
      const tenantId = req.user && req.user.tenantId;
      const projectId = Number(req.params.projectId);
      if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
      const raw = await getCsvTextFromRequest(req);
      const { headers, rows } = parseCsv(raw);
      const required = ['number'];
      for (const col of required) if (!headers.includes(col)) return res.status(400).json({ error: `Missing required column: ${col}` });
      let imported = 0, skipped = 0; const skippedRows = [];
      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx];
        const num = (r.number || '').trim();
        if (!num) { skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'INVALID_NUMBER' }); continue; }
        try {
          await prisma.invoice.create({
            data: {
              tenantId,
              projectId,
              number: num,
              supplierId: r.supplierId ? Number(r.supplierId) : null,
              issueDate: r.issueDate ? new Date(r.issueDate) : null,
              dueDate: r.dueDate ? new Date(r.dueDate) : null,
              net: r.net ? Number(r.net) : 0,
              vat: r.vat ? Number(r.vat) : 0,
              gross: r.gross ? Number(r.gross) : (Number(r.net || 0) + Number(r.vat || 0)),
              status: r.status ? String(r.status) : 'Open',
              source: 'csv',
            },
          });
          imported++;
        } catch (e) {
          skipped++; skippedRows.push({ rowIndex: idx+2, reason: 'ERROR:' + (e.code || e.message || 'UNKNOWN') });
        }
      }
      res.json({ imported, skipped, skippedRows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to import invoices CSV' });
    }
  });

  return router;
};
