const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const costCodeSelect = {
  id: true,
  tenantId: true,
  code: true,
  description: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
};

function getTenantId(req) {
  return req.user?.tenantId || req.tenantId;
}

// GET /cost-codes?search=&parentId=
router.get('/cost-codes', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
    const { search, parentId } = req.query;
    const where = { tenantId };
    const term = typeof search === 'string' ? search.trim() : '';
    if (term) {
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }
    if (parentId !== undefined) {
      if (parentId === '' || parentId === null || parentId === 'null') {
        where.parentId = null;
      } else {
        const parsed = Number(parentId);
        if (!Number.isNaN(parsed)) where.parentId = parsed;
      }
    }
    const rows = await prisma.costCode.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      select: costCodeSelect,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// POST /cost-codes
router.post('/cost-codes', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
    const { code, description, parentId } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'code is required' });
    }
    let resolvedParentId = null;
    if (parentId !== undefined && parentId !== null) {
      const parsed = Number(parentId);
      if (!Number.isNaN(parsed)) {
        const parent = await prisma.costCode.findFirst({
          where: { id: parsed, tenantId },
          select: { id: true },
        });
        if (!parent) return res.status(400).json({ error: 'parent not found' });
        resolvedParentId = parent.id;
      }
    }
    const row = await prisma.costCode.upsert({
      where: { tenantId_code: { tenantId, code: code.trim() } },
      update: { description: description?.trim() || undefined, parentId: resolvedParentId ?? undefined },
      create: { tenantId, code: code.trim(), description: description?.trim() || null, parentId: resolvedParentId },
      select: costCodeSelect,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

// PATCH /cost-codes/:id
router.patch('/cost-codes/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });
    const body = req.body || {};
    const data = {};
    if (body.code !== undefined) {
      if (!body.code) return res.status(400).json({ error: 'code cannot be empty' });
      data.code = String(body.code).trim();
    }
    if (body.description !== undefined) {
      data.description = body.description ? String(body.description).trim() : null;
    }
    if (body.parentId !== undefined) {
      if (body.parentId === null) {
        data.parentId = null;
      } else {
        const parsed = Number(body.parentId);
        if (Number.isNaN(parsed)) return res.status(400).json({ error: 'invalid parentId' });
        if (parsed === id) return res.status(400).json({ error: 'parent cannot be self' });
        const parent = await prisma.costCode.findFirst({
          where: { id: parsed, tenantId },
          select: { id: true },
        });
        if (!parent) return res.status(400).json({ error: 'parent not found' });
        data.parentId = parent.id;
      }
    }
    const updated = await prisma.costCode.update({
      where: { id },
      data,
      select: costCodeSelect,
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// DELETE /cost-codes/:id
router.delete('/cost-codes/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });
    await prisma.costCode.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /cost-codes/import  { rows:[{code,description,parentCode?}]}
router.post('/cost-codes/import', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const cache = new Map();
    let processed = 0;
    for (const r of rows) {
      const code = typeof r.code === 'string' ? r.code.trim() : '';
      if (!code) continue;
      const description = typeof r.description === 'string' ? r.description.trim() : null;
      let parentId = null;
      const parentCode = typeof r.parentCode === 'string' ? r.parentCode.trim() : '';
      if (parentCode) {
        let parent = cache.get(parentCode);
        if (!parent) {
          parent = await prisma.costCode.findFirst({
            where: { tenantId, code: parentCode },
            select: { id: true },
          });
        }
        if (parent) {
          parentId = parent.id;
          cache.set(parentCode, parent);
        }
      }
      const created = await prisma.costCode.upsert({
        where: { tenantId_code: { tenantId, code } },
        update: { description, parentId },
        create: { tenantId, code, description, parentId },
        select: { id: true, code: true },
      });
      cache.set(code, created);
      processed += 1;
    }
    res.json({ ok: true, count: processed });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
