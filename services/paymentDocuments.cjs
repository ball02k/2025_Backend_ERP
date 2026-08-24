const { prisma } = require('../utils/prisma.cjs');
const { saveBufferAsDocument, saveHtmlAsDocument } = require('./storage.cjs');
const { paymentCertificateHtml, paymentNoticeHtml, payLessNoticeHtml } = require('../templates/paymentHtml.cjs');
const {
  generatePaymentCertificatePdf,
  generatePaymentNoticePdf,
  generatePayLessNoticePdf
} = require('./paymentCertificatePdf.cjs');

const PDF_MODE = process.env.PDF_MODE || 'pdfkit'; // 'pdfkit' | 'http' | 'none'
const PDF_HTTP_URL = process.env.PDF_HTTP_URL || '';
const TENANT_NAME_FALLBACK = process.env.APP_NAME || 'ERP';
const columnCache = new Map();

function toMoney(value) {
  return Number(value || 0);
}

async function hasColumn(tableName, columnName) {
  const key = `${tableName}.${columnName}`;
  if (columnCache.has(key)) {
    return columnCache.get(key);
  }

  const rows = await prisma.$queryRaw`
    SELECT 1 AS present
    FROM information_schema.columns
    WHERE table_schema = ${'public'}
      AND table_name = ${tableName}
      AND column_name = ${columnName}
    LIMIT 1
  `;
  const present = rows.length > 0;
  columnCache.set(key, present);
  return present;
}

