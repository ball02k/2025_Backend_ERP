const { prisma } = require('./prisma');

async function checkSupplierCompliance({ tenantId, supplierId }) {
  const s = await prisma.supplier.findFirst({ where: { id: Number(supplierId), tenantId } });
  if (!s) return { ok: false, missing: ['supplierNotFound'] };

  const missing = [];
  if (!s.insuranceValidUntil || new Date(s.insuranceValidUntil) < new Date()) missing.push('insurance');
  if (!s.hsCertificateValid) missing.push('hsCertificate');
  return { ok: missing.length === 0, missing };
}

module.exports = { checkSupplierCompliance };
