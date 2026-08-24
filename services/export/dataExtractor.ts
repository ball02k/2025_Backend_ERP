/**
 * Data Extractor Service (Task 5.1 - Part 3)
 *
 * Extracts data from the database and transforms it into the standardized
 * PaymentApplicationExportData format for export templates.
 */

import { prisma } from '../../lib/prisma';
import {
  PaymentApplicationExportData,
  PaymentApplicationLineExport,
  VariationExport,
  DayworkExport
} from './types';

/**
 * Extract payment application data in standardized export format
 *
 * @param applicationId - Payment application ID (as integer)
 * @returns Standardized export data structure
 * @throws Error if application not found
 */
export async function extractPaymentApplicationData(
  applicationId: number
): Promise<PaymentApplicationExportData> {
  // Fetch complete application with all relations
  const application = await prisma.applicationForPayment.findUnique({
    where: { id: applicationId },
    include: {
      project: {
        include: {
          client: true,
          upstreamParty: true,
        },
      },
      lineItemDetails: {
        orderBy: { id: 'asc' },
        include: {
          budgetLine: true,
        },
      },
      contract: true,
      supplier: true,
      certificate: true,
    },
  });

  if (!application) {
    throw new Error(`Payment application ${applicationId} not found`);
  }

  // Fetch tenant settings separately
  const tenantSettings = await prisma.tenantSettings.findUnique({
    where: { tenantId: application.tenantId },
  });

  const project = application.project;
  const contract = application.contract;

  // Determine employer/main contractor
  const employer = project.upstreamParty || project.client;

  // Helper to build full address from components
  const buildAddress = (client: typeof employer) => {
    if (!client) return undefined;
    const parts = [
      client.address1,
      client.address2,
      client.city,
      client.county,
      client.postcode,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : undefined;
  };

  // Build header
  const header = {
    applicationNumber: application.applicationNumber || 0,
    applicationRef: application.applicationNo || `APP-${application.id}`,
    projectName: project.name,
    projectRef: project.code, // Project uses 'code' field
    contractRef: contract?.contractRef || project.upstreamContractRef || undefined,

    contractor: {
      name: tenantSettings?.companyName || 'Unknown Contractor',
      address: tenantSettings?.companyAddress || undefined,
      vatNumber: undefined, // Not in TenantSettings schema
      cisNumber: undefined, // Not in TenantSettings schema
    },

    employer: {
      name: employer?.name || 'Unknown Client',
      address: buildAddress(employer),
    },

    periodStart: application.periodStart || application.applicationDate,
    periodEnd: application.periodEnd || application.applicationDate,
    valuationDate: application.valuationDate || application.applicationDate,
    submittedDate: application.submittedAt || undefined,
    dueDate: application.dueDate || undefined,

    contractValue: Number(project.budget || 0),
    retentionPercentage: Number(
      application.retentionPercentage ||
      contract?.retentionPercentage ||
      project.retentionPct ||
      5
    ),
    mcdPercentage: contract?.mainContractorDiscount ? Number(contract.mainContractorDiscount) : undefined,
  };

  // Build lines
  const lines: PaymentApplicationLineExport[] = application.lineItemDetails.map((line, index) => {
    const contractValue = Number(line.contractValue || line.budgetLine?.amount || 0);
    const previousValue = Number(line.valuePrevious || 0);
    const thisPeriodValue = Number(line.valueThisPeriod || 0);
    const cumulativeValue = Number(line.valueCumulative || 0);

    return {
      lineNumber: index + 1,
      reference: line.reference || line.budgetLine?.code || undefined, // BudgetLine uses 'code' field
      description: line.description,

      contractValue,

      previousCumulative: previousValue,
      previousPercentage: calculatePercentage(previousValue, contractValue),
      thisPeriod: thisPeriodValue,
      thisPeriodPercentage: calculatePercentage(thisPeriodValue, contractValue),
      currentCumulative: cumulativeValue,
      currentPercentage: calculatePercentage(cumulativeValue, contractValue),

      remainingValue: contractValue - cumulativeValue,
      remainingPercentage: 100 - calculatePercentage(cumulativeValue, contractValue),

      section: undefined, // Not in schema
      category: undefined, // Not in schema
      sortOrder: index,
    };
  });

  // Build summary
  const grossThisPeriod = Number(application.claimedThisPeriod || application.grossToDate || 0);
  const mosValue = Number(application.mosValue || 0);
  const previousCumulative = Number(application.claimedPreviouslyPaid || 0);
  const currentCumulative = Number(application.grossToDate || 0);
  const retentionValue = Number(application.retentionValue || 0);
  const netClaimed = Number(application.netClaimed || application.claimedNetValue || 0);

  const summary = {
    grossThisPeriod,
    materialsOnSite: mosValue,
    totalThisPeriod: grossThisPeriod + mosValue,

    previousCumulative,
    currentCumulative,

    retentionThisPeriod: Number(application.claimedRetention || 0),
    retentionCumulative: retentionValue,
    retentionReleaseDue: undefined, // Not in schema

    mcdThisPeriod: undefined, // Not in schema
    mcdCumulative: undefined, // Not in schema

    contracharges: Number(application.deductionsValue || 0),
    otherDeductions: undefined, // Not in schema
    otherDeductionsDesc: undefined, // Not in schema

    netThisPeriod: grossThisPeriod - Number(application.claimedRetention || 0),
    netCumulative: netClaimed,

    previousPayments: Number(application.claimedPreviouslyPaid || 0),
    amountDue: Number(application.claimedThisPeriod || 0),

    vatRate: 20, // Default UK VAT rate
    vatAmount: 0, // Would need to be calculated if VAT is applied
    totalDue: Number(application.claimedThisPeriod || 0),
  };

  // Parse variations from JSON field if present
  let variations: VariationExport[] | undefined;
  if (application.variations && typeof application.variations === 'object') {
    try {
      const variationsData = Array.isArray(application.variations)
        ? application.variations
        : [];

      variations = variationsData.map((v: any) => ({
        variationNumber: v.variationNumber || 0,
        reference: v.reference || '',
        description: v.description || '',
        status: v.status || 'UNKNOWN',
        value: Number(v.value || v.amount || 0),
        previousCumulative: Number(v.previousCumulative || 0),
        thisPeriod: Number(v.thisPeriod || 0),
        currentCumulative: Number(v.currentCumulative || 0),
      }));
    } catch (error) {
      console.warn('Failed to parse variations JSON:', error);
    }
  }

  // Parse dayworks from JSON field if present
  let dayworks: DayworkExport[] | undefined;
  if (application.lineItems && typeof application.lineItems === 'object') {
    try {
      const lineItemsData = Array.isArray(application.lineItems)
        ? application.lineItems
        : [];

      // Filter for daywork items
      const dayworkItems = lineItemsData.filter((item: any) =>
        item.type === 'DAYWORK' || item.isDaywork
      );

      if (dayworkItems.length > 0) {
        dayworks = dayworkItems.map((d: any) => ({
          reference: d.reference || '',
          description: d.description || '',
          date: d.date ? new Date(d.date) : new Date(),
          labourHours: Number(d.labourHours || 0),
          labourRate: Number(d.labourRate || 0),
          labourTotal: Number(d.labourTotal || 0),
          materialsTotal: Number(d.materialsTotal || 0),
          plantTotal: Number(d.plantTotal || 0),
          total: Number(d.total || 0),
        }));
      }
    } catch (error) {
      console.warn('Failed to parse dayworks from lineItems JSON:', error);
    }
  }

  // Build certification (if exists)
  const certification = application.certificate ? {
    certifiedAmount: Number(application.certificate.certifiedGross),
    certifiedDate: application.certificate.certificateDate,
    certifiedBy: undefined, // Certificate model doesn't have certifiedBy user
    varianceNotes: undefined, // Not in schema
  } : undefined;

  // Build attachments list (if needed)
  const attachments = undefined; // Would need to query AfpAttachment relation

  return {
    header,
    lines,
    summary,
    variations,
    dayworks,
    attachments,
    certification,
  };
}

/**
 * Calculate percentage safely
 *
 * @param value - Numerator value
 * @param total - Denominator value
 * @returns Percentage with 2 decimal places, or 0 if total is 0
 */
function calculatePercentage(value: any, total: any): number {
  const v = Number(value || 0);
  const t = Number(total || 0);
  if (t === 0) return 0;
  return Math.round((v / t) * 10000) / 100; // 2 decimal places
}

/**
 * Extract payment certificate data for export
 *
 * @param certificateId - Payment certificate ID (as string - uses cuid)
 * @returns Standardized export data structure
 * @throws Error if certificate not found
 */
export async function extractCertificateData(certificateId: string) {
  const certificate = await prisma.paymentCertificate.findUnique({
    where: { id: certificateId },
    include: {
      project: {
        include: {
          client: true,
          upstreamParty: true,
        },
      },
      upstreamContract: true,
      paymentApplication: {
        include: {
          lineItemDetails: true,
        },
      },
    },
  });

  if (!certificate) {
    throw new Error(`Payment certificate ${certificateId} not found`);
  }

  // Transform certificate data to export format
  // Similar structure to payment application
  // Implementation depends on specific certificate export requirements

  return {
    certificateNumber: certificate.certificateNumber,
    certificateRef: certificate.certificateRef,
    certificateDate: certificate.certificateDate,
    certifiedGross: Number(certificate.certifiedGross),
    retentionAmount: Number(certificate.retentionAmount),
    netCertified: Number(certificate.netCertified), // Certificate uses 'netCertified' field
    mcdAmount: Number(certificate.mcdAmount),
    cisAmount: Number(certificate.cisAmount),
    totalPaid: Number(certificate.totalPaid),
    // ... additional fields as needed
  };
}

/**
 * Extract CVR (Cost Value Reconciliation) report data for export
 *
 * @param projectId - Project ID
 * @param periodEnd - End date for the report period
 * @returns CVR report data structure
 * @throws Error if project not found
 */
export async function extractCVRData(projectId: number, periodEnd: Date) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: true,
      contracts: true,
      budgetLines: true,
    },
  });

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  // Aggregate costs from various sources
  // This is a simplified version - real implementation would:
  // 1. Sum up all costs from timesheets, materials, subcontractor invoices, etc.
  // 2. Sum up all certified values from payment applications/certificates
  // 3. Calculate margins and forecasts

  const totalBudget = Number(project.budget || 0);
  const totalSpend = Number(project.actualSpend || 0);
  const grossMargin = totalBudget - totalSpend;
  const grossMarginPercentage = totalBudget > 0
    ? (grossMargin / totalBudget) * 100
    : 0;

  return {
    projectId: project.id,
    projectName: project.name,
    projectRef: project.code, // Project uses 'code' field
    reportDate: new Date(),
    periodEnd,

    value: {
      totalValue: totalBudget,
      cumulativeCertified: 0, // Would need to sum from payment applications
      pendingCertification: 0,
      retentionHeld: 0,
    },

    cost: {
      labour: 0, // Would aggregate from timesheets
      materials: 0, // Would aggregate from material invoices
      subcontractors: 0, // Would aggregate from subcontractor payments
      plant: 0, // Would aggregate from plant/equipment costs
      overheads: 0, // Would calculate based on overhead allocation
      other: 0,
      totalCost: totalSpend,
    },

    results: {
      grossMargin,
      grossMarginPercentage: Math.round(grossMarginPercentage * 100) / 100,
    },
  };
}
