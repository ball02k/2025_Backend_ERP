/**
 * Email Templates for ERP System
 *
 * Usage:
 *   const { paymentCertificateEmail } = require('../templates/emailTemplates.cjs');
 *   const { html, text } = paymentCertificateEmail(data);
 */

/**
 * Format date as DD/MM/YYYY
 * @param {Date|string} date
 * @returns {string}
 */
function formatDate(date) {
  if (!date) return 'TBC';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Payment Certificate Email Template
 * @param {Object} data - Template data
 * @param {string} data.supplier_name - Supplier company name
 * @param {string} data.certificate_number - Certificate reference number
 * @param {string} data.project_name - Project name
 * @param {number} data.amount - Certified amount
 * @param {Date|string} data.due_date - Payment due date
 * @param {string} [data.company_name] - Your company name
 * @param {string} [data.application_number] - Application number
 * @param {string} [data.contract_title] - Contract title
 * @returns {Object} { html, text } email content
 */
function paymentCertificateEmail(data) {
  const {
    supplier_name = 'Supplier',
    certificate_number,
    project_name,
    amount,
    due_date,
    company_name = 'Accounts Team',
    application_number,
    contract_title
  } = data;

  const formattedAmount = typeof amount === 'number'
    ? amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';

  const formattedDueDate = formatDate(due_date);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Certificate Issued</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f9fafb;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <div style="background-color: #1e40af; padding: 30px 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
        Payment Certificate Issued
      </h1>
    </div>

    <!-- Content -->
    <div style="padding: 40px 30px;">
      <p style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">
        Dear <strong>${supplier_name}</strong>,
      </p>

      <p style="font-size: 16px; color: #374151; line-height: 1.6; margin: 0 0 25px 0;">
        Please find attached the payment certificate for your recent application.
        This confirms the amount certified for payment under your contract.
      </p>

      <!-- Certificate Details Box -->
      <div style="background-color: #f3f4f6; border-left: 4px solid #3b82f6; padding: 25px; border-radius: 8px; margin: 30px 0;">
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">
          Certificate Details
        </h2>

        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 500;">
              Certificate Number:
            </td>
            <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">
              ${certificate_number}
            </td>
          </tr>
          ${application_number ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 500;">
              Application:
            </td>
            <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">
              ${application_number}
            </td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 500;">
              Project:
            </td>
            <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">
              ${project_name}
            </td>
          </tr>
          ${contract_title ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 500;">
              Contract:
            </td>
            <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">
              ${contract_title}
            </td>
          </tr>
          ` : ''}
          <tr>
            <td colspan="2" style="padding-top: 15px;">
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 10px 0;">
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 500;">
              Certified Amount:
            </td>
            <td style="padding: 8px 0; color: #059669; font-size: 18px; font-weight: 700; text-align: right;">
              £${formattedAmount}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 500;">
              Payment Due:
            </td>
            <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">
              ${formattedDueDate}
            </td>
          </tr>
        </table>
      </div>

      <!-- Payment Notice -->
      <div style="background-color: #fffbeb; border: 1px solid #fbbf24; padding: 15px; border-radius: 6px; margin: 25px 0;">
        <p style="font-size: 13px; color: #92400e; margin: 0; line-height: 1.5;">
          <strong>⚠️ Payment Notice:</strong> Payment will be made in accordance with the contract terms
          and UK Construction Act 1996. This certificate constitutes formal notice of the amount due for payment.
        </p>
      </div>

      <p style="font-size: 16px; color: #374151; line-height: 1.6; margin: 25px 0 0 0;">
        If you have any questions regarding this certificate or payment, please do not hesitate to contact us.
      </p>

      <!-- Signature -->
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 16px; color: #374151; margin: 0;">
          Best regards,
        </p>
        <p style="font-size: 16px; color: #1f2937; font-weight: 600; margin: 10px 0 0 0;">
          ${company_name}
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f9fafb; padding: 25px 30px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #6b7280; margin: 0; line-height: 1.5; text-align: center;">
        This is an automated message from the ERP system. Please do not reply directly to this email.
      </p>
      <p style="font-size: 12px; color: #9ca3af; margin: 10px 0 0 0; text-align: center;">
        For support or queries, please contact your project manager or accounts team.
      </p>
    </div>
  </div>
</body>
</html>
`;

  const text = `
Payment Certificate Issued

Dear ${supplier_name},

Please find attached the payment certificate for your recent application. This confirms the amount certified for payment under your contract.

CERTIFICATE DETAILS
-------------------
Certificate Number: ${certificate_number}
${application_number ? `Application: ${application_number}\n` : ''}Project: ${project_name}
${contract_title ? `Contract: ${contract_title}\n` : ''}
Certified Amount: £${formattedAmount}
Payment Due: ${formattedDueDate}

PAYMENT NOTICE: Payment will be made in accordance with the contract terms and UK Construction Act 1996. This certificate constitutes formal notice of the amount due for payment.

If you have any questions regarding this certificate or payment, please do not hesitate to contact us.

Best regards,
${company_name}

---
This is an automated message from the ERP system. Please do not reply directly to this email.
For support or queries, please contact your project manager or accounts team.
`;

  return { html, text };
}

module.exports = {
  paymentCertificateEmail
};
