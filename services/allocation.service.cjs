/**
 * Allocation Service
 *
 * Handles budget line category allocations and CVR calculations per category.
 * Supports splitting budget lines into UK construction categories (Preliminaries, Substructure, etc.)
 * with independent CVR tracking for each category.
 */

const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Get all active allocation categories for a tenant
 * @param {string} tenantId
 * @returns {Promise<Array>}
 */
async function getCategories(tenantId) {
  return await prisma.allocationCategory.findMany({
    where: {
      tenantId,
      isActive: true
    },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      sortOrder: true,
      isDefault: true,
      parentId: true
    }
  });
}

/**
 * Create a custom allocation category
 * @param {string} tenantId
 * @param {object} categoryData - { code, name, description, sortOrder, parentId }
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function createCategory(tenantId, categoryData, userId) {
  const { code, name, description, sortOrder, parentId } = categoryData;

  // Check if code already exists for this tenant
  const existing = await prisma.allocationCategory.findUnique({
    where: {
      tenantId_code: {
        tenantId,
        code
      }
    }
  });

  if (existing) {
    throw new Error(`Category with code '${code}' already exists for this tenant`);
  }

  return await prisma.allocationCategory.create({
    data: {
      tenantId,
      code,
      name,
      description,
      sortOrder: sortOrder || 999,
      parentId: parentId || null,
      isActive: true,
      isDefault: false,
      createdBy: userId
    }
  });
}

/**
 * Get all allocations for a budget line
 * @param {string} tenantId
 * @param {number} budgetLineId
 * @returns {Promise<Array>}
 */
async function getBudgetLineAllocations(tenantId, budgetLineId) {
  const allocations = await prisma.budgetLineAllocation.findMany({
    where: {
      tenantId,
      budgetLineId,
      status: 'ACTIVE'
    },
    include: {
      category: {
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          sortOrder: true
        }
      }
    },
    orderBy: {
      category: {
        sortOrder: 'asc'
      }
    }
  });

  return allocations;
}

/**
 * Create or update budget line allocations
 * Validates that sum of allocations equals budget line total
 * @param {string} tenantId
 * @param {number} budgetLineId
 * @param {Array} allocations - [{ categoryId, allocatedAmount, notes }]
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function createBudgetLineAllocations(tenantId, budgetLineId, allocations, userId) {
  // Get budget line to validate total
  const budgetLine = await prisma.budgetLine.findFirst({
    where: {
      id: budgetLineId,
      tenantId
    }
  });

  if (!budgetLine) {
    throw new Error('Budget line not found');
  }

  // Validate sum of allocations equals budget
  const totalAllocated = allocations.reduce((sum, a) => sum + Number(a.allocatedAmount), 0);
  const budgetTotal = Number(budgetLine.amount);

  if (Math.abs(totalAllocated - budgetTotal) > 0.01) {
    throw new Error(
      `Sum of allocations (${totalAllocated}) must equal budget line amount (${budgetTotal})`
    );
  }

  // Delete existing allocations and create new ones in a transaction
  return await prisma.$transaction(async (tx) => {
    // Delete existing allocations
    await tx.budgetLineAllocation.deleteMany({
      where: {
        tenantId,
        budgetLineId
      }
    });

    // Create new allocations
    const created = [];
    for (const alloc of allocations) {
      const newAlloc = await tx.budgetLineAllocation.create({
        data: {
          tenantId,
          budgetLineId,
          categoryId: alloc.categoryId,
          allocatedAmount: alloc.allocatedAmount,
          currency: budgetLine.currency || 'GBP',
          status: 'ACTIVE',
          notes: alloc.notes || null,
          createdBy: userId
        },
        include: {
          category: {
            select: {
              id: true,
              code: true,
              name: true,
              sortOrder: true
            }
          }
        }
      });
      created.push(newAlloc);
    }

    return created;
  });
}

/**
 * Update a single allocation amount
 * Must maintain budget line total balance
 * @param {string} tenantId
 * @param {string} allocationId
 * @param {number} newAmount
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function updateAllocationAmount(tenantId, allocationId, newAmount, userId) {
  const allocation = await prisma.budgetLineAllocation.findFirst({
    where: {
      id: allocationId,
      tenantId
    },
    include: {
      budgetLine: true
    }
  });

  if (!allocation) {
    throw new Error('Allocation not found');
  }

  // Get all allocations for this budget line
  const allAllocations = await prisma.budgetLineAllocation.findMany({
    where: {
      tenantId,
      budgetLineId: allocation.budgetLineId,
      status: 'ACTIVE'
    }
  });

  // Calculate new total
  const currentTotal = allAllocations.reduce((sum, a) => {
    if (a.id === allocationId) {
      return sum + Number(newAmount);
    }
    return sum + Number(a.allocatedAmount);
  }, 0);

  const budgetTotal = Number(allocation.budgetLine.amount);

  if (Math.abs(currentTotal - budgetTotal) > 0.01) {
    throw new Error(
      `Updated allocation would make total (${currentTotal}) not equal budget (${budgetTotal})`
    );
  }

  return await prisma.budgetLineAllocation.update({
    where: { id: allocationId },
    data: {
      allocatedAmount: newAmount,
      updatedAt: new Date()
    },
    include: {
      category: {
        select: {
          id: true,
          code: true,
          name: true
        }
      }
    }
  });
}

/**
 * Calculate CVR for a single allocation
 * @param {string} tenantId
 * @param {string} allocationId
 * @returns {Promise<object>}
 */
