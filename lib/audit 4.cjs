const { prisma } = require('../utils/prisma.cjs');

function normalizeUserId(userId) {
  if (userId == null) return null;
  const numeric = Number(userId);
  return Number.isFinite(numeric) ? numeric : String(userId);
}

async function auditLog(client, { tenantId, userId, entity, entityId, action, before, after }) {
  try {
    if (!client?.auditLog?.create) return;
    await client.auditLog.create({
      data: {
        tenantId: tenantId || null,
        userId: normalizeUserId(userId),
        entity,
        entityId: String(entityId ?? ''),
        action,
        changes: { before, after },
      },
    });
  } catch (e) {
    console.error('auditLog error', e);
  }
}

async function writeAudit({
  tenantId,
  userId,
  entity,
  entityId,
  action,
  before = null,
  after = null,
  reason = null,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: tenantId || null,
        userId: normalizeUserId(userId),
        entity,
        entityId: String(entityId ?? ''),
        action,
        changes: { before, after, reason },
      },
    });
  } catch (e) {
    console.error('writeAudit error', e);
  }
}

module.exports = {
  auditLog,
  writeAudit,
};
