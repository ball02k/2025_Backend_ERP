const express = require('express');
const { requireProjectMember } = require('../middleware/membership.cjs');

module.exports = (prisma) => {
  const router = express.Router();

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
            supplier: { select: { id: true, name: true } },
          },
        }),
      ]);
      const items = rows.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        supplierId: r.supplierId || null,
        supplier: r.supplier ? { id: r.supplier.id, name: r.supplier.name } : (r.supplierId ? { id: r.supplierId, name: null } : null),
        issueDate: r.issueDate,
        dueDate: r.dueDate,
        net: r.net,
        vat: r.vat,
        gross: r.gross,
      }));
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

  return router;
};
