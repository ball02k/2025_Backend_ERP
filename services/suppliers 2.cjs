const { prisma } = require('../utils/prisma.cjs');

/**
 * Upsert or find a Supplier based on onboarding data.
 * Match order: companyRegNo -> exact name in tenant -> email domain (best-effort).
 */
async function upsertSupplierForOnboarding({ tenantId, profile, emails = [] }) {
  const { name, companyRegNo, vatNo } = profile || {};
  if (!tenantId || !name) throw new Error('tenantId and name are required');

  let supplier = null;

  if (companyRegNo) {
    supplier = await prisma.supplier.findFirst({ where: { tenantId, companyRegNo } });
  }

  if (!supplier) {
    supplier = await prisma.supplier.findFirst({ where: { tenantId, name } });
  }

  if (!supplier && emails.length) {
    const first = emails.find((e) => typeof e === 'string' && e.includes('@'));
    if (first) {
      const domain = first.split('@')[1]?.toLowerCase();
      if (domain && domain.includes('.')) {
        supplier = await prisma.supplier.findFirst({
          where: {
            tenantId,
            OR: [
              { vatNo: { contains: domain, mode: 'insensitive' } },
              { companyRegNo: { contains: domain, mode: 'insensitive' } },
            ],
          },
        });
      }
    }
  }

  if (supplier) {
    const data = {};
    if (vatNo && !supplier.vatNo) data.vatNo = vatNo;
    if (companyRegNo && !supplier.companyRegNo) data.companyRegNo = companyRegNo;
    if (Object.keys(data).length) {
      supplier = await prisma.supplier.update({ where: { id: supplier.id }, data });
    }
    return { id: supplier.id, name: supplier.name };
  }

  supplier = await prisma.supplier.create({
    data: {
      tenantId,
      name,
      status: 'active',
      companyRegNo: companyRegNo || null,
      vatNo: vatNo || null,
    },
  });
  return { id: supplier.id, name: supplier.name };
}

module.exports = { upsertSupplierForOnboarding };

