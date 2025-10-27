const { prisma } = require('./prisma');

function safeMetadataString(metadata) {
  try {
    return JSON.stringify(metadata ?? {});
  } catch (err) {
    console.error('writeAudit metadata stringify error:', err?.message || err);
    return '{}';
  }
}

async function writeAudit(tenantId, userId, action, entityType, entityId, metadata = {}) {
  const metadataJson = safeMetadataString(metadata);
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
          metadata: metadataJson,
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
    let parsedMetadata = {};
    try {
      parsedMetadata = JSON.parse(metadataJson);
    } catch (_) {}

    console.log(
      JSON.stringify({
        level: 'info',
        type: 'audit-fallback',
        tenantId,
        userId,
        action,
        entityType,
        entityId,
        metadata: parsedMetadata,
        ts: new Date().toISOString()
      })
    );
  } catch {}
}

/**
 * Audit a rejected mutation (e.g., 409 Conflict) with reason
 */
async function auditReject(userId, tenantId, entity, entityId, action, reason, payload = {}) {
  await writeAudit(tenantId, userId, `${action}_REJECTED`, entity, entityId, {
    reason,
    payload,
    immutable: true
  });
}

module.exports = { writeAudit, auditReject };
