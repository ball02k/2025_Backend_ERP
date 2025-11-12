/**
 * Email Service for Contract Variations
 *
 * Handles sending emails for variation workflow events:
 * - Variation created
 * - Quotation requested
 * - Quotation received
 * - Approval required
 * - Approved/Rejected
 * - Implemented
 */

const { sendEmail } = require('./email.service.cjs');

const APP_URL = process.env.APP_BASE_URL || process.env.VITE_APP_BASE_URL || 'http://localhost:5173';

/**
 * Send email when variation is created
 * Notifies Project Manager
 */
async function sendVariationCreated({ variation, contract, project, creator }) {
  const variationUrl = `${APP_URL}/contracts/${contract.id}?tab=variations&variation=${variation.id}`;

  const emailData = {
    to: process.env.PM_EMAIL || 'pm@example.com', // TODO: Get from project
    subject: `New Variation Created: ${variation.variationNumber} - ${variation.title}`,
    html: generateVariationCreatedHTML({
      variationNumber: variation.variationNumber,
      title: variation.title,
      category: variation.category,
      estimatedValue: variation.estimatedValue,
      urgency: variation.urgency,
      contractRef: contract.contractRef || `Contract #${contract.id}`,
      projectName: project?.name || 'Unknown Project',
      creatorName: creator?.name || 'Unknown User',
      variationUrl
    }),
    text: generateVariationCreatedText({
      variationNumber: variation.variationNumber,
      title: variation.title,
      category: variation.category,
      estimatedValue: variation.estimatedValue,
      urgency: variation.urgency,
      contractRef: contract.contractRef || `Contract #${contract.id}`,
      projectName: project?.name || 'Unknown Project',
      creatorName: creator?.name || 'Unknown User',
      variationUrl
    })
  };

  return sendEmail(emailData);
}

/**
 * Send email when quotation is requested from contractor
 */
async function sendQuotationRequest({ variation, contract, project, supplier, requiredByDate }) {
  const variationUrl = `${APP_URL}/supplier-portal/variation/${variation.id}?token=xxx`; // TODO: Generate token

  const emailData = {
    to: supplier.email,
    subject: `Quotation Request: ${variation.variationNumber} - ${variation.title}`,
    html: generateQuotationRequestHTML({
      variationNumber: variation.variationNumber,
      title: variation.title,
      description: variation.description,
      category: variation.category,
      estimatedValue: variation.estimatedValue,
      contractRef: contract.contractRef || `Contract #${contract.id}`,
      projectName: project?.name || 'Unknown Project',
      supplierName: supplier.name,
      contactName: supplier.contactName || 'Supplier',
      requiredByDate,
      variationUrl
    }),
    text: generateQuotationRequestText({
      variationNumber: variation.variationNumber,
      title: variation.title,
      description: variation.description,
      category: variation.category,
      contractRef: contract.contractRef || `Contract #${contract.id}`,
      projectName: project?.name || 'Unknown Project',
      contactName: supplier.contactName || 'Supplier',
      requiredByDate,
      variationUrl
    })
  };

  return sendEmail(emailData);
}

/**
 * Send email when contractor submits quotation
 * Notifies PM and Cost Manager
 */
async function sendQuotationReceived({ variation, contract, project, quotedValue }) {
  const variationUrl = `${APP_URL}/contracts/${contract.id}?tab=variations&variation=${variation.id}`;

  const variance = quotedValue - (variation.estimatedValue || 0);
  const variancePercent = variation.estimatedValue ? ((variance / variation.estimatedValue) * 100).toFixed(1) : 0;

  const emailData = {
    to: [process.env.PM_EMAIL, process.env.CM_EMAIL].filter(Boolean).join(',') || 'pm@example.com',
    subject: `Quotation Received: ${variation.variationNumber} - ${variation.title}`,
    html: generateQuotationReceivedHTML({
      variationNumber: variation.variationNumber,
      title: variation.title,
      estimatedValue: variation.estimatedValue,
      quotedValue,
      variance,
      variancePercent,
      contractRef: contract.contractRef || `Contract #${contract.id}`,
      projectName: project?.name || 'Unknown Project',
      variationUrl
    }),
    text: generateQuotationReceivedText({
      variationNumber: variation.variationNumber,
      title: variation.title,
      estimatedValue: variation.estimatedValue,
      quotedValue,
      variance,
      variancePercent,
      contractRef: contract.contractRef || `Contract #${contract.id}`,
      projectName: project?.name || 'Unknown Project',
      variationUrl
    })
  };

  return sendEmail(emailData);
}

