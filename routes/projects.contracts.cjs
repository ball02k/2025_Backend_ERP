const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { safeJson } = require('../lib/serialize.cjs');

router.get('/projects/:projectId/contracts', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId || 'demo';

    const rows = await prisma.contract.findMany({
      where: { projectId },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        supplier: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        package: { select: { id: true, name: true } },
      }
    });

    // Fetch variation summaries for all contracts in a single query
    const contractIds = rows.map(r => r.id);
    const variations = await prisma.variation.findMany({
      where: {
        contractId: { in: contractIds },
        tenantId,
        is_deleted: false,
      },
      select: {
        contractId: true,
        status: true,
        approvedValue: true,
        variationNumber: true,
        urgency: true,
      },
    });

    // Group variations by contract
    const variationsByContract = variations.reduce((acc, v) => {
      if (!acc[v.contractId]) acc[v.contractId] = [];
      acc[v.contractId].push(v);
      return acc;
    }, {});

    const data = rows.map(r => {
      try {
        const x = safeJson(r);
        x.links = buildLinks('contract', x);

        // Add variation summary
        const contractVariations = variationsByContract[r.id] || [];

        // All non-rejected/non-closed variations (includes draft!)
        const inFlightStatuses = ['draft', 'quotation_requested', 'quotation_received', 'under_review', 'client_approval_required', 'approved', 'implemented'];
        const inFlightVariations = contractVariations.filter(v => inFlightStatuses.includes(v.status));

        // Approved variations for price impact
        const approvedVariations = contractVariations.filter(v => v.status === 'approved' || v.status === 'implemented');
        const totalApprovedValue = approvedVariations.reduce((sum, v) => sum + Number(v.approvedValue || 0), 0);

        // Categorize in-flight variations by status
        const byStatus = inFlightVariations.reduce((acc, v) => {
          if (!acc[v.status]) acc[v.status] = 0;
          acc[v.status]++;
          return acc;
        }, {});

        // Find highest priority status to display
        let variationDisplay = null;
        if (inFlightVariations.length > 0) {
          const criticalVariations = inFlightVariations.filter(v => v.urgency === 'critical');
          const urgentVariations = inFlightVariations.filter(v => v.urgency === 'urgent');

          // Determine the primary status to show
          let primaryStatus = '';
          let statusLabel = '';
          let urgency = 'standard';

          // Priority order: critical > urgent > client_approval_required > under_review > quotation_requested > quotation_received > draft > approved/implemented
          if (criticalVariations.length > 0) {
            urgency = 'critical';
            primaryStatus = criticalVariations[0].status;
            statusLabel = primaryStatus.replace(/_/g, ' ');
          } else if (urgentVariations.length > 0) {
            urgency = 'urgent';
            primaryStatus = urgentVariations[0].status;
            statusLabel = primaryStatus.replace(/_/g, ' ');
          } else if (byStatus.client_approval_required) {
            primaryStatus = 'client_approval_required';
            statusLabel = 'client approval';
          } else if (byStatus.under_review) {
            primaryStatus = 'under_review';
            statusLabel = 'under review';
          } else if (byStatus.quotation_requested) {
            primaryStatus = 'quotation_requested';
            statusLabel = 'quote requested';
          } else if (byStatus.quotation_received) {
            primaryStatus = 'quotation_received';
            statusLabel = 'quote received';
          } else if (byStatus.draft) {
            primaryStatus = 'draft';
            statusLabel = 'draft';
          } else if (byStatus.approved || byStatus.implemented) {
            primaryStatus = byStatus.implemented ? 'implemented' : 'approved';
            statusLabel = primaryStatus;
          }

          variationDisplay = {
            count: inFlightVariations.length,
            primaryStatus,
            statusLabel,
            urgency,
            multiple: inFlightVariations.length > 1,
          };
        }

        x.variationSummary = {
          totalCount: contractVariations.length,
          inFlightCount: inFlightVariations.length,
          approvedCount: approvedVariations.length,
          totalApprovedValue,
          display: variationDisplay,
        };

        return x;
      } catch (err) {
        console.error('[projects.contracts] safeJson error:', err?.message);
        return r; // fallback to raw object
      }
    });
    res.json({ items: data, total: data.length });
  } catch (e) {
    console.error('[projects.contracts] Error:', e?.message, e?.stack);
    next(e);
  }
});

module.exports = router;

