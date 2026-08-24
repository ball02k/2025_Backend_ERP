/**
 * Retention Service (Task 3.4)
 *
 * Service for calculating and managing retention held by Main Contractor
 * Handles retention lifecycle, forecasting, and release calculations
 */

const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

function daysUntil(date) {
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get complete retention position for a project
 * @param {number} projectId - Project ID
 * @param {string} tenantId - Tenant ID for security
 * @returns {Promise<Object>} Complete retention position
 */
async function getRetentionPosition(projectId, tenantId) {
  // Fetch project with upstream contract
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    include: {
      upstreamContract: {
        include: {
          retentionReleases: {
            orderBy: { createdAt: 'asc' }
          },
          retentionBonds: {
            where: { status: 'ACTIVE' }
          }
        }
      }
    }
  });

  if (!project) {
    throw new Error('Project not found');
  }

  if (!project.upstreamContract) {
    return emptyRetentionPosition(project);
  }

  const upstreamContract = project.upstreamContract;

  // Fetch all payment certificates with retention data
  const certificates = await prisma.paymentCertificate.findMany({
    where: {
      projectId,
      tenantId,
      status: { not: 'CANCELLED' }
    },
    orderBy: { certificateNumber: 'asc' },
    select: {
      id: true,
      certificateNumber: true,
      certificateDate: true,
      netCertified: true,
      retentionHeldThisCert: true,
      retentionReleasedThisCert: true,
      cumulativeRetentionHeld: true
    }
  });

  // Calculate cumulative retention from certificates
  let retentionData = calculateCumulatives(certificates);

  // Apply retention cap if specified
  if (upstreamContract.retentionCap && upstreamContract.retentionCap > 0) {
    retentionData = applyRetentionCap(retentionData, upstreamContract);
  }

  // Get all releases (past and claimed)
  const releases = upstreamContract.retentionReleases || [];
  const totalReleased = releases.reduce((sum, r) => {
    return sum + (r.releaseAmount ? parseFloat(r.releaseAmount) : 0);
  }, 0);

  // Get active bonds
  const activeBonds = upstreamContract.retentionBonds || [];
  const totalBondSubstitution = activeBonds.reduce((sum, b) => {
    return sum + parseFloat(b.bondAmount);
  }, 0);

  // Calculate current position
  const currentlyHeld = Math.max(0, retentionData.totalRetentionHeld - totalReleased - totalBondSubstitution);

  // Forecast future retention
  const forecast = forecastRetention(project, upstreamContract, retentionData, currentlyHeld);

  // Determine milestone status
  const milestoneStatus = getMilestoneStatus(project, upstreamContract);

  // Build certificate breakdown
  const certificateBreakdown = retentionData.certificates.map(cert => ({
    certificateId: cert.id,
    certificateNumber: cert.certificateNumber,
    certificateDate: cert.certificateDate,
    netCertified: parseFloat(cert.netCertified),
    retentionHeld: parseFloat(cert.retentionHeldThisCert || 0),
    retentionReleased: parseFloat(cert.retentionReleasedThisCert || 0),
    cumulativeRetention: parseFloat(cert.cumulativeRetentionHeld || 0)
  }));

  return {
    summary: {
      totalRetentionHeld: retentionData.totalRetentionHeld,
      totalReleased,
      totalBondSubstitution,
      currentlyHeld,
      retentionPercentage: parseFloat(upstreamContract.retentionPercentage || 0),
      retentionCap: upstreamContract.retentionCap ? parseFloat(upstreamContract.retentionCap) : null
    },
    milestones: milestoneStatus,
    forecast,
    certificateBreakdown,
    releases: releases.map(r => ({
      id: r.id,
      releaseType: r.releaseType,
      releaseAmount: parseFloat(r.releaseAmount),
      retentionBefore: parseFloat(r.retentionBefore),
      retentionAfter: parseFloat(r.retentionAfter),
      releaseDate: r.releaseDate,
      expectedDate: r.expectedDate,
      requestedDate: r.requestedDate,
      claimStatus: r.claimStatus,
      claimReference: r.claimReference,
      paymentReceivedDate: r.paymentReceivedDate,
      paymentAmount: r.paymentAmount ? parseFloat(r.paymentAmount) : null,
      notes: r.notes
    })),
    bonds: activeBonds.map(b => ({
      id: b.id,
      bondProvider: b.bondProvider,
      bondReference: b.bondReference,
      bondAmount: parseFloat(b.bondAmount),
      bondType: b.bondType,
      issueDate: b.issueDate,
      expiryDate: b.expiryDate,
      status: b.status
    }))
  };
}

