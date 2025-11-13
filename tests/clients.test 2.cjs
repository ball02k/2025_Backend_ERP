process.env.NODE_ENV = 'development';
process.env.ENABLE_DEV_AUTH = '1';
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../index.cjs');

const prisma = new PrismaClient();

describe('Clients CRUD', () => {
  let clientId;
  test('POST /api/clients creates a client', async () => {
    const res = await request(app)
      .post('/api/clients')
      .send({ name: 'Test Client Ltd', companyRegNo: 'TC123' })
      .expect(201);
    expect(res.body).toMatchObject({ name: 'Test Client Ltd', companyRegNo: 'TC123' });
    clientId = res.body.id;
    // Link a project to satisfy tenant-scoped update/delete guards in routes/clients.js
    const code = 'C-' + Math.floor(Math.random() * 1e9);
    await prisma.project.create({ data: { code, name: 'Client Link', clientId } });
  });

  test('GET /api/clients lists clients', async () => {
    const res = await request(app).get('/api/clients').expect(200);
    expect(res.body).toHaveProperty('rows');
    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  test('GET /api/clients/:id returns client', async () => {
    const res = await request(app).get(`/api/clients/${clientId}`).expect(200);
    expect(res.body).toHaveProperty('id', clientId);
  });

  test('PUT /api/clients/:id updates client', async () => {
    const res = await request(app)
      .put(`/api/clients/${clientId}`)
      .send({ vatNo: 'GB123456789' })
      .expect(200);
    expect(res.body).toHaveProperty('vatNo', 'GB123456789');
  });

  test('DELETE /api/clients/:id soft deletes client', async () => {
    await request(app).delete(`/api/clients/${clientId}`).expect(204);
    await request(app).get(`/api/clients/${clientId}`).expect(404);
  });
});
