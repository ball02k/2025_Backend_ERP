const express = require('express');
const request = require('supertest');

class MockDecimal {
  constructor(value) {
    this.value = Number(value || 0);
  }
  valueOf() {
    return this.value;
  }
  toJSON() {
    return this.value;
  }
}

const mockPrisma = {
  request: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  supplier: {
    findFirst: jest.fn(),
  },
  requestResponse: {
    findFirst: jest.fn(),
  },
  award: {
    create: jest.fn(),
  },
  awardDecision: {
    create: jest.fn(),
  },
  contract: {
    create: jest.fn(),
  },
  contractLineItem: {
    create: jest.fn(),
  },
  contractDocument: {
    create: jest.fn(),
  },
  contractVersion: {
    create: jest.fn(),
  },
  package: {
    update: jest.fn(),
  },
  $transaction: jest.fn(async (fn) => fn(mockPrisma)),
};

jest.mock('../utils/prisma.cjs', () => ({
  prisma: mockPrisma,
  Prisma: { Decimal: MockDecimal },
}));

jest.mock('../middleware/membership.cjs', () => ({
  assertProjectMember: jest.fn(async () => ({ id: 1 })),
}));

jest.mock('../services/compliance.service.cjs', () => ({
  checkSupplierCompliance: jest.fn(async () => ({ ok: true, summary: 'Supplier is compliant' })),
}));

const router = require('../routes/requests.cjs');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 1, tenantId: 'demo', role: 'PM' };
    next();
  });
  app.use('/requests', router);
  return app;
}

describe('RFx award contract creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.request.findFirst.mockResolvedValue({
      id: 10,
      tenantId: 'demo',
      title: 'Steel RFx',
      packageId: 20,
      package: {
        id: 20,
        projectId: 30,
        name: 'Steel frame',
        currency: 'GBP',
        retentionPct: new MockDecimal(5),
        paymentTerms: 'Net 30',
        contractTypeId: 'ct-1',
        awardedToSupplierId: null,
        project: { id: 30, code: 'P30', name: 'Project 30' },
        contractType: { retentionRate: new MockDecimal(3), paymentTerms: 'Net 14' },
      },
    });
    mockPrisma.supplier.findFirst.mockResolvedValue({ id: 40, name: 'Steel Supplier' });
    mockPrisma.requestResponse.findFirst.mockResolvedValue({
      id: 50,
      supplierId: 40,
      answers: { totalPrice: '12500' },
    });
    mockPrisma.award.create.mockResolvedValue({ id: 60 });
    mockPrisma.awardDecision.create.mockResolvedValue({ id: 70 });
    mockPrisma.contract.create.mockResolvedValue({
      id: 80,
      contractRef: 'P30-PKG20-RFX-123456',
      currency: 'GBP',
    });
    mockPrisma.contractDocument.create.mockResolvedValue({ id: 90 });
    mockPrisma.contractVersion.create.mockResolvedValue({ id: 100 });
    mockPrisma.contractLineItem.create.mockResolvedValue({ id: 110 });
    mockPrisma.package.update.mockResolvedValue({ id: 20 });
    mockPrisma.request.update.mockResolvedValue({ id: 10, status: 'awarded' });
  });

  test('POST /requests/:id/award creates award, draft contract, document version, and package award state', async () => {
    const res = await request(makeApp())
      .post('/requests/10/award')
      .send({ supplierId: 40 })
      .expect(201);

    expect(res.body.data).toMatchObject({
      awardId: 60,
      awardDecisionId: 70,
      contractId: 80,
      contractRef: 'P30-PKG20-RFX-123456',
    });
    expect(mockPrisma.award.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'demo',
        projectId: 30,
        packageId: 20,
        supplierId: 40,
        awardValue: expect.any(MockDecimal),
      }),
    }));
    expect(mockPrisma.contract.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'demo',
        projectId: 30,
        packageId: 20,
        supplierId: 40,
        title: 'Steel frame - RFx Award',
        sourceMode: 'rfx_award',
        status: 'draft',
      }),
    }));
    expect(mockPrisma.contractLineItem.create).toHaveBeenCalled();
    expect(mockPrisma.contractVersion.create).toHaveBeenCalled();
    expect(mockPrisma.package.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 20 },
      data: expect.objectContaining({
        status: 'awarded',
        awardedToSupplierId: 40,
      }),
    }));
    expect(mockPrisma.request.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { status: 'awarded' } });
  });
});
