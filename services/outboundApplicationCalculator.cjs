/**
 * Outbound Application Calculator (Task 2.5)
 *
 * Calculates retention, MCD, and totals for OUTBOUND payment applications
 * (when subcontractor raises application to Main Contractor)
 */

const { prisma, Prisma } = require('../lib/prisma.js');
const { addDays } = require('date-fns/addDays');

/**
 * Calculate outbound payment application
 *
 * @param {Object} input
 * @param {string} input.tenantId - Tenant ID
 * @param {string} input.upstreamContractId - Upstream contract ID
 * @param {number} input.projectId - Project ID
 * @param {Array<{budgetLineId: number, thisPeriod: number}>} input.lineItems - Line items with values
 * @returns {Promise<Object>} Calculated result with line items and summary
 */
async function calculateOutboundApplication(input) {
  const { tenantId, upstreamContractId, projectId, lineItems } = input;

  // Get upstream contract terms
  const upstreamContract = await prisma.upstreamContract.findFirst({
    where: {
      id: upstreamContractId,
      tenantId
    },
    select: {
      contractValue: true,
      retentionPercentage: true,
      retentionCap: true,
      retentionCapAuto: true,
      mainContractorDiscount: true,
      paymentTermsDays: true
    }
  });

  if (!upstreamContract) {
    throw new Error('Upstream contract not found');
  }

  // Get all budget lines for this project
  const budgetLineIds = lineItems.map(li => li.budgetLineId);
  const budgetLines = await prisma.budgetLine.findMany({
    where: {
      id: { in: budgetLineIds },
      tenantId,
      projectId
    },
    select: {
      id: true,
      code: true,
      description: true,
      total: true
    }
  });

  // Create lookup map
  const budgetLineMap = new Map(budgetLines.map(bl => [bl.id, bl]));

  // Get all previous applications to calculate cumulative values
  const previousApps = await prisma.applicationForPayment.findMany({
    where: {
      tenantId,
      projectId,
      direction: 'OUTBOUND',
      status: { not: 'CANCELLED' }
    },
    include: {
      lineItemDetails: {
        where: {
          budgetLineId: { in: budgetLineIds }
        },
        select: {
          budgetLineId: true,
          valueCumulative: true
        }
      }
    },
    orderBy: {
      applicationNumber: 'desc'
    }
  });

  // Build previous cumulative map from most recent application
  const previousCumulativeMap = new Map();
  if (previousApps.length > 0) {
    const latestApp = previousApps[0];
    latestApp.lineItemDetails.forEach(item => {
      if (item.budgetLineId) {
        previousCumulativeMap.set(item.budgetLineId, Number(item.valueCumulative || 0));
      }
    });
  }

  // Calculate line items
  const warnings = [];
  const calculatedLines = [];
  let grossThisPeriod = 0;
  let grossPrevious = 0;

  for (const lineItem of lineItems) {
    const budgetLine = budgetLineMap.get(lineItem.budgetLineId);
    if (!budgetLine) {
      warnings.push(`Budget line ID ${lineItem.budgetLineId} not found`);
      continue;
    }

    const contractValue = Number(budgetLine.total || 0);
    const previousCumulative = previousCumulativeMap.get(lineItem.budgetLineId) || 0;
    const thisPeriod = Number(lineItem.thisPeriod || 0);
    const cumulativeToDate = previousCumulative + thisPeriod;
    const remainingValue = contractValue - cumulativeToDate;
    const percentageComplete = contractValue > 0 ? (cumulativeToDate / contractValue) * 100 : 0;

    // Check for over-application
    if (cumulativeToDate > contractValue) {
      warnings.push(
        `${budgetLine.code || budgetLine.description}: Over-application by £${(cumulativeToDate - contractValue).toFixed(2)} ` +
        `(${percentageComplete.toFixed(1)}% of contract value)`
      );
    }

    calculatedLines.push({
      budgetLineId: lineItem.budgetLineId,
      reference: budgetLine.code,
      description: budgetLine.description,
      contractValue,
      previousCumulative,
      thisPeriod,
      cumulativeToDate,
      remainingValue,
      percentageComplete: Math.round(percentageComplete * 10) / 10
    });

    grossThisPeriod += thisPeriod;
    grossPrevious += previousCumulative;
  }

  const grossCumulative = grossPrevious + grossThisPeriod;

  // Calculate retention
  const retentionPercentage = Number(upstreamContract.retentionPercentage || 0);
  const retentionCap = upstreamContract.retentionCapAuto
    ? Number(upstreamContract.contractValue) * (retentionPercentage / 100)
    : Number(upstreamContract.retentionCap || 0);

  const retentionThisPeriod = (grossThisPeriod * retentionPercentage) / 100;
  const retentionCumulativeUncapped = (grossCumulative * retentionPercentage) / 100;
  const retentionCumulative = Math.min(retentionCumulativeUncapped, retentionCap);
  const retentionHeldToDate = retentionCumulative;

  // Calculate MCD (Main Contractor Discount)
  const mcdPercentage = Number(upstreamContract.mainContractorDiscount || 0);
  const mcdThisPeriod = (grossThisPeriod * mcdPercentage) / 100;
  const mcdCumulative = (grossCumulative * mcdPercentage) / 100;

  // Calculate net
  const netThisPeriod = grossThisPeriod - retentionThisPeriod - mcdThisPeriod;
  const netCumulative = grossCumulative - retentionCumulative - mcdCumulative;

  // Check if total exceeds contract value
  if (grossCumulative > Number(upstreamContract.contractValue)) {
    warnings.push(
      `Total application (£${grossCumulative.toFixed(2)}) exceeds contract value ` +
      `(£${Number(upstreamContract.contractValue).toFixed(2)})`
    );
  }

  return {
    lineItems: calculatedLines,
    summary: {
      grossThisPeriod: Math.round(grossThisPeriod * 100) / 100,
      grossCumulative: Math.round(grossCumulative * 100) / 100,
      grossPrevious: Math.round(grossPrevious * 100) / 100,
      retentionPercentage,
      retentionThisPeriod: Math.round(retentionThisPeriod * 100) / 100,
      retentionCumulative: Math.round(retentionCumulative * 100) / 100,
      retentionHeldToDate: Math.round(retentionHeldToDate * 100) / 100,
      retentionCap: Math.round(retentionCap * 100) / 100,
      mcdPercentage,
      mcdThisPeriod: Math.round(mcdThisPeriod * 100) / 100,
      mcdCumulative: Math.round(mcdCumulative * 100) / 100,
      netThisPeriod: Math.round(netThisPeriod * 100) / 100,
      netCumulative: Math.round(netCumulative * 100) / 100,
      contractValue: Number(upstreamContract.contractValue),
      percentageComplete: Number(upstreamContract.contractValue) > 0
        ? Math.round((grossCumulative / Number(upstreamContract.contractValue)) * 1000) / 10
        : 0
    },
    paymentTerms: {
      paymentTermsDays: upstreamContract.paymentTermsDays || 30
    },
    warnings
  };
}

