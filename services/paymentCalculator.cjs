/**
 * Unified Payment Calculator Service
 *
 * Orchestrates the complete payment calculation waterfall for construction payments:
 * 1. Gross Amount
 * 2. Main Contractor Discount (MCD) → Gross After MCD
 * 3. Retention → Net After Retention
 * 4. CIS Deduction → Net After CIS
 * 5. VAT → Gross With VAT
 *
 * Task 1.6 - Main Contractor Discount Integration
 */

const { prisma } = require('../utils/prisma.cjs');
const { calculateCIS } = require('./cisCalculator.cjs');
const { calculateVAT, determineVATTreatment } = require('./vatCalculator.cjs');

/**
 * Calculate complete payment breakdown including MCD, Retention, CIS, and VAT
 *
 * @param {Object} input - Payment calculation input
 * @param {number} input.grossAmount - Initial gross amount
 * @param {string} input.contractId - Contract ID for fetching MCD, retention, labour %
 * @param {string} [input.supplierId] - Supplier ID for CIS calculation (optional - not used for outbound apps)
 * @param {string} input.tenantId - Tenant ID for multi-tenancy
 * @param {number} [input.labourPercentageOverride] - Override labour % (takes precedence over contract/supplier)
 * @param {string} [input.vatTreatmentOverride] - Override VAT treatment
 * @returns {Promise<Object>} Complete payment breakdown
 */
