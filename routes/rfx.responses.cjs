const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// POST /rfx/:rfxId/upload-response { supplierId, filename, contentBase64 }
router.post('/rfx/:rfxId/upload-response', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const rfxId = Number(req.params.rfxId);
    const { supplierId, contentBase64 } = req.body || {};
    if (!supplierId || !contentBase64) return res.status(400).json({ error: 'supplierId and contentBase64 required' });

    const xml = Buffer.from(contentBase64, 'base64').toString('utf8');
    const pickTable = (name) => {
      const m = xml.match(new RegExp(`<Worksheet[^>]*Name="${name}"[\\s\\S]*?<Table>([\\s\\S]*?)</Table>`));
      if (!m) return [];
      return [...m[1].matchAll(/<Row>([\s\S]*?)<\/Row>/g)].map((r) => {
        return [...r[1].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/g)].map((c) => c[1]);
      });
    };

    const pricingRows = pickTable('Pricing');
    const questionsRows = pickTable('Questions');

    const pricing = pricingRows
      .slice(1)
      .filter((r) => r.length)
      .map((r) => ({
        supplierId: Number(r[0] || supplierId),
        item: r[1],
        description: r[2],
        qty: r[3] ? Number(r[3]) : null,
        unit: r[4] || null,
        rate: r[5] ? Number(r[5]) : null,
        total: r[6] ? Number(r[6]) : null,
      }))
      .filter((x) => x.item || x.description);

    const answers = questionsRows
      .slice(1)
      .filter((r) => r.length)
      .map((r) => ({ supplierId: Number(r[0] || supplierId), question: r[1], response: r[2] || '' }))
      .filter((x) => x.question);

    const sub = await prisma.rFxSubmission.upsert({
      where: { tenantId_rfxId_supplierId: { tenantId, rfxId, supplierId: Number(supplierId) } },
      update: { pricing, answers },
      create: { tenantId, rfxId, supplierId: Number(supplierId), pricing, answers },
    });

    res.json({ ok: true, submissionId: sub.id, pricingCount: pricing.length, questionsCount: answers.length });
  } catch (e) {
    next(e);
  }
});

// GET /rfx/:rfxId/submissions — list parsed submissions (id, supplierId, score)
router.get('/rfx/:rfxId/submissions', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const rfxId = Number(req.params.rfxId);
    const rows = await prisma.rFxSubmission.findMany({
      where: { tenantId, rfxId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, supplierId: true, score: true, createdAt: true, updatedAt: true },
    });
    res.json(rows);
  } catch (e) { next(e); }
});

// PATCH /rfx/submissions/:submissionId — save manual score
router.patch('/rfx/submissions/:submissionId', async (req, res, next) => {
  try {
    const id = Number(req.params.submissionId);
    const { score } = req.body || {};
    const upd = await prisma.rFxSubmission.update({ where: { id }, data: { score: score == null ? null : Number(score) } });
    res.json({ id: upd.id, score: upd.score });
  } catch (e) { next(e); }
});

module.exports = router;
