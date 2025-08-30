const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');

function hasRole(req, roleKeys) {
  const roles = Array.isArray(req.user?.roles) ? req.user.roles.map((r) => String(r).toLowerCase()) : [];
  return roleKeys.some((k) => roles.includes(String(k).toLowerCase()));
}

function pickTypes(raw) {
  const all = ['projects', 'tasks', 'clients', 'suppliers', 'variations', 'purchaseOrders', 'cvr'];
  if (!raw) return new Set(all);
  const arr = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  return new Set(arr.filter((t) => all.includes(t)));
}

function item(type, id, title, subtitle, route) {
  return { id, type, title, subtitle, route };
}

router.get('/', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ data: [] });
    const types = pickTypes(req.query.types);
    const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 5;

    const want = (t) => types.has(t);
    const tasks = [];

    if (want('projects')) {
      tasks.push(
        prisma.project.findMany({
          where: {
            tenantId,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true, code: true, status: true },
          take: limit,
        }).then((rows) => rows.map((r) => item('projects', r.id, r.name, `Code ${r.code} • ${r.status}`, `/projects/${r.id}`)))
      );
    }

    if (want('tasks')) {
      tasks.push(
        prisma.task.findMany({
          where: {
            tenantId,
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, title: true, projectId: true, status: true, dueDate: true },
          take: limit,
        }).then((rows) => rows.map((r) => item('tasks', r.id, r.title, `Status ${r.status}${r.dueDate ? ' • due ' + new Date(r.dueDate).toLocaleDateString() : ''}`, `/projects/${r.projectId}/tasks`)))
      );
    }

    if (want('clients')) {
      // Tenant-safe: only clients tied to projects in this tenant
      tasks.push(
        prisma.client.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { vatNo: { contains: q, mode: 'insensitive' } },
              { companyRegNo: { contains: q, mode: 'insensitive' } },
            ],
            projects: { some: { tenantId } },
          },
          select: { id: true, name: true, vatNo: true, companyRegNo: true },
          take: limit,
        }).then((rows) => rows.map((r) => item('clients', r.id, r.name, [r.companyRegNo, r.vatNo].filter(Boolean).join(' • '), `/clients/${r.id}`)))
      );
    }

    if (want('suppliers')) {
      tasks.push(
        prisma.supplier.findMany({
          where: {
            tenantId,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { vatNo: { contains: q, mode: 'insensitive' } },
              { companyRegNo: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true, status: true },
          take: limit,
        }).then((rows) => rows.map((r) => item('suppliers', r.id, r.name, `Status ${r.status}`, `/suppliers/${r.id}`)))
      );
    }

    if (want('variations')) {
      tasks.push(
        prisma.variation.findMany({
          where: {
            tenantId,
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { reference: { contains: q, mode: 'insensitive' } },
              { referenceCode: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, title: true, reference: true, projectId: true, status: true },
          take: limit,
        }).then((rows) => rows.map((r) => item('variations', r.id, r.title || (r.reference ? `VAR ${r.reference}` : `Variation ${r.id}`), `Status ${r.status}`, `/projects/${r.projectId}/variations/${r.id}`)))
      );
    }

    if (want('purchaseOrders')) {
      tasks.push(
        prisma.purchaseOrder.findMany({
          where: {
            tenantId,
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { supplier: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, code: true, supplier: true, status: true, projectId: true },
          take: limit,
        }).then((rows) => rows.map((r) => item('purchaseOrders', r.id, `PO ${r.code}`, `${r.supplier || 'Supplier'} • ${r.status}`, `/procurement/pos/${r.id}`)))
      );
    }

    if (want('cvr')) {
      tasks.push(
        prisma.project.findMany({
          where: {
            tenantId,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true, code: true },
          take: limit,
        }).then((rows) => rows.map((r) => item('cvr', r.id, `CVR: ${r.name}`, `Code ${r.code}`, `/projects/${r.id}/financials`)))
      );
    }

    const resultsByType = await Promise.all(tasks);
    const flat = resultsByType.flat();

    // Role-aware ordering
    const isQS = hasRole(req, ['qs', 'quantity_surveyor', 'commercial', 'commercial_manager']);
    const isPM = hasRole(req, ['pm', 'project_manager']);
    const priority = new Map();
    // Base priority
    const baseOrder = ['projects', 'tasks', 'clients', 'suppliers', 'variations', 'purchaseOrders', 'cvr'];
    baseOrder.forEach((t, i) => priority.set(t, 100 + i));
    if (isQS) {
      // Surface variations/PO/CVR
      priority.set('variations', 1);
      priority.set('purchaseOrders', 2);
      priority.set('cvr', 3);
    }
    if (isPM) {
      // Surface projects/tasks
      priority.set('projects', 1);
      priority.set('tasks', 2);
    }
    const sorted = flat.sort((a, b) => (priority.get(a.type) || 999) - (priority.get(b.type) || 999) || String(a.title).localeCompare(String(b.title)));

    res.json({ data: sorted });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;

