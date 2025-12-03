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

/**
 * Generate Payment Certificate PDF/HTML and store it
 * @param {number} afpId - ApplicationForPayment ID
 * @param {number} tenantId - Tenant ID
 * @returns {Promise<{url: string, filename: string, docId: bigint}>}
 */
async function generatePaymentCertificate(afpId, tenantId) {
  // Fetch full AFP details
  const afp = await prisma.applicationForPayment.findFirst({
    where: { id: Number(afpId), tenantId },
    include: {
      project: true,
      contract: true,
    },
  });

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
  await prisma.applicationForPayment.update({
    where: { id: Number(afpId) },
    data: {
      paymentCertificateUrl: url,
      paymentCertificateGeneratedAt: new Date(),
    },
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
  const afp = await prisma.applicationForPayment.findFirst({
    where: { id: Number(afpId), tenantId },
    include: {
      project: true,
      contract: true,
    },
  });

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
  await prisma.applicationForPayment.update({
    where: { id: Number(afpId) },
    data: {
      paymentNoticeDocument: url,
      paymentNoticeSent: true,
      paymentNoticeSentAt: new Date(),
      paymentNoticeAmount: afp.netDue, // Default to netDue if not already set
    },
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
  const afp = await prisma.applicationForPayment.findFirst({
    where: { id: Number(afpId), tenantId },
    include: {
      project: true,
      contract: true,
    },
  });

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
  await prisma.applicationForPayment.update({
    where: { id: Number(afpId) },
    data: {
      payLessNoticeDocument: url,
      payLessNoticeSent: true,
      payLessNoticeSentAt: new Date(),
      payLessNoticeAmount: Number(payLessAmount),
      payLessNoticeReason: payLessReason || '',
    },
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
  const afp = await prisma.applicationForPayment.findFirst({
    where: { id: Number(afpId), tenantId },
    select: {
      paymentCertificateUrl: true,
      paymentCertificateGeneratedAt: true,
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
      url: afp.paymentCertificateUrl,
      generatedAt: afp.paymentCertificateGeneratedAt,
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
  if (!afp.paymentCertificateUrl) {
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
