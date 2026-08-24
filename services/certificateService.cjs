/**
 * Certificate Service (Task 3.1)
 *
 * Calculation and utility functions for Payment Certificates
 */

const { prisma } = require('../lib/prisma.js');
const { addDays } = require('date-fns/addDays');

/**
 * Calculate variance from application
 * @param {number} certifiedGross - Amount certified by MC
 * @param {number} appliedGross - Amount you applied for
 * @returns {Object} Variance amount and percentage
 */
function calculateVariance(certifiedGross, appliedGross) {
  if (!appliedGross || appliedGross === 0) {
    return {
      varianceAmount: 0,
      variancePercentage: 0
    };
  }

  const varianceAmount = Number(certifiedGross) - Number(appliedGross);
  const variancePercentage = (varianceAmount / Number(appliedGross)) * 100;

  return {
    varianceAmount: Math.round(varianceAmount * 100) / 100,
    variancePercentage: Math.round(variancePercentage * 100) / 100
  };
}

/**
 * Calculate payment due date from contract terms
 * @param {Object} upstreamContract - Upstream contract with payment terms
 * @param {Date} certificateDate - Date of certificate
 * @returns {Date} Payment due date
 */
function calculatePaymentDueDate(upstreamContract, certificateDate) {
  const paymentTermsDays = upstreamContract.paymentTermsDays || 30;
  return addDays(new Date(certificateDate), paymentTermsDays);
}

/**
 * Calculate cumulative totals across all certificates for a project
 * @param {number} projectId - Project ID
 * @param {string} upstreamContractId - Upstream contract ID
 * @param {string} tenantId - Tenant ID
 * @param {number} currentCertificateNumber - Current certificate number to calculate up to
 * @returns {Promise<Object>} Cumulative totals
 */
async function calculateCumulatives(projectId, upstreamContractId, tenantId, currentCertificateNumber) {
  const previousCerts = await prisma.paymentCertificate.findMany({
    where: {
      projectId,
      upstreamContractId,
      tenantId,
      certificateNumber: {
        lte: currentCertificateNumber
      }
    },
    orderBy: {
      certificateNumber: 'asc'
    },
    select: {
      certifiedGross: true,
      retentionAmount: true,
      netCertified: true
    }
  });

  const cumulativeGross = previousCerts.reduce((sum, cert) =>
    sum + Number(cert.certifiedGross || 0), 0
  );

  const cumulativeRetention = previousCerts.reduce((sum, cert) =>
    sum + Number(cert.retentionAmount || 0), 0
  );

  const cumulativeNetCertified = previousCerts.reduce((sum, cert) =>
    sum + Number(cert.netCertified || 0), 0
  );

  return {
    cumulativeGross: Math.round(cumulativeGross * 100) / 100,
    cumulativeRetention: Math.round(cumulativeRetention * 100) / 100,
    cumulativeNetCertified: Math.round(cumulativeNetCertified * 100) / 100
  };
}

/**
 * Check for overdue certificates and update their status
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<number>} Number of certificates marked as overdue
 */
async function checkOverdueCertificates(tenantId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await prisma.paymentCertificate.updateMany({
    where: {
      tenantId,
      paymentStatus: 'AWAITING',
      paymentDueDate: {
        lt: today
      }
    },
    data: {
      paymentStatus: 'OVERDUE'
    }
  });

  return result.count;
}

/**
 * Auto-populate certificate fields from payment application
 * @param {number} paymentApplicationId - Payment application ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Pre-populated certificate data
 */
