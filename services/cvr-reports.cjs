/**
 * CVR Report Service
 *
 * Manages CVR period reports for financial tracking and approvals.
 * British English: "realise", "organise", "summarise"
 *
 * Workflow: IN_PROGRESS → SUBMITTED → APPROVED / REJECTED → IN_PROGRESS (if rejected)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cvrService = require('./cvr.cjs');

/**
 * Create a new CVR report
 */
async function createReport({
  tenantId,
  projectId,
  reportDate,
  periodEnd,
  reportType, // 'MONTHLY', 'QUARTERLY', 'YEAR_END', 'AD_HOC'
  createdBy,
}) {
  // Get current CVR data for the project
  const summary = await cvrService.getCVRSummaryEnhanced(tenantId, projectId);
  const byBudgetLine = await cvrService.getCVRByBudgetLine(tenantId, projectId);

  // Store as snapshot
  const snapshotData = {
    reportDate: new Date(reportDate),
    periodEnd: new Date(periodEnd),
    summary,
    byBudgetLine,
    generatedAt: new Date(),
  };

  const report = await prisma.cVRReport.create({
    data: {
      tenantId,
      projectId,
      reportDate: new Date(reportDate),
      periodEnd: new Date(periodEnd),
      reportType,
      status: 'IN_PROGRESS',
      snapshotData,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          number: true,
        },
      },
    },
  });

  return report;
}

/**
 * Get a single report by ID
 */
async function getReportById(tenantId, reportId) {
  const report = await prisma.cVRReport.findFirst({
    where: {
      id: reportId,
      tenantId,
      is_deleted: false,
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          number: true,
        },
      },
    },
  });

  if (!report) {
    throw new Error('CVR report not found');
  }

  return report;
}

/**
 * List reports for a project
 */
async function listReports({
  tenantId,
  projectId,
  reportType = null,
  status = null,
  limit = 100,
  offset = 0,
}) {
  const where = {
    tenantId,
    projectId,
    is_deleted: false,
  };

  if (reportType) {
    where.reportType = reportType;
  }

  if (status) {
    where.status = status;
  }

  const [reports, total] = await Promise.all([
    prisma.cVRReport.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            number: true,
          },
        },
      },
      orderBy: [
        { periodEnd: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
      skip: offset,
    }),
    prisma.cVRReport.count({ where }),
  ]);

  return {
    reports,
    total,
    limit,
    offset,
  };
}

/**
 * Update report (only if status is IN_PROGRESS)
 */
async function updateReport(tenantId, reportId, updates) {
  // Check current status
  const current = await prisma.cVRReport.findFirst({
    where: { id: reportId, tenantId, is_deleted: false },
    select: { status: true, projectId: true },
  });

  if (!current) {
    throw new Error('CVR report not found');
  }

  if (current.status !== 'IN_PROGRESS') {
    throw new Error('Can only update reports in IN_PROGRESS status');
  }

  // If refreshing snapshot data, get latest CVR
  if (updates.refreshSnapshot) {
    const summary = await cvrService.getCVRSummaryEnhanced(tenantId, current.projectId);
    const byBudgetLine = await cvrService.getCVRByBudgetLine(tenantId, current.projectId);

    updates.snapshotData = {
      reportDate: updates.reportDate || current.reportDate,
      periodEnd: updates.periodEnd || current.periodEnd,
      summary,
      byBudgetLine,
      generatedAt: new Date(),
    };

    delete updates.refreshSnapshot;
  }

  const report = await prisma.cVRReport.update({
    where: { id: reportId },
    data: {
      ...updates,
      updatedAt: new Date(),
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          number: true,
        },
      },
    },
  });

  return report;
}

/**
 * Update report status
 * Workflow: IN_PROGRESS → SUBMITTED → APPROVED / REJECTED
 * Can return to IN_PROGRESS if REJECTED
 */