async function calculatePayment(input) {
  const {
    grossAmount,
    contractId,
    supplierId,
    tenantId,
    labourPercentageOverride,
    vatTreatmentOverride,
  } = input;

  // Validate required inputs
  if (grossAmount == null || !Number.isFinite(Number(grossAmount))) {
    throw new Error('grossAmount must be a valid number');
  }
  if (!contractId) {
    throw new Error('contractId is required');
  }
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const gross = Number(grossAmount);
  const result = {
    // Input
    grossAmount: gross,

    // MCD calculation
    mcdPercentage: 0,
    mcdAmount: 0,
    grossAfterMCD: gross,

    // Retention calculation
    retentionPercentage: 0,
    retentionAmount: 0,
    netAfterRetention: gross,

    // CIS calculation
    labourElement: 0,
    materialsElement: 0,
    labourPercentage: 0,
    cisStatus: 'NOT_APPLICABLE',
    cisRate: 0,
    cisDeduction: 0,
    netAfterCIS: gross,
    cisWarnings: [],

    // VAT calculation
    vatTreatment: 'STANDARD',
    vatRate: 0,
    vatAmount: 0,
    grossWithVAT: gross,
    reverseCharge: false,
    reverseChargeNote: null,

    // Metadata
    calculatedAt: new Date(),
    errors: [],
  };

  try {
    // Fetch contract details
    const contract = await prisma.contract.findFirst({
      where: {
        id: contractId,
        tenantId,
      },
      select: {
        mainContractorDiscount: true,
        mcdDescription: true,
        retentionPct: true,
        labourPercentage: true,
        vatTreatment: true,
        isEndUser: true,
      },
    });

    if (!contract) {
      throw new Error(`Contract not found: ${contractId}`);
    }

    // =========================================================================
    // STEP 1: Main Contractor Discount (MCD)
    // =========================================================================
    const mcdPct = Number(contract.mainContractorDiscount || 0);
    if (mcdPct > 0) {
      result.mcdPercentage = mcdPct;
      result.mcdAmount = Math.round((gross * mcdPct) / 100 * 100) / 100;
      result.grossAfterMCD = Math.round((gross - result.mcdAmount) * 100) / 100;
    } else {
      result.grossAfterMCD = gross;
    }

    // =========================================================================
    // STEP 2: Retention
    // =========================================================================
    const retentionPct = Number(contract.retentionPct || 0);
    if (retentionPct > 0) {
      result.retentionPercentage = retentionPct;
      result.retentionAmount = Math.round((result.grossAfterMCD * retentionPct) / 100 * 100) / 100;
      result.netAfterRetention = Math.round((result.grossAfterMCD - result.retentionAmount) * 100) / 100;
    } else {
      result.netAfterRetention = result.grossAfterMCD;
    }

    // =========================================================================
    // STEP 3: CIS Deduction (only for inbound applications with supplier)
    // =========================================================================
    if (supplierId && result.netAfterRetention > 0) {
      try {
        const cisCalculation = await calculateCIS({
          grossAmount: result.netAfterRetention, // CIS applies to net after retention
          supplierId,
          contractId,
          tenantId,
          labourPercentageOverride,
        });

        result.labourElement = cisCalculation.labourElement;
        result.materialsElement = cisCalculation.materialsElement;
        result.labourPercentage = cisCalculation.labourPercentage;
        result.cisStatus = cisCalculation.cisStatus;
        result.cisRate = cisCalculation.cisRate;
        result.cisDeduction = cisCalculation.cisDeduction;
        result.netAfterCIS = cisCalculation.netPayment;
        result.cisWarnings = cisCalculation.warnings || [];
      } catch (cisError) {
        console.error('[paymentCalculator] CIS calculation error:', cisError?.message);
        result.errors.push(`CIS calculation failed: ${cisError?.message}`);
        // Continue with netAfterRetention as netAfterCIS
        result.netAfterCIS = result.netAfterRetention;
      }
    } else {
      // No supplier (outbound application) or zero amount - skip CIS
      result.netAfterCIS = result.netAfterRetention;
    }

    // =========================================================================
    // STEP 4: VAT Calculation
    // =========================================================================
    try {
      // Determine VAT treatment (override or auto-determine)
      let vatTreatment = vatTreatmentOverride || contract.vatTreatment || 'STANDARD';

      // If no override and we have supplier info, auto-determine based on supplier VAT status
      if (!vatTreatmentOverride && supplierId) {
        const supplier = await prisma.supplier.findFirst({
          where: { id: supplierId, tenantId },
          select: { vatRegistered: true },
        });

        if (supplier) {
          vatTreatment = determineVATTreatment(
            supplier.vatRegistered || false,
            contract.isEndUser || false
          );
        }
      }

      const vatCalculation = calculateVAT({
        netAmount: result.netAfterCIS,
        vatTreatment,
      });

      result.vatTreatment = vatCalculation.vatTreatment;
      result.vatRate = vatCalculation.vatRate;
      result.vatAmount = vatCalculation.vatAmount;
      result.grossWithVAT = vatCalculation.grossAmount;
      result.reverseCharge = vatCalculation.reverseCharge;
      result.reverseChargeNote = vatCalculation.reverseChargeNote;
    } catch (vatError) {
      console.error('[paymentCalculator] VAT calculation error:', vatError?.message);
      result.errors.push(`VAT calculation failed: ${vatError?.message}`);
      // Continue with netAfterCIS as grossWithVAT
      result.grossWithVAT = result.netAfterCIS;
    }
  } catch (error) {
    console.error('[paymentCalculator] Payment calculation error:', error?.message);
    result.errors.push(`Payment calculation failed: ${error?.message}`);
    throw error; // Re-throw to signal failure to caller
  }

  return result;
}

/**
 * Calculate MCD only (useful for quick previews)
 *
 * @param {number} grossAmount - Gross amount
 * @param {number} mcdPercentage - MCD percentage (0-100)
 * @returns {Object} { mcdAmount, grossAfterMCD }
 */
function calculateMCD(grossAmount, mcdPercentage) {
  const gross = Number(grossAmount);
  const pct = Number(mcdPercentage || 0);

  const mcdAmount = Math.round((gross * pct) / 100 * 100) / 100;
  const grossAfterMCD = Math.round((gross - mcdAmount) * 100) / 100;

  return {
    grossAmount: gross,
    mcdPercentage: pct,
    mcdAmount,
    grossAfterMCD,
  };
}

module.exports = {
  calculatePayment,
  calculateMCD,
};