async function calculateAllocationCVR(tenantId, allocationId) {
  const allocation = await prisma.budgetLineAllocation.findFirst({
    where: {
      id: allocationId,
      tenantId,
      status: 'ACTIVE'
    },
    include: {
      category: true,
      budgetLine: {
        include: {
          project: true
        }
      }
    }
  });

  if (!allocation) {
    throw new Error('Allocation not found');
  }

  // Get CVR commitments for this allocation
  const commitments = await prisma.cVRCommitment.findMany({
    where: {
      tenantId,
      allocationId,
      status: 'ACTIVE'
    }
  });

  // Get CVR actuals for this allocation
  const actuals = await prisma.cVRActual.findMany({
    where: {
      tenantId,
      allocationId,
      status: {
        in: ['ACCRUED', 'PAID']
      }
    }
  });

  // Calculate totals
  const budget = Number(allocation.allocatedAmount);
  const committed = commitments.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const actualSpend = actuals.reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const remaining = budget - committed;  // Remaining before overcommitment
  const variance = budget - actualSpend; // Variance is budget vs actual spend

  // Calculate percentages
  const percentCommitted = budget > 0 ? (committed / budget) * 100 : 0;
  const percentActual = budget > 0 ? (actualSpend / budget) * 100 : 0;
  const percentRemaining = budget > 0 ? (remaining / budget) * 100 : 0;

  // Get forecast if available (sum of forecast from actuals)
  const forecastActuals = actuals.filter(a => a.forecastFinal !== null);
  const forecastFinal = forecastActuals.length > 0
    ? forecastActuals.reduce((sum, a) => sum + Number(a.forecastFinal || 0), 0)
    : null;

  const forecastVariance = forecastFinal !== null ? budget - forecastFinal : null;

  return {
    allocationId: allocation.id,
    categoryId: allocation.categoryId,
    categoryCode: allocation.category.code,
    categoryName: allocation.category.name,
    budgetLineId: allocation.budgetLineId,
    projectId: allocation.budgetLine.projectId,

    // Financial figures
    budget,
    committed,
    actuals: actualSpend,
    remaining,
    variance,
    forecastFinal,
    forecastVariance,

    // Percentages
    percentCommitted,
    percentActual,
    percentRemaining,

    // Metadata
    currency: allocation.currency,
    commitmentCount: commitments.length,
    actualCount: actuals.length
  };
}

/**
 * Calculate CVR for a budget line with category breakdown
 * @param {string} tenantId
 * @param {number} budgetLineId
 * @returns {Promise<object>}
 */
