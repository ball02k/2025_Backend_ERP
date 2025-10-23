const router = require('express').Router();
const { prisma } = require('../utils/prisma.cjs');
const { writeAudit } = require('../lib/audit.cjs');

function getTenantId(req) {
  return req.user?.tenantId || req.tenantId || 'demo';
}

function getUserId(req) {
  const raw = req.user?.id ?? req.userId ?? null;
  return raw != null ? Number(raw) : null;
}

async function audit(prisma, req, userId, id, action, changes) {
  try {
    await writeAudit({
      prisma,
      req,
      userId,
      entity: 'Contract',
      entityId: id,
      action,
      changes: changes || {},
    });
  } catch (_) {}
}

// Issue contract
router.post('/contracts/:id/issue', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = Number(req.params.id);

    const row = await prisma.contract.update({
      where: { id },
      data: { status: 'Issued', issuedAt: new Date() },
    });

    await audit(prisma, req, userId, id, 'CONTRACT_ISSUE', {});
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// Send for signature
router.post('/contracts/:id/send-for-signature', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = Number(req.params.id);

    const row = await prisma.contract.update({
      where: { id },
      data: { status: 'SentForSignature', sentForSignatureAt: new Date() },
    });

    await audit(prisma, req, userId, id, 'CONTRACT_SEND_FOR_SIGNATURE', {});
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// Mark as signed
router.post('/contracts/:id/mark-signed', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = Number(req.params.id);

    const row = await prisma.contract.update({
      where: { id },
      data: { status: 'Signed', signedAt: new Date() },
    });

    await audit(prisma, req, userId, id, 'CONTRACT_MARK_SIGNED', {});
    res.json(row);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
