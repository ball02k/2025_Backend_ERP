const { prisma } = require('../utils/prisma.cjs');

/**
 * CIS Calculator Service
 *
 * Calculates Construction Industry Scheme (CIS) deductions for subcontractor payments.
 * CIS tax is only applied to the LABOUR portion of payments, not materials.
 *
 * Rates:
 * - GROSS: 0% deduction
 * - NET: 20% deduction
 * - UNVERIFIED: 30% deduction
 * - NOT_APPLICABLE: 0% (not CIS registered)
 */

/**
 * Get CIS deduction rate based on verification status
 * @param {string} status - CIS verification status (GROSS, NET, UNVERIFIED)
 * @returns {number} Deduction rate (0, 20, or 30)
 */
function getCISRate(status) {
  const rates = {
    GROSS: 0,
    NET: 20,
    UNVERIFIED: 30,
  };
  return rates[status] || 0;
}

/**
 * Get labour percentage split
 * Priority: Contract override > Supplier default > 100%
 * @param {number} supplierId - Supplier ID
 * @param {number|null} contractId - Contract ID (optional, for override)
 * @param {string} tenantId - Tenant ID for isolation
 * @returns {Promise<number>} Labour percentage (0-100)
 */
async function getLabourSplit(supplierId, contractId, tenantId) {
  // If contract ID provided, check for override
  if (contractId) {
    const contract = await prisma.contract.findFirst({
      where: {
        id: Number(contractId),
        tenantId,
        supplierId: Number(supplierId),
      },
      select: { labourPercentage: true },
    });

    if (contract && contract.labourPercentage != null) {
      return Number(contract.labourPercentage);
    }
  }

  // Fall back to supplier default
  const supplier = await prisma.supplier.findFirst({
    where: {
      id: Number(supplierId),
      tenantId,
    },
    select: { defaultLabourPercentage: true },
  });

  if (supplier && supplier.defaultLabourPercentage != null) {
    return Number(supplier.defaultLabourPercentage);
  }

  // Ultimate fallback: 100% labour
  return 100;
}

/**
 * Calculate CIS deduction for a payment
 * @param {Object} input - Calculation input
 * @param {number} input.grossAmount - Total payment amount
 * @param {number} input.supplierId - Supplier ID
 * @param {number|null} input.contractId - Contract ID (optional)
 * @param {string} input.tenantId - Tenant ID
 * @returns {Promise<Object>} CIS calculation result
 */
async function calculateCIS(input) {
  const { grossAmount, supplierId, contractId, tenantId } = input;

  // Validate inputs
  if (!tenantId) {
    throw new Error('tenantId is required for tenant isolation');
  }
  if (!supplierId) {
    throw new Error('supplierId is required');
  }
  if (grossAmount == null || !Number.isFinite(Number(grossAmount))) {
    throw new Error('grossAmount must be a valid number');
  }

  const amount = Number(grossAmount);
  const warnings = [];

  // Fetch supplier CIS details
  const supplier = await prisma.supplier.findFirst({
    where: {
      id: Number(supplierId),
      tenantId,
    },
    select: {
      cisRegistered: true,
      cisVerificationStatus: true,
      cisVerificationExpiry: true,
      defaultLabourPercentage: true,
    },
  });

  if (!supplier) {
    throw new Error(`Supplier ${supplierId} not found`);
  }

  // If not CIS registered, return no deduction
  if (!supplier.cisRegistered) {
    return {
      grossAmount: amount,
      labourPercentage: 0,
      labourElement: 0,
      materialsElement: amount,
      cisStatus: 'NOT_APPLICABLE',
      cisRate: 0,
      cisDeduction: 0,
      netPayment: amount,
      warnings: [],
    };
  }

  // Check if verification expired
  if (supplier.cisVerificationExpiry) {
    const expiryDate = new Date(supplier.cisVerificationExpiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Compare dates only

    if (expiryDate < today) {
      warnings.push('CIS verification expired');
    }
  }

  // Get CIS status and rate
  const cisStatus = supplier.cisVerificationStatus || 'UNVERIFIED';
  const cisRate = getCISRate(cisStatus);

  // Get labour split
  const labourPercentage = await getLabourSplit(supplierId, contractId, tenantId);

  // Calculate labour and materials elements
  const labourElement = Math.round((amount * labourPercentage) / 100 * 100) / 100; // Round to 2dp
  const materialsElement = Math.round((amount - labourElement) * 100) / 100; // Round to 2dp

  // Calculate CIS deduction (only on labour element)
  const cisDeduction = Math.round((labourElement * cisRate) / 100 * 100) / 100; // Round to 2dp

  // Calculate net payment
  const netPayment = Math.round((amount - cisDeduction) * 100) / 100; // Round to 2dp

  return {
    grossAmount: amount,
    labourPercentage,
    labourElement,
    materialsElement,
    cisStatus,
    cisRate,
    cisDeduction,
    netPayment,
    warnings,
  };
}

module.exports = {
  calculateCIS,
  getCISRate,
  getLabourSplit,
};