async function calculateBudgetLineCVRWithAllocations(tenantId, budgetLineId) {
  const budgetLine = await prisma.budgetLine.findFirst({
    where: {
      id: budgetLineId,
      tenantId
    },
    include: {
      project: true
    }
  });

  if (!budgetLine) {
    throw new Error('Budget line not found');
  }

  // Get all allocations
  const allocations = await getBudgetLineAllocations(tenantId, budgetLineId);

  // Calculate CVR for each allocation
  const allocationCVRs = await Promise.all(
    allocations.map(alloc => calculateAllocationCVR(tenantId, alloc.id))
  );

  // Calculate budget line totals (rollup from allocations)
  const totalBudget = allocationCVRs.reduce((sum, cvr) => sum + cvr.budget, 0);
  const totalCommitted = allocationCVRs.reduce((sum, cvr) => sum + cvr.committed, 0);
  const totalActuals = allocationCVRs.reduce((sum, cvr) => sum + cvr.actuals, 0);
  const totalRemaining = allocationCVRs.reduce((sum, cvr) => sum + cvr.remaining, 0);
  const totalVariance = allocationCVRs.reduce((sum, cvr) => sum + cvr.variance, 0);

  // Calculate forecast if any allocation has it
  const hasForecast = allocationCVRs.some(cvr => cvr.forecastFinal !== null);
  const totalForecastFinal = hasForecast
    ? allocationCVRs.reduce((sum, cvr) => sum + (cvr.forecastFinal || 0), 0)
    : null;
  const totalForecastVariance = totalForecastFinal !== null
    ? totalBudget - totalForecastFinal
    : null;

  // Calculate percentages
  const percentCommitted = totalBudget > 0 ? (totalCommitted / totalBudget) * 100 : 0;
  const percentActual = totalBudget > 0 ? (totalActuals / totalBudget) * 100 : 0;
  const percentRemaining = totalBudget > 0 ? (totalRemaining / totalBudget) * 100 : 0;

  return {
    budgetLineId,
    budgetLineCode: budgetLine.code,
    budgetLineDescription: budgetLine.description,
    projectId: budgetLine.projectId,

    // Overall totals
    summary: {
      budget: totalBudget,
      committed: totalCommitted,
      actuals: totalActuals,
      remaining: totalRemaining,
      variance: totalVariance,
      forecastFinal: totalForecastFinal,
      forecastVariance: totalForecastVariance,
      percentCommitted,
      percentActual,
      percentRemaining,
      currency: budgetLine.currency || 'GBP'
    },

    // Breakdown by category
    categories: allocationCVRs
  };
}

/**
 * Calculate project-level CVR by category
 * Aggregates all budget lines in a project by category
 * @param {string} tenantId
 * @param {number} projectId
 * @returns {Promise<object>}
 */
