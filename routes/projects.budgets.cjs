const express = require('express');
const router = express.Router({ mergeParams: true });
const { prisma } = require('../utils/prisma.cjs');
const { requireProjectMember } = require('../middleware/membership.cjs');

// GET /api/projects/:projectId/budgets?grouping=costCode|user
// GET grouped budgets (subtotals correct)
router.get('/:projectId/budgets', requireProjectMember, async (req, res) => {
  try {
    const { projectId } = req.params;
    const grouping = String(req.query.grouping || 'costCode').toLowerCase();
    const tenantId = req.user.tenantId;

    const lines = await prisma.budgetLine.findMany({
      where: { tenantId, projectId: Number(projectId) },
      include: { costCode: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    const groups = new Map();

    for (const b of lines) {
      const codePrefix = (b.costCode?.code || '').split('-')[0] || 'UNGROUPED';
      const key = (grouping === 'user' && b.groupId) ? `user:${b.groupId}` : `code:${codePrefix}`;

      if (!groups.has(key)) {
        const gid = key.startsWith('user:') ? Number(String(key).split(':')[1]) : null;
        const meta = gid ? await prisma.budgetGroup.findFirst({ where: { tenantId, projectId: Number(projectId), id: gid }, select: { name: true, sortOrder: true } }).catch(()=>null) : null;
        const name = key.startsWith('user:') ? (meta?.name || `Group ${gid}`) : codePrefix;
        const sortOrder = key.startsWith('user:') ? (meta?.sortOrder ?? 0) : 999999;
        groups.set(key, { key, groupId: gid, name, sortOrder, subtotal: 0, items: [] });
      }
      const g = groups.get(key);
      g.items.push(b);

      const lineAmount = (b.amount != null ? Number(b.amount) : (Number(b.quantity||0) * Number(b.rate||0)));
      g.subtotal += Number(lineAmount || 0);
    }

    // If user grouping: order groups by BudgetGroup.sortOrder (if available)
    let out = Array.from(groups.values());
    if (grouping === 'user') {
      // Ensure empty groups also appear, and sort by group.sortOrder
      const allGroups = await prisma.budgetGroup.findMany({
        where: { tenantId, projectId: Number(projectId) },
        select: { id: true, name: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      for (const mg of allGroups) {
        const key = `user:${mg.id}`;
        if (!groups.has(key)) {
          groups.set(key, { key, groupId: mg.id, name: mg.name || `Group ${mg.id}`, sortOrder: mg.sortOrder ?? 0, subtotal: 0, items: [] });
        } else {
          const g = groups.get(key);
          g.name = mg.name || g.name;
          g.sortOrder = mg.sortOrder ?? g.sortOrder ?? 0;
          g.groupId = mg.id;
        }
      }
      out = allGroups.map(mg => groups.get(`user:${mg.id}`)).filter(Boolean);
    }

    res.json({ groups: out });
  } catch (e) {
    console.error('[budgets/groups]', e);
    res.status(500).json({ error: 'Failed to load budget groups' });
  }
});

// POST /api/projects/:projectId/budget-groups { name }
router.post('/:projectId/budget-groups', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.projectId);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const group = await prisma.budgetGroup.create({ data: { tenantId, projectId, name, isSystem: false } });

    await prisma.auditLog?.create?.({
      data: {
        tenantId, userId: req.user.id,
        entity: 'BudgetGroup', entityId: String(group.id),
        action: 'CREATE', changes: { name }
      }
    }).catch(() => {});

    res.status(201).json(group);
  } catch (e) {
    console.error('[budget-groups/create]', e);
    res.status(500).json({ error: 'Failed to create budget group' });
  }
});

// PATCH /api/projects/:projectId/budgets/:budgetLineId/group { groupId }
router.patch('/:projectId/budgets/:budgetLineId/group', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const budgetLineId = Number(req.params.budgetLineId);
    const groupId = req.body?.groupId != null ? Number(req.body.groupId) : null;

    const updated = await prisma.budgetLine.update({ where: { id: budgetLineId }, data: { groupId } });

    await prisma.auditLog?.create?.({
      data: {
        tenantId, userId: req.user.id,
        entity: 'BudgetLine', entityId: String(budgetLineId),
        action: 'UPDATE', changes: { groupId }
      }
    }).catch(() => {});

    res.json(updated);
  } catch (e) {
    console.error('[budgets/assign-group]', e);
    res.status(500).json({ error: 'Failed to assign budget to group' });
  }
});

// CREATE budget line via budgets namespace (maps qty/rate -> amount)
router.post('/:projectId/budgets', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.projectId);
    const b = req.body || {};
    const qty = Number(b.quantity || b.qty || 0) || 0;
    const rate = Number(b.rate || b.unitCost || 0) || 0;
    const amount = b.amount != null ? Number(b.amount) : (qty * rate);

    const created = await prisma.budgetLine.create({
      data: {
        tenantId,
        projectId,
        description: b.description ?? null,
        amount: Number.isFinite(amount) ? amount : 0,
        planned: null,
        estimated: null,
        actual: null,
        costCodeId: b.costCodeId != null ? Number(b.costCodeId) : null,
        groupId: b.groupId != null ? Number(b.groupId) : null,
      },
      include: { costCode: true },
    });

    await prisma.auditLog?.create?.({
      data: {
        tenantId, userId: req.user.id,
        entity: 'BudgetLine', entityId: String(created.id),
        action: 'CREATE', changes: { description: created.description, amount: created.amount }
      }
    }).catch(() => {});

    res.status(201).json(created);
  } catch (e) {
    console.error('[budgets/create]', e);
    res.status(500).json({ error: 'Failed to create budget line' });
  }
});