async function prepopulateFromApplication(paymentApplicationId, tenantId) {
  const app = await prisma.applicationForPayment.findFirst({
    where: {
      id: paymentApplicationId,
      tenantId
    },
    include: {
      upstreamContract: {
        select: {
          id: true,
          retentionPercentage: true,
          mainContractorDiscount: true,
          paymentTermsDays: true
        }
      },
      project: {
        select: {
          id: true
        }
      }
    }
  });

  if (!app) {
    throw new Error('Application not found');
  }

  if (!app.upstreamContract) {
    throw new Error('Upstream contract not found for this application');
  }

  // Get next certificate number
  const lastCert = await prisma.paymentCertificate.findFirst({
    where: {
      projectId: app.projectId,
      upstreamContractId: app.upstreamContractId,
      tenantId
    },
    orderBy: {
      certificateNumber: 'desc'
    },
    select: {
      certificateNumber: true
    }
  });

  const nextCertificateNumber = (lastCert?.certificateNumber || 0) + 1;

  // Pre-fill with application values (user can adjust)
  const appliedGross = Number(app.claimedGrossValue || 0);
  const retentionPercentage = Number(app.upstreamContract.retentionPercentage || 0);
  const mcdPercentage = Number(app.upstreamContract.mainContractorDiscount || 0);

  const retentionAmount = (appliedGross * retentionPercentage) / 100;
  const mcdAmount = (appliedGross * mcdPercentage) / 100;
  const cisAmount = 0; // Default to 0, user can adjust
  const netCertified = appliedGross - retentionAmount - mcdAmount - cisAmount;

  return {
    projectId: app.projectId,
    upstreamContractId: app.upstreamContractId,
    certificateNumber: nextCertificateNumber,
    appliedGross,
    certifiedGross: appliedGross, // Default to same as applied
    retentionPercentage,
    retentionAmount: Math.round(retentionAmount * 100) / 100,
    mcdPercentage,
    mcdAmount: Math.round(mcdAmount * 100) / 100,
    cisAmount: Math.round(cisAmount * 100) / 100,
    netCertified: Math.round(netCertified * 100) / 100,
    paymentTermsDays: app.upstreamContract.paymentTermsDays || 30
  };
}

/**
 * Calculate net certified amount from components
 * @param {number} certifiedGross - Gross amount certified
 * @param {number} retentionAmount - Retention deducted
 * @param {number} mcdAmount - MCD deducted
 * @param {number} cisAmount - CIS deducted
 * @param {number} otherDeductions - Other deductions
 * @returns {number} Net certified amount
 */
function calculateNetCertified(certifiedGross, retentionAmount, mcdAmount, cisAmount, otherDeductions) {
  const net = Number(certifiedGross || 0)
    - Number(retentionAmount || 0)
    - Number(mcdAmount || 0)
    - Number(cisAmount || 0)
    - Number(otherDeductions || 0);

  return Math.round(net * 100) / 100;
}

/**
 * Get outstanding certificates (awaiting payment or overdue)
 * @param {number} projectId - Project ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Outstanding and overdue certificates
 */
async function getOutstandingCertificates(projectId, tenantId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const certificates = await prisma.paymentCertificate.findMany({
    where: {
      projectId,
      tenantId,
      paymentStatus: {
        in: ['AWAITING', 'OVERDUE', 'PARTIAL']
      }
    },
    select: {
      id: true,
      certificateNumber: true,
      certificateDate: true,
      netCertified: true,
      paymentDueDate: true,
      paymentStatus: true
    },
    orderBy: {
      certificateNumber: 'asc'
    }
  });

  const outstanding = [];
  const overdue = [];
  let totalOutstanding = 0;

  for (const cert of certificates) {
    const dueDate = new Date(cert.paymentDueDate);
    const diffDays = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));

    const item = {
      id: cert.id,
      certificateNumber: cert.certificateNumber,
      certificateDate: cert.certificateDate,
      netCertified: Number(cert.netCertified),
      paymentDueDate: cert.paymentDueDate,
      status: cert.paymentStatus,
      daysUntilDue: diffDays > 0 ? diffDays : 0,
      daysOverdue: diffDays < 0 ? Math.abs(diffDays) : 0
    };

    if (cert.paymentStatus === 'OVERDUE' || diffDays < 0) {
      overdue.push(item);
    } else {
      outstanding.push(item);
    }

    totalOutstanding += Number(cert.netCertified);
  }

  return {
    outstanding,
    overdue,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100
  };
}

module.exports = {
  calculateVariance,
  calculatePaymentDueDate,
  calculateCumulatives,
  checkOverdueCertificates,
  prepopulateFromApplication,
  calculateNetCertified,
  getOutstandingCertificates
};
