/**
 * Unit Tests for CIS Calculator
 *
 * Tests all aspects of CIS (Construction Industry Scheme) calculation:
 * - Different verification statuses (GROSS, NET, UNVERIFIED)
 * - Labour/materials splits
 * - Contract overrides
 * - Edge cases and validation
 */

// Mock Prisma client BEFORE any imports
const mockSupplierFindFirst = jest.fn();
const mockContractFindFirst = jest.fn();

jest.mock('../utils/prisma.cjs', () => ({
  prisma: {
    supplier: {
      findFirst: mockSupplierFindFirst,
    },
    contract: {
      findFirst: mockContractFindFirst,
    },
  },
}));

const { calculateCIS, getCISRate, getLabourSplit } = require('../services/cisCalculator.cjs');

describe('CIS Calculator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCISRate', () => {
    it('should return 0% for GROSS status', () => {
      expect(getCISRate('GROSS')).toBe(0);
    });

    it('should return 20% for NET status', () => {
      expect(getCISRate('NET')).toBe(20);
    });

    it('should return 30% for UNVERIFIED status', () => {
      expect(getCISRate('UNVERIFIED')).toBe(30);
    });

    it('should return 0% for unknown status', () => {
      expect(getCISRate('INVALID')).toBe(0);
      expect(getCISRate(null)).toBe(0);
      expect(getCISRate(undefined)).toBe(0);
    });
  });

  describe('getLabourSplit', () => {
    it('should return contract override when available', async () => {
      mockContractFindFirst.mockResolvedValue({ labourPercentage: 75 });

      const result = await getLabourSplit(123, 456, 'demo');

      expect(result).toBe(75);
      expect(mockContractFindFirst).toHaveBeenCalledWith({
        where: { id: 456, tenantId: 'demo', supplierId: 123 },
        select: { labourPercentage: true },
      });
    });

    it('should return supplier default when no contract override', async () => {
      mockContractFindFirst.mockResolvedValue({ labourPercentage: null });
      mockSupplierFindFirst.mockResolvedValue({ defaultLabourPercentage: 60 });

      const result = await getLabourSplit(123, 456, 'demo');

      expect(result).toBe(60);
    });

    it('should return 100% when no contract and no supplier default', async () => {
      mockContractFindFirst.mockResolvedValue(null);
      mockSupplierFindFirst.mockResolvedValue({ defaultLabourPercentage: null });

      const result = await getLabourSplit(123, 456, 'demo');

      expect(result).toBe(100);
    });

    it('should skip contract lookup when contractId not provided', async () => {
      mockSupplierFindFirst.mockResolvedValue({ defaultLabourPercentage: 80 });

      const result = await getLabourSplit(123, null, 'demo');

      expect(result).toBe(80);
      expect(mockContractFindFirst).not.toHaveBeenCalled();
    });
  });

  describe('calculateCIS', () => {
    it('should calculate 0% deduction for GROSS registered supplier', async () => {
      mockSupplierFindFirst.mockResolvedValue({
        cisRegistered: true,
        cisVerificationStatus: 'GROSS',
        cisVerificationExpiry: new Date('2026-12-31'),
        defaultLabourPercentage: 100,
      });

      const result = await calculateCIS({
        grossAmount: 10000,
        supplierId: 123,
        contractId: null,
        tenantId: 'demo',
      });

      expect(result).toMatchObject({
        grossAmount: 10000,
        labourPercentage: 100,
        labourElement: 10000,
        materialsElement: 0,
        cisStatus: 'GROSS',
        cisRate: 0,
        cisDeduction: 0,
        netPayment: 10000,
        warnings: [],
      });
    });

    it('should calculate 20% deduction for NET registered supplier', async () => {
      mockSupplierFindFirst.mockResolvedValue({
        cisRegistered: true,
        cisVerificationStatus: 'NET',
        cisVerificationExpiry: new Date('2026-12-31'),
        defaultLabourPercentage: 100,
      });

      const result = await calculateCIS({
        grossAmount: 10000,
        supplierId: 123,
        contractId: null,
        tenantId: 'demo',
      });

      expect(result).toMatchObject({
        grossAmount: 10000,
        labourPercentage: 100,
        labourElement: 10000,
        materialsElement: 0,
        cisStatus: 'NET',
        cisRate: 20,
        cisDeduction: 2000,
        netPayment: 8000,
      });
    });

    it('should calculate 30% deduction for UNVERIFIED supplier', async () => {
      mockSupplierFindFirst.mockResolvedValue({
        cisRegistered: true,
        cisVerificationStatus: 'UNVERIFIED',
        cisVerificationExpiry: null,
        defaultLabourPercentage: 100,
      });

      const result = await calculateCIS({
        grossAmount: 10000,
        supplierId: 123,
        contractId: null,
        tenantId: 'demo',
      });

      expect(result).toMatchObject({
        cisStatus: 'UNVERIFIED',
        cisRate: 30,
        cisDeduction: 3000,
        netPayment: 7000,
      });
    });

    it('should return NOT_APPLICABLE for non-CIS supplier', async () => {
      mockSupplierFindFirst.mockResolvedValue({
        cisRegistered: false,
        cisVerificationStatus: null,
        cisVerificationExpiry: null,
        defaultLabourPercentage: null,
      });

      const result = await calculateCIS({
        grossAmount: 10000,
        supplierId: 123,
        contractId: null,
        tenantId: 'demo',
      });

      expect(result).toMatchObject({
        grossAmount: 10000,
        labourPercentage: 0,
        labourElement: 0,
        materialsElement: 10000,
        cisStatus: 'NOT_APPLICABLE',
        cisRate: 0,
        cisDeduction: 0,
        netPayment: 10000,
      });
    });

    it('should only apply CIS to labour element with 60% labour split', async () => {
      mockSupplierFindFirst.mockResolvedValue({
        cisRegistered: true,
        cisVerificationStatus: 'NET',
        cisVerificationExpiry: new Date('2026-12-31'),
        defaultLabourPercentage: 60,
      });

      const result = await calculateCIS({
        grossAmount: 10000,
        supplierId: 123,
        contractId: null,
        tenantId: 'demo',
      });

      expect(result).toMatchObject({
        grossAmount: 10000,
        labourPercentage: 60,
        labourElement: 6000,
        materialsElement: 4000,
        cisStatus: 'NET',
        cisRate: 20,
        cisDeduction: 1200, // 20% of £6000
        netPayment: 8800,
      });
    });

    it('should use contract override over supplier default', async () => {
      mockContractFindFirst.mockResolvedValue({ labourPercentage: 50 });
      mockSupplierFindFirst.mockResolvedValue({
        cisRegistered: true,
        cisVerificationStatus: 'NET',
        cisVerificationExpiry: new Date('2026-12-31'),
        defaultLabourPercentage: 100,
      });

      const result = await calculateCIS({
        grossAmount: 10000,
        supplierId: 123,
        contractId: 456,
        tenantId: 'demo',
      });

      expect(result).toMatchObject({
        labourPercentage: 50,
        labourElement: 5000,
        materialsElement: 5000,
        cisDeduction: 1000, // 20% of £5000
        netPayment: 9000,
      });
    });

    it('should add warning for expired verification', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockSupplierFindFirst.mockResolvedValue({
        cisRegistered: true,
        cisVerificationStatus: 'NET',
        cisVerificationExpiry: yesterday,
        defaultLabourPercentage: 100,
      });

      const result = await calculateCIS({
        grossAmount: 10000,
        supplierId: 123,
        contractId: null,
        tenantId: 'demo',
      });

      expect(result.warnings).toContain('CIS verification expired');
      expect(result.cisDeduction).toBe(2000); // Still calculates deduction
    });

    it('should handle zero amount', async () => {
      mockSupplierFindFirst.mockResolvedValue({
        cisRegistered: true,
        cisVerificationStatus: 'NET',
        cisVerificationExpiry: new Date('2026-12-31'),
        defaultLabourPercentage: 100,
      });

      const result = await calculateCIS({
        grossAmount: 0,
        supplierId: 123,
        contractId: null,
        tenantId: 'demo',
      });

      expect(result).toMatchObject({
        grossAmount: 0,
        cisDeduction: 0,
        netPayment: 0,
      });
    });

    it('should round to 2 decimal places', async () => {
      mockSupplierFindFirst.mockResolvedValue({
        cisRegistered: true,
        cisVerificationStatus: 'NET',
        cisVerificationExpiry: new Date('2026-12-31'),
        defaultLabourPercentage: 33.33,
      });

      const result = await calculateCIS({
        grossAmount: 1234.56,
        supplierId: 123,
        contractId: null,
        tenantId: 'demo',
      });

      // All values should be rounded to 2dp
      // 1234.56 * 33.33 / 100 = 411.4785 → 411.48
      // 1234.56 - 411.48 = 823.08
      // 411.48 * 20 / 100 = 82.296 → 82.30
      // 1234.56 - 82.30 = 1152.26
      expect(result.labourElement).toBeCloseTo(411.48, 2);
      expect(result.materialsElement).toBeCloseTo(823.08, 2);
      expect(result.cisDeduction).toBeCloseTo(82.30, 2);
      expect(result.netPayment).toBeCloseTo(1152.26, 2);
    });

    it('should throw error if tenantId missing', async () => {
      await expect(
        calculateCIS({
          grossAmount: 10000,
          supplierId: 123,
          contractId: null,
          tenantId: null,
        })
      ).rejects.toThrow('tenantId is required');
    });

    it('should throw error if supplierId missing', async () => {
      await expect(
        calculateCIS({
          grossAmount: 10000,
          supplierId: null,
          contractId: null,
          tenantId: 'demo',
        })
      ).rejects.toThrow('supplierId is required');
    });

    it('should throw error if supplier not found', async () => {
      mockSupplierFindFirst.mockResolvedValue(null);

      await expect(
        calculateCIS({
          grossAmount: 10000,
          supplierId: 999,
          contractId: null,
          tenantId: 'demo',
        })
      ).rejects.toThrow('Supplier 999 not found');
    });
  });
});