function emptyRetentionPosition(project) {
  const practicalCompletionDate =
    project.practicalCompletionDate ||
    project.actualCompletionDate ||
    project.endActual ||
    project.endPlanned ||
    null;

  return {
    summary: {
      totalRetentionHeld: 0,
      totalReleased: 0,
      totalBondSubstitution: 0,
      currentlyHeld: 0,
      retentionPercentage: Number(project.retentionPct || 0),
      retentionCap: null
    },
    milestones: {
      practicalCompletion: {
        date: practicalCompletionDate,
        reached: Boolean(project.practicalCompletionDate || project.actualCompletionDate || project.endActual),
        daysUntil: practicalCompletionDate ? daysUntil(practicalCompletionDate) : null
      },
      defectsLiability: {
        date: null,
        reached: false,
        daysUntil: null
      }
    },
    forecast: {
      pcRelease: null,
      dlpRelease: null,
      totalForecast: 0
    },
    certificateBreakdown: [],
    releases: [],
    bonds: [],
    notConfigured: true
  };
}

/**
 * Calculate cumulative retention from certificates
 * @param {Array} certificates - Payment certificates
 * @returns {Object} Retention data with cumulatives
 */
function calculateCumulatives(certificates) {
  let totalRetentionHeld = 0;
  let totalRetentionReleased = 0;

  certificates.forEach(cert => {
    totalRetentionHeld += parseFloat(cert.retentionHeldThisCert || 0);
    totalRetentionReleased += parseFloat(cert.retentionReleasedThisCert || 0);
  });

  return {
    totalRetentionHeld,
    totalRetentionReleased,
    certificates
  };
}

/**
 * Apply retention cap to retention data
 * @param {Object} retentionData - Current retention data
 * @param {Object} upstreamContract - Upstream contract with cap
 * @returns {Object} Adjusted retention data
 */
function applyRetentionCap(retentionData, upstreamContract) {
  const cap = parseFloat(upstreamContract.retentionCap);

  if (retentionData.totalRetentionHeld > cap) {
    // Cap has been reached
    return {
      ...retentionData,
      totalRetentionHeld: cap,
      cappedAt: cap,
      excessRetention: retentionData.totalRetentionHeld - cap
    };
  }

  return retentionData;
}

/**
 * Forecast retention releases based on project milestones
 * @param {Object} project - Project with milestone dates
 * @param {Object} upstreamContract - Upstream contract
 * @param {Object} retentionData - Current retention data
 * @param {number} currentlyHeld - Current retention held
 * @returns {Object} Forecast data
 */
function forecastRetention(project, upstreamContract, retentionData, currentlyHeld) {
  const forecast = {
    pcRelease: null,
    dlpRelease: null,
    totalForecast: 0
  };

  // Check if we have milestone dates
  const pcDate = project.practicalCompletionDate;
  const dlpDate = project.defectsLiabilityEndDate;

  // Calculate PC release (typically 50%)
  if (pcDate) {
    const pcReleasePercent = upstreamContract.retentionPcReleasePercent || 50;
    const pcReleaseAmount = (currentlyHeld * pcReleasePercent) / 100;

    forecast.pcRelease = {
      expectedDate: pcDate,
      releasePercent: pcReleasePercent,
      estimatedAmount: pcReleaseAmount,
      status: isPastDate(pcDate) ? 'OVERDUE' : 'FORECAST'
    };

    forecast.totalForecast += pcReleaseAmount;
  }

  // Calculate DLP release (remaining retention)
  if (dlpDate) {
    const pcReleasePercent = upstreamContract.retentionPcReleasePercent || 50;
    const dlpReleasePercent = 100 - pcReleasePercent;
    const dlpReleaseAmount = (currentlyHeld * dlpReleasePercent) / 100;

    forecast.dlpRelease = {
      expectedDate: dlpDate,
      releasePercent: dlpReleasePercent,
      estimatedAmount: dlpReleaseAmount,
      status: isPastDate(dlpDate) ? 'OVERDUE' : 'FORECAST'
    };

    forecast.totalForecast += dlpReleaseAmount;
  }

  return forecast;
}

