process.env.NODE_ENV = 'development';
process.env.ENABLE_DEV_AUTH = '1';
const request = require('supertest');
const app = require('../index.cjs');

describe('Dev delta endpoints', () => {
  test('GET /api/__catalog/hash returns hash', async () => {
    const res = await request(app).get('/api/__catalog/hash').expect(200);
    expect(res.body).toHaveProperty('hash');
  });

  test('GET /api/__delta returns delta prompt', async () => {
    const res = await request(app).get('/api/__delta').expect(200);
    expect(res.text.startsWith('FRONTEND_DELTA_PROMPT')).toBe(true);
  });
});
