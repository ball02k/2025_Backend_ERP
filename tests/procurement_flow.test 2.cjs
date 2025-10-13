process.env.NODE_ENV = 'development';
process.env.ENABLE_DEV_AUTH = '1';
const request = require('supertest');
const app = require('../index.cjs');

describe('Procurement flow (additive)', () => {
  let projectId;
  test('create/list tender and add bid', async () => {
    // Ensure a project exists
    const p = await request(app).get('/api/projects?limit=1&offset=0').expect(200);
    projectId = (p.body?.items?.[0]?.id) || (p.body?.data?.[0]?.id) || 1;
    // Create package
    const pkg = await request(app).post(`/api/projects/${projectId}/packages`).send({ name: 'Auto Pkg', description: 'auto', budget: 1000 }).expect(201);
    // Create tender
    const t = await request(app).post(`/api/projects/${projectId}/tenders`).send({ packageId: pkg.body.id, title: 'Auto Tender', status: 'open' }).expect(201);
    const tenderId = t.body.id;
    // Add bid (uses supplier 1 if exists else skip)
    const sup = await request(app).get('/api/suppliers?limit=1').expect(200);
    const supplierId = sup.body?.items?.[0]?.id || sup.body?.data?.[0]?.id;
    if (supplierId) {
      await request(app).post(`/api/projects/${projectId}/tenders/${tenderId}/bids`).send({ supplierId, price: 1234 }).expect(201);
    }
    // Show tender
    const show = await request(app).get(`/api/projects/tenders/${tenderId}`).expect(200);
    expect(show.body).toHaveProperty('id', tenderId);
  });
});

