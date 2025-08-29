const { Prisma } = require('@prisma/client');

function decimalToString(v) {
  if (v == null) return null;
  if (Prisma.Decimal && Prisma.Decimal.isDecimal?.(v)) return v.toString();
  if (typeof v === 'number') return v.toFixed(2);
  return String(v);
}

function serializeDecimals(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(serializeDecimals);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (Prisma.Decimal && Prisma.Decimal.isDecimal?.(v)) out[k] = v.toString();
    else if (v && typeof v === 'object') out[k] = serializeDecimals(v);
    else out[k] = v;
  }
  return out;
}

module.exports = { decimalToString, serializeDecimals };

