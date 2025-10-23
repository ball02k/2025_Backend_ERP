const { prisma } = require('./prisma');

async function writeAudit(tenantId, userId, action, entityType, entityId, metadata = {}) {
  try {
    // Try to persist to DB if the model exists
    if (prisma?.auditLog?.create) {
      await prisma.auditLog.create({
        data: {
          tenantId: String(tenantId || ''),
          userId: userId != null ? Number(userId) : null,
          action: String(action || ''),
          entityType: String(entityType || ''),
          entityId: entityId != null ? Number(entityId) : null,
          metadata: JSON.stringify(metadata || {}),
          createdAt: new Date()
        }
      });
      return;
    }
  } catch (e) {
    // fall through to console log
    console.error('writeAudit DB error (non-fatal):', e?.message || e);
  }

  // Fallback: console log so we never crash the API
  try {
    // keep one-line structured log
    console.log(
      JSON.stringify({
        level: 'info',
        type: 'audit-fallback',
        tenantId,
        userId,
        action,
        entityType,
        entityId,
        metadata,
        ts: new Date().toISOString()
      })
    );
  } catch {}
}

module.exports = { writeAudit };