const afpDocumentSelect = {
  id: true,
  tenantId: true,
  projectId: true,
  supplierId: true,
  contractId: true,
  applicationNumber: true,
  applicationNo: true,
  reference: true,
  title: true,
  applicationDate: true,
  valuationDate: true,
  dueDate: true,
  finalPaymentDate: true,
  periodStart: true,
  periodEnd: true,
  status: true,
  currency: true,
  claimedGrossValue: true,
  claimedRetention: true,
  claimedNetValue: true,
  claimedPreviouslyPaid: true,
  claimedThisPeriod: true,
  grossToDate: true,
  retentionValue: true,
  netClaimed: true,
  certifiedGrossValue: true,
  certifiedRetention: true,
  certifiedNetValue: true,
  certifiedPreviouslyPaid: true,
  certifiedThisPeriod: true,
  certifiedAmount: true,
  certifiedDate: true,
  certificationNotes: true,
  paymentNoticeDocument: true,
  paymentNoticeSent: true,
  paymentNoticeSentAt: true,
  paymentNoticeAmount: true,
  payLessNoticeDocument: true,
  payLessNoticeSent: true,
  payLessNoticeSentAt: true,
  payLessNoticeAmount: true,
  payLessNoticeReason: true,
  qsNotes: true,
  notes: true,
  valuationDocument: true,
  project: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
  supplier: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  contract: {
    select: {
      id: true,
      title: true,
      contractRef: true,
      value: true,
      supplier: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
};

function getCertifiedNet(afp) {
  if (afp.paymentNoticeAmount != null) return toMoney(afp.paymentNoticeAmount);
  if (afp.certifiedThisPeriod != null) return toMoney(afp.certifiedThisPeriod);
  if (afp.certifiedNetValue != null) return toMoney(afp.certifiedNetValue);
  if (afp.certifiedAmount != null) return toMoney(afp.certifiedAmount);
  if (afp.certifiedGrossValue != null) {
    return toMoney(afp.certifiedGrossValue) - toMoney(afp.certifiedRetention);
  }
  if (afp.claimedNetValue != null) return toMoney(afp.claimedNetValue);
  if (afp.netClaimed != null) return toMoney(afp.netClaimed);
  return toMoney(afp.claimedThisPeriod);
}

function normaliseAfpForDocuments(afp) {
  const grossVal = toMoney(afp.certifiedGrossValue ?? afp.claimedGrossValue ?? afp.grossToDate);
  const retention = toMoney(afp.certifiedRetention ?? afp.claimedRetention ?? afp.retentionValue);
  const prevPaid = toMoney(afp.certifiedPreviouslyPaid ?? afp.claimedPreviouslyPaid);
  const netDue = getCertifiedNet(afp);

  return {
    ...afp,
    appNumber: afp.applicationNo || afp.applicationNumber || afp.id,
    certNumber: afp.applicationNo || afp.applicationNumber || afp.id,
    grossVal,
    retention,
    prevPaid,
    netDue,
    paymentNoticeAmount: afp.paymentNoticeAmount ?? netDue,
    contractor: afp.supplier?.name || afp.contract?.supplier?.name,
    contract: afp.contract ? {
      ...afp.contract,
      contractor: afp.supplier?.name || afp.contract?.supplier?.name,
    } : afp.contract,
  };
}

async function getAfpForDocuments(afpId, tenantId) {
  const afp = await prisma.applicationForPayment.findFirst({
    where: { id: Number(afpId), tenantId },
    select: afpDocumentSelect,
  });
  return afp ? normaliseAfpForDocuments(afp) : null;
}

async function updateAfpDocumentFields(afpId, data) {
  const updateData = {};
  for (const [field, value] of Object.entries(data)) {
    if (await hasColumn('ApplicationForPayment', field)) {
      updateData[field] = value;
    }
  }

  if (!Object.keys(updateData).length) {
    return null;
  }

  return prisma.applicationForPayment.update({
    where: { id: Number(afpId) },
    data: updateData,
    select: { id: true },
  });
}

/**
 * Generate Payment Certificate PDF/HTML and store it
 * @param {number} afpId - ApplicationForPayment ID
 * @param {number} tenantId - Tenant ID
 * @returns {Promise<{url: string, filename: string, docId: bigint}>}
 */
async function generatePaymentCertificate(afpId, tenantId) {
  // Fetch full AFP details
  const afp = await getAfpForDocuments(afpId, tenantId);

  if (!afp) {
    throw new Error('Application for Payment not found');
  }

  // Generate HTML
  const html = paymentCertificateHtml({
    afp,
    project: afp.project,
    contract: afp.contract,
    tenantName: TENANT_NAME_FALLBACK,
  });

  const filename = `Payment-Certificate-${afp.certNumber || afp.id}.pdf`;
  let docId;

  // Generate PDF using pdfkit (default), HTTP service, or fallback to HTML
  if (PDF_MODE === 'pdfkit') {
    // Use pdfkit to generate professional PDF
    const buffer = await generatePaymentCertificatePdf(afp, {
      project: afp.project,
      contract: afp.contract,
      tenantName: TENANT_NAME_FALLBACK,
    });
    docId = await saveBufferAsDocument(buffer, filename, 'application/pdf', tenantId, afp.projectId);
  } else if (PDF_MODE === 'http' && PDF_HTTP_URL) {
    // Use external HTTP service for PDF generation
    const resp = await fetch(PDF_HTTP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ html, filename }),
    });

    if (!resp.ok) {
      throw new Error(`PDF render failed: ${resp.status}`);
    }

    const arr = await resp.arrayBuffer();
    const buf = Buffer.from(arr);
    docId = await saveBufferAsDocument(buf, filename, 'application/pdf', tenantId, afp.projectId);
  } else {
    // Fallback: store as HTML
    const htmlFilename = filename.replace('.pdf', '.html');
    docId = await saveHtmlAsDocument(html, htmlFilename, tenantId, afp.projectId);
  }

  // Get document URL (storageKey)
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  const url = doc?.storageKey || '';

  // Update AFP record with certificate URL and timestamp
  await updateAfpDocumentFields(afpId, {
    paymentCertificateUrl: url,
    paymentCertificateGeneratedAt: new Date(),
    valuationDocument: url,
  });

  return { url, filename, docId };
}

/**
 * Generate Payment Notice PDF/HTML and store it
 * @param {number} afpId - ApplicationForPayment ID
 * @param {number} tenantId - Tenant ID
 * @returns {Promise<{url: string, filename: string, docId: bigint}>}
 */
