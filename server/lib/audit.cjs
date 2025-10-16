module.exports.auditLog = async function auditLog(prisma, { tenantId, userId, entity, entityId, action, before, after }) {
  try {
    if (!prisma?.auditLog?.create) return;
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: userId == null ? null : Number.isNaN(Number(userId)) ? String(userId) : Number(userId),
        entity,
        entityId: String(entityId ?? ''),
        action,
        beforeJson: before ? JSON.stringify(before) : null,
        afterJson: after ? JSON.stringify(after) : null,
      },
    });
  } catch (e) {
    console.error('auditLog error', e);
  }
};
