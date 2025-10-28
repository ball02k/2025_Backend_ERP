const prisma = require("../lib/prisma.cjs");

function serialize(value) {
  if (value === undefined) {
    return null;
  }
  return JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

async function writeAudit({
  tenantId,
  userId,
  entity,
  entityId,
  action,
  before,
  after,
  reason
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        table_name: entity,
        record_id: typeof entityId === "bigint" ? Number(entityId) : Number(entityId ?? 0),
        user_id: userId ? Number.parseInt(userId, 10) || null : null,
        changes: {
          tenantId,
          before: serialize(before),
          after: serialize(after),
          reason: reason || null
        }
      }
    });
  } catch (error) {
    console.error("Failed to write audit log", error);
  }
}

module.exports = { writeAudit };