async function generatePaymentNotice(afpId, tenantId) {
  // Fetch full AFP details
  const afp = await getAfpForDocuments(afpId, tenantId);

  if (!afp) {
    throw new Error('Application for Payment not found');
  }

  // Generate HTML
  const html = paymentNoticeHtml({
    afp,
    project: afp.project,
    contract: afp.contract,
    tenantName: TENANT_NAME_FALLBACK,
  });

  const filename = `Payment-Notice-${afp.appNumber || afp.id}.pdf`;
  let docId;

  // Generate PDF using pdfkit (default), HTTP service, or fallback to HTML
  if (PDF_MODE === 'pdfkit') {
    // Use pdfkit to generate professional PDF
    const buffer = await generatePaymentNoticePdf(afp, {
      project: afp.project,
      contract: afp.contract,
      tenantName: TENANT_NAME_FALLBACK,
    });
    docId = await saveBufferAsDocument(buffer, filename, 'application/pdf', tenantId, afp.projectId);
  } else if (PDF_MODE === 'http' && PDF_HTTP_URL) {
    // Use external HTTP service for PDF generation
    const resp = await fetch(PDF_HTTP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ html, filename }),
    });

    if (!resp.ok) {
      throw new Error(`PDF render failed: ${resp.status}`);
    }

    const arr = await resp.arrayBuffer();
    const buf = Buffer.from(arr);
    docId = await saveBufferAsDocument(buf, filename, 'application/pdf', tenantId, afp.projectId);
  } else {
    // Fallback: store as HTML
    const htmlFilename = filename.replace('.pdf', '.html');
    docId = await saveHtmlAsDocument(html, htmlFilename, tenantId, afp.projectId);
  }

  // Get document URL (storageKey)
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  const url = doc?.storageKey || '';

  // Update AFP record with payment notice URL and timestamp
  await updateAfpDocumentFields(afpId, {
    paymentNoticeDocument: url,
    paymentNoticeSent: true,
    paymentNoticeSentAt: new Date(),
    paymentNoticeAmount: afp.netDue,
  });

  return { url, filename, docId };
}

/**
 * Generate Pay Less Notice PDF/HTML and store it
 * @param {number} afpId - ApplicationForPayment ID
 * @param {number} tenantId - Tenant ID
 * @param {number} payLessAmount - Revised amount to pay
 * @param {string} payLessReason - Reason for paying less
 * @returns {Promise<{url: string, filename: string, docId: bigint}>}
 */
async function generatePayLessNotice(afpId, tenantId, payLessAmount, payLessReason) {
  // Fetch full AFP details
  const afp = await getAfpForDocuments(afpId, tenantId);

  if (!afp) {
    throw new Error('Application for Payment not found');
  }

  // Validate payLessAmount
  if (payLessAmount == null || isNaN(Number(payLessAmount))) {
    throw new Error('Valid payLessAmount is required');
  }

  // Generate HTML
  const html = payLessNoticeHtml({
    afp,
    project: afp.project,
    contract: afp.contract,
    tenantName: TENANT_NAME_FALLBACK,
    payLessAmount: Number(payLessAmount),
    payLessReason: payLessReason || '',
  });

  const filename = `Pay-Less-Notice-${afp.appNumber || afp.id}.pdf`;
  let docId;

  // Generate PDF using pdfkit (default), HTTP service, or fallback to HTML
  if (PDF_MODE === 'pdfkit') {
    // Use pdfkit to generate professional PDF
    const buffer = await generatePayLessNoticePdf(afp, {
      project: afp.project,
      contract: afp.contract,
      tenantName: TENANT_NAME_FALLBACK,
      payLessAmount: Number(payLessAmount),
      payLessReason: payLessReason || '',
    });
    docId = await saveBufferAsDocument(buffer, filename, 'application/pdf', tenantId, afp.projectId);
  } else if (PDF_MODE === 'http' && PDF_HTTP_URL) {
    // Use external HTTP service for PDF generation
    const resp = await fetch(PDF_HTTP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ html, filename }),
    });

    if (!resp.ok) {
      throw new Error(`PDF render failed: ${resp.status}`);
    }

    const arr = await resp.arrayBuffer();
    const buf = Buffer.from(arr);
    docId = await saveBufferAsDocument(buf, filename, 'application/pdf', tenantId, afp.projectId);
  } else {
    // Fallback: store as HTML
    const htmlFilename = filename.replace('.pdf', '.html');
    docId = await saveHtmlAsDocument(html, htmlFilename, tenantId, afp.projectId);
  }

  // Get document URL (storageKey)
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  const url = doc?.storageKey || '';

  // Update AFP record with pay less notice details
  await updateAfpDocumentFields(afpId, {
    payLessNoticeDocument: url,
    payLessNoticeSent: true,
    payLessNoticeSentAt: new Date(),
    payLessNoticeAmount: Number(payLessAmount),
    payLessNoticeReason: payLessReason || '',
  });

  return { url, filename, docId };
}

