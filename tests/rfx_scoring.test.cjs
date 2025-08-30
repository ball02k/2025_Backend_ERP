process.env.NODE_ENV = 'development';
process.env.ENABLE_DEV_AUTH = '1';
const { PrismaClient } = require('@prisma/client');
const { computeRequestScore } = require('../services/rfx_scoring.cjs');

const prisma = new PrismaClient();

describe('RFx scoring service', () => {
  const tenantId = 'demo';
  let requestId;
  let supplierId;
  let qNumId;
  let qMcqId;

  beforeAll(async () => {
    // Create minimal supplier to reference
    const sup = await prisma.supplier.create({ data: { tenantId, name: 'Test Supplier' } });
    supplierId = sup.id;

    const req = await prisma.request.create({
      data: { tenantId, title: 'RFx Test', type: 'RFP', status: 'published', totalStages: 1 },
    });
    requestId = req.id;

    const sA = await prisma.requestSection.create({ data: { tenantId, requestId, title: 'Technical', weight: 1, order: 1 } });
    const sB = await prisma.requestSection.create({ data: { tenantId, requestId, title: 'Commercial', weight: 1, order: 2 } });

    const qNum = await prisma.requestQuestion.create({
      data: { tenantId, requestId, sectionId: sA.id, qType: 'number', prompt: 'Score out of 10', weight: 1, order: 1 },
    });
    const qMcq = await prisma.requestQuestion.create({
      data: { tenantId, requestId, sectionId: sB.id, qType: 'mcq', prompt: 'ISO9001?', options: { yes: 10, no: 0 }, weight: 1, order: 1 },
    });
    qNumId = qNum.id;
    qMcqId = qMcq.id;

    await prisma.requestResponse.create({
      data: {
        tenantId,
        requestId,
        supplierId,
        stage: 1,
        answers: { [qNumId]: 8, [qMcqId]: 'yes' },
        submittedAt: new Date(),
        status: 'submitted',
      },
    });
  });

  afterAll(async () => {
    // Cleanup created data to keep DB tidy for subsequent tests
    await prisma.requestQuestion.deleteMany({ where: { tenantId, requestId } });
    await prisma.requestSection.deleteMany({ where: { tenantId, requestId } });
    await prisma.requestResponse.deleteMany({ where: { tenantId, requestId, supplierId } });
    await prisma.awardDecision.deleteMany({ where: { tenantId, requestId } });
    await prisma.requestInvite.deleteMany({ where: { tenantId, requestId } });
    await prisma.request.delete({ where: { id: requestId } });
    await prisma.supplier.delete({ where: { id: supplierId } });
    await prisma.$disconnect();
  });

  test('computes weighted average score without normalization', async () => {
    const result = await computeRequestScore({ tenantId, requestId, supplierId, scaleCfg: {}, prisma });
    expect(result).toHaveProperty('score');
    // Sections: 8 and 10 -> average = 9
    expect(Number(result.score)).toBeGreaterThan(8.9);
    expect(Number(result.score)).toBeLessThan(9.1);
    expect(Array.isArray(result.sections)).toBe(true);
    expect(result.sections.length).toBe(2);
  });

  test('applies normalization to 0-1 scale', async () => {
    const result = await computeRequestScore({ tenantId, requestId, supplierId, scaleCfg: { normalize: true, defaultMin: 0, defaultMax: 10, targetMax: 1 }, prisma });
    // Sections: 0.8 and 1.0 -> average = 0.9
    expect(Number(result.score)).toBeGreaterThan(0.89);
    expect(Number(result.score)).toBeLessThan(0.91);
  });
});

