const { prisma } = require('../utils/prisma.cjs');

/**
 * Check supplier compliance status
 * @param {number} tenantId - The tenant ID
 * @param {number} supplierId - The supplier ID to check
 * @returns {Promise<{ok: boolean, fails?: string[], summary?: string}>} Compliance check result
 */
async function checkSupplierCompliance(tenantId, supplierId) {
  try {
    const supplier = await prisma.supplier.findFirst({
      where: {
        id: supplierId,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        status: true,
        insuranceExpiry: true,
        hsExpiry: true,
        hsAccreditations: true,
      },
    });

    if (!supplier) {
      return {
        ok: false,
        fails: ['SUPPLIER_NOT_FOUND'],
        summary: 'Supplier not found',
      };
    }

    const fails = [];
    const warnings = [];
    const now = new Date();

    // Only block if supplier is explicitly blocked/suspended/rejected
    if (supplier.status && ['blocked', 'suspended', 'rejected', 'banned'].includes(supplier.status.toLowerCase())) {
      fails.push(`SUPPLIER_STATUS_${supplier.status.toUpperCase()}`);
    }

    // Warnings only (not blocking) - insurance expiry
    if (supplier.insuranceExpiry) {
      const expiryDate = new Date(supplier.insuranceExpiry);
      if (expiryDate < now) {
        warnings.push('INSURANCE_EXPIRED');
      }
    }

    // Warnings only - H&S expiry
    if (supplier.hsExpiry) {
      const hsExpiryDate = new Date(supplier.hsExpiry);
      if (hsExpiryDate < now) {
        warnings.push('HS_CERTIFICATION_EXPIRED');
      }
    }

    const ok = fails.length === 0;
    const summary = ok
      ? warnings.length > 0
        ? `Supplier is compliant (warnings: ${warnings.join(', ')})`
        : 'Supplier is compliant'
      : `Compliance blocked: ${fails.join(', ')}`;

    return {
      ok,
      fails: fails.length > 0 ? fails : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      summary,
    };
  } catch (error) {
    console.error('checkSupplierCompliance error:', error);
    return {
      ok: false,
      fails: ['COMPLIANCE_CHECK_FAILED'],
      summary: 'Compliance check failed due to system error',
    };
  }
}

module.exports = {
  checkSupplierCompliance,
};
