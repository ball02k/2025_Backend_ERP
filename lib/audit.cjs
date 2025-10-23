const { prisma } = require('./prisma');

async function writeAudit(...args) {
  let tenantId;
  let userId;
  let action;
  let entityType;
  let entityId;
  let metadata = {};

  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const payload = args[0];
    tenantId = payload.tenantId ?? payload.req?.tenant?.id ?? payload.req?.tenantId ?? payload.req?.user?.tenantId ?? payload.req?.headers?.['x-tenant-id'] ?? payload.req?.headers?.['X-Tenant-Id'] ?? null;
    userId = payload.userId ?? payload.req?.user?.id ?? null;
    action = payload.action ?? payload.event ?? null;
    entityType = payload.entityType ?? payload.entity ?? null;
    entityId = payload.entityId ?? payload.id ?? null;
    metadata = payload.metadata ?? payload.changes ?? {};
  } else {
    [tenantId, userId, action, entityType, entityId, metadata = {}] = args;
  }

  if (!tenantId || entityId == null || !action || !entityType) {
    console.error('writeAudit skipped due to missing fields', {
      tenantId,
      userId,
      action,
      entityType,
      entityId,
    });
    return;
  }

  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: userId != null ? Number(userId) : null,
        action,
        entityType,
        entityId: Number(entityId),
        metadata: JSON.stringify(metadata ?? {}),
      },
    });
  } catch (e) {
    console.error('writeAudit failed', e);
  }
}

module.exports = { writeAudit };
