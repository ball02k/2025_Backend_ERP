const { prisma, Prisma } = require('./prisma.js');

function serialise(value) {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serialise);
  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((acc, key) => {
      acc[key] = serialise(value[key]);
      return acc;
    }, {});
  }
  return value;
}

async function auditLog({
  prisma: client = prisma,
  userId = null,
  entity,
  entityId,
  action,
  changes,
  ipAddress,
} = {}) {
  if (!entity || entityId == null) {
    console.warn('[audit] missing entity information, skipping log');
    return;
  }
  try {
    await client.auditLog.create({
      data: {
        userId: userId != null ? Number(userId) : null,
        entity,
        entityId: String(entityId),
        action,
        changes: changes != null ? serialise(changes) : null,
        ipAddress: ipAddress || null,
      },
    });
  } catch (err) {
    console.warn('[audit] failed to write audit log', err);
  }
}

async function writeAudit({
  prisma: client,
  req,
  userId,
  entity,
  entityId,
  action,
  changes,
} = {}) {
  const resolvedUserId = userId ?? req?.user?.id ?? req?.userId ?? null;
  const ip = req?.ip || req?.headers?.['x-forwarded-for'] || null;
  await auditLog({
    prisma: client,
    userId: resolvedUserId != null ? Number(resolvedUserId) : null,
    entity,
    entityId,
    action,
    changes,
    ipAddress: Array.isArray(ip) ? ip[0] : ip,
  });
}

module.exports = { auditLog, writeAudit };
