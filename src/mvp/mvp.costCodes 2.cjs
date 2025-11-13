const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /mvp/cost-codes?search=&parentId=
router.get('/cost-codes', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { search, parentId } = req.query;
    const where = { tenantId };
    if (search) where.OR = [{ code: { contains: String(search) } }, { description: { contains: String(search) } }];
    if (parentId) where.parentId = Number(parentId);
    const rows = await prisma.costCode.findMany({ where, orderBy: [{ code: 'asc' }] });
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /mvp/cost-codes
router.post('/cost-codes', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { code, description, parentId } = req.body || {};
    const row = await prisma.costCode.create({ data: { tenantId, code, description, parentId: parentId ?? null } });
    res.json(row);
  } catch (e) { next(e); }
});

// POST /mvp/cost-codes/import  { rows:[{code,description,parentCode?}]}
router.post('/cost-codes/import', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const map = new Map();
    for (const r of rows) {
      let parentId = null;
      if (r.parentCode) {
        const parent = map.get(r.parentCode) || (await prisma.costCode.findFirst({ where: { tenantId, code: r.parentCode } }));
        if (parent) parentId = parent.id;
      }
      const created = await prisma.costCode.upsert({
        where: { tenantId_code: { tenantId, code: r.code } },
        update: { description: r.description ?? null, parentId },
        create: { tenantId, code: r.code, description: r.description ?? null, parentId },
      });
      map.set(r.code, created);
    }
    res.json({ ok: true, count: rows.length });
  } catch (e) { next(e); }
});

module.exports = router;
