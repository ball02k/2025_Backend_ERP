process.env.NODE_ENV = 'development';
process.env.ENABLE_DEV_AUTH = '1';
const request = require('supertest');
const app = require('../index.cjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

describe('Supplier capability filter', () => {
  const tenantId = 'demo';
  let sup1, sup2, sup3;

  beforeAll(async () => {
    sup1 = await prisma.supplier.create({ data: { tenantId, name: 'Sup1', status: 'approved' } });
    sup2 = await prisma.supplier.create({ data: { tenantId, name: 'Sup2', status: 'approved' } });
    sup3 = await prisma.supplier.create({ data: { tenantId, name: 'Sup3', status: 'pending' } });

    await prisma.supplierCapability.createMany({
      data: [
        { tenantId, supplierId: sup1.id, tag: 'Civils' },
        { tenantId, supplierId: sup1.id, tag: 'Rail' },
        { tenantId, supplierId: sup2.id, tag: 'Civils' },
        { tenantId, supplierId: sup3.id, tag: 'Civils' },
        { tenantId, supplierId: sup3.id, tag: 'Rail' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.supplierCapability.deleteMany({ where: { tenantId } });
    await prisma.supplier.deleteMany({ where: { tenantId, name: { in: ['Sup1', 'Sup2', 'Sup3'] } } });
    await prisma.$disconnect();
  });

  test('filters by approval and capabilities', async () => {
    const res = await request(app)
      .get('/api/suppliers?approved=true&capability=Civils,Rail')
      .expect(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].name).toBe('Sup1');
  });
});