/**
 * Get all payment documents for an AFP
 * @param {number} afpId - ApplicationForPayment ID
 * @param {number} tenantId - Tenant ID
 * @returns {Promise<object>}
 */
async function getPaymentDocuments(afpId, tenantId) {
  const hasCertificateFields = await hasColumn('ApplicationForPayment', 'paymentCertificateUrl');
  const afp = await prisma.applicationForPayment.findFirst({
    where: { id: Number(afpId), tenantId },
    select: {
      ...(hasCertificateFields ? {
        paymentCertificateUrl: true,
        paymentCertificateGeneratedAt: true,
      } : {}),
      valuationDocument: true,
      paymentNoticeDocument: true,
      paymentNoticeSentAt: true,
      paymentNoticeAmount: true,
      payLessNoticeDocument: true,
      payLessNoticeSentAt: true,
      payLessNoticeAmount: true,
      payLessNoticeReason: true,
    },
  });

  if (!afp) {
    throw new Error('Application for Payment not found');
  }

  return {
    paymentCertificate: {
      url: afp.paymentCertificateUrl || afp.valuationDocument || null,
      generatedAt: afp.paymentCertificateGeneratedAt || null,
    },
    paymentNotice: {
      url: afp.paymentNoticeDocument,
      sentAt: afp.paymentNoticeSentAt,
      amount: afp.paymentNoticeAmount,
    },
    payLessNotice: {
      url: afp.payLessNoticeDocument,
      sentAt: afp.payLessNoticeSentAt,
      amount: afp.payLessNoticeAmount,
      reason: afp.payLessNoticeReason,
    },
  };
}

/**
 * Check Construction Act compliance - are deadlines being met?
 * @param {object} afp - ApplicationForPayment record
 * @returns {object} Compliance status and warnings
 */
function checkConstructionActCompliance(afp) {
  const warnings = [];
  const now = new Date();

  if (!afp.dueDate) {
    return { compliant: false, warnings: ['Due date not set'] };
  }

  const dueDate = new Date(afp.dueDate);
  const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
  const paymentNoticeDueDate = new Date(dueDate);
  paymentNoticeDueDate.setDate(paymentNoticeDueDate.getDate() - 5);
  const daysUntilPaymentNoticeDue = Math.ceil((paymentNoticeDueDate - now) / (1000 * 60 * 60 * 24));

  // Check payment notice deadline (must be issued at least 5 days before due date)
  if (!afp.paymentNoticeSent && daysUntilPaymentNoticeDue <= 0) {
    warnings.push('Payment Notice deadline has passed! Must be issued 5 days before payment due date.');
  } else if (!afp.paymentNoticeSent && daysUntilPaymentNoticeDue <= 2) {
    warnings.push(`Payment Notice should be issued soon (${daysUntilPaymentNoticeDue} days until deadline).`);
  }

  // Check pay-less notice deadline (must be issued at least 5 days before due date)
  if (afp.paymentNoticeSent && !afp.payLessNoticeSent && daysUntilDue <= 5) {
    warnings.push(`Pay Less Notice deadline approaching! Must be issued at least 5 days before payment due date (${daysUntilDue} days remaining).`);
  }

  // Check if payment certificate is generated
  if (!afp.paymentCertificateUrl && !afp.valuationDocument) {
    warnings.push('Payment Certificate not yet generated.');
  }

  return {
    compliant: warnings.length === 0,
    warnings,
    daysUntilDue,
    daysUntilPaymentNoticeDue,
    paymentNoticeDueDate,
  };
}

module.exports = {
  generatePaymentCertificate,
  generatePaymentNotice,
  generatePayLessNotice,
  getPaymentDocuments,
  checkConstructionActCompliance,
};
