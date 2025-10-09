const express = require('express');
const router = express.Router({ mergeParams: true });
const { prisma } = require('../utils/prisma.cjs');
const { requireProjectMember } = require('../middleware/membership.cjs');

// --- helpers: coerce Prisma Decimal/strings to numbers, and shape outbound lines ---
function num(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function shapeLine(b) {
  return {
    id: b.id,
    description: b.description ?? "",
    quantity: num(b.quantity),   // may be null if not set
    unit: b.unit ?? "ea",
    rate: num(b.rate),
    amount: num(b.amount),
    sortOrder: num(b.sortOrder) ?? 0,
    groupId: b.groupId ? Number(b.groupId) : null,
    costCode: b.costCode ? { id: b.costCode.id, code: b.costCode.code, description: b.costCode.description ?? "" } : null,
    // Map through join table; include status if present
    packages: Array.isArray(b.packageItems)
      ? b.packageItems
          .map(pi => (pi.package ? { id: pi.package.id, name: pi.package.name, status: pi.package.status, code: pi.package.costCode?.code } : null))
          .filter(Boolean)
      : [],
  };
}

// GET grouped budgets — unified data for both views; includes empty groups for "user"
router.get('/:projectId/budgets', requireProjectMember, async (req, res) => {
  try {
    const { projectId } = req.params;
    const groupingRaw = String(req.query.grouping || 'user');
    const grouping = groupingRaw.split(':')[0]; // sanitize unexpected values like 'user:1'
    const tenantId = req.user.tenantId;

    // 1) Load all lines (we'll coerce with shapeLine)
    const linesRaw = await prisma.budgetLine.findMany({
      where: { tenantId, projectId: Number(projectId) },
      select: {
        id: true,
        description: true,
        amount: true,
        sortOrder: true,
        groupId: true,
        costCode: { select: { id: true, code: true, description: true } },
        packageItems: { select: { package: { select: { id: true, name: true, status: true, costCode: { select: { code: true } } } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    const lines = linesRaw.map(shapeLine);

    // 2) Load all groups (so empty groups appear)
    const allGroups = await prisma.budgetGroup.findMany({
      where: { tenantId, projectId: Number(projectId) },
      select: { id: true, name: true, sortOrder: true },
    });
    const gmap = new Map(allGroups.map(g => [g.id, g]));

    const groups = new Map();

    if (String(grouping) === 'user') {
      // Seed UNGROUPED bucket first
      groups.set('user:0', { key: 'user:0', name: 'Ungrouped', sortOrder: 0, subtotal: 0, items: [] });
      // Seed ALL user groups (even if empty)
      for (const g of allGroups) {
        groups.set(`user:${g.id}`, { key: `user:${g.id}`, name: g.name || `Group ${g.id}`, sortOrder: g.sortOrder ?? 10000, subtotal: 0, items: [] });
      }
      // Place each line into its group (or ungrouped)
      for (const l of lines) {
        const key = l.groupId ? `user:${l.groupId}` : 'user:0';
        const amt = l.amount != null ? l.amount : (num(l.quantity) || 0) * (num(l.rate) || 0);
        if (!groups.has(key)) groups.set(key, { key, name: l.groupId ? (gmap.get(l.groupId)?.name || `Group ${l.groupId}`) : 'Ungrouped', sortOrder: l.groupId ? (gmap.get(l.groupId)?.sortOrder ?? 10000) : 0, subtotal: 0, items: [] });
        const g = groups.get(key);
        g.items.push(l);
        g.subtotal += amt;
      }
    } else {
      // Group by cost code prefix; UNGROUPED first
      groups.set('code:UNGROUPED', { key: 'code:UNGROUPED', name: 'Ungrouped', sortOrder: 0, subtotal: 0, items: [] });
      for (const l of lines) {
        const code = l.costCode?.code || '';
        const prefix = code.split('-')[0] || 'UNGROUPED';
        const key = `code:${prefix}`;
        if (!groups.has(key)) groups.set(key, { key, name: prefix === 'UNGROUPED' ? 'Ungrouped' : prefix, sortOrder: prefix === 'UNGROUPED' ? 0 : 10000, subtotal: 0, items: [] });
        const g = groups.get(key);
        const amt = l.amount != null ? l.amount : (num(l.quantity) || 0) * (num(l.rate) || 0);
        g.items.push(l);
        g.subtotal += amt;
      }
    }

    const out = Array.from(groups.values()).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const total = out.reduce((s, g) => s + (Number(g.subtotal) || 0), 0);
    res.json({ groups: out, total });
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

    // Coerce any Decimal/string numerics to plain numbers to keep client inputs stable
    res.json({
      ...updated,
      quantity: Number(updated.quantity ?? 0),
      rate: Number(updated.rate ?? 0),
      amount: Number(updated.amount ?? 0),
    });
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

    // Check linked packages and variations
    const [packages, varCount] = await Promise.all([
      prisma.package.findMany({
        where: { budgetItems: { some: { budgetLineId: id } } },
        select: { id: true, name: true, status: true },
      }),
      prisma.variation.count({ where: { budgetLineId: id } }).catch(()=>0),
    ]);

    const blocking = packages.filter(p => ['awarded','contracted'].includes(String(p.status||'').toLowerCase()));
    if (blocking.length) {
      return res.status(409).json({
        error: 'LINKED_TO_AWARDED',
        message: 'Line is linked to awarded/contracted package(s). Remove it there first.',
        packages: blocking.map(p => ({ id: p.id, name: p.name, status: p.status })),
      });
    }

    // If other references exist (e.g., non-awarded packages or variations), still block to avoid FK errors
    if (packages.length > 0 || varCount > 0) {
      return res.status(409).json({
        error: 'BUDGET_LINE_IN_USE',
        message: 'This budget line is linked to other records. Remove it from packages/variations first, then delete.',
        refs: { packages: packages.length, variations: varCount },
      });
    }

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

// TEMP: One-off backfill for legacy lines where amount is null
// Remove after running once per project/tenant
router.post('/:projectId/budgets/backfill-amounts', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.projectId);

    const rows = await prisma.budgetLine.findMany({
      where: { tenantId, projectId },
      select: { id: true, amount: true },
      orderBy: { id: 'asc' },
    });

    // In this schema quantity/rate are not persisted; this backfill simply ensures amount is numeric
    const tx = [];
    for (const r of rows) {
      const amt = num(r.amount) ?? 0;
      // Only update when stored value is null/NaN
      if (amt !== num(r.amount)) {
        tx.push(prisma.budgetLine.update({ where: { id: r.id }, data: { amount: amt } }));
      }
    }
    if (tx.length) await prisma.$transaction(tx);
    res.json({ ok: true, updated: tx.length });
  } catch (e) {
    console.error('[budgets/backfill-amounts]', e);
    res.status(500).json({ error: 'Failed to backfill amounts' });
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
