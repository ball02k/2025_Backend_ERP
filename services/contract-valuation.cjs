/**
 * Contract Valuation Service
 *
 * Manages contract valuations for revenue tracking in construction projects.
 * British English: "valuation" (not "assessment" or "appraisal")
 *
 * Workflow: DRAFT → SUBMITTED → CERTIFIED → INVOICED
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Create a new contract valuation
 */
async function createValuation({
  tenantId,
  contractId,
  budgetLineId = null,
  valuationNumber,
  valuationDate,
  grossValuation,
  retention = 0,
  previouslyValued = 0,
  thisValuation,
  materialsOnSite = 0,
  description = '',
  notes = '',
  createdBy,
}) {
  const netValuation = grossValuation - retention;

  const valuation = await prisma.contractValuation.create({
    data: {
      tenantId,
      contractId,
      budgetLineId,
      valuationNumber,
      valuationDate: new Date(valuationDate),
      grossValuation,
      retention,
      netValuation,
      previouslyValued,
      thisValuation,
      materialsOnSite,
      description,
      notes,
      status: 'DRAFT',
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    include: {
      contract: {
        select: {
          id: true,
          number: true,
          title: true,
          supplier: {
            select: { id: true, name: true },
          },
        },
      },
      budgetLine: {
        select: { id: true, code: true, description: true },
      },
    },
  });

  return valuation;
}

/**
 * Get a single valuation by ID
 */
async function getValuationById(tenantId, valuationId) {
  const valuation = await prisma.contractValuation.findFirst({
    where: {
      id: valuationId,
      tenantId,
      is_deleted: false,
    },
    include: {
      contract: {
        select: {
          id: true,
          number: true,
          title: true,
          supplier: {
            select: { id: true, name: true },
          },
        },
      },
      budgetLine: {
        select: { id: true, code: true, description: true },
      },
    },
  });

  if (!valuation) {
    throw new Error('Contract valuation not found');
  }

  return valuation;
}

/**
 * List valuations for a contract or project
 */
async function listValuations({
  tenantId,
  contractId = null,
  projectId = null,
  status = null,
  limit = 100,
  offset = 0,
}) {
  const where = {
    tenantId,
    is_deleted: false,
  };

  if (contractId) {
    where.contractId = contractId;
  }

  if (projectId) {
    where.contract = {
      projectId,
    };
  }

  if (status) {
    where.status = status;
  }

  const [valuations, total] = await Promise.all([
    prisma.contractValuation.findMany({
      where,
      include: {
        contract: {
          select: {
            id: true,
            number: true,
            title: true,
            projectId: true,
            supplier: {
              select: { id: true, name: true },
            },
          },
        },
        budgetLine: {
          select: { id: true, code: true, description: true },
        },
      },
      orderBy: [
        { valuationDate: 'desc' },
        { valuationNumber: 'desc' },
      ],
      take: limit,
      skip: offset,
    }),
    prisma.contractValuation.count({ where }),
  ]);

  return {
    valuations,
    total,
    limit,
    offset,
  };
}

/**
 * Update a valuation (only if status is DRAFT)
 */
async function updateValuation(tenantId, valuationId, updates) {
  // Check current status
  const current = await prisma.contractValuation.findFirst({
    where: { id: valuationId, tenantId, is_deleted: false },
    select: { status: true },
  });

  if (!current) {
    throw new Error('Contract valuation not found');
  }

  if (current.status !== 'DRAFT') {
    throw new Error('Can only update valuations in DRAFT status');
  }

  // Recalculate net valuation if gross or retention changed
  if (updates.grossValuation !== undefined || updates.retention !== undefined) {
    const gross = updates.grossValuation ?? current.grossValuation;
    const retention = updates.retention ?? current.retention;
    updates.netValuation = gross - retention;
  }

  const valuation = await prisma.contractValuation.update({
    where: { id: valuationId },
    data: {
      ...updates,
      updatedAt: new Date(),
    },
    include: {
      contract: {
        select: {
          id: true,
          number: true,
          title: true,
          supplier: {
            select: { id: true, name: true },
          },
        },
      },
      budgetLine: {
        select: { id: true, code: true, description: true },
      },
    },
  });

  return valuation;
}

/**
 * Update valuation status
 * Workflow: DRAFT → SUBMITTED → CERTIFIED → INVOICED
 */
async function updateValuationStatus(
  tenantId,
  valuationId,
  newStatus,
  userId,
  notes = ''
) {
  const current = await prisma.contractValuation.findFirst({
    where: { id: valuationId, tenantId, is_deleted: false },
  });

  if (!current) {
    throw new Error('Contract valuation not found');
  }

  // Validate status transitions
  const validTransitions = {
    DRAFT: ['SUBMITTED'],
    SUBMITTED: ['CERTIFIED', 'DRAFT'], // Can send back to draft
    CERTIFIED: ['INVOICED'],
    INVOICED: [], // Terminal state
  };

  if (!validTransitions[current.status]?.includes(newStatus)) {
    throw new Error(
      `Invalid status transition from ${current.status} to ${newStatus}`
    );
  }

  const updateData = {
    status: newStatus,
    updatedAt: new Date(),
  };

  // Set timestamp fields based on status
  if (newStatus === 'SUBMITTED') {
    updateData.submittedDate = new Date();
    updateData.submittedBy = userId;
  } else if (newStatus === 'CERTIFIED') {
    updateData.certifiedDate = new Date();
    updateData.certifiedBy = userId;
  } else if (newStatus === 'INVOICED') {
    updateData.invoicedDate = new Date();
    updateData.invoicedBy = userId;
  }

  if (notes) {
    updateData.notes = notes;
  }

  const valuation = await prisma.contractValuation.update({
    where: { id: valuationId },
    data: updateData,
    include: {
      contract: {
        select: {
          id: true,
          number: true,
          title: true,
          supplier: {
            select: { id: true, name: true },
          },
        },
      },
      budgetLine: {
        select: { id: true, code: true, description: true },
      },
    },
  });

  return valuation;
}

/**
 * Delete a valuation (soft delete, only if DRAFT)
 */
async function deleteValuation(tenantId, valuationId) {
  const current = await prisma.contractValuation.findFirst({
    where: { id: valuationId, tenantId, is_deleted: false },
    select: { status: true },
  });

  if (!current) {
    throw new Error('Contract valuation not found');
  }

  if (current.status !== 'DRAFT') {
    throw new Error('Can only delete valuations in DRAFT status');
  }

  await prisma.contractValuation.update({
    where: { id: valuationId },
    data: {
      is_deleted: true,
      updatedAt: new Date(),
    },
  });

  return { success: true };
}

/**
 * Get valuation summary for a contract
 * Returns total valued to date, certified, invoiced amounts
 */
async function getContractValuationSummary(tenantId, contractId) {
  const valuations = await prisma.contractValuation.findMany({
    where: {
      tenantId,
      contractId,
      is_deleted: false,
    },
    select: {
      status: true,
      grossValuation: true,
      netValuation: true,
      thisValuation: true,
    },
  });

  const summary = {
    totalGross: 0,
    totalNet: 0,
    totalThisValuation: 0,
    certifiedGross: 0,
    certifiedNet: 0,
    invoicedGross: 0,
    invoicedNet: 0,
    draftCount: 0,
    submittedCount: 0,
    certifiedCount: 0,
    invoicedCount: 0,
  };

  for (const val of valuations) {
    const gross = Number(val.grossValuation);
    const net = Number(val.netValuation);
    const thisVal = Number(val.thisValuation);

    summary.totalGross += gross;
    summary.totalNet += net;
    summary.totalThisValuation += thisVal;

    if (val.status === 'DRAFT') {
      summary.draftCount++;
    } else if (val.status === 'SUBMITTED') {
      summary.submittedCount++;
    } else if (val.status === 'CERTIFIED') {
      summary.certifiedCount++;
      summary.certifiedGross += gross;
      summary.certifiedNet += net;
    } else if (val.status === 'INVOICED') {
      summary.invoicedCount++;
      summary.invoicedGross += gross;
      summary.invoicedNet += net;
    }
  }

  return summary;
}

module.exports = {
  createValuation,
  getValuationById,
  listValuations,
  updateValuation,
  updateValuationStatus,
  deleteValuation,
  getContractValuationSummary,
};
