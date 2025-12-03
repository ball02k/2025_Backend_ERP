/**
 * Payment Certificate PDF Generation Service
 *
 * Generates professional payment certificates, payment notices, and pay-less notices
 * using pdfkit for UK Construction Act compliance
 */

const PDFDocument = require('pdfkit');

/**
 * Generate Payment Certificate PDF
 * @param {Object} paymentApplication - Full payment application with relations
 * @param {Object} options - Generation options (tenant, company info)
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generatePaymentCertificatePdf(paymentApplication, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        info: {
          Title: `Payment Certificate PC-${paymentApplication.applicationNo}`,
          Author: options.tenant?.name || 'ERP System',
          Subject: 'Payment Certificate',
          Keywords: 'payment, certificate, construction',
        }
      });

      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Company Header
      if (options.tenant?.logo) {
        // Add company logo if provided
        try {
          doc.image(options.tenant.logo, 50, 50, { width: 100 });
        } catch (e) {
          console.warn('Could not load company logo:', e.message);
        }
      }

      doc.fontSize(10).font('Helvetica');
      doc.text(options.tenant?.name || 'Construction Company', 400, 50, { align: 'right', width: 150 });
      doc.fontSize(8);
      if (options.tenant?.address) doc.text(options.tenant.address, 400, 65, { align: 'right', width: 150 });
      if (options.tenant?.phone) doc.text(options.tenant.phone, 400, 90, { align: 'right', width: 150 });

      doc.moveDown(3);

      // Title
      doc.fontSize(24).font('Helvetica-Bold')
         .fillColor('#1a1a1a')
         .text('PAYMENT CERTIFICATE', { align: 'center' });

      doc.fontSize(10).font('Helvetica')
         .fillColor('#666666')
         .text('Issued under the Housing Grants, Construction and Regeneration Act 1996', { align: 'center' });

      doc.moveDown(2);

      // Certificate Reference Box
      doc.rect(50, doc.y, 495, 60)
         .fillAndStroke('#f5f5f5', '#cccccc')
         .fillColor('#000000');

      const boxY = doc.y + 10;
      doc.fontSize(10).font('Helvetica-Bold')
         .text('Certificate No:', 60, boxY);
      doc.font('Helvetica')
         .text(`PC-${paymentApplication.applicationNo || paymentApplication.id}`, 160, boxY);

      doc.font('Helvetica-Bold')
         .text('Issue Date:', 320, boxY);
      doc.font('Helvetica')
         .text(formatDate(paymentApplication.certifiedDate || new Date()), 420, boxY);

      doc.font('Helvetica-Bold')
         .text('Valuation Date:', 60, boxY + 20);
      doc.font('Helvetica')
         .text(formatDate(paymentApplication.periodEnd || paymentApplication.valuationDate), 160, boxY + 20);

      doc.font('Helvetica-Bold')
         .text('Payment Due:', 320, boxY + 20);
      doc.font('Helvetica')
         .text(formatDate(paymentApplication.dueDate), 420, boxY + 20);

      doc.moveDown(5);

      // Contract Details Section
      drawSection(doc, 'Contract Details', [
        ['Contract Reference:', paymentApplication.contract?.contractRef || paymentApplication.contract?.title || 'N/A'],
        ['Project:', paymentApplication.project?.name || 'N/A'],
        ['Subcontractor:', paymentApplication.supplier?.name || paymentApplication.contract?.supplier?.name || 'N/A'],
        ['Application Period:', paymentApplication.title || `Application ${paymentApplication.applicationNo}`],
      ]);

      doc.moveDown(1.5);

      // Valuation Summary Table
      doc.fontSize(12).font('Helvetica-Bold')
         .fillColor('#1a1a1a')
         .text('Valuation Summary');

      doc.moveDown(0.5);

      const tableData = [
        { label: 'Gross Value of Work to Date', amount: paymentApplication.certifiedGrossValue || paymentApplication.grossVal || paymentApplication.claimedGrossValue, bold: false },
        { label: 'Less: Retention (' + (paymentApplication.retentionPct || paymentApplication.retentionPercentage || 5) + '%)', amount: -(paymentApplication.certifiedRetention || paymentApplication.retention || 0), bold: false },
        { label: 'Net Value to Date', amount: (paymentApplication.certifiedGrossValue || paymentApplication.grossVal || 0) - (paymentApplication.certifiedRetention || paymentApplication.retention || 0), bold: false },
        { label: 'Less: Previously Certified', amount: -(paymentApplication.certifiedPreviouslyPaid || paymentApplication.prevPaid || 0), bold: false },
        { label: '', amount: null, bold: false, divider: true },
        { label: 'NET AMOUNT CERTIFIED THIS PERIOD', amount: paymentApplication.certifiedThisPeriod || paymentApplication.netDue || paymentApplication.certifiedNetValue, bold: true },
      ];

      drawFinancialTable(doc, tableData);

      doc.moveDown(2);

      // Notes section if present
      if (paymentApplication.qsNotes || paymentApplication.certificationNotes) {
        doc.fontSize(12).font('Helvetica-Bold')
           .text('Notes');
        doc.fontSize(10).font('Helvetica')
           .text(paymentApplication.qsNotes || paymentApplication.certificationNotes, { width: 495 });
        doc.moveDown(1.5);
      }

      // Construction Act Notice
      doc.rect(50, doc.y, 495, 80)
         .fillAndStroke('#fff9e6', '#ffcc00')
         .fillColor('#000000');

      const noticeY = doc.y + 10;
      doc.fontSize(10).font('Helvetica-Bold')
         .text('CONSTRUCTION ACT NOTICE', 60, noticeY);
      doc.fontSize(9).font('Helvetica')
         .text('This certificate constitutes a payment notice under Section 110A of the Housing Grants, Construction and Regeneration Act 1996 (as amended). Payment of the certified amount is due by the final payment date shown above.', 60, noticeY + 20, { width: 475 });
      doc.text('If the paying party intends to pay less than the certified amount, a Pay Less Notice must be issued at least 5 days before the final date for payment.', 60, noticeY + 50, { width: 475 });

      doc.moveDown(6);

      // Signature Block
      if (doc.y > 650) {
        doc.addPage();
      }

      doc.fontSize(10).font('Helvetica-Bold')
         .text('Certification');
      doc.moveDown(0.5);

      doc.fontSize(9).font('Helvetica')
         .text('Certified by: ' + (paymentApplication.qsName || options.certifiedBy || '_______________________________'));
      doc.moveDown(0.5);
      doc.text('Position: Quantity Surveyor / Cost Manager');
      doc.moveDown(0.5);
      doc.text('Date: ' + formatDate(paymentApplication.certifiedDate || new Date()));
      doc.moveDown(0.5);
      doc.text('Signature: _______________________________');

      // Footer
      const footerY = 750;
      doc.fontSize(8).font('Helvetica')
         .fillColor('#666666')
         .text('Generated by ERP System | ' + formatDate(new Date(), true),
               50, footerY, { align: 'center', width: 495 });
      doc.text(`Certificate Reference: PC-${paymentApplication.applicationNo || paymentApplication.id} | Page 1`,
               50, footerY + 12, { align: 'center', width: 495 });

      doc.end();
    } catch (error) {
      console.error('[PDF Generation] Error generating payment certificate:', error);
      reject(error);
    }
  });
}

/**
 * Generate Payment Notice PDF
 * @param {Object} paymentApplication - Full payment application with relations
 * @param {Object} options - Generation options
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generatePaymentNoticePdf(paymentApplication, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        info: {
          Title: `Payment Notice PN-${paymentApplication.applicationNo}`,
          Author: options.tenant?.name || 'ERP System',
          Subject: 'Payment Notice',
        }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold')
         .fillColor('#1a1a1a')
         .text('PAYMENT NOTICE', { align: 'center' });

      doc.fontSize(10).font('Helvetica')
         .fillColor('#666666')
         .text('Issued under Section 110A of the Construction Act 1996', { align: 'center' });

      doc.moveDown(2);

      // Notice details
      drawSection(doc, 'Notice Details', [
        ['Notice No:', `PN-${paymentApplication.applicationNo || paymentApplication.id}`],
        ['Issue Date:', formatDate(paymentApplication.paymentNoticeSentAt || new Date())],
        ['Application No:', paymentApplication.applicationNo || paymentApplication.id],
        ['Contract:', paymentApplication.contract?.contractRef || 'N/A'],
        ['Project:', paymentApplication.project?.name || 'N/A'],
        ['Subcontractor:', paymentApplication.supplier?.name || 'N/A'],
      ]);

      doc.moveDown(2);

      // Payment amount box
      doc.rect(50, doc.y, 495, 80)
         .fillAndStroke('#e6f3ff', '#0066cc')
         .fillColor('#000000');

      const amountY = doc.y + 15;
      doc.fontSize(12).font('Helvetica-Bold')
         .text('AMOUNT TO BE PAID', 60, amountY, { align: 'center', width: 475 });
      doc.fontSize(28).font('Helvetica-Bold')
         .fillColor('#0066cc')
         .text('£' + formatCurrency(paymentApplication.paymentNoticeAmount || paymentApplication.certifiedThisPeriod || paymentApplication.netDue),
               60, amountY + 25, { align: 'center', width: 475 });
      doc.fontSize(10).font('Helvetica')
         .fillColor('#000000')
         .text('Final Date for Payment: ' + formatDate(paymentApplication.dueDate),
               60, amountY + 58, { align: 'center', width: 475 });

      doc.moveDown(5);

      // Construction Act Notice
      doc.fontSize(10).font('Helvetica-Bold')
         .text('CONSTRUCTION ACT REQUIREMENTS');
      doc.fontSize(9).font('Helvetica')
         .text('This payment notice specifies the sum considered due and the basis of its calculation. Payment must be made by the final date for payment stated above.', { width: 495 });
      doc.moveDown();
      doc.text('If you intend to pay less than the notified sum, you must issue a Pay Less Notice at least 5 days before the final date for payment, stating the sum you consider due and the basis of calculation.', { width: 495 });

      doc.moveDown(2);

      // Footer
      const footerY = 750;
      doc.fontSize(8).fillColor('#666666')
         .text('Generated by ERP System | ' + formatDate(new Date(), true),
               50, footerY, { align: 'center', width: 495 });

      doc.end();
    } catch (error) {
      console.error('[PDF Generation] Error generating payment notice:', error);
      reject(error);
    }
  });
}

/**
 * Generate Pay-Less Notice PDF
 * @param {Object} paymentApplication - Full payment application with relations
 * @param {Object} options - Generation options (must include payLessAmount and payLessReason)
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generatePayLessNoticePdf(paymentApplication, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        info: {
          Title: `Pay-Less Notice PL-${paymentApplication.applicationNo}`,
          Author: options.tenant?.name || 'ERP System',
          Subject: 'Pay Less Notice',
        }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold')
         .fillColor('#cc0000')
         .text('PAY LESS NOTICE', { align: 'center' });

      doc.fontSize(10).font('Helvetica')
         .fillColor('#666666')
         .text('Issued under Section 111 of the Construction Act 1996', { align: 'center' });

      doc.moveDown(2);

      // Notice details
      drawSection(doc, 'Notice Details', [
        ['Notice No:', `PL-${paymentApplication.applicationNo || paymentApplication.id}`],
        ['Issue Date:', formatDate(paymentApplication.payLessNoticeSentAt || new Date())],
        ['Application No:', paymentApplication.applicationNo || paymentApplication.id],
        ['Contract:', paymentApplication.contract?.contractRef || 'N/A'],
        ['Project:', paymentApplication.project?.name || 'N/A'],
        ['Subcontractor:', paymentApplication.supplier?.name || 'N/A'],
      ]);

      doc.moveDown(2);

      // Amount comparison
      const originalAmount = paymentApplication.paymentNoticeAmount || paymentApplication.certifiedThisPeriod || paymentApplication.netDue || 0;
      const payLessAmount = options.payLessAmount || paymentApplication.payLessNoticeAmount || 0;
      const deduction = originalAmount - payLessAmount;

      doc.fontSize(12).font('Helvetica-Bold')
         .fillColor('#1a1a1a')
         .text('Amount Adjustment');

      doc.moveDown(0.5);

      const adjustmentTable = [
        { label: 'Original Payment Notice Amount', amount: originalAmount, bold: false },
        { label: 'Less: Deduction', amount: -deduction, bold: false },
        { label: '', amount: null, bold: false, divider: true },
        { label: 'REVISED AMOUNT TO BE PAID', amount: payLessAmount, bold: true },
      ];

      drawFinancialTable(doc, adjustmentTable);

      doc.moveDown(2);

      // Reason box
      doc.fontSize(12).font('Helvetica-Bold')
         .text('Reason for Pay Less Notice');
      doc.moveDown(0.5);

      doc.rect(50, doc.y, 495, 120)
         .fillAndStroke('#fff5f5', '#cc0000')
         .fillColor('#000000');

      doc.fontSize(10).font('Helvetica')
         .text(options.payLessReason || paymentApplication.payLessNoticeReason || paymentApplication.payLessReason || 'No reason provided',
               60, doc.y + 10, { width: 475, height: 100 });

      doc.moveDown(8);

      // Final payment date
      doc.rect(50, doc.y, 495, 40)
         .fillAndStroke('#fff5f5', '#cc0000')
         .fillColor('#000000');

      doc.fontSize(10).font('Helvetica-Bold')
         .text('Final Date for Payment: ' + formatDate(paymentApplication.dueDate),
               60, doc.y + 15, { align: 'center', width: 475 });

      doc.moveDown(3);

      // Construction Act Notice
      doc.fontSize(10).font('Helvetica-Bold')
         .text('CONSTRUCTION ACT NOTICE');
      doc.fontSize(9).font('Helvetica')
         .text('This notice is issued under Section 111 of the Housing Grants, Construction and Regeneration Act 1996 (as amended). It notifies the payee that the paying party intends to pay less than the notified sum and sets out the sum considered due and the basis of its calculation.', { width: 495 });

      doc.moveDown(2);

      // Footer
      const footerY = 750;
      doc.fontSize(8).fillColor('#666666')
         .text('Generated by ERP System | ' + formatDate(new Date(), true),
               50, footerY, { align: 'center', width: 495 });

      doc.end();
    } catch (error) {
      console.error('[PDF Generation] Error generating pay-less notice:', error);
      reject(error);
    }
  });
}

// Helper Functions

function drawSection(doc, title, items) {
  doc.fontSize(12).font('Helvetica-Bold')
     .fillColor('#1a1a1a')
     .text(title);
  doc.moveDown(0.5);

  doc.fontSize(10).font('Helvetica');
  items.forEach(([label, value]) => {
    doc.font('Helvetica-Bold')
       .text(label, 60, doc.y, { continued: true, width: 180 });
    doc.font('Helvetica')
       .text(value, { width: 295 });
    doc.moveDown(0.3);
  });
}

function drawFinancialTable(doc, rows) {
  const startY = doc.y;
  const colX = [60, 400];
  const rowHeight = 25;
  let currentY = startY;

  rows.forEach((row, index) => {
    if (row.divider) {
      doc.moveTo(60, currentY - 5)
         .lineTo(535, currentY - 5)
         .stroke('#cccccc');
      currentY += 5;
      return;
    }

    const font = row.bold ? 'Helvetica-Bold' : 'Helvetica';
    const fontSize = row.bold ? 11 : 10;

    doc.font(font).fontSize(fontSize);

    // Label
    doc.text(row.label, colX[0], currentY, { width: 330 });

    // Amount
    if (row.amount !== null && row.amount !== undefined) {
      const amountText = row.amount < 0
        ? '(' + formatCurrency(Math.abs(row.amount)) + ')'
        : formatCurrency(row.amount);
      doc.text('£' + amountText, colX[1], currentY, { width: 135, align: 'right' });
    }

    currentY += rowHeight;
  });

  doc.y = currentY;
}

function formatCurrency(value) {
  if (value === null || value === undefined) return '0.00';
  const num = parseFloat(value);
  return num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(date, includeTime = false) {
  if (!date) return 'N/A';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  if (includeTime) {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  return `${day}/${month}/${year}`;
}

module.exports = {
  generatePaymentCertificatePdf,
  generatePaymentNoticePdf,
  generatePayLessNoticePdf,
};
