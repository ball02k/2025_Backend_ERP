const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function recomputeEstimatesForProject(tenantId, projectId) {
  // Schema may not include estimated/packageId on BudgetLine in this setup.
  // Perform no-op safely to avoid breaking flows that call this hook.
  try {
    // Intentionally left blank; keep compatibility for variants.
    return;
  } catch (_) { return; }
}

async function recomputeActualsForProject(tenantId, projectId) {
  // No-op for current schema (no actual/packageId on BudgetLine)
  try { return; } catch (_) { return; }
}

async function recomputeProjectFinancials(tenantId, projectId) {
  try { await recomputeEstimatesForProject(tenantId, projectId); } catch (_) {}
  try { await recomputeActualsForProject(tenantId, projectId); } catch (_) {}
}

module.exports = {
  recomputeEstimatesForProject,
  recomputeActualsForProject,
  recomputeProjectFinancials,
};
