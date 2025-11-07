const { PrismaClient } = require('@prisma/client');

// Initialize Prisma Client
const prisma = new PrismaClient();

/**
 * Convert value to integer safely
 * @param {any} value - Value to convert
 * @returns {number|null} - Integer or null if invalid
 */
function toInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.floor(num);
}

/**
 * Assert that a project belongs to the tenant
 * @param {import('@prisma/client').PrismaClient} prisma - Prisma client
 * @param {number} projectId - Project ID
 * @param {string|number} tenantId - Tenant ID
 * @throws {Error} If project doesn't belong to tenant
 */
async function assertProjectTenant(prisma, projectId, tenantId) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      tenantId: String(tenantId),
    },
    select: { id: true },
  });

  if (!project) {
    const error = new Error('Project not found or access denied');
    error.status = 404;
    throw error;
  }

  return project;
}

module.exports = {
  prisma,
  toInt,
  assertProjectTenant,
};
