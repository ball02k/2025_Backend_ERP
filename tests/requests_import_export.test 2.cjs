process.env.NODE_ENV = 'development';
process.env.ENABLE_DEV_AUTH = '1';
const request = require('supertest');
const app = require('../index.cjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

describe('RFx export/import + duplicate options', () => {
  const tenantId = 'demo';
  let requestId;
  let importedId;
  let dupId;

  afterAll(async () => {
    if (importedId) {
      await prisma.requestQuestion.deleteMany({ where: { tenantId, requestId: importedId } }).catch(() => {});
      await prisma.requestSection.deleteMany({ where: { tenantId, requestId: importedId } }).catch(() => {});
      await prisma.request.delete({ where: { id: importedId } }).catch(() => {});
    }
    if (dupId) {
      await prisma.requestQuestion.deleteMany({ where: { tenantId, requestId: dupId } }).catch(() => {});
      await prisma.requestSection.deleteMany({ where: { tenantId, requestId: dupId } }).catch(() => {});
      await prisma.request.delete({ where: { id: dupId } }).catch(() => {});
    }
    if (requestId) {
      await prisma.requestQuestion.deleteMany({ where: { tenantId, requestId } }).catch(() => {});
      await prisma.requestSection.deleteMany({ where: { tenantId, requestId } }).catch(() => {});
      await prisma.request.delete({ where: { id: requestId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test('create base request and export', async () => {
    const create = await request(app).post('/api/requests').send({ title: 'Exportable', type: 'RFP', totalStages: 1, weighting: { scale: { normalize: true } } }).expect(200);
    requestId = create.body.data.id;
    const s1 = await request(app).post(`/api/requests/${requestId}/sections`).send({ title: 'S1', order: 1, weight: 1 }).expect(200);
    const sectionId = s1.body.data.id;
    await request(app).post(`/api/requests/${requestId}/questions`).send({ sectionId, qType: 'number', prompt: 'Score', weight: 1, order: 1 }).expect(200);
    const exp = await request(app).get(`/api/requests/${requestId}/export`).expect(200);
    expect(exp.body).toHaveProperty('data.request');
    expect(exp.body.data.request).toHaveProperty('weighting');
  });

  test('import without weighting and ensure created', async () => {
    const exp = await request(app).get(`/api/requests/${requestId}/export`).expect(200);
    const payload = exp.body.data;
    const imp = await request(app).post('/api/requests/import').send({ data: payload, includeWeighting: false, titleSuffix: '(Imported)' }).expect(200);
    importedId = imp.body.data.id;
    expect(importedId).toBeGreaterThan(0);
    const got = await prisma.request.findFirst({ where: { tenantId, id: importedId } });
    expect(got.weighting).toBeNull();
    expect(got.title.endsWith('(Imported)')).toBe(true);
  });

  test('duplicate without weighting and with titleSuffix', async () => {
    const dup = await request(app).post(`/api/requests/${requestId}/duplicate`).send({ includeWeighting: false, titleSuffix: '(Copy2)' }).expect(200);
    expect(dup.body.data).toHaveProperty('id');
    dupId = dup.body.data.id;
    const got = await prisma.request.findFirst({ where: { tenantId, id: dupId } });
    // when omitted, Prisma returns null for JSON column by default
    expect(got.weighting).toBeNull();
    expect(got.title.endsWith('(Copy2)')).toBe(true);
  });

  test('import validation rejects invalid qType', async () => {
    const exp = await request(app).get(`/api/requests/${requestId}/export`).expect(200);
    const payload = exp.body.data;
    // Mutate qType to an invalid one
    if (payload.sections[0] && payload.sections[0].questions[0]) {
      payload.sections[0].questions[0].qType = 'invalid_type';
    }
    await request(app).post('/api/requests/import').send({ data: payload }).expect(400);
  });
});