async function calculateProjectCVRByCategory(tenantId, projectId) {
  // Get all budget lines for this project
  const budgetLines = await prisma.budgetLine.findMany({
    where: {
      projectId,
      tenantId
    },
    include: {
      project: true,
      allocations: {
        where: {
          status: 'ACTIVE'
        },
        include: {
          category: true
        }
      }
    }
  });

  // Get all unique categories used in this project
  const categoryMap = new Map();

  for (const budgetLine of budgetLines) {
    for (const allocation of budgetLine.allocations) {
      if (!categoryMap.has(allocation.categoryId)) {
        categoryMap.set(allocation.categoryId, {
          categoryId: allocation.categoryId,
          categoryCode: allocation.category.code,
          categoryName: allocation.category.name,
          sortOrder: allocation.category.sortOrder,
          allocations: []
        });
      }
      categoryMap.get(allocation.categoryId).allocations.push(allocation.id);
    }
  }

  // Calculate CVR for each category
  const categoryCVRs = [];

  for (const [categoryId, categoryData] of categoryMap) {
    // Calculate CVR for all allocations in this category
    const allocationCVRs = await Promise.all(
      categoryData.allocations.map(allocId => calculateAllocationCVR(tenantId, allocId))
    );

    // Aggregate totals
    const budget = allocationCVRs.reduce((sum, cvr) => sum + cvr.budget, 0);
    const committed = allocationCVRs.reduce((sum, cvr) => sum + cvr.committed, 0);
    const actuals = allocationCVRs.reduce((sum, cvr) => sum + cvr.actuals, 0);
    const remaining = allocationCVRs.reduce((sum, cvr) => sum + cvr.remaining, 0);
    const variance = allocationCVRs.reduce((sum, cvr) => sum + cvr.variance, 0);

    // Forecast
    const hasForecast = allocationCVRs.some(cvr => cvr.forecastFinal !== null);
    const forecastFinal = hasForecast
      ? allocationCVRs.reduce((sum, cvr) => sum + (cvr.forecastFinal || 0), 0)
      : null;
    const forecastVariance = forecastFinal !== null ? budget - forecastFinal : null;

    // Percentages
    const percentCommitted = budget > 0 ? (committed / budget) * 100 : 0;
    const percentActual = budget > 0 ? (actuals / budget) * 100 : 0;
    const percentRemaining = budget > 0 ? (remaining / budget) * 100 : 0;

    categoryCVRs.push({
      categoryId,
      categoryCode: categoryData.categoryCode,
      categoryName: categoryData.categoryName,
      sortOrder: categoryData.sortOrder,
      budget,
      committed,
      actuals,
      remaining,
      variance,
      forecastFinal,
      forecastVariance,
      percentCommitted,
      percentActual,
      percentRemaining,
      allocationCount: allocationCVRs.length
    });
  }

  // Sort by sortOrder
  categoryCVRs.sort((a, b) => a.sortOrder - b.sortOrder);

  // Calculate project totals
  const totalBudget = categoryCVRs.reduce((sum, cat) => sum + cat.budget, 0);
  const totalCommitted = categoryCVRs.reduce((sum, cat) => sum + cat.committed, 0);
  const totalActuals = categoryCVRs.reduce((sum, cat) => sum + cat.actuals, 0);
  const totalRemaining = categoryCVRs.reduce((sum, cat) => sum + cat.remaining, 0);
  const totalVariance = categoryCVRs.reduce((sum, cat) => sum + cat.variance, 0);

  const hasForecast = categoryCVRs.some(cat => cat.forecastFinal !== null);
  const totalForecastFinal = hasForecast
    ? categoryCVRs.reduce((sum, cat) => sum + (cat.forecastFinal || 0), 0)
    : null;
  const totalForecastVariance = totalForecastFinal !== null
    ? totalBudget - totalForecastFinal
    : null;

  const percentCommitted = totalBudget > 0 ? (totalCommitted / totalBudget) * 100 : 0;
  const percentActual = totalBudget > 0 ? (totalActuals / totalBudget) * 100 : 0;
  const percentRemaining = totalBudget > 0 ? (totalRemaining / totalBudget) * 100 : 0;

  return {
    projectId,
    tenantId,

    // Project-level summary
    summary: {
      budget: totalBudget,
      committed: totalCommitted,
      actuals: totalActuals,
      remaining: totalRemaining,
      variance: totalVariance,
      forecastFinal: totalForecastFinal,
      forecastVariance: totalForecastVariance,
      percentCommitted,
      percentActual,
      percentRemaining,
      currency: 'GBP'
    },

    // Breakdown by category
    categories: categoryCVRs
  };
}

/**
 * Create a budget transfer request between allocations
 * @param {string} tenantId
 * @param {string} fromAllocationId
 * @param {string} toAllocationId
 * @param {number} amount
 * @param {string} reason
 * @param {string} requestedBy
 * @returns {Promise<object>}
 */
async function createBudgetTransfer(
  tenantId,
  fromAllocationId,
  toAllocationId,
  amount,
  reason,
  requestedBy
) {
  // Validate allocations exist and have sufficient funds
  const fromAllocation = await prisma.budgetLineAllocation.findFirst({
    where: {
      id: fromAllocationId,
      tenantId,
      status: 'ACTIVE'
    }
  });

  const toAllocation = await prisma.budgetLineAllocation.findFirst({
    where: {
      id: toAllocationId,
      tenantId,
      status: 'ACTIVE'
    }
  });

  if (!fromAllocation || !toAllocation) {
    throw new Error('One or both allocations not found');
  }

  if (fromAllocation.budgetLineId !== toAllocation.budgetLineId) {
    throw new Error('Transfers must be between allocations in the same budget line');
  }

  if (Number(fromAllocation.allocatedAmount) < amount) {
    throw new Error('Insufficient funds in source allocation');
  }

  // Create transfer request with PENDING status
  return await prisma.budgetTransfer.create({
    data: {
      tenantId,
      fromAllocationId,
      toAllocationId,
      amount,
      currency: fromAllocation.currency,
      reason,
      status: 'PENDING',
      requestedBy
    },
    include: {
      fromAllocation: {
        include: {
          category: true
        }
      },
      toAllocation: {
        include: {
          category: true
        }
      }
    }
  });
}