async function updateReportStatus(
  tenantId,
  reportId,
  newStatus,
  userId,
  comments = ''
) {
  const current = await prisma.cVRReport.findFirst({
    where: { id: reportId, tenantId, is_deleted: false },
  });

  if (!current) {
    throw new Error('CVR report not found');
  }

  // Validate status transitions
  const validTransitions = {
    IN_PROGRESS: ['SUBMITTED'],
    SUBMITTED: ['APPROVED', 'REJECTED', 'IN_PROGRESS'], // Can return to draft
    APPROVED: [], // Terminal state (unless reopened manually)
    REJECTED: ['IN_PROGRESS'], // Can be reworked
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

  // Set timestamp and user fields based on status
  if (newStatus === 'SUBMITTED') {
    updateData.submittedDate = new Date();
    updateData.submittedBy = userId;
  } else if (newStatus === 'APPROVED') {
    updateData.approvedDate = new Date();
    updateData.approvedBy = userId;
  } else if (newStatus === 'REJECTED') {
    updateData.rejectedDate = new Date();
    updateData.rejectedBy = userId;
    if (comments) {
      updateData.rejectionReason = comments;
    }
  }

  if (comments) {
    updateData.comments = comments;
  }

  const report = await prisma.cVRReport.update({
    where: { id: reportId },
    data: updateData,
    include: {
      project: {
        select: {
          id: true,
          name: true,
          number: true,
        },
      },
    },
  });

  return report;
}

/**
 * Delete a report (soft delete, only if IN_PROGRESS)
 */
async function deleteReport(tenantId, reportId) {
  const current = await prisma.cVRReport.findFirst({
    where: { id: reportId, tenantId, is_deleted: false },
    select: { status: true },
  });

  if (!current) {
    throw new Error('CVR report not found');
  }

  if (current.status !== 'IN_PROGRESS') {
    throw new Error('Can only delete reports in IN_PROGRESS status');
  }

  await prisma.cVRReport.update({
    where: { id: reportId },
    data: {
      is_deleted: true,
      updatedAt: new Date(),
    },
  });

  return { success: true };
}

/**
 * Get report summary for a project
 * Returns counts by status and recent reports
 */
async function getProjectReportSummary(tenantId, projectId) {
  const reports = await prisma.cVRReport.findMany({
    where: {
      tenantId,
      projectId,
      is_deleted: false,
    },
    select: {
      id: true,
      status: true,
      reportType: true,
      periodEnd: true,
    },
    orderBy: {
      periodEnd: 'desc',
    },
  });

  const summary = {
    inProgressCount: 0,
    submittedCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    totalReports: reports.length,
    latestApproved: null,
    latestSubmitted: null,
  };

  for (const report of reports) {
    if (report.status === 'IN_PROGRESS') {
      summary.inProgressCount++;
    } else if (report.status === 'SUBMITTED') {
      summary.submittedCount++;
      if (!summary.latestSubmitted) {
        summary.latestSubmitted = report;
      }
    } else if (report.status === 'APPROVED') {
      summary.approvedCount++;
      if (!summary.latestApproved) {
        summary.latestApproved = report;
      }
    } else if (report.status === 'REJECTED') {
      summary.rejectedCount++;
    }
  }

  return summary;
}

/**
 * Compare two approved reports to show movement
 */
async function compareReports(tenantId, fromReportId, toReportId) {
  const [fromReport, toReport] = await Promise.all([
    getReportById(tenantId, fromReportId),
    getReportById(tenantId, toReportId),
  ]);

  if (fromReport.projectId !== toReport.projectId) {
    throw new Error('Reports must be from the same project');
  }

  // Extract snapshots
  const fromSnapshot = fromReport.snapshotData;
  const toSnapshot = toReport.snapshotData;

  // Calculate movements
  const movement = {
    fromPeriod: fromReport.periodEnd,
    toPeriod: toReport.periodEnd,
    budgetMovement: (toSnapshot.summary?.budget || 0) - (fromSnapshot.summary?.budget || 0),
    committedMovement: (toSnapshot.summary?.committed || 0) - (fromSnapshot.summary?.committed || 0),
    actualMovement: (toSnapshot.summary?.actuals || 0) - (fromSnapshot.summary?.actuals || 0),
    remainingMovement: (toSnapshot.summary?.remaining || 0) - (fromSnapshot.summary?.remaining || 0),
    forecastMovement: (toSnapshot.summary?.forecastFinal || 0) - (fromSnapshot.summary?.forecastFinal || 0),
  };

  return {
    fromReport: {
      id: fromReport.id,
      periodEnd: fromReport.periodEnd,
      summary: fromSnapshot.summary,
    },
    toReport: {
      id: toReport.id,
      periodEnd: toReport.periodEnd,
      summary: toSnapshot.summary,
    },
    movement,
  };
}

module.exports = {
  createReport,
  getReportById,
  listReports,
  updateReport,
  updateReportStatus,
  deleteReport,
  getProjectReportSummary,
  compareReports,
};
