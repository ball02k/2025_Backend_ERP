/* eslint-disable no-console */
module.exports = {
  /**
   * Cascade delete all data linked to the provided project IDs.
   * Runs in a single transaction and deletes in FK-safe order.
   *
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {string} tenantId - current tenant id (e.g., 'demo')
   * @param {number[]} projectIds - numeric Project.id values
   */
  async cascadeDeleteProjects(prisma, tenantId, projectIds) {
    if (!Array.isArray(projectIds) || projectIds.length === 0) return;
    await prisma.$transaction(async (tx) => {
      // 1) Variation children -> Variations
      await tx.variationStatusHistory?.deleteMany?.({
        where: { variation: { projectId: { in: projectIds }, tenantId } },
      }).catch(() => {});
      await tx.variationLine.deleteMany({
        where: { variation: { projectId: { in: projectIds }, tenantId } },
      });
      await tx.variation.deleteMany({
        where: { projectId: { in: projectIds }, tenantId },
      });

      // 2) Tasks (and any task-related children if present)
      await tx.task.deleteMany({
        where: { projectId: { in: projectIds }, tenantId },
      });

      // 3) Financials / CVR bits (adjust table names if different)
      await tx.commitment?.deleteMany?.({ where: { projectId: { in: projectIds }, tenantId } }).catch(() => {});
      await tx.budgetLine?.deleteMany?.({ where: { projectId: { in: projectIds }, tenantId } }).catch(() => {});
      await tx.actualCost?.deleteMany?.({ where: { projectId: { in: projectIds }, tenantId } }).catch(() => {});
      await tx.forecast?.deleteMany?.({ where: { projectId: { in: projectIds }, tenantId } }).catch(() => {});
      await tx.financialItem?.deleteMany?.({ where: { projectId: { in: projectIds }, tenantId } }).catch(() => {});
      await tx.valuation?.deleteMany?.({ where: { projectId: { in: projectIds }, tenantId } }).catch(() => {});

      // 4) Documents (unlink rows that FK projectId)
      await tx.documentLink?.deleteMany?.({ where: { projectId: { in: projectIds } } }).catch(() => {});

      // 5) Memberships / joins
      await tx.projectMembership?.deleteMany?.({ where: { projectId: { in: projectIds }, tenantId } }).catch(() => {});

      // 6) Any other module tables that reference projectId (procurement, etc.)
      // Purchase orders and their children
      await tx.delivery?.deleteMany?.({ where: { po: { projectId: { in: projectIds }, tenantId } } }).catch(() => {});
      await tx.pOLine?.deleteMany?.({ where: { po: { projectId: { in: projectIds }, tenantId } } }).catch(() => {});
      await tx.purchaseOrder?.deleteMany?.({ where: { projectId: { in: projectIds }, tenantId } }).catch(() => {});
      // Packages and related submissions/invites/contracts
      const pkgIds = (await tx.package?.findMany?.({ where: { projectId: { in: projectIds } }, select: { id: true } }).catch(() => [])).map(p => p.id);
      if (pkgIds.length) {
        await tx.submission?.deleteMany?.({ where: { packageId: { in: pkgIds } } }).catch(() => {});
        await tx.tenderInvite?.deleteMany?.({ where: { packageId: { in: pkgIds } } }).catch(() => {});
        await tx.contract?.deleteMany?.({ where: { packageId: { in: pkgIds } } }).catch(() => {});
        await tx.package?.deleteMany?.({ where: { id: { in: pkgIds } } }).catch(() => {});
      }
      // Standalone contracts on the projects
      await tx.contract?.deleteMany?.({ where: { projectId: { in: projectIds } } }).catch(() => {});
      // Other potential modules
      await tx.procurementItem?.deleteMany?.({ where: { projectId: { in: projectIds }, tenantId } }).catch(() => {});
      await tx.procurement?.deleteMany?.({ where: { projectId: { in: projectIds }, tenantId } }).catch(() => {});

      // 7) Finally: Projects
      await tx.projectSnapshot?.deleteMany?.({ where: { projectId: { in: projectIds } } }).catch(() => {});
      await tx.project.deleteMany({
        where: { id: { in: projectIds }, tenantId },
      });
    });
  },
};
