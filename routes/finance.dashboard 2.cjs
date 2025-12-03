const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const requireFinanceRole = require('../middleware/requireFinanceRole.cjs');
const { prisma } = require('../utils/prisma.cjs');

router.use(requireAuth);
router.use(requireFinanceRole);

/**
 * GET /api/finance/dashboard-summary
 * Company-wide Finance dashboard summary
 * Shows portfolio-wide metrics across ALL projects
 */
router.get('/finance/dashboard-summary', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    // Get all contracts for this tenant
    const contracts = await prisma.contract.findMany({
      where: { tenantId },
      select: {
        id: true,
        value: true,
        totalCertifiedToDate: true,
        totalPaidToDate: true,
        retentionHeld: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Calculate portfolio totals
    const totalContractValue = contracts.reduce((sum, c) => sum + Number(c.value || 0), 0);
    const totalCertified = contracts.reduce((sum, c) => sum + Number(c.totalCertifiedToDate || 0), 0);
    const totalPaid = contracts.reduce((sum, c) => sum + Number(c.totalPaidToDate || 0), 0);
    const outstandingPayables = totalCertified - totalPaid;
    const totalRetention = contracts.reduce((sum, c) => sum + Number(c.retentionHeld || 0), 0);

    // Get payment applications needing attention
    const urgentApplications = await prisma.applicationForPayment.findMany({
      where: {
        tenantId,
        status: {
          in: ['CERTIFIED', 'APPROVED', 'PAYMENT_NOTICE_SENT'],
        },
      },
      include: {
        project: {
          select: {
            name: true,
          },
        },
        supplier: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        dueDate: 'asc',
      },
      take: 10,
    });

    // Get payment status breakdown
    const statusBreakdown = await prisma.applicationForPayment.groupBy({
      by: ['status'],
      where: { tenantId },
      _sum: {
        certifiedNetPayable: true,
      },
      _count: true,
    });

    // Format status breakdown
    const paymentStatusBreakdown = statusBreakdown.map(item => ({
      status: item.status,
      count: item._count,
      amount: Number(item._sum.certifiedNetPayable || 0),
    }));

    // Get this month's cash flow
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const thisMonthApplications = await prisma.applicationForPayment.findMany({
      where: {
        tenantId,
        applicationDate: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      select: {
        claimedThisPeriod: true,
        certifiedThisPeriod: true,
        amountPaid: true,
      },
    });

    const thisMonthClaimed = thisMonthApplications.reduce((sum, a) => sum + Number(a.claimedThisPeriod || 0), 0);
    const thisMonthCertified = thisMonthApplications.reduce((sum, a) => sum + Number(a.certifiedThisPeriod || 0), 0);
    const thisMonthPaid = thisMonthApplications.reduce((sum, a) => sum + Number(a.amountPaid || 0), 0);

    // Get project financial summary
    const projectSummaries = await Promise.all(
      [...new Map(contracts.map(c => [c.project.id, c.project])).values()].map(async (project) => {
        const projectContracts = contracts.filter(c => c.project.id === project.id);
        const projectContractValue = projectContracts.reduce((sum, c) => sum + Number(c.value || 0), 0);
        const projectCertified = projectContracts.reduce((sum, c) => sum + Number(c.totalCertifiedToDate || 0), 0);
        const projectPaid = projectContracts.reduce((sum, c) => sum + Number(c.totalPaidToDate || 0), 0);

        return {
          projectId: project.id,
          projectName: project.name,
          budget: projectContractValue,
          certified: projectCertified,
          paid: projectPaid,
          outstanding: projectCertified - projectPaid,
        };
      })
    );

    // Calculate payment status amounts
    const readyToPay = statusBreakdown.find(s => s.status === 'APPROVED')?._sum.certifiedNetPayable || 0;
    const awaitingApproval = statusBreakdown.find(s => s.status === 'CERTIFIED')?._sum.certifiedNetPayable || 0;
    const underReview = statusBreakdown.find(s => s.status === 'UNDER_REVIEW')?._sum.certifiedNetPayable || 0;

    // Count of active contracts
    const activeContracts = contracts.length;

    // Count of pending payments
    const pendingPayments = urgentApplications.length;

    res.json({
      // Top-level fields for dashboard cards
      totalContractValue,
      totalCertified,
      totalPaid,
      activeContracts,
      pendingPayments,
      retentionHeld: totalRetention,

      // Payment status breakdown for sidebar widget
      readyToPay: Number(readyToPay),
      awaitingApproval: Number(awaitingApproval),
      underReview: Number(underReview),

      // This month's cash flow
      thisMonthPaid,
      thisMonthCertified,
      thisMonthClaimed,

      // Urgent applications for main widget
      urgentApplications: urgentApplications.map(app => ({
        id: app.id,
        applicationNo: app.applicationNo,
        title: app.title,
        project: { name: app.project?.name },
        supplier: { name: app.supplier?.name },
        status: app.status,
        claimedThisPeriod: Number(app.claimedThisPeriod || 0),
        certifiedThisPeriod: Number(app.certifiedThisPeriod || 0),
        dueDate: app.dueDate,
      })),

      // Project summaries for table
      projectSummaries: projectSummaries.map(ps => ({
        id: ps.projectId,
        name: ps.projectName,
        budget: ps.budget,
        committed: ps.certified, // Certified = Committed
        actual: ps.paid,
      })),
    });
  } catch (error) {
    console.error('[Finance Dashboard] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/finance/payment-applications
 * Company-wide view of ALL payment applications across ALL projects
 * For Finance team to manage approvals and payments
 */
router.get('/finance/payment-applications', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { status, projectId } = req.query;

    // Build where clause
    const where = { tenantId };
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (projectId && projectId !== 'ALL') {
      where.projectId = Number(projectId);
    }

    // Get applications
    const applications = await prisma.applicationForPayment.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        contract: {
          select: {
            contractRef: true,
          },
        },
        supplier: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [
        { dueDate: 'asc' },
        { applicationDate: 'desc' },
      ],
    });

    // Get summary data
    const allApplications = await prisma.applicationForPayment.findMany({
      where: { tenantId },
      select: {
        certifiedThisPeriod: true,
        claimedThisPeriod: true,
        amountPaid: true,
        status: true,
        certifiedRetention: true,
        claimedRetention: true,
      },
    });

    const totalCount = allApplications.length;
    const totalCertified = allApplications.reduce((sum, a) => sum + Number(a.certifiedThisPeriod || a.claimedThisPeriod || 0), 0);
    const totalPaid = allApplications.reduce((sum, a) => sum + Number(a.amountPaid || 0), 0);
    const awaitingPayment = allApplications
      .filter(a => ['CERTIFIED', 'APPROVED', 'PAYMENT_NOTICE_SENT'].includes(a.status))
      .reduce((sum, a) => sum + Number(a.certifiedThisPeriod || a.claimedThisPeriod || 0) - Number(a.amountPaid || 0), 0);
    const retentionHeld = allApplications.reduce((sum, a) => sum + Number(a.certifiedRetention || a.claimedRetention || 0), 0);

    // Get unique projects for filter
    const projects = await prisma.project.findMany({
      where: {
        tenantId,
        contracts: {
          some: {
            applications: {
              some: {},
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    res.json({
      applications: applications.map(app => ({
        id: app.id,
        applicationNo: app.applicationNo,
        title: app.title,
        project: app.project,
        contract: app.contract,
        supplier: app.supplier,
        status: app.status,
        applicationDate: app.applicationDate,
        dueDate: app.dueDate,
        claimedThisPeriod: Number(app.claimedThisPeriod || 0),
        certifiedThisPeriod: Number(app.certifiedThisPeriod || 0),
        amountPaid: Number(app.amountPaid || 0),
      })),
      summary: {
        totalCount,
        totalCertified,
        totalPaid,
        awaitingPayment,
        retentionHeld,
        projects,
      },
    });
  } catch (error) {
    console.error('[Finance Payment Applications] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/finance/payment-applications/export
 * Export payment applications to CSV
 * Respects same filters as list endpoint
 */
router.get('/finance/payment-applications/export', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { status, projectId, contractId, packageId, supplierId, search, dateFrom, dateTo } = req.query;

    // Build where clause (same as list endpoint, plus additional filters)
    const where = { tenantId };

    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (projectId && projectId !== 'ALL') {
      where.projectId = Number(projectId);
    }
    if (contractId && contractId !== 'ALL') {
      where.contractId = Number(contractId);
    }
    if (packageId && packageId !== 'ALL') {
      where.packageId = Number(packageId);
    }
    if (supplierId && supplierId !== 'ALL') {
      where.supplierId = Number(supplierId);
    }
    if (search) {
      where.applicationNo = { contains: search };
    }
    if (dateFrom || dateTo) {
      where.periodStart = {};
      if (dateFrom) where.periodStart.gte = new Date(dateFrom);
      if (dateTo) where.periodStart.lte = new Date(dateTo);
    }

    // Get applications with all necessary relations
    const applications = await prisma.applicationForPayment.findMany({
      where,
      include: {
        project: { select: { name: true } },
        contract: { select: { contractRef: true, title: true } },
        package: { select: { code: true, name: true } },
        supplier: { select: { name: true } },
        certifiedByUser: { select: { name: true, email: true } },
      },
      orderBy: [
        { applicationDate: 'desc' },
      ],
    });

    // Build CSV rows
    const csvRows = [];

    // Header row
    csvRows.push([
      'Application Number',
      'Contract Number',
      'Contract Name',
      'Package Code',
      'Package Name',
      'Supplier Name',
      'Period Start',
      'Period End',
      'Gross Value Applied (£)',
      'Less Previous Applications (£)',
      'This Application (£)',
      'Certified Value (£)',
      'Retention %',
      'Retention Amount (£)',
      'Net Payable (£)',
      'Status',
      'Submitted Date',
      'Certified Date',
      'Payment Due Date',
      'Certified By',
    ].join(','));

    // Data rows
    for (const app of applications) {
      const grossValue = Number(app.grossValueThisPeriod || 0);
      const lessPrevious = Number(app.lessPreviousApplications || 0);
      const thisApplication = grossValue - lessPrevious;
      const certifiedValue = Number(app.certifiedThisPeriod || 0);
      const retentionPct = Number(app.retentionPercentage || 0);
      const retentionAmount = Number(app.retentionThisPeriod || 0);
      const netPayable = certifiedValue - retentionAmount;

      const row = [
        app.applicationNo || `APP-${app.id}`,
        app.contract?.contractRef || '',
        app.contract?.title || '',
        app.package?.code || '',
        app.package?.name || '',
        app.supplier?.name || '',
        app.periodStart ? new Date(app.periodStart).toISOString().split('T')[0] : '',
        app.periodEnd ? new Date(app.periodEnd).toISOString().split('T')[0] : '',
        grossValue.toFixed(2),
        lessPrevious.toFixed(2),
        thisApplication.toFixed(2),
        certifiedValue.toFixed(2),
        retentionPct.toFixed(2),
        retentionAmount.toFixed(2),
        netPayable.toFixed(2),
        app.status,
        app.applicationDate ? new Date(app.applicationDate).toISOString().split('T')[0] : '',
        app.certifiedDate ? new Date(app.certifiedDate).toISOString().split('T')[0] : '',
        app.dueDate ? new Date(app.dueDate).toISOString().split('T')[0] : '',
        app.certifiedByUser ? (app.certifiedByUser.name || app.certifiedByUser.email) : '',
      ];

      // Escape fields containing commas or quotes
      const escapedRow = row.map(field => {
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });

      csvRows.push(escapedRow.join(','));
    }

    // Create CSV content
    const csvContent = csvRows.join('\n');

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="payment_applications_export.csv"');
    res.send(csvContent);

  } catch (error) {
    console.error('[Finance Payment Applications Export] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