/**
 * Send email when approval is required
 * Notifies specific approver
 */
async function sendApprovalRequired({ variation, contract, project, approverEmail, approverRole }) {
  const variationUrl = `${APP_URL}/contracts/${contract.id}?tab=variations&variation=${variation.id}`;

  const emailData = {
    to: approverEmail,
    subject: `Approval Required: ${variation.variationNumber} - ${variation.title}`,
    html: generateApprovalRequiredHTML({
      variationNumber: variation.variationNumber,
      title: variation.title,
      category: variation.category,
      approvedValue: variation.approvedValue || variation.negotiatedValue || variation.quotedValue || variation.estimatedValue,
      extensionClaimed: variation.extensionClaimed,
      contractRef: contract.contractRef || `Contract #${contract.id}`,
      projectName: project?.name || 'Unknown Project',
      approverRole,
      variationUrl
    }),
    text: generateApprovalRequiredText({
      variationNumber: variation.variationNumber,
      title: variation.title,
      category: variation.category,
      approvedValue: variation.approvedValue || variation.negotiatedValue || variation.quotedValue || variation.estimatedValue,
      extensionClaimed: variation.extensionClaimed,
      contractRef: contract.contractRef || `Contract #${contract.id}`,
      projectName: project?.name || 'Unknown Project',
      approverRole,
      variationUrl
    })
  };

  return sendEmail(emailData);
}

/**
 * Send email when variation is approved
 * Notifies originator, contractor, and stakeholders
 */
async function sendVariationApproved({ variation, contract, project, approvedValue }) {
  const variationUrl = `${APP_URL}/contracts/${contract.id}?tab=variations&variation=${variation.id}`;

  const emailData = {
    to: [process.env.PM_EMAIL, process.env.CONTRACTOR_EMAIL].filter(Boolean).join(',') || 'pm@example.com',
    subject: `Variation Approved: ${variation.variationNumber} - ${variation.title}`,
    html: generateVariationApprovedHTML({
      variationNumber: variation.variationNumber,
      title: variation.title,
      approvedValue,
      extensionGranted: variation.extensionGranted,
      contractRef: contract.contractRef || `Contract #${contract.id}`,
      projectName: project?.name || 'Unknown Project',
      variationUrl
    }),
    text: generateVariationApprovedText({
      variationNumber: variation.variationNumber,
      title: variation.title,
      approvedValue,
      extensionGranted: variation.extensionGranted,
      contractRef: contract.contractRef || `Contract #${contract.id}`,
      projectName: project?.name || 'Unknown Project',
      variationUrl
    })
  };

  return sendEmail(emailData);
}

/**
 * Send email when variation is rejected
 * Notifies originator
 */
async function sendVariationRejected({ variation, contract, project, rejectionReason, rejectedBy }) {
  const variationUrl = `${APP_URL}/contracts/${contract.id}?tab=variations&variation=${variation.id}`;

  const emailData = {
    to: process.env.PM_EMAIL || 'pm@example.com', // TODO: Get originator email
    subject: `Variation Rejected: ${variation.variationNumber} - ${variation.title}`,
    html: generateVariationRejectedHTML({
      variationNumber: variation.variationNumber,
      title: variation.title,
      rejectionReason,
      rejectedBy,
      contractRef: contract.contractRef || `Contract #${contract.id}`,
      projectName: project?.name || 'Unknown Project',
      variationUrl
    }),
    text: generateVariationRejectedText({
      variationNumber: variation.variationNumber,
      title: variation.title,
      rejectionReason,
      rejectedBy,
      contractRef: contract.contractRef || `Contract #${contract.id}`,
      projectName: project?.name || 'Unknown Project',
      variationUrl
    })
  };

  return sendEmail(emailData);
}

// ============================================================================
// HTML EMAIL TEMPLATES
// ============================================================================

