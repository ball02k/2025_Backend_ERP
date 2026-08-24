/**
 * Integration tests for Supplier Portal (E-Tendering response flow)
 *
 * Tests the public supplier invite link flow:
 * - Token validation (valid, expired, revoked)
 * - Opening portal (GET /api/public/rfx/respond/:token)
 * - Saving draft (POST .../save)
 * - Submitting response (POST .../submit)
 * - 409 lock after submission
 * - Tenant isolation
 */

const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

// NOTE: These tests require a test database and app instance
// Run with: npm test -- supplier-portal.test.js

describe('Supplier Portal - E-Tendering Flow', () => {
  let prisma;
  let app;
  let testTenantId = 'test-tenant';
  let testRfxId;
  let testInviteId;
  let testToken;

  beforeAll(async () => {
    prisma = new PrismaClient();
    // TODO: Initialize Express app for testing
    // app = require('../index.cjs');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Setup Test Data', () => {
    it('should create test tender and invite', async () => {
      // Create test Request (tender)
      const tender = await prisma.request.create({
        data: {
          tenantId: testTenantId,
          title: 'Test Tender for Portal',
          type: 'RFP',
          status: 'live',
          stage: 1,
          totalStages: 1,
        },
      });
      testRfxId = tender.id;

      // Generate unique token
      testToken = crypto.randomBytes(32).toString('hex');

      // Create invite with token
      const invite = await prisma.requestInvite.create({
        data: {
          tenantId: testTenantId,
          requestId: testRfxId,
          email: 'supplier@test.com',
          supplierName: 'Test Supplier Ltd',
          contactFirstName: 'John',
          contactLastName: 'Doe',
          status: 'invited',
          responseToken: testToken,
        },
      });
      testInviteId = invite.id;

      expect(testRfxId).toBeDefined();
      expect(testInviteId).toBeDefined();
      expect(testToken).toBeDefined();
    });
  });

  describe('GET /api/public/rfx/respond/:token', () => {
    it('should load tender details with valid token', async () => {
      const res = await request(app)
        .get(`/api/public/rfx/respond/${testToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('rfx');
      expect(res.body).toHaveProperty('invite');
      expect(res.body.rfx.id).toBe(testRfxId);
      expect(res.body.invite.email).toBe('supplier@test.com');
    });

    it('should return 404 for invalid token', async () => {
      const res = await request(app)
        .get('/api/public/rfx/respond/invalid-token-12345')
        .expect(404);

      expect(res.body.error).toBe('INVALID_TOKEN');
    });

    it('should return 403 for expired token', async () => {
      // Create expired invite
      const expiredToken = crypto.randomBytes(32).toString('hex');
      await prisma.requestInvite.create({
        data: {
          tenantId: testTenantId,
          requestId: testRfxId,
          email: 'expired@test.com',
          responseToken: expiredToken,
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
          status: 'invited',
        },
      });

      const res = await request(app)
        .get(`/api/public/rfx/respond/${expiredToken}`)
        .expect(403);

      expect(res.body.error).toBe('TOKEN_EXPIRED');
    });

    it('should return 403 for revoked token', async () => {
      // Create revoked invite
      const revokedToken = crypto.randomBytes(32).toString('hex');
      await prisma.requestInvite.create({
        data: {
          tenantId: testTenantId,
          requestId: testRfxId,
          email: 'revoked@test.com',
          responseToken: revokedToken,
          revokedAt: new Date(),
          status: 'revoked',
        },
      });

      const res = await request(app)
        .get(`/api/public/rfx/respond/${revokedToken}`)
        .expect(403);

      expect(res.body.error).toBe('TOKEN_REVOKED');
    });

    it('should track lastOpenedAt timestamp', async () => {
      await request(app)
        .get(`/api/public/rfx/respond/${testToken}`)
        .expect(200);

      const invite = await prisma.requestInvite.findUnique({
        where: { id: testInviteId },
      });

      expect(invite.lastOpenedAt).not.toBeNull();
    });
  });

  describe('POST /api/public/rfx/respond/:token/save', () => {
    it('should save draft response', async () => {
      const res = await request(app)
        .post(`/api/public/rfx/respond/${testToken}/save`)
        .send({
          totalPrice: 50000,
          programmeStart: '2026-03-01',
          programmeEnd: '2026-06-30',
          methodStatement: 'We will use agile methodology...',
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.submission).toBeDefined();
      expect(res.body.submission.status).toBe('in_progress');
    });

    it('should be idempotent (update existing draft)', async () => {
      // Save again with different price
      const res = await request(app)
        .post(`/api/public/rfx/respond/${testToken}/save`)
        .send({
          totalPrice: 55000,
        })
        .expect(200);

      expect(res.body.submission.totalPrice).toBe(55000);
    });

    it('should track lastSavedAt timestamp', async () => {
      await request(app)
        .post(`/api/public/rfx/respond/${testToken}/save`)
        .send({ totalPrice: 50000 })
        .expect(200);

      const invite = await prisma.requestInvite.findUnique({
        where: { id: testInviteId },
      });

      expect(invite.lastSavedAt).not.toBeNull();
    });
  });

  describe('POST /api/public/rfx/respond/:token/submit', () => {
    it('should submit final response', async () => {
      const res = await request(app)
        .post(`/api/public/rfx/respond/${testToken}/submit`)
        .send({
          supplierName: 'Test Supplier Ltd',
          contactFirstName: 'John',
          contactLastName: 'Doe',
          totalPrice: 50000,
          programmeStart: '2026-03-01',
          programmeEnd: '2026-06-30',
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.submission.status).toBe('submitted');
      expect(res.body.submission.submittedAt).not.toBeNull();
    });

    it('should return 409 when trying to save after submission', async () => {
      const res = await request(app)
        .post(`/api/public/rfx/respond/${testToken}/save`)
        .send({ totalPrice: 60000 })
        .expect(409);

      expect(res.body.error).toBe('ALREADY_SUBMITTED');
    });

    it('should return 409 when trying to submit again', async () => {
      const res = await request(app)
        .post(`/api/public/rfx/respond/${testToken}/submit`)
        .send({
          supplierName: 'Test Supplier Ltd',
          contactFirstName: 'John',
          contactLastName: 'Doe',
          totalPrice: 60000,
        })
        .expect(409);

      expect(res.body.error).toBe('ALREADY_SUBMITTED');
    });
  });

  describe('Tenant Isolation', () => {
    it('should not access tender from different tenant', async () => {
      // Create token for different tenant
      const otherTenantToken = crypto.randomBytes(32).toString('hex');
      await prisma.requestInvite.create({
        data: {
          tenantId: 'other-tenant',
          requestId: testRfxId, // Same RFx ID but different tenant
          email: 'other@test.com',
          responseToken: otherTenantToken,
          status: 'invited',
        },
      });

      // Should not find tender because tenantId in Request doesn't match
      const res = await request(app)
        .get(`/api/public/rfx/respond/${otherTenantToken}`)
        .expect(404);

      expect(res.body.error).toBe('RFX_NOT_FOUND');
    });
  });

  describe('Cleanup', () => {
    it('should clean up test data', async () => {
      await prisma.requestResponse.deleteMany({
        where: { requestId: testRfxId },
      });
      await prisma.requestInvite.deleteMany({
        where: { requestId: testRfxId },
      });
      await prisma.request.deleteMany({
        where: { id: testRfxId },
      });
    });
  });
});
