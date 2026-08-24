/**
 * CVR Value Service - Role-Aware Value Calculation (Task 4.1)
 *
 * Calculates "Value" side of CVR based on project role:
 * - Principal Contractor: Value from applications TO client
 * - Subcontractor: Value from certificates RECEIVED from Main Contractor
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Get CVR value data based on project role
 *
 * @param {string} tenantId
 * @param {number} projectId
 * @param {Date} [asOfDate] - Optional date for historical reporting
 * @returns {Promise<CVRValueSource>}
 */
async function getCVRValueData(tenantId, projectId, asOfDate) {
  // Get project with role
  const project = await prisma.project.findUnique({
    where: { id: projectId, tenantId },
    select: {
      projectRole: true,
      name: true,
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  // Route to appropriate value calculation based on role
  if (project.projectRole === 'SUBCONTRACTOR') {
    return getSubcontractorValue(tenantId, projectId, asOfDate);
  } else {
    // PRINCIPAL_CONTRACTOR, DIRECT_TO_CLIENT, or default
    return getPrincipalContractorValue(tenantId, projectId, asOfDate);
  }
}

/**
 * Value for Principal Contractor - from outbound applications to client
 *
 * @param {string} tenantId
 * @param {number} projectId
 * @param {Date} [asOfDate]
 * @returns {Promise<CVRValueSource>}
 */
async function getPrincipalContractorValue(tenantId, projectId, asOfDate) {
  const dateFilter = asOfDate ? { lte: asOfDate } : {};

  // Get all outbound applications (to client)
  // Using ApplicationForPayment model
  const applications = await prisma.applicationForPayment.findMany({
    where: {
      tenantId,
      projectId,
      // Filter for outbound if direction field exists
      // If no direction field, assume all apps are outbound for principal contractor
      status: { notIn: ['CANCELLED', 'REJECTED', 'VOID'] },
      ...(asOfDate && { applicationDate: dateFilter }),
    },
    select: {
      id: true,
      applicationNumber: true,
      applicationDate: true,
      status: true,
      // Claimed amounts
      claimedThisPeriod: true,
      claimedGrossValue: true,
      grossToDate: true,
      netClaimed: true,
      // Certified amounts (what client approved)
      certifiedThisPeriod: true,
      certifiedGrossValue: true,
      certifiedAmount: true,
      // Retention
      claimedRetention: true,
      retentionValue: true,
    },
    orderBy: [
      { applicationNumber: 'desc' },
      { applicationDate: 'desc' },
    ],
  });

  // Get the latest certified application for cumulative figures
  const certifiedApps = applications.filter((app) =>
    ['CERTIFIED', 'PAID', 'PART_PAID'].includes(app.status)
  );

  const latestCertified = certifiedApps[0];

  // Get pending applications (submitted but not yet certified)
  const pendingApps = applications.filter((app) =>
    ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'].includes(app.status)
  );

  // Calculate pending value (applications submitted but not certified)
  const pendingValue = pendingApps.reduce((sum, app) => {
    const value = Number(app.claimedThisPeriod || app.claimedGrossValue || 0);
    return sum + value;
  }, 0);

  // Get cumulative certified value
  const cumulativeCertified = latestCertified
    ? Number(
        latestCertified.certifiedGrossValue ||
          latestCertified.grossToDate ||
          0
      )
    : 0;

  // Calculate cumulative retention
  const cumulativeRetention = latestCertified
    ? Number(latestCertified.retentionValue || 0)
    : 0;

  return {
    source: 'APPLICATIONS',
    description: 'Value from applications to Client',
    cumulativeCertified,
    cumulativeApplied: cumulativeCertified + pendingValue,
    pendingValue,
    retentionHeld: cumulativeRetention,
    netValue: cumulativeCertified - cumulativeRetention,
    breakdown: {
      certifiedCount: certifiedApps.length,
      pendingCount: pendingApps.length,
      latestCertifiedNumber: latestCertified?.applicationNumber || null,
      latestCertifiedDate: latestCertified?.applicationDate || null,
    },
  };
}

/**
 * Value for Subcontractor - from certificates received from Main Contractor
 *
 * @param {string} tenantId
 * @param {number} projectId
 * @param {Date} [asOfDate]
 * @returns {Promise<CVRValueSource>}
 */
async function getSubcontractorValue(tenantId, projectId, asOfDate) {
  const dateFilter = asOfDate ? { lte: asOfDate } : {};

  // Get received certificates from Main Contractor
  const certificates = await prisma.paymentCertificate.findMany({
    where: {
      tenantId,
      projectId,
      direction: 'INBOUND', // Certificates we receive
      status: { in: ['RECEIVED', 'ACCEPTED'] },
      ...(asOfDate && { certificateDate: dateFilter }),
    },
    select: {
      id: true,
      certificateNumber: true,
      certificateDate: true,
      certifiedGross: true,
      cumulativeGross: true,
      retentionAmount: true,
      retentionPercentage: true,
      mcdAmount: true,
      cisAmount: true,
      netPayable: true,
      status: true,
      paymentApplicationId: true,
    },
    orderBy: [
      { certificateNumber: 'desc' },
      { certificateDate: 'desc' },
    ],
  });

  // Get the latest certificate for cumulative figures
  const latestCert = certificates[0];

  // Get pending applications (submitted to MC but no certificate yet)
  const pendingApps = await prisma.applicationForPayment.findMany({
    where: {
      tenantId,
      projectId,
      status: { in: ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'] },
      // Applications that don't have a certificate yet
      paymentCertificate: null,
    },
    select: {
      id: true,
      applicationNumber: true,
      claimedThisPeriod: true,
      claimedGrossValue: true,
    },
  });

  // Calculate pending value
  const pendingValue = pendingApps.reduce((sum, app) => {
    const value = Number(app.claimedThisPeriod || app.claimedGrossValue || 0);
    return sum + value;
  }, 0);

  // Get cumulative certified value from latest certificate
  const cumulativeCertified = latestCert
    ? Number(latestCert.cumulativeGross || latestCert.certifiedGross || 0)
    : 0;

  // Calculate cumulative retention from all certificates
  const cumulativeRetention = certificates.reduce((sum, cert) => {
    return sum + Number(cert.retentionAmount || 0);
  }, 0);

  // Calculate variance from applications (if we have cert-app linkage)
  let varianceFromApplied = null;
  let varianceNotes = [];

  if (latestCert && latestCert.paymentApplicationId) {
    const linkedApp = await prisma.applicationForPayment.findUnique({
      where: { id: latestCert.paymentApplicationId },
      select: { claimedThisPeriod: true, claimedGrossValue: true },
    });

    if (linkedApp) {
      const appliedValue = Number(
        linkedApp.claimedThisPeriod || linkedApp.claimedGrossValue || 0
      );
      const certifiedValue = Number(latestCert.certifiedGross || 0);
      const variance = certifiedValue - appliedValue;

      if (Math.abs(variance) > 0.01) {
        // More than 1p difference
        varianceFromApplied = variance;
        if (variance < 0) {
          varianceNotes.push(
            `MC certified ${Math.abs(variance).toFixed(
              2
            )} less than applied`
          );
        } else {
          varianceNotes.push(
            `MC certified ${variance.toFixed(2)} more than applied`
          );
        }
      }
    }
  }

  return {
    source: 'CERTIFICATES',
    description: 'Value from certificates received from Main Contractor',
    cumulativeCertified,
    cumulativeApplied: cumulativeCertified + pendingValue,
    pendingValue,
    retentionHeld: cumulativeRetention,
    netValue: cumulativeCertified - cumulativeRetention,
    breakdown: {
      certifiedCount: certificates.length,
      pendingCount: pendingApps.length,
      latestCertifiedNumber: latestCert?.certificateNumber || null,
      latestCertifiedDate: latestCert?.certificateDate || null,
    },
    varianceFromApplied,
    varianceNotes,
  };
}

/**
 * Get detailed value breakdown (list of source documents)
 *
 * @param {string} tenantId
 * @param {number} projectId
 * @param {string} projectRole
 * @returns {Promise<Array>}
 */
async function getValueBreakdown(tenantId, projectId, projectRole) {
  if (projectRole === 'SUBCONTRACTOR') {
    // Return certificates breakdown
    const certificates = await prisma.paymentCertificate.findMany({
      where: {
        tenantId,
        projectId,
        direction: 'INBOUND',
      },
      select: {
        certificateNumber: true,
        certificateDate: true,
        certifiedGross: true,
        cumulativeGross: true,
        retentionAmount: true,
        netPayable: true,
        status: true,
      },
      orderBy: { certificateNumber: 'asc' },
    });

    return certificates.map((cert) => ({
      ...cert,
      certifiedGross: Number(cert.certifiedGross || 0),
      cumulativeGross: Number(cert.cumulativeGross || 0),
      retentionAmount: Number(cert.retentionAmount || 0),
      netPayable: Number(cert.netPayable || 0),
    }));
  } else {
    // Return applications breakdown
    const applications = await prisma.applicationForPayment.findMany({
      where: {
        tenantId,
        projectId,
        status: { notIn: ['CANCELLED', 'REJECTED', 'VOID'] },
      },
      select: {
        applicationNumber: true,
        applicationDate: true,
        claimedThisPeriod: true,
        certifiedThisPeriod: true,
        grossToDate: true,
        claimedGrossValue: true,
        certifiedGrossValue: true,
        claimedRetention: true,
        retentionValue: true,
        status: true,
      },
      orderBy: { applicationNumber: 'asc' },
    });

    return applications.map((app) => ({
      ...app,
      claimedThisPeriod: Number(app.claimedThisPeriod || 0),
      certifiedThisPeriod: Number(app.certifiedThisPeriod || 0),
      cumulativeGross: Number(app.grossToDate || 0),
      claimedCumulative: Number(app.claimedGrossValue || 0),
      certifiedCumulative: Number(app.certifiedGrossValue || 0),
      retentionThisPeriod: Number(app.claimedRetention || 0),
      retentionCumulative: Number(app.retentionValue || 0),
    }));
  }
}

/**
 * Get value warnings based on data availability
 *
 * @param {CVRValueSource} valueData
 * @param {string} projectRole
 * @returns {Array<string>}
 */
function getCVRValueWarnings(valueData, projectRole) {
  const warnings = [];

  if (valueData.source === 'CERTIFICATES' && valueData.cumulativeCertified === 0) {
    if (valueData.pendingValue > 0) {
      warnings.push(
        'No certificates received yet. Value shown is from pending applications only.'
      );
    } else {
      warnings.push(
        'No certificates received and no applications submitted. CVR value is £0.'
      );
    }
  }

  if (valueData.source === 'APPLICATIONS' && valueData.cumulativeCertified === 0) {
    if (valueData.pendingValue > 0) {
      warnings.push(
        'No certified applications yet. Value shown is from pending applications only.'
      );
    } else {
      warnings.push(
        'No applications certified and no pending applications. CVR value is £0.'
      );
    }
  }

  // Warn if high pending value
  if (valueData.pendingValue > 0 && valueData.cumulativeCertified > 0) {
    const pendingPercentage =
      (valueData.pendingValue / valueData.cumulativeCertified) * 100;
    if (pendingPercentage > 20) {
      warnings.push(
        `High pending value (${pendingPercentage.toFixed(
          1
        )}% of certified). Consider following up on certification.`
      );
    }
  }

  // Include any variance notes
  if (valueData.varianceNotes && valueData.varianceNotes.length > 0) {
    warnings.push(...valueData.varianceNotes);
  }

  return warnings;
}

module.exports = {
  getCVRValueData,
  getPrincipalContractorValue,
  getSubcontractorValue,
  getValueBreakdown,
  getCVRValueWarnings,
};