// UPDATE budget line: robust recompute of amount from qty & rate (client supplies both)
router.patch('/:projectId/budgets/:id', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const b = req.body || {};

    // Read existing to future‑proof recompute (qty/rate not persisted in current schema)
    const existing = await prisma.budgetLine.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const data = {};
    if (b.description !== undefined) data.description = b.description ?? null;
    if (b.groupId !== undefined) data.groupId = b.groupId ? Number(b.groupId) : null;
    if (b.sortOrder !== undefined) data.sortOrder = Number(b.sortOrder);
    if (b.costCodeId !== undefined) data.costCodeId = b.costCodeId ? Number(b.costCodeId) : null;

    // Robust recompute: if amount provided, take it; else recompute from qty*rate provided by client
    if (b.amount !== undefined) {
      data.amount = Number(b.amount) || 0;
    } else if (b.quantity !== undefined || b.rate !== undefined) {
      const q = b.quantity != null ? Number(b.quantity) : 0;
      const r = b.rate != null ? Number(b.rate) : 0;
      data.amount = (Number.isFinite(q) ? q : 0) * (Number.isFinite(r) ? r : 0);
    }

    const updated = await prisma.budgetLine.update({ where: { id }, data, include: { costCode: true } });

    await prisma.auditLog?.create?.({
      data: {
        tenantId, userId: req.user.id,
        entity: 'BudgetLine', entityId: String(id),
        action: 'UPDATE', changes: data
      }
    }).catch(() => {});

    res.json(updated);
  } catch (e) {
    console.error('[budgets/update]', e);
    res.status(500).json({ error: 'Failed to update budget line' });
  }
});

// DELETE budget line
router.delete('/:projectId/budgets/:id', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    await prisma.budgetLine.delete({ where: { id } });
    await prisma.auditLog?.create?.({
      data: { tenantId, userId: req.user.id, entity: 'BudgetLine', entityId: String(id), action: 'DELETE', changes: {} }
    }).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error('[budgets/delete]', e);
    res.status(500).json({ error: 'Failed to delete budget line' });
  }
});

