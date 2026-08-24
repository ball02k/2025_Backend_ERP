const { prisma } = require('./prisma');

function safeMetadataString(metadata) {
  try {
    return JSON.stringify(metadata ?? {});
  } catch (err) {
    console.error('writeAudit metadata stringify error:', err?.message || err);
    return '{}';
  }
}

function normalizeAuditArgs(args) {
  const first = args[0];
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    const payload = first;
    const req = payload.req || {};
    const tenantId =
      payload.tenantId ||
      req.user?.tenantId ||
      req.tenant?.id ||
      req.tenantId ||
      null;
    const userId =
      payload.userId ??
      req.user?.id ??
      null;
    const metadata =
      payload.changes !== undefined
        ? payload.changes
        : {
            ...(payload.before !== undefined ? { before: payload.before } : {}),
            ...(payload.after !== undefined ? { after: payload.after } : {}),
            ...(payload.reason !== undefined ? { reason: payload.reason } : {}),
          };
    return {
      tenantId,
      userId,
      action: payload.action,
      entityType: payload.entity || payload.entityType,
      entityId: payload.entityId,
      metadata,
      ipAddress: req.ip || req.headers?.['x-forwarded-for'] || null,
    };
  }

  return {
    tenantId: args[0],
    userId: args[1],
    action: args[2],
    entityType: args[3],
    entityId: args[4],
    metadata: args[5] || {},
    ipAddress: null,
  };
}

async function writeAudit(...args) {
  const { tenantId, userId, action, entityType, entityId, metadata, ipAddress } = normalizeAuditArgs(args);
  const metadataJson = safeMetadataString(metadata);
  try {
    // Try to persist to DB if the model exists
    if (prisma?.auditLog?.create) {
      await prisma.auditLog.create({
        data: {
          userId: userId != null ? Number(userId) : null,
          action: String(action || ''),
          entity: String(entityType || ''),
          entityId: entityId != null ? String(entityId) : '',
          changes: {
            tenantId: String(tenantId || ''),
            ...(JSON.parse(metadataJson) || {}),
          },
          ipAddress: ipAddress ? String(ipAddress).split(',')[0].trim() : null,
          timestamp: new Date(),
        },
        select: { id: true },
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