/**
 * Get next application number for outbound applications
 */
async function getNextApplicationNumber(tenantId, projectId) {
  const lastApp = await prisma.applicationForPayment.findFirst({
    where: {
      tenantId,
      projectId,
      direction: 'OUTBOUND'
    },
    orderBy: {
      applicationNumber: 'desc'
    },
    select: {
      applicationNumber: true
    }
  });

  return (lastApp?.applicationNumber || 0) + 1;
}

/**
 * Prepare data for new outbound application
 */
async function prepareNewOutboundApplication(tenantId, projectId) {
  // Get project with upstream contract
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      tenantId
    },
    select: {
      id: true,
      name: true,
      upstreamContract: {
        select: {
          id: true,
          contractValue: true,
          retentionPercentage: true,
          retentionCap: true,
          mainContractorDiscount: true,
          mainContractorId: true,
          paymentTermsDays: true,
          mainContractor: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  });

  if (!project) {
    throw new Error('Project not found');
  }

  if (!project.upstreamContract) {
    throw new Error('No upstream contract found for this project');
  }

  // Get next application number
  const applicationNumber = await getNextApplicationNumber(tenantId, projectId);

  // Get budget lines with their previous cumulative values
  const budgetLines = await prisma.budgetLine.findMany({
    where: {
      tenantId,
      projectId
    },
    select: {
      id: true,
      code: true,
      description: true,
      total: true,
      unit: true
    },
    orderBy: [
      { code: 'asc' },
      { sortOrder: 'asc' }
    ]
  });

  // Get previous application for cumulative tracking
  const previousApp = await prisma.applicationForPayment.findFirst({
    where: {
      tenantId,
      projectId,
      direction: 'OUTBOUND',
      status: { not: 'CANCELLED' }
    },
    include: {
      lineItemDetails: {
        select: {
          budgetLineId: true,
          valueCumulative: true
        }
      }
    },
    orderBy: {
      applicationNumber: 'desc'
    }
  });

  // Build previous cumulative map
  const previousCumulativeMap = new Map();
  if (previousApp) {
    previousApp.lineItemDetails.forEach(item => {
      if (item.budgetLineId) {
        previousCumulativeMap.set(item.budgetLineId, Number(item.valueCumulative || 0));
      }
    });
  }

  // Enrich budget lines with previous values
  const enrichedBudgetLines = budgetLines.map(line => {
    const contractValue = Number(line.total || 0);
    const previousCumulative = previousCumulativeMap.get(line.id) || 0;
    const remainingValue = contractValue - previousCumulative;
    const percentageComplete = contractValue > 0 ? (previousCumulative / contractValue) * 100 : 0;

    return {
      id: line.id,
      reference: line.code,
      description: line.description,
      contractValue,
      previousCumulative,
      remainingValue,
      percentageComplete: Math.round(percentageComplete * 10) / 10,
      unit: line.unit
    };
  });

  // Get suggested period (current month)
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const valuationDate = now;

  return {
    applicationNumber,
    suggestedPeriod: {
      start: periodStart.toISOString().split('T')[0],
      end: periodEnd.toISOString().split('T')[0],
      valuationDate: valuationDate.toISOString().split('T')[0]
    },
    upstreamContract: {
      id: project.upstreamContract.id,
      contractValue: Number(project.upstreamContract.contractValue),
      retentionPercentage: Number(project.upstreamContract.retentionPercentage),
      mainContractorDiscount: Number(project.upstreamContract.mainContractorDiscount),
      recipientName: project.upstreamContract.mainContractor?.name || 'Main Contractor',
      paymentTermsDays: project.upstreamContract.paymentTermsDays || 30
    },
    budgetLines: enrichedBudgetLines,
    previousApplication: previousApp ? {
      number: previousApp.applicationNumber,
      grossCumulative: Number(previousApp.claimedGrossValue || 0),
      status: previousApp.status
    } : null
  };
}

module.exports = {
  calculateOutboundApplication,
  getNextApplicationNumber,
  prepareNewOutboundApplication
};
