const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Get all categories for tenant
 */
async function getCategories(tenantId, includeInactive = false) {
  return await prisma.budgetCategory.findMany({
    where: {
      tenantId,
      ...(includeInactive ? {} : { isActive: true })
    },
    orderBy: { sortOrder: 'asc' }
  });
}

/**
 * Get single category by ID
 */
async function getCategoryById(categoryId, tenantId) {
  const category = await prisma.budgetCategory.findUnique({
    where: { id: categoryId }
  });

  if (!category || category.tenantId !== tenantId) {
    throw new Error('Category not found');
  }

  return category;
}

/**
 * Assign category to budget line
 */
async function assignCategoryToBudgetLine(budgetLineId, categoryId, tenantId) {
  // Verify budget line belongs to tenant
  const budgetLine = await prisma.budgetLine.findUnique({
    where: { id: parseInt(budgetLineId) }
  });

  if (!budgetLine || budgetLine.tenantId !== tenantId) {
    throw new Error('Budget line not found');
  }

  // Verify category belongs to tenant (if not null)
  if (categoryId) {
    const category = await prisma.budgetCategory.findUnique({
      where: { id: categoryId }
    });

    if (!category || category.tenantId !== tenantId) {
      throw new Error('Category not found');
    }
  }

  return await prisma.budgetLine.update({
    where: { id: parseInt(budgetLineId) },
    data: { categoryId },
    include: {
      budgetCategory: true
    }
  });
}

/**
 * Bulk assign category to multiple budget lines
 */
async function bulkAssignCategory(budgetLineIds, categoryId, tenantId) {
  // Convert string IDs to integers
  const lineIds = budgetLineIds.map(id => parseInt(id));

  // Verify all budget lines belong to tenant
  const budgetLines = await prisma.budgetLine.findMany({
    where: {
      id: { in: lineIds },
      tenantId
    }
  });

  if (budgetLines.length !== lineIds.length) {
    throw new Error('Some budget lines not found');
  }

  // Verify category belongs to tenant (if not null)
  if (categoryId) {
    const category = await prisma.budgetCategory.findUnique({
      where: { id: categoryId }
    });

    if (!category || category.tenantId !== tenantId) {
      throw new Error('Category not found');
    }
  }

  return await prisma.budgetLine.updateMany({
    where: {
      id: { in: lineIds },
      tenantId
    },
    data: { categoryId }
  });
}

/**
 * Get budget lines grouped by category for a project
 */
async function getBudgetLinesByCategory(projectId, tenantId) {
  const budgetLines = await prisma.budgetLine.findMany({
    where: {
      projectId: parseInt(projectId),
      tenantId
    },
    include: {
      budgetCategory: true,
      packageItems: {
        include: {
          package: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    },
    orderBy: [
      { budgetCategory: { sortOrder: 'asc' } },
      { code: 'asc' }
    ]
  });

  // Group by category
  const grouped = {
    categorized: {},
    uncategorized: []
  };

  budgetLines.forEach(line => {
    if (line.budgetCategory) {
      const catCode = line.budgetCategory.code;
      if (!grouped.categorized[catCode]) {
        grouped.categorized[catCode] = {
          category: line.budgetCategory,
          lines: [],
          totalAmount: 0
        };
      }
      grouped.categorized[catCode].lines.push(line);
      grouped.categorized[catCode].totalAmount += parseFloat(line.amount);
    } else {
      grouped.uncategorized.push(line);
    }
  });

  return grouped;
}

/**
 * Get CVR summary by category for a project
 */
async function getCategoryCVRSummary(projectId, tenantId) {
  const budgetLines = await prisma.budgetLine.findMany({
    where: {
      projectId: parseInt(projectId),
      tenantId
    },
    include: {
      budgetCategory: true,
      cvrCommitments: {
        where: { status: 'ACTIVE' }
      },
      cvrActuals: {
        where: { status: { in: ['ACCRUED', 'PAID'] } }
      }
    }
  });

  // Group by category and calculate CVR
  const categoryMap = new Map();

  budgetLines.forEach(line => {
    const catCode = line.budgetCategory?.code || 'UNCATEGORIZED';
    const catName = line.budgetCategory?.name || 'Uncategorized';
    const catColor = line.budgetCategory?.color || '#ef4444';

    if (!categoryMap.has(catCode)) {
      categoryMap.set(catCode, {
        categoryCode: catCode,
        categoryName: catName,
        color: catColor,
        budget: 0,
        committed: 0,
        actual: 0,
        lineCount: 0
      });
    }

    const cat = categoryMap.get(catCode);
    cat.budget += parseFloat(line.amount);
    cat.committed += line.cvrCommitments.reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);
    cat.actual += line.cvrActuals.reduce((sum, a) => sum + parseFloat(a.amount || 0), 0);
    cat.lineCount++;
  });

  const summary = Array.from(categoryMap.values()).map(cat => ({
    ...cat,
    remaining: cat.budget - cat.committed,
    variance: cat.budget - cat.actual,
    utilizationPct: cat.budget > 0 ? (cat.committed / cat.budget) * 100 : 0
  }));

  // Sort by category code (uncategorized last)
  summary.sort((a, b) => {
    if (a.categoryCode === 'UNCATEGORIZED') return 1;
    if (b.categoryCode === 'UNCATEGORIZED') return -1;
    return a.categoryCode.localeCompare(b.categoryCode);
  });

  return summary;
}

module.exports = {
  getCategories,
  getCategoryById,
  assignCategoryToBudgetLine,
  bulkAssignCategory,
  getBudgetLinesByCategory,
  getCategoryCVRSummary
};
