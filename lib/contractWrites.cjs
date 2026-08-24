const { Prisma } = require('@prisma/client');

function decimalText(value, fallback = 0) {
  if (value == null || value === '') return String(fallback);
  if (value instanceof Prisma.Decimal) return value.toString();
  return String(value);
}

function intOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function createDraftContract(tx, data) {
  const value = decimalText(data.value);
  const retention = decimalText(data.retentionPercentage ?? data.retentionPct, 5);
  const paymentDueDays = intOrNull(data.paymentDueDays) ?? 14;
  const paymentFinalDays = intOrNull(data.paymentFinalDays) ?? 21;
  const rows = await tx.$queryRaw`
    INSERT INTO "Contract" (
      "tenantId",
      "projectId",
      "packageId",
      "supplierId",
      "title",
      "contractRef",
      "value",
      "currency",
      "status",
      "startDate",
      "endDate",
      "retentionPct",
      "retentionPercentage",
      "paymentTerms",
      "notes",
      "internalTeam",
      "contractTypeId",
      "awardId",
      "rfxId",
      "sourceMode",
      "draftCreatedAt",
      "paymentFrequency",
      "paymentDueDays",
      "paymentFinalDays",
      "totalCertifiedToDate",
      "totalPaidToDate",
      "retentionHeld",
      "retentionReleased",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${data.tenantId ?? null},
      ${Number(data.projectId)},
      ${data.packageId == null ? null : Number(data.packageId)},
      ${Number(data.supplierId)},
      ${String(data.title || 'Draft Contract')},
      ${data.contractRef || null},
      CAST(${value} AS numeric),
      ${data.currency || 'GBP'},
      ${data.status || 'draft'},
      ${data.startDate || null},
      ${data.endDate || null},
      CAST(${retention} AS numeric),
      CAST(${retention} AS numeric),
      ${data.paymentTerms || null},
      ${data.notes || null},
      ${data.internalTeam || null},
      ${data.contractTypeId || null},
      ${data.awardId == null ? null : Number(data.awardId)},
      ${data.rfxId == null ? null : Number(data.rfxId)},
      ${data.sourceMode || null},
      ${data.draftCreatedAt || new Date()},
      ${data.paymentFrequency || 'MONTHLY'},
      ${paymentDueDays},
      ${paymentFinalDays},
      CAST('0' AS numeric),
      CAST('0' AS numeric),
      CAST('0' AS numeric),
      CAST('0' AS numeric),
      NOW(),
      NOW()
    )
    RETURNING
      "id",
      "projectId",
      "packageId",
      "supplierId",
      "title",
      "contractRef",
      "value",
      "currency",
      "status"
  `;
  return Array.isArray(rows) ? rows[0] : rows;
}

module.exports = { createDraftContract };