/**
 * Calculate release amount based on type and percentage
 * @param {number} currentlyHeld - Current retention held
 * @param {string} releaseType - Release type (PC_RELEASE, DLP_RELEASE, etc.)
 * @param {number} percentage - Percentage to release (optional)
 * @returns {number} Release amount
 */
function calculateReleaseAmount(currentlyHeld, releaseType, percentage = null) {
  if (releaseType === 'PC_RELEASE') {
    return (currentlyHeld * (percentage || 50)) / 100;
  }

  if (releaseType === 'DLP_RELEASE') {
    // DLP releases remaining retention
    return currentlyHeld;
  }

  if (releaseType === 'EARLY_RELEASE' && percentage) {
    return (currentlyHeld * percentage) / 100;
  }

  if (releaseType === 'BOND_SUBSTITUTION') {
    // Bond substitution releases all or specified amount
    return currentlyHeld;
  }

  return 0;
}

/**
 * Get milestone status for project
 * @param {Object} project - Project with dates
 * @param {Object} upstreamContract - Upstream contract
 * @returns {Object} Milestone status
 */
function getMilestoneStatus(project, upstreamContract) {
  const pcDate = project.practicalCompletionDate;
  const dlpDate = project.defectsLiabilityEndDate;
  const now = new Date();

  return {
    practicalCompletion: {
      date: pcDate,
      reached: pcDate ? isPastDate(pcDate) : false,
      daysUntil: pcDate ? daysBetween(now, new Date(pcDate)) : null
    },
    defectsLiability: {
      date: dlpDate,
      reached: dlpDate ? isPastDate(dlpDate) : false,
      daysUntil: dlpDate ? daysBetween(now, new Date(dlpDate)) : null
    }
  };
}

/**
 * Get tenant-wide retention register (all projects)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Retention register for all projects
 */
async function getTenantRetentionRegister(tenantId) {
  const projects = await prisma.project.findMany({
    where: {
      tenantId,
      status: { not: 'CLOSED' }
    },
    include: {
      upstreamContract: {
        include: {
          retentionReleases: true,
          retentionBonds: {
            where: { status: 'ACTIVE' }
          }
        }
      }
    }
  });

  const register = [];

  for (const project of projects) {
    if (!project.upstreamContract) continue;

    try {
      const position = await getRetentionPosition(project.id, tenantId);

      register.push({
        projectId: project.id,
        projectName: project.name,
        projectReference: project.projectReference,
        mainContractor: project.upstreamContract.contractorName,
        contractValue: parseFloat(project.upstreamContract.contractValue || 0),
        retentionHeld: position.summary.currentlyHeld,
        retentionPercentage: position.summary.retentionPercentage,
        pcDate: project.practicalCompletionDate,
        dlpDate: project.defectsLiabilityEndDate,
        pcReleaseStatus: position.forecast.pcRelease?.status || 'PENDING',
        dlpReleaseStatus: position.forecast.dlpRelease?.status || 'PENDING',
        pcReleaseForecast: position.forecast.pcRelease?.estimatedAmount || 0,
        dlpReleaseForecast: position.forecast.dlpRelease?.estimatedAmount || 0,
        activeBonds: position.bonds.length,
        totalBondAmount: position.summary.totalBondSubstitution
      });
    } catch (error) {
      console.error(`Error calculating retention for project ${project.id}:`, error);
    }
  }

  return register;
}

/**
 * Create retention release claim
 * @param {Object} data - Release claim data
 * @returns {Promise<Object>} Created release
 */
