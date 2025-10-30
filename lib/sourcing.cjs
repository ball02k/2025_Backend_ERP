/**
 * Check whether a package already has active sourcing records.
 * @param {import('@prisma/client').PrismaClient} prisma Prisma client handle.
 * @param {string|number} tenantId Tenant identifier to scope queries.
 * @param {number|string} packageId Target package id.
 * @returns {Promise<boolean>} Resolves true when blocking sourcing exists.
 */
async function isPackageSourced(prisma, tenantId, packageId) {
  if (!prisma) return false;
  const tenant = tenantId != null ? String(tenantId) : null;
  if (!tenant) return false;

  const pkgId = Number(packageId);
  if (!Number.isFinite(pkgId)) return false;

  const sharedWhere = { tenantId: tenant, packageId: pkgId };

  const tender = await prisma?.tender?.findFirst({
    where: {
      ...sharedWhere,
      status: { not: 'cancelled' },
    },
    select: { id: true },
  });
  if (tender) return true;

  const ACTIVE_CONTRACT_STATUSES = ['draft', 'active', 'executed', 'live'];
  const contract = await prisma?.contract?.findFirst({
    where: {
      ...sharedWhere,
      status: { in: ACTIVE_CONTRACT_STATUSES },
    },
    select: { id: true },
  });
  if (contract) return true;

  const INACTIVE_STATUSES = ['cancelled', 'canceled', 'closed', 'terminated', 'withdrawn', 'void', 'archived'];

  if (prisma?.directAward?.findFirst) {
    const directAward = await optionalLookup(() =>
      prisma.directAward.findFirst({
        where: {
          ...sharedWhere,
          status: { notIn: INACTIVE_STATUSES },
        },
        select: { id: true },
      }),
    );
    if (directAward) return true;
  }

  if (prisma?.internalResourceAssignment?.findFirst) {
    const assignment = await optionalLookup(() =>
      prisma.internalResourceAssignment.findFirst({
        where: {
          ...sharedWhere,
          status: { notIn: INACTIVE_STATUSES },
        },
        select: { id: true },
      }),
    );
    if (assignment) return true;
  }

  return false;
}

async function optionalLookup(fn) {
  try {
    const row = await fn();
    return Boolean(row);
  } catch (err) {
    if (isMissingModelError(err)) return false;
    throw err;
  }
}

function isMissingModelError(err) {
  const message = String(err?.message || '').toLowerCase();
  if (!message) return false;
  const mentionsMissing =
    message.includes('does not exist') ||
    message.includes('unknown') ||
    message.includes('missing');
  if (!mentionsMissing) return false;
  return message.includes('model') || message.includes('table') || message.includes('relation');
}

module.exports = { isPackageSourced };
