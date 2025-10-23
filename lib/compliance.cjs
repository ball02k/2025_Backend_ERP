const { prisma } = require('./prisma');

async function checkSupplierCompliance({ tenantId, supplierId }) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: Number(supplierId), tenantId }
  });
  if (!supplier) return { ok: false, missing: ['supplierNotFound'] };

  const missing = [];
  if (!supplier.insuranceValidUntil || new Date(supplier.insuranceValidUntil) < new Date()) {
    missing.push('insurance');
  }
  if (!supplier.hsCertificateValid) missing.push('hsCertificate');
  if (supplier.accreditationValid === false) missing.push('accreditation');

  return { ok: missing.length === 0, missing };
}

module.exports = { checkSupplierCompliance };