async function createRetentionRelease(data) {
  const { projectId, tenantId, releaseType, releaseAmount, requestedDate, notes, documentUrl, createdById } = data;

  // Get current retention position
  const position = await getRetentionPosition(projectId, tenantId);
  const currentlyHeld = position.summary.currentlyHeld;

  // Validate release amount
  if (releaseAmount > currentlyHeld) {
    throw new Error(`Release amount (£${releaseAmount}) exceeds currently held retention (£${currentlyHeld})`);
  }

  // Get upstream contract
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    include: { upstreamContract: true }
  });

  if (!project?.upstreamContract) {
    throw new Error('No upstream contract found');
  }

  // Create release record
  const release = await prisma.upstreamRetentionRelease.create({
    data: {
      tenantId,
      projectId,
      upstreamContractId: project.upstreamContract.id,
      releaseType,
      releaseAmount: new Prisma.Decimal(releaseAmount),
      retentionBefore: new Prisma.Decimal(currentlyHeld),
      retentionAfter: new Prisma.Decimal(currentlyHeld - releaseAmount),
      requestedDate: requestedDate ? new Date(requestedDate) : new Date(),
      claimStatus: 'CLAIMED',
      claimSubmittedAt: new Date(),
      notes,
      documentUrl,
      createdById
    }
  });

  return release;
}

/**
 * Update retention release
 * @param {string} releaseId - Release ID
 * @param {string} tenantId - Tenant ID
 * @param {Object} updates - Updates to apply
 * @returns {Promise<Object>} Updated release
 */
async function updateRetentionRelease(releaseId, tenantId, updates) {
  const release = await prisma.upstreamRetentionRelease.findFirst({
    where: { id: releaseId, tenantId }
  });

  if (!release) {
    throw new Error('Retention release not found');
  }

  // Build update data
  const updateData = {};

  if (updates.claimStatus) updateData.claimStatus = updates.claimStatus;
  if (updates.claimReference) updateData.claimReference = updates.claimReference;
  if (updates.releaseDate) updateData.releaseDate = new Date(updates.releaseDate);
  if (updates.paymentReceivedDate) updateData.paymentReceivedDate = new Date(updates.paymentReceivedDate);
  if (updates.paymentAmount) updateData.paymentAmount = new Prisma.Decimal(updates.paymentAmount);
  if (updates.paymentReference) updateData.paymentReference = updates.paymentReference;
  if (updates.notes) updateData.notes = updates.notes;

  const updated = await prisma.upstreamRetentionRelease.update({
    where: { id: releaseId },
    data: updateData
  });

  return updated;
}

/**
 * Create retention bond
 * @param {Object} data - Bond data
 * @returns {Promise<Object>} Created bond
 */
async function createRetentionBond(data) {
  const { projectId, tenantId, bondProvider, bondReference, bondAmount, bondType, issueDate, expiryDate, bondDocumentUrl } = data;

  // Get upstream contract
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    include: { upstreamContract: true }
  });

  if (!project?.upstreamContract) {
    throw new Error('No upstream contract found');
  }

  const bond = await prisma.upstreamRetentionBond.create({
    data: {
      tenantId,
      projectId,
      upstreamContractId: project.upstreamContract.id,
      bondProvider,
      bondReference,
      bondAmount: new Prisma.Decimal(bondAmount),
      bondType,
      issueDate: new Date(issueDate),
      expiryDate: new Date(expiryDate),
      status: 'ACTIVE',
      bondDocumentUrl
    }
  });

  return bond;
}

/**
 * Helper: Check if date is in the past
 */
function isPastDate(date) {
  return new Date(date) < new Date();
}

/**
 * Helper: Calculate days between two dates
 */
function daysBetween(date1, date2) {
  const diffTime = date2 - date1;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

module.exports = {
  getRetentionPosition,
  calculateCumulatives,
  applyRetentionCap,
  forecastRetention,
  calculateReleaseAmount,
  getMilestoneStatus,
  getTenantRetentionRegister,
  createRetentionRelease,
  updateRetentionRelease,
  createRetentionBond
};
