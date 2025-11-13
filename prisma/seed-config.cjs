// seed-config.cjs
// Configuration and schema mappings for the seed

module.exports = {
  tenantId: process.env.SEED_TENANT_ID || 'demo',

  // Scoring weights for tender evaluation
  weights: {
    price: 50,
    programme: 20,
    technical: 15,
    hs: 10,
    esg: 5
  },

  // Map to actual Prisma model names in your schema
  models: {
    tenant: 'tenant',
    user: 'user',
    role: 'role',
    client: 'client',
    project: 'project',
    budgetGroup: 'budgetGroup',
    budgetLine: 'budgetLine',
    costCode: 'costCode',
    package: 'package',
    packageItem: 'packageItem',
    packageLineItem: 'packageLineItem',
    supplier: 'supplier',
    tender: 'tender',
    tenderSection: 'tenderSection',
    tenderQuestion: 'tenderQuestion',
    tenderSupplierInvite: 'tenderSupplierInvite',
    tenderResponse: 'tenderResponse',
    award: 'award',
    contract: 'contract',
    contractDocument: 'contractDocument',
    contractVersion: 'contractVersion'
  },

  // Status values
  statuses: {
    project: {
      active: 'Active',
      planning: 'Planning',
      complete: 'Complete'
    },
    tender: {
      draft: 'draft',
      open: 'open',
      closed: 'closed',
      awarded: 'awarded'
    },
    package: {
      planned: 'planned',
      tendering: 'tendering',
      awarded: 'awarded',
      active: 'active'
    },
    contract: {
      draft: 'draft',
      active: 'active',
      signed: 'signed',
      complete: 'complete'
    }
  }
};
