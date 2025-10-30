/**
 * Email Service for Tender Management
 *
 * Handles sending emails for tender invitations, notifications, etc.
 * Gracefully handles missing email provider configuration.
 */

// Try to load nodemailer if available
let nodemailer;
let emailConfigured = false;

try {
  nodemailer = require('nodemailer');

  // Check if email is configured via environment variables
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    emailConfigured = true;
  }
} catch (e) {
  console.warn('[EmailService] nodemailer not installed - emails will be logged only');
}

// Create transporter if email is configured
let transporter = null;

if (emailConfigured && nodemailer) {
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    console.log('[EmailService] Email transport configured successfully');
  } catch (e) {
    console.error('[EmailService] Failed to configure email transport:', e.message);
    transporter = null;
  }
}

/**
 * Send a tender invitation email to a supplier
 * @param {Object} options - Email options
 * @param {Object} options.supplier - Supplier details
 * @param {Object} options.tender - Tender details
 * @param {Object} options.invitation - Invitation record
 * @param {string} options.projectName - Project name
 * @param {string} options.packageName - Package name
 */
async function sendTenderInvitation(options) {
  const { supplier, tender, invitation, projectName, packageName } = options;

  const appUrl = process.env.APP_BASE_URL || process.env.VITE_APP_BASE_URL || 'http://localhost:5173';
  const invitationUrl = `${appUrl}/supplier-portal/tender/${tender.id}?token=${invitation.accessToken}`;

  const emailData = {
    to: supplier.email,
    subject: `Tender Invitation: ${tender.title || 'New Tender Opportunity'}`,
    html: generateInvitationEmailHTML({
      supplierName: supplier.name,
      contactName: supplier.contactName || 'Supplier',
      tenderTitle: tender.title || 'Tender',
      projectName,
      packageName,
      deadline: tender.deadline,
      invitationUrl,
      tenderRef: tender.referenceNumber || `T-${tender.id}`
    }),
    text: generateInvitationEmailText({
      supplierName: supplier.name,
      contactName: supplier.contactName || 'Supplier',
      tenderTitle: tender.title || 'Tender',
      projectName,
      packageName,
      deadline: tender.deadline,
      invitationUrl,
      tenderRef: tender.referenceNumber || `T-${tender.id}`
    })
  };

  return sendEmail(emailData);
}

/**
 * Core email sending function
 * @param {Object} emailData - Email data (to, subject, html, text)
 */
async function sendEmail(emailData) {
  if (!transporter) {
    // Email not configured - log instead
    console.log('[EmailService] Email would be sent:', {
      to: emailData.to,
      subject: emailData.subject,
      preview: emailData.text?.substring(0, 100) + '...'
    });

    return {
      success: false,
      message: 'Email service not configured - email logged to console',
      logged: true
    };
  }

  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('[EmailService] Email sent successfully:', {
      to: emailData.to,
      messageId: info.messageId
    });

    return {
      success: true,
      messageId: info.messageId
    };
  } catch (error) {
    console.error('[EmailService] Failed to send email:', error);

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate HTML for tender invitation email
 */
function generateInvitationEmailHTML(data) {
  const {
    contactName,
    supplierName,
    tenderTitle,
    projectName,
    packageName,
    deadline,
    invitationUrl,
    tenderRef
  } = data;

  const deadlineFormatted = deadline
    ? new Date(deadline).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'TBA';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tender Invitation</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">Tender Invitation</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">You've been invited to submit a tender</p>
  </div>

  <div style="background: #f8f9fa; padding: 30px 20px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="margin-top: 0;">Dear ${contactName},</p>

    <p>You are invited to submit a tender for the following opportunity:</p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 140px;">Reference:</td>
          <td style="padding: 8px 0;">${tenderRef}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Tender Title:</td>
          <td style="padding: 8px 0;">${tenderTitle}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Project:</td>
          <td style="padding: 8px 0;">${projectName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Package:</td>
          <td style="padding: 8px 0;">${packageName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Submission Deadline:</td>
          <td style="padding: 8px 0; color: #d32f2f; font-weight: bold;">${deadlineFormatted}</td>
        </tr>
      </table>
    </div>

    <p style="margin-bottom: 25px;">
      To view the full tender documentation, requirements, and submit your response, please click the button below:
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${invitationUrl}"
         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;
                padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        View Tender &amp; Submit Response
      </a>
    </div>

    <p style="font-size: 13px; color: #666; margin-top: 30px;">
      <strong>Note:</strong> This invitation link is unique to ${supplierName}.
      Please do not share this link with others.
    </p>

    <p style="font-size: 13px; color: #666;">
      If you have any questions about this tender opportunity, please contact us through the tender portal
      or reply to this email.
    </p>
  </div>

  <div style="background: #e0e0e0; padding: 20px; text-align: center; font-size: 12px; color: #666;
              border-radius: 0 0 8px 8px;">
    <p style="margin: 0;">This is an automated message from the Tender Management System.</p>
    <p style="margin: 10px 0 0 0;">
      If you cannot click the button above, copy and paste this URL into your browser:<br>
      <span style="word-break: break-all; color: #667eea;">${invitationUrl}</span>
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text for tender invitation email
 */
function generateInvitationEmailText(data) {
  const {
    contactName,
    tenderTitle,
    projectName,
    packageName,
    deadline,
    invitationUrl,
    tenderRef
  } = data;

  const deadlineFormatted = deadline
    ? new Date(deadline).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'TBA';

  return `
TENDER INVITATION
==================

Dear ${contactName},

You are invited to submit a tender for the following opportunity:

Reference: ${tenderRef}
Tender Title: ${tenderTitle}
Project: ${projectName}
Package: ${packageName}
Submission Deadline: ${deadlineFormatted}

To view the full tender documentation and submit your response, please visit:
${invitationUrl}

This invitation link is unique to your organization. Please do not share this link with others.

If you have any questions about this tender opportunity, please contact us through the tender portal or reply to this email.

---
This is an automated message from the Tender Management System.
  `.trim();
}

module.exports = {
  sendTenderInvitation,
  sendEmail,
  isConfigured: () => transporter !== null
};
