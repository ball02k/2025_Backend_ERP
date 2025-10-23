const { prisma } = require('./prisma');

async function checkSupplierCompliance(input) {
  const tenantId = typeof input === 'object' && input !== null ? input.tenantId : arguments[0];
  const supplierIdRaw = typeof input === 'object' && input !== null ? input.supplierId : arguments[1];
  const supplierId = Number(supplierIdRaw);

  if (!tenantId || !Number.isFinite(supplierId)) {
    return { ok: false, missing: ['inputInvalid'] };
  }

  const supplier = await prisma.supplier.findFirst({
    where: { tenantId, id: supplierId },
    select: {
      id: true,
      insuranceValidUntil: true,
      insuranceExpiry: true,
      hsCertificateValid: true,
      hsAccreditations: true,
      accreditationValid: true,
      complianceStatus: true,
    },
  });

  if (!supplier) {
    return { ok: false, missing: ['supplierNotFound'] };
  }

  const missing = [];
  const now = new Date();

  const insuranceExpiry = supplier.insuranceValidUntil || supplier.insuranceExpiry;
  if (!insuranceExpiry || new Date(insuranceExpiry) < now) {
    missing.push('insurance');
  }

  const hasHsCert =
    supplier.hsCertificateValid !== undefined
      ? Boolean(supplier.hsCertificateValid)
      : Boolean(supplier.hsAccreditations);
  if (!hasHsCert) {
    missing.push('hsCertificate');
  }

  const accreditationOk =
    supplier.accreditationValid !== undefined
      ? Boolean(supplier.accreditationValid)
      : supplier.complianceStatus
      ? String(supplier.complianceStatus).toLowerCase() === 'approved'
      : false;
  if (!accreditationOk) {
    missing.push('accreditation');
  }

  return { ok: missing.length === 0, missing };
}

module.exports = { checkSupplierCompliance };
