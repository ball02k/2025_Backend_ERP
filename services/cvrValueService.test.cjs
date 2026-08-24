/**
 * CVR Value Service Tests (Task 4.1)
 *
 * Tests for role-aware CVR value calculation
 */

const { PrismaClient } = require('@prisma/client');
const {
  getCVRValueData,
  getPrincipalContractorValue,
  getSubcontractorValue,
  getCVRValueWarnings,
} = require('./cvrValueService.cjs');

const prisma = new PrismaClient();

describe('CVR Role Detection', () => {
  let testTenantId;
  let principalProject;
  let subcontractorProject;

  beforeAll(async () => {
    // Setup test tenant
    testTenantId = 'test-tenant-' + Date.now();

    // Create test projects
    principalProject = await prisma.project.create({
      data: {
        tenantId: testTenantId,
        name: 'Test Principal Project',
        projectRole: 'PRINCIPAL_CONTRACTOR',
        status: 'active',
      },
    });

    subcontractorProject = await prisma.project.create({
      data: {
        tenantId: testTenantId,
        name: 'Test Subcontractor Project',
        projectRole: 'SUBCONTRACTOR',
        status: 'active',
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.project.deleteMany({
      where: { tenantId: testTenantId },
    });
    await prisma.applicationForPayment.deleteMany({
      where: { tenantId: testTenantId },
    });
    await prisma.paymentCertificate.deleteMany({
      where: { tenantId: testTenantId },
    });
    await prisma.$disconnect();
  });

  describe('Principal Contractor Value', () => {
    it('should use applications for Principal Contractor', async () => {
      // Create test application
      await prisma.applicationForPayment.create({
        data: {
          tenantId: testTenantId,
          projectId: principalProject.id,
          applicationNo: 'APP-001',
          applicationDate: new Date(),
          status: 'CERTIFIED',
          cumulativeGross: 50000,
          certifiedCumulative: 50000,
          claimedCumulative: 50000,
          retentionCumulative: 2500,
        },
      });

      const valueData = await getCVRValueData(
        testTenantId,
        principalProject.id,
        null
      );

      expect(valueData.source).toBe('APPLICATIONS');
      expect(valueData.description).toContain('Client');
      expect(valueData.cumulativeCertified).toBeGreaterThan(0);
    });

    it('should calculate pending value from submitted applications', async () => {
      // Create pending application
      await prisma.applicationForPayment.create({
        data: {
          tenantId: testTenantId,
          projectId: principalProject.id,
          applicationNo: 'APP-002',
          applicationDate: new Date(),
          status: 'SUBMITTED',
          claimedThisPeriod: 10000,
          grossThisPeriod: 10000,
        },
      });

      const valueData = await getPrincipalContractorValue(
        testTenantId,
        principalProject.id,
        null
      );

      expect(valueData.pendingValue).toBeGreaterThan(0);
      expect(valueData.cumulativeApplied).toBeGreaterThan(
        valueData.cumulativeCertified
      );
    });
  });

  describe('Subcontractor Value', () => {
    it('should use certificates for Subcontractor', async () => {
      // Create test certificate
      await prisma.paymentCertificate.create({
        data: {
          tenantId: testTenantId,
          projectId: subcontractorProject.id,
          upstreamContractId: 'test-contract',
          direction: 'INBOUND',
          certificateNumber: 1,
          certificateDate: new Date(),
          certifiedGross: 45000,
          cumulativeGross: 45000,
          retentionAmount: 2250,
          netPayable: 42750,
          status: 'RECEIVED',
        },
      });

      const valueData = await getCVRValueData(
        testTenantId,
        subcontractorProject.id,
        null
      );

      expect(valueData.source).toBe('CERTIFICATES');
      expect(valueData.description).toContain('Main Contractor');
      expect(valueData.cumulativeCertified).toBeGreaterThan(0);
    });

    it('should calculate pending value from applications without certificates', async () => {
      // Create application without certificate
      await prisma.applicationForPayment.create({
        data: {
          tenantId: testTenantId,
          projectId: subcontractorProject.id,
          applicationNo: 'APP-003',
          applicationDate: new Date(),
          status: 'SUBMITTED',
          claimedThisPeriod: 8000,
          grossThisPeriod: 8000,
        },
      });

      const valueData = await getSubcontractorValue(
        testTenantId,
        subcontractorProject.id,
        null
      );

      expect(valueData.pendingValue).toBeGreaterThan(0);
    });

    it('should calculate variance when certificate differs from application', async () => {
      // Create linked application and certificate with variance
      const app = await prisma.applicationForPayment.create({
        data: {
          tenantId: testTenantId,
          projectId: subcontractorProject.id,
          applicationNo: 'APP-004',
          applicationDate: new Date(),
          status: 'SUBMITTED',
          claimedThisPeriod: 10000,
          grossThisPeriod: 10000,
        },
      });

      await prisma.paymentCertificate.create({
        data: {
          tenantId: testTenantId,
          projectId: subcontractorProject.id,
          upstreamContractId: 'test-contract',
          direction: 'INBOUND',
          certificateNumber: 2,
          certificateDate: new Date(),
          paymentApplicationId: app.id,
          certifiedGross: 9500, // £500 less than applied
          cumulativeGross: 54500,
          retentionAmount: 475,
          netPayable: 9025,
          status: 'RECEIVED',
        },
      });

      const valueData = await getSubcontractorValue(
        testTenantId,
        subcontractorProject.id,
        null
      );

      expect(valueData.varianceFromApplied).toBeLessThan(0);
      expect(valueData.varianceNotes).toBeDefined();
      expect(valueData.varianceNotes.length).toBeGreaterThan(0);
    });
  });

  describe('CVR Value Warnings', () => {
    it('should warn when subcontractor has no certificates', () => {
      const valueData = {
        source: 'CERTIFICATES',
        cumulativeCertified: 0,
        pendingValue: 5000,
      };

      const warnings = getCVRValueWarnings(valueData, 'SUBCONTRACTOR');

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('No certificates received yet');
    });

    it('should warn when pending value is high', () => {
      const valueData = {
        source: 'APPLICATIONS',
        cumulativeCertified: 100000,
        pendingValue: 30000, // 30% pending
        varianceNotes: [],
      };

      const warnings = getCVRValueWarnings(valueData, 'PRINCIPAL_CONTRACTOR');

      expect(warnings.some((w) => w.includes('High pending value'))).toBe(true);
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running CVR Value Service Tests...');
  // Note: Actual test execution would use Jest or another test runner
  console.log('Tests would run here with: npm test');
}
