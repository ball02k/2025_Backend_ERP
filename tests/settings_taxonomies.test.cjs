const request = require('supertest');

describe('Settings/Taxonomies API', () => {
  let app;
  const { sign } = require('../utils/jwt.cjs');
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

  function tokenFor(role) {
    const payload = { sub: 1, email: `${role}@test.local`, role, tenantId: 'demo' };
    return sign(payload, JWT_SECRET, { expiresIn: 3600 });
  }

  beforeEach(() => {
    // Force production-like env to avoid devRbac elevating role to admin
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    app = require('..');
  });

  it('rejects non-admin for taxonomy create (403) and allows admin', async () => {
    const nonAdmin = tokenFor('user');
    await request(app)
      .post('/api/v1/settings/taxonomies')
      .set('Authorization', `Bearer ${nonAdmin}`)
      .send({ key: 'unit_test_tax', name: 'Unit Test' })
      .expect(403);

    const admin = tokenFor('admin');
    const res = await request(app)
      .post('/api/v1/settings/taxonomies')
      .set('Authorization', `Bearer ${admin}`)
      .send({ key: 'unit_test_tax', name: 'Unit Test' })
      .expect(200);
    expect(res.body).toHaveProperty('id');
  });

  it('imports CSV and exposes terms for cost_codes', async () => {
    const admin = tokenFor('admin');
    // ensure taxonomy exists
    await request(app)
      .post('/api/v1/settings/taxonomies')
      .set('Authorization', `Bearer ${admin}`)
      .send({ key: 'cost_codes', name: 'Cost Codes', isHierarchical: true })
      .expect(200);

    const csv = 'code,label,parentCode,sort\nA,Alpha,,1\nA1,Alpha Child,A,1';
    const boundary = 'xxxBOUNDARYxxx';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="terms.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`;
    await request(app)
      .post('/api/v1/settings/taxonomies/cost_codes/import')
      .set('Authorization', `Bearer ${admin}`)
      .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
      .send(body)
      .expect(200);

    const show = await request(app)
      .get('/api/v1/settings/taxonomies/cost_codes')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    const terms = show.body.terms || [];
    expect(terms.length).toBeGreaterThanOrEqual(2);
    const a = terms.find((t) => t.code === 'A');
    const a1 = terms.find((t) => t.code === 'A1');
    expect(a).toBeTruthy();
    expect(a1).toBeTruthy();
    expect(a1.parentId).toBe(a.id);
  });

  it('updates tenant settings and persists values', async () => {
    const admin = tokenFor('admin');
    const patch = await request(app)
      .patch('/api/v1/settings/tenant')
      .set('Authorization', `Bearer ${admin}`)
      .send({ default_rfx_scoring_set: 'STD', default_contract_family: 'NEC4', award_override_reason_required: true })
      .expect(200);
    expect(patch.body).toMatchObject({ default_rfx_scoring_set: 'STD', default_contract_family: 'NEC4', award_override_reason_required: true });

    const get = await request(app)
      .get('/api/v1/settings/tenant')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(get.body).toMatchObject({ default_rfx_scoring_set: 'STD', default_contract_family: 'NEC4', award_override_reason_required: true });
  });

  it('writes audit logs for mutations', async () => {
    const admin = tokenFor('admin');
    // Create taxonomy
    await request(app)
      .post('/api/v1/settings/taxonomies')
      .set('Authorization', `Bearer ${admin}`)
      .send({ key: 'audit_tax', name: 'Audit Tax' })
      .expect(200);
    // Bulk terms
    await request(app)
      .post('/api/v1/settings/taxonomies/audit_tax/terms')
      .set('Authorization', `Bearer ${admin}`)
      .send([{ code: 'X', label: 'X' }])
      .expect(200);
    const db = global.__PRISMA_MOCK_DB__;
    expect(Array.isArray(db.auditLog)).toBe(true);
    const hasTax = db.auditLog.some((l) => l.entity === 'Taxonomy' && l.action === 'create');
    const hasTerm = db.auditLog.some((l) => l.entity === 'TaxonomyTerm' && l.action === 'bulk_upsert');
    expect(hasTax).toBe(true);
    expect(hasTerm).toBe(true);
  });
});