/**
 * Approve a budget transfer and execute the transfer
 * @param {string} tenantId
 * @param {string} transferId
 * @param {string} approvedBy
 * @returns {Promise<object>}
 */
async function approveBudgetTransfer(tenantId, transferId, approvedBy) {
  return await prisma.$transaction(async (tx) => {
    // Get transfer request
    const transfer = await tx.budgetTransfer.findFirst({
      where: {
        id: transferId,
        tenantId,
        status: 'PENDING'
      },
      include: {
        fromAllocation: true,
        toAllocation: true
      }
    });

    if (!transfer) {
      throw new Error('Transfer not found or already processed');
    }

    // Validate sufficient funds still available
    if (Number(transfer.fromAllocation.allocatedAmount) < Number(transfer.amount)) {
      throw new Error('Insufficient funds in source allocation');
    }

    // Update allocations
    await tx.budgetLineAllocation.update({
      where: { id: transfer.fromAllocationId },
      data: {
        allocatedAmount: {
          decrement: transfer.amount
        }
      }
    });

    await tx.budgetLineAllocation.update({
      where: { id: transfer.toAllocationId },
      data: {
        allocatedAmount: {
          increment: transfer.amount
        }
      }
    });

    // Mark transfer as approved
    const approvedTransfer = await tx.budgetTransfer.update({
      where: { id: transferId },
      data: {
        status: 'APPROVED',
        approvedBy,
        approvedAt: new Date()
      },
      include: {
        fromAllocation: {
          include: {
            category: true
          }
        },
        toAllocation: {
          include: {
            category: true
          }
        }
      }
    });

    return approvedTransfer;
  });
}

/**
 * Reject a budget transfer request
 * @param {string} tenantId
 * @param {string} transferId
 * @param {string} rejectedBy
 * @param {string} rejectionReason
 * @returns {Promise<object>}
 */
async function rejectBudgetTransfer(tenantId, transferId, rejectedBy, rejectionReason) {
  const transfer = await prisma.budgetTransfer.findFirst({
    where: {
      id: transferId,
      tenantId,
      status: 'PENDING'
    }
  });

  if (!transfer) {
    throw new Error('Transfer not found or already processed');
  }

  return await prisma.budgetTransfer.update({
    where: { id: transferId },
    data: {
      status: 'REJECTED',
      approvedBy: rejectedBy,
      approvedAt: new Date(),
      rejectionReason
    },
    include: {
      fromAllocation: {
        include: {
          category: true
        }
      },
      toAllocation: {
        include: {
          category: true
        }
      }
    }
  });
}

/**
 * Get transfer history for a budget line
 * @param {string} tenantId
 * @param {number} budgetLineId
 * @returns {Promise<Array>}
 */
async function getBudgetLineTransfers(tenantId, budgetLineId) {
  return await prisma.budgetTransfer.findMany({
    where: {
      tenantId,
      OR: [
        {
          fromAllocation: {
            budgetLineId
          }
        },
        {
          toAllocation: {
            budgetLineId
          }
        }
      ]
    },
    include: {
      fromAllocation: {
        include: {
          category: true
        }
      },
      toAllocation: {
        include: {
          category: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
}

module.exports = {
  // Category management
  getCategories,
  createCategory,

  // Budget line allocations
  getBudgetLineAllocations,
  createBudgetLineAllocations,
  updateAllocationAmount,

  // CVR calculations
  calculateAllocationCVR,
  calculateBudgetLineCVRWithAllocations,
  calculateProjectCVRByCategory,

  // Budget transfers
  createBudgetTransfer,
  approveBudgetTransfer,
  rejectBudgetTransfer,
  getBudgetLineTransfers
};