module.exports = router;
// BULK reorder/move budget lines: [{ id, groupId, sortOrder }]
router.patch('/:projectId/budgets/reorder', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.projectId);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!items.length) return res.json({ ok: true, count: 0 });

    const updates = [];
    for (const it of items) {
      if (!it?.id) continue;
      const id = Number(it.id);
      const data = {};
      if (it.groupId !== undefined) data.groupId = it.groupId ? Number(it.groupId) : null;
      if (it.sortOrder !== undefined) data.sortOrder = Number(it.sortOrder);
      if (Object.keys(data).length === 0) continue;
      // Scope by id; membership middleware enforces project access
      updates.push(prisma.budgetLine.update({ where: { id }, data }));
    }

    if (updates.length) await prisma.$transaction(updates);

    await prisma.auditLog?.create?.({
      data: {
        tenantId,
        userId: req.user.id,
        entity: 'Budget',
        entityId: 'bulk',
        action: 'REORDER',
        changes: { count: items.length, projectId },
      },
    }).catch(() => {});

    res.json({ ok: true, count: items.length });
  } catch (e) {
    console.error('[budgets/reorder]', e);
    res.status(500).json({ error: 'Failed to reorder budget lines' });
  }
});

// REORDER budget groups: [{ groupId, sortOrder }]
router.patch('/:projectId/budget-groups/reorder', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.projectId);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.json({ ok: true, count: 0 });

    const tx = [];
    for (const it of items) {
      if (!it?.groupId) continue;
      const id = Number(it.groupId);
      const sortOrder = Number(it.sortOrder ?? 0);
      tx.push(prisma.budgetGroup.updateMany({ where: { id, tenantId, projectId }, data: { sortOrder } }));
    }
    if (tx.length) await prisma.$transaction(tx);

    await prisma.auditLog?.create?.({
      data: {
        tenantId, userId: req.user.id,
        entity: 'BudgetGroup', entityId: 'bulk',
        action: 'REORDER', changes: { count: items.length }
      }
    }).catch(() => {});

    res.json({ ok: true, count: items.length });
  } catch (e) {
    console.error('[budget-groups/reorder]', e);
    res.status(500).json({ error: 'Failed to reorder budget groups' });
  }
});

// RENAME group
router.patch('/:projectId/budget-groups/:groupId', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.projectId);
    const groupId = Number(req.params.groupId);
    const { name } = req.body || {};

    const updated = await prisma.budgetGroup.update({
      where: { id: groupId },
      data: { ...(name != null ? { name: String(name) } : {}) },
    });

    await prisma.auditLog?.create?.({
      data: { tenantId, userId: req.user.id, entity: 'BudgetGroup', entityId: String(groupId), action: 'UPDATE', changes: { name } }
    }).catch(() => {});

    res.json(updated);
  } catch (e) {
    console.error('[budget-groups/rename]', e);
    res.status(500).json({ error: 'Failed to rename group' });
  }
});

// DELETE group (blocks if lines exist unless withLines=true)
router.delete('/:projectId/budget-groups/:groupId', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.projectId);
    const groupId = Number(req.params.groupId);
    const withLines = String(req.query.withLines || '').toLowerCase() === 'true';

    const count = await prisma.budgetLine.count({ where: { groupId } });
    if (count > 0 && !withLines) {
      return res.status(409).json({ error: 'GROUP_NOT_EMPTY', message: 'Move lines to another group or choose delete with lines.' });
    }
    if (withLines) {
      await prisma.budgetLine.deleteMany({ where: { groupId } });
    }
    await prisma.budgetGroup.delete({ where: { id: groupId } });

    await prisma.auditLog?.create?.({
      data: { tenantId, userId: req.user.id, entity: 'BudgetGroup', entityId: String(groupId), action: 'DELETE', changes: { withLines, deletedLines: withLines ? count : 0 } }
    }).catch(() => {});

    res.json({ ok: true });
  } catch (e) {
    console.error('[budget-groups/delete]', e);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});
