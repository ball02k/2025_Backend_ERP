process.env.NODE_ENV = 'development';
process.env.ENABLE_DEV_AUTH = '1';
const request = require('supertest');
const app = require('../index.cjs');
const { PrismaClient } = require('@prisma/client');
const { sign } = require('../utils/jwt.cjs');

const prisma = new PrismaClient();

describe('RFx HTTP flow', () => {
  const tenantId = 'demo';
  let requestId;
  let supplierId;
  let sectionA;
  let sectionB;
  let qNumId;
  let qMcqId;

  beforeAll(async () => {
    // Create supplier for invites and responses
    const sup = await prisma.supplier.create({ data: { tenantId, name: 'HTTP Supplier' } });
    supplierId = sup.id;
  });

  afterAll(async () => {
    // Cleanup
    if (requestId) {
      await prisma.requestResponse.deleteMany({ where: { tenantId, requestId } });
      await prisma.requestInvite.deleteMany({ where: { tenantId, requestId } });
      await prisma.requestQuestion.deleteMany({ where: { tenantId, requestId } });
      await prisma.requestSection.deleteMany({ where: { tenantId, requestId } });
      await prisma.awardDecision.deleteMany({ where: { tenantId, requestId } });
      await prisma.request.delete({ where: { id: requestId } }).catch(() => {});
    }
    if (supplierId) {
      await prisma.supplier.delete({ where: { id: supplierId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test('Create → sections → questions → publish', async () => {
    // Create request (draft)
    const createRes = await request(app)
      .post('/api/requests')
      .send({ title: 'RFx HTTP', type: 'RFP', totalStages: 2 })
      .expect(200);
    requestId = createRes.body.data.id;
    expect(requestId).toBeGreaterThan(0);

    // Add sections
    const sA = await request(app)
      .post(`/api/requests/${requestId}/sections`)
      .send({ title: 'Technical', weight: 1, order: 1 })
      .expect(200);
    sectionA = sA.body.data.id;
    const sB = await request(app)
      .post(`/api/requests/${requestId}/sections`)
      .send({ title: 'Commercial', weight: 1, order: 2 })
      .expect(200);
    sectionB = sB.body.data.id;

    // Add questions
    const q1 = await request(app)
      .post(`/api/requests/${requestId}/questions`)
      .send({ sectionId: sectionA, qType: 'number', prompt: 'Score /10', weight: 1, order: 1 })
      .expect(200);
    qNumId = q1.body.data.id;
    const q2 = await request(app)
      .post(`/api/requests/${requestId}/questions`)
      .send({ sectionId: sectionB, qType: 'mcq', prompt: 'ISO9001?', options: { yes: 10, no: 0 }, weight: 1, order: 1 })
      .expect(200);
    qMcqId = q2.body.data.id;

    // Publish
    const pub = await request(app).post(`/api/requests/${requestId}/publish`).expect(200);
    expect(pub.body.data.status).toBe('published');
  });

  test('Invite supplier and submit stage 1 response', async () => {
    // Invite
    const inv = await request(app)
      .post(`/api/requests/${requestId}/invites`)
      .send({ supplierId, email: 'bidder@example.com' })
      .expect(200);
    expect(inv.body.data).toHaveProperty('status', 'invited');

    // Submit stage 1
    const sub = await request(app)
      .post(`/api/requests/${requestId}/responses/submit`)
      .send({ supplierId, stage: 1, answers: { [qNumId]: 7, [qMcqId]: 'yes' } })
      .expect(200);
    expect(sub.body.data).toHaveProperty('status', 'submitted');
  });

  test('Scoring status, score compute, policy toggle, preview override', async () => {
    // Status (should be allowed with open default)
    const status1 = await request(app).get(`/api/requests/${requestId}/scoring/status`).expect(200);
    expect(status1.body.data).toHaveProperty('policy');
    expect(status1.body.data).toHaveProperty('canScoreNow', true);

    // Score (open)
    const score1 = await request(app).post(`/api/requests/${requestId}/score/${supplierId}`).expect(200);
    expect(score1.body).toHaveProperty('score');

    // Set closed_only and ensure scoring blocked
    await request(app).patch(`/api/requests/${requestId}/scoring/policy`).send({ policy: 'closed_only' }).expect(200);
    const status2 = await request(app).get(`/api/requests/${requestId}/scoring/status`).expect(200);
    expect(status2.body.data).toHaveProperty('policy', 'closed_only');
    expect(status2.body.data.canScoreNow).toBe(false);

    await request(app).post(`/api/requests/${requestId}/score/${supplierId}`).expect(400);

    // Preview with override
    const prev = await request(app).get(`/api/requests/${requestId}/score/${supplierId}/preview?override=1`).expect(200);
    expect(prev.body).toHaveProperty('preview', true);
    expect(prev.body).toHaveProperty('score');
  });

  test('Award requires procurement:award permission', async () => {
    const token = sign({ id: 999, tenantId, role: 'QS' }, 'dev_secret');
    await request(app)
      .post(`/api/requests/${requestId}/award`)
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId })
      .expect(403);
  });
});