function generateVariationCreatedHTML(data) {
  const {
    variationNumber,
    title,
    category,
    estimatedValue,
    urgency,
    contractRef,
    projectName,
    creatorName,
    variationUrl
  } = data;

  const urgencyColor = urgency === 'critical' ? '#d32f2f' : urgency === 'urgent' ? '#f57c00' : '#666';
  const categoryColor = category === 'Addition' ? '#2e7d32' : category === 'Omission' ? '#d32f2f' : '#1976d2';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Variation Created</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">New Contract Variation</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 18px;">${variationNumber}</p>
  </div>

  <div style="background: #f8f9fa; padding: 30px 20px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="margin-top: 0;">A new contract variation has been created and requires your attention.</p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${categoryColor};">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 140px;">Variation:</td>
          <td style="padding: 8px 0;">${variationNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Title:</td>
          <td style="padding: 8px 0;">${title}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Category:</td>
          <td style="padding: 8px 0; color: ${categoryColor}; font-weight: bold;">${category}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Estimated Value:</td>
          <td style="padding: 8px 0;">£${(estimatedValue || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Urgency:</td>
          <td style="padding: 8px 0; color: ${urgencyColor}; font-weight: bold;">${urgency.toUpperCase()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Contract:</td>
          <td style="padding: 8px 0;">${contractRef}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Project:</td>
          <td style="padding: 8px 0;">${projectName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Created By:</td>
          <td style="padding: 8px 0;">${creatorName}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${variationUrl}"
         style="display: inline-block; background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%); color: white;
                padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        Review Variation
      </a>
    </div>

    <p style="font-size: 13px; color: #666; margin-top: 30px;">
      <strong>Next Steps:</strong> Please review the variation details and supporting documentation.
      ${urgency === 'critical' || urgency === 'urgent' ? '<br><strong style="color: #d32f2f;">This variation requires immediate attention.</strong>' : ''}
    </p>
  </div>

  <div style="background: #e0e0e0; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px;">
    <p style="margin: 0;">This is an automated message from the Contract Management System.</p>
  </div>
</body>
</html>
  `.trim();
}

function generateQuotationRequestHTML(data) {
  const {
    variationNumber,
    title,
    description,
    category,
    estimatedValue,
    contractRef,
    projectName,
    supplierName,
    contactName,
    requiredByDate,
    variationUrl
  } = data;

  const deadlineFormatted = requiredByDate
    ? new Date(requiredByDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : 'As soon as possible';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quotation Request</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #f57c00 0%, #ef6c00 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">Quotation Request</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">${variationNumber}</p>
  </div>

  <div style="background: #f8f9fa; padding: 30px 20px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="margin-top: 0;">Dear ${contactName},</p>

    <p>We request your quotation for the following contract variation:</p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f57c00;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 140px;">Variation:</td>
          <td style="padding: 8px 0;">${variationNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Title:</td>
          <td style="padding: 8px 0;">${title}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Category:</td>
          <td style="padding: 8px 0;">${category}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Contract:</td>
          <td style="padding: 8px 0;">${contractRef}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Project:</td>
          <td style="padding: 8px 0;">${projectName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Quotation Required By:</td>
          <td style="padding: 8px 0; color: #d32f2f; font-weight: bold;">${deadlineFormatted}</td>
        </tr>
      </table>
    </div>

    ${description ? `
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0; font-size: 14px; color: #666; text-transform: uppercase;">Description</h3>
      <p style="margin-bottom: 0; white-space: pre-wrap;">${description}</p>
    </div>
    ` : ''}

    <p>Please provide:</p>
    <ul style="margin: 10px 0;">
      <li>Detailed cost breakdown (labour, materials, plant, prelims)</li>
      <li>Programme impact (if any)</li>
      <li>Any qualifications or assumptions</li>
      <li>Supporting documentation</li>
    </ul>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${variationUrl}"
         style="display: inline-block; background: linear-gradient(135deg, #f57c00 0%, #ef6c00 100%); color: white;
                padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        Submit Quotation
      </a>
    </div>

    <p style="font-size: 13px; color: #666; margin-top: 30px;">
      <strong>Note:</strong> This quotation link is unique to ${supplierName}.
    </p>
  </div>

  <div style="background: #e0e0e0; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px;">
    <p style="margin: 0;">This is an automated message from the Contract Management System.</p>
  </div>
</body>
</html>
  `.trim();
}

function generateApprovalRequiredHTML(data) {
  const {
    variationNumber,
    title,
    category,
    approvedValue,
    extensionClaimed,
    contractRef,
    projectName,
    approverRole,
    variationUrl
  } = data;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Approval Required</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #7c4dff 0%, #651fff 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">Approval Required</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">${variationNumber}</p>
  </div>

  <div style="background: #f8f9fa; padding: 30px 20px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="margin-top: 0;">Your approval is required for the following variation:</p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #7c4dff;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 140px;">Variation:</td>
          <td style="padding: 8px 0;">${variationNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Title:</td>
          <td style="padding: 8px 0;">${title}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Category:</td>
          <td style="padding: 8px 0;">${category}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Value:</td>
          <td style="padding: 8px 0; font-size: 18px; color: #2e7d32; font-weight: bold;">
            £${(approvedValue || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </td>
        </tr>
        ${extensionClaimed > 0 ? `
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Extension Claimed:</td>
          <td style="padding: 8px 0; font-size: 18px; color: #f57c00; font-weight: bold;">
            +${extensionClaimed} days
          </td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Contract:</td>
          <td style="padding: 8px 0;">${contractRef}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Project:</td>
          <td style="padding: 8px 0;">${projectName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Your Role:</td>
          <td style="padding: 8px 0; font-weight: bold;">${approverRole}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${variationUrl}"
         style="display: inline-block; background: linear-gradient(135deg, #7c4dff 0%, #651fff 100%); color: white;
                padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        Review & Approve
      </a>
    </div>

    <p style="font-size: 13px; color: #666; margin-top: 30px;">
      <strong>Please Note:</strong> This variation requires your approval before it can be implemented.
      Please review all documentation and provide your decision.
    </p>
  </div>

  <div style="background: #e0e0e0; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px;">
    <p style="margin: 0;">This is an automated message from the Contract Management System.</p>
  </div>
</body>
</html>
  `.trim();
}

function generateVariationApprovedHTML(data) {
  const {
    variationNumber,
    title,
    approvedValue,
    extensionGranted,
    contractRef,
    projectName,
    variationUrl
  } = data;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Variation Approved</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">✓ Variation Approved</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 18px;">${variationNumber}</p>
  </div>

  <div style="background: #f8f9fa; padding: 30px 20px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="margin-top: 0;">The following variation has been <strong style="color: #2e7d32;">approved</strong>:</p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2e7d32;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 140px;">Variation:</td>
          <td style="padding: 8px 0;">${variationNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Title:</td>
          <td style="padding: 8px 0;">${title}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Approved Value:</td>
          <td style="padding: 8px 0; font-size: 20px; color: #2e7d32; font-weight: bold;">
            £${(approvedValue || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </td>
        </tr>
        ${extensionGranted > 0 ? `
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Extension Granted:</td>
          <td style="padding: 8px 0; font-size: 20px; color: #f57c00; font-weight: bold;">
            +${extensionGranted} days
          </td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Contract:</td>
          <td style="padding: 8px 0;">${contractRef}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Project:</td>
          <td style="padding: 8px 0;">${projectName}</td>
        </tr>
      </table>
    </div>

    <p>The contract value has been updated to reflect this variation.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${variationUrl}"
         style="display: inline-block; background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%); color: white;
                padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        View Variation
      </a>
    </div>

    <p style="font-size: 13px; color: #666; margin-top: 30px;">
      <strong>Next Steps:</strong> You may now proceed with implementation of this variation.
    </p>
  </div>

  <div style="background: #e0e0e0; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px;">
    <p style="margin: 0;">This is an automated message from the Contract Management System.</p>
  </div>
</body>
</html>
  `.trim();
}

function generateVariationRejectedHTML(data) {
  const {
    variationNumber,
    title,
    rejectionReason,
    rejectedBy,
    contractRef,
    projectName,
    variationUrl
  } = data;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Variation Rejected</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #d32f2f 0%, #c62828 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">Variation Rejected</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 18px;">${variationNumber}</p>
  </div>

  <div style="background: #f8f9fa; padding: 30px 20px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="margin-top: 0;">The following variation has been <strong style="color: #d32f2f;">rejected</strong>:</p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #d32f2f;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 140px;">Variation:</td>
          <td style="padding: 8px 0;">${variationNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Title:</td>
          <td style="padding: 8px 0;">${title}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Contract:</td>
          <td style="padding: 8px 0;">${contractRef}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Project:</td>
          <td style="padding: 8px 0;">${projectName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Rejected By:</td>
          <td style="padding: 8px 0;">${rejectedBy}</td>
        </tr>
      </table>
    </div>

    ${rejectionReason ? `
    <div style="background: #ffebee; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #d32f2f;">
      <h3 style="margin-top: 0; font-size: 14px; color: #d32f2f; text-transform: uppercase;">Rejection Reason</h3>
      <p style="margin-bottom: 0; white-space: pre-wrap;">${rejectionReason}</p>
    </div>
    ` : ''}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${variationUrl}"
         style="display: inline-block; background: linear-gradient(135deg, #d32f2f 0%, #c62828 100%); color: white;
                padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        View Details
      </a>
    </div>

    <p style="font-size: 13px; color: #666; margin-top: 30px;">
      <strong>Next Steps:</strong> Please review the rejection reason and make necessary amendments if you wish to resubmit.
    </p>
  </div>

  <div style="background: #e0e0e0; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px;">
    <p style="margin: 0;">This is an automated message from the Contract Management System.</p>
  </div>
</body>
</html>
  `.trim();
}

// ============================================================================
// PLAIN TEXT EMAIL TEMPLATES
// ============================================================================

function generateVariationCreatedText(data) {
  return `
NEW CONTRACT VARIATION
======================

Variation: ${data.variationNumber}
Title: ${data.title}
Category: ${data.category}
Estimated Value: £${(data.estimatedValue || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
Urgency: ${data.urgency.toUpperCase()}
Contract: ${data.contractRef}
Project: ${data.projectName}
Created By: ${data.creatorName}

Please review the variation details at:
${data.variationUrl}

${data.urgency === 'critical' || data.urgency === 'urgent' ? '*** THIS VARIATION REQUIRES IMMEDIATE ATTENTION ***' : ''}

---
This is an automated message from the Contract Management System.
  `.trim();
}

function generateQuotationRequestText(data) {
  return `
QUOTATION REQUEST
=================

Dear ${data.contactName},

We request your quotation for the following contract variation:

Variation: ${data.variationNumber}
Title: ${data.title}
Category: ${data.category}
Contract: ${data.contractRef}
Project: ${data.projectName}
Quotation Required By: ${data.requiredByDate ? new Date(data.requiredByDate).toLocaleDateString('en-GB') : 'As soon as possible'}

${data.description ? `Description:\n${data.description}\n\n` : ''}

Please provide:
- Detailed cost breakdown (labour, materials, plant, prelims)
- Programme impact (if any)
- Any qualifications or assumptions
- Supporting documentation

Submit your quotation at:
${data.variationUrl}

---
This is an automated message from the Contract Management System.
  `.trim();
}

function generateQuotationReceivedText(data) {
  return `
QUOTATION RECEIVED
==================

Variation: ${data.variationNumber}
Title: ${data.title}
Estimated Value: £${(data.estimatedValue || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
Quoted Value: £${(data.quotedValue || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
Variance: £${(data.variance || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })} (${data.variancePercent}%)

${data.variance > 0 ? '⚠️ Quoted value exceeds estimate' : '✓ Quoted value within estimate'}

Contract: ${data.contractRef}
Project: ${data.projectName}

Review the quotation at:
${data.variationUrl}

---
This is an automated message from the Contract Management System.
  `.trim();
}

function generateApprovalRequiredText(data) {
  return `
APPROVAL REQUIRED
=================

Your approval is required for the following variation:

Variation: ${data.variationNumber}
Title: ${data.title}
Category: ${data.category}
Value: £${(data.approvedValue || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
${data.extensionClaimed > 0 ? `Extension Claimed: +${data.extensionClaimed} days\n` : ''}Contract: ${data.contractRef}
Project: ${data.projectName}

Your Role: ${data.approverRole}

Review and approve at:
${data.variationUrl}

---
This is an automated message from the Contract Management System.
  `.trim();
}

function generateVariationApprovedText(data) {
  return `
VARIATION APPROVED
==================

The following variation has been APPROVED:

Variation: ${data.variationNumber}
Title: ${data.title}
Approved Value: £${(data.approvedValue || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
${data.extensionGranted > 0 ? `Extension Granted: +${data.extensionGranted} days\n` : ''}Contract: ${data.contractRef}
Project: ${data.projectName}

The contract value has been updated to reflect this variation.

View details at:
${data.variationUrl}

---
This is an automated message from the Contract Management System.
  `.trim();
}

function generateVariationRejectedText(data) {
  return `
VARIATION REJECTED
==================

The following variation has been REJECTED:

Variation: ${data.variationNumber}
Title: ${data.title}
Contract: ${data.contractRef}
Project: ${data.projectName}
Rejected By: ${data.rejectedBy}

${data.rejectionReason ? `Rejection Reason:\n${data.rejectionReason}\n\n` : ''}

View details at:
${data.variationUrl}

---
This is an automated message from the Contract Management System.
  `.trim();
}

module.exports = {
  sendVariationCreated,
  sendQuotationRequest,
  sendQuotationReceived,
  sendApprovalRequired,
  sendVariationApproved,
  sendVariationRejected
};
