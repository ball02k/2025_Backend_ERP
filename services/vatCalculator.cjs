/**
 * VAT Calculator Service
 *
 * Calculates Value Added Tax (VAT) for UK construction payments,
 * including support for Domestic Reverse Charge (DRC).
 *
 * UK VAT Rates (as of 2025):
 * - Standard: 20%
 * - Reduced: 5%
 * - Zero: 0%
 *
 * Reverse Charge:
 * Since March 2021, most construction services between VAT-registered
 * businesses use reverse charge - supplier doesn't charge VAT,
 * customer accounts for it themselves.
 *
 * Task 1.5 - VAT & Reverse Charge
 */

// Current UK VAT rates
const VAT_RATES = {
  STANDARD: 20.0,
  REDUCED: 5.0,
  ZERO: 0.0,
};

const REVERSE_CHARGE_NOTE = 'Reverse charge: Customer to account for VAT to HMRC';

/**
 * Get current VAT rates
 * @returns {Object} VAT rates
 */
function getVATRates() {
  return {
    standard: VAT_RATES.STANDARD,
    reduced: VAT_RATES.REDUCED,
    zero: VAT_RATES.ZERO,
  };
}

/**
 * Determine VAT treatment based on supplier VAT status and end user flag
 *
 * @param {boolean} supplierVATRegistered - Is supplier VAT registered?
 * @param {boolean} isEndUser - Is customer an end user?
 * @returns {string} VAT treatment: STANDARD | REVERSE_CHARGE | EXEMPT
 */
function determineVATTreatment(supplierVATRegistered, isEndUser) {
  // If supplier not VAT registered, no VAT applies
  if (!supplierVATRegistered) {
    return 'EXEMPT';
  }

  // If customer is an end user, use standard VAT
  if (isEndUser) {
    return 'STANDARD';
  }

  // Both VAT registered and not end user = reverse charge
  return 'REVERSE_CHARGE';
}

/**
 * Calculate VAT for a payment
 *
 * @param {Object} input - Calculation input
 * @param {number} input.netAmount - Net amount (after CIS deduction if applicable)
 * @param {string} input.vatTreatment - VAT treatment: STANDARD | REVERSE_CHARGE | ZERO_RATED | EXEMPT
 * @param {number} [input.vatRate] - VAT rate override (defaults to standard rate for STANDARD treatment)
 * @returns {Object} VAT calculation result
 */
function calculateVAT(input) {
  const { netAmount, vatTreatment, vatRate } = input;

  // Validate input
  if (netAmount == null || !Number.isFinite(Number(netAmount))) {
    throw new Error('netAmount must be a valid number');
  }

  if (!vatTreatment) {
    throw new Error('vatTreatment is required');
  }

  const net = Number(netAmount);
  let rate = 0;
  let amount = 0;
  let reverseCharge = false;
  let reverseChargeNote = null;

  switch (vatTreatment) {
    case 'STANDARD':
      // Use provided rate or default to standard rate
      rate = vatRate != null ? Number(vatRate) : VAT_RATES.STANDARD;
      amount = Math.round((net * rate) / 100 * 100) / 100; // Round to 2dp
      break;

    case 'REVERSE_CHARGE':
      // No VAT charged by supplier - customer accounts for it
      rate = 0; // Stored as 0 in database to indicate RC, not a rate
      amount = 0;
      reverseCharge = true;
      reverseChargeNote = REVERSE_CHARGE_NOTE;
      break;

    case 'ZERO_RATED':
      // 0% VAT (e.g., certain new build residential)
      rate = 0;
      amount = 0;
      break;

    case 'EXEMPT':
      // No VAT applicable
      rate = 0;
      amount = 0;
      break;

    default:
      throw new Error(`Invalid VAT treatment: ${vatTreatment}`);
  }

  const grossAmount = Math.round((net + amount) * 100) / 100; // Round to 2dp

  return {
    netAmount: net,
    vatTreatment,
    vatRate: rate,
    vatAmount: amount,
    grossAmount,
    reverseCharge,
    reverseChargeNote,
  };
}

/**
 * Validate UK VAT number format
 *
 * GB format: GB + 9 digits (e.g., GB123456789)
 * or GB + 12 digits for branches (e.g., GB123456789012)
 *
 * @param {string} vatNumber - VAT number to validate
 * @returns {Object} { valid: boolean, error?: string, value?: string }
 */
function validateVATNumber(vatNumber) {
  if (!vatNumber) return { valid: true }; // Optional field

  const cleaned = String(vatNumber).replace(/\s/g, '').toUpperCase();

  // GB format validation
  if (!/^GB\d{9}(\d{3})?$/.test(cleaned)) {
    return {
      valid: false,
      error: 'VAT number must be in format: GB + 9 digits (e.g., GB123456789) or GB + 12 digits for branches',
    };
  }

  return { valid: true, value: cleaned };
}

module.exports = {
  getVATRates,
  determineVATTreatment,
  calculateVAT,
  validateVATNumber,
};
