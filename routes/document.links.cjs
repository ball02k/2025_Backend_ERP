const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');

// List documents linked to an entity
router.get('/documents/links', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { entityType, entityId, limit = '50', offset = '0', orderBy = 'createdAt.desc', category } = req.query || {};
    if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId required' });

    const where = {
      tenantId,
      entityType: String(entityType),
      entityId: Number(entityId),
      ...(category ? { category: String(category) } : {}),
    };

    const links = await prisma.documentLink.findMany({
      where,
      skip: Number(offset),
      take: Number(limit),
      orderBy: toOrderBy(String(orderBy)),
    });

    const docIds = links.map((l) => l.documentId);
    const docs = docIds.length
      ? await prisma.document.findMany({ where: { id: { in: docIds }, tenantId } })
      : [];

    const items = links.map((l) => {
      const d = docs.find((x) => String(x.id) === String(l.documentId));
      return { linkId: l.id, ...l, document: d || null };
    });

    res.json({ items, total: items.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list links' });
  }
});

// Link a document to an entity (optionally set category)
router.post('/documents/:documentId/link', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const documentId = BigInt(req.params.documentId);
    const { entityType, entityId, category } = req.body || {};
    if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId required' });

    // Emulate upsert against a logical unique (tenantId, documentId, entityType, entityId)
    const existing = await prisma.documentLink.findFirst({
      where: { tenantId, documentId, entityType: String(entityType), entityId: Number(entityId) },
    });

    let link;
    if (existing) {
      link = await prisma.documentLink.update({
        where: { id: existing.id },
        data: { category: category || null },
      });
    } else {
      link = await prisma.documentLink.create({
        data: {
          tenantId,
          documentId,
          entityType: String(entityType),
          entityId: Number(entityId),
          category: category || null,
          linkType: String(entityType),
        },
      });
    }

    res.json(link);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to link document' });
  }
});

// Unlink
router.delete('/documents/:documentId/link', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const documentId = BigInt(req.params.documentId);
    const { entityType, entityId } = req.query || {};
    if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId required' });

    await prisma.documentLink.deleteMany({
      where: {
        tenantId,
        documentId,
        entityType: String(entityType),
        entityId: Number(entityId),
      },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to unlink document' });
  }
});

function toOrderBy(ob) {
  const [k, d] = (ob || 'createdAt.desc').split('.');
  return { [k]: String(d).toLowerCase() === 'asc' ? 'asc' : 'desc' };
}

module.exports = router;
