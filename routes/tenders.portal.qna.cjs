const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma');

// Assume prior middleware decoded token -> sets req.tenantId, req.rfxId, req.supplierId
function assert(condition, status = 400, message = 'Bad request') {
  if (!condition) {
    const e = new Error(message);
    e.status = status;
    throw e;
  }
}

// GET public QnA
router.get('/:token/qna', async (req, res, next) => {
  try {
    const { rfxId, tenantId } = req; // from token decode
    const rfxIdNum = Number(rfxId);
    assert(!Number.isNaN(rfxIdNum), 400, 'Invalid tender');

    const rows = await prisma.rfxQna.findMany({
      where: { tenantId, rfxId: rfxIdNum, visibility: 'public' },
      orderBy: [{ parentId: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// POST question (supplier -> always public, if before deadline and tender live)
router.post('/:token/qna', async (req, res, next) => {
  try {
    const { rfxId, tenantId, supplierId } = req; // from token decode
    const rfxIdNum = Number(rfxId);
    assert(!Number.isNaN(rfxIdNum), 400, 'Invalid tender');

    const tender = await prisma.rfx.findFirst({ where: { id: rfxIdNum, tenantId } });
    assert(tender && tender.status === 'live', 409, 'Tender not live');
    if (tender.deadline && new Date() > new Date(tender.deadline)) {
      return res.status(409).json({ message: 'Deadline passed' });
    }
    const { content, parentId, attachments } = req.body;
    assert(content && content.trim().length, 400, 'Content required');

    const row = await prisma.rfxQna.create({
      data: {
        tenantId,
        rfxId: rfxIdNum,
        parentId: parentId ? Number(parentId) : null,
        visibility: 'public',
        status: 'open',
        authorRole: 'supplier',
        authorSupplierId: supplierId,
        content,
        attachments: attachments ? JSON.stringify(attachments) : null,
      },
    });
    // optional internal notification
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
