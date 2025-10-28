const fs = require("fs/promises");
const path = require("path");
const prisma = require("./prisma.cjs");

/**
 * Template variable substitution
 * Supports: {{var}}, {{object.property}}, {{array[0].property}}
 * Also supports formatters: {{value|currency}}, {{date|date}}
 */
function substituteVariables(template, data) {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const trimmedKey = key.trim();
    const [varPath, formatter] = trimmedKey.split('|').map(s => s.trim());

    // Navigate nested properties
    const value = varPath.split('.').reduce((obj, prop) => {
      if (!obj) return null;
      // Handle array access like lineItems[0]
      const arrayMatch = prop.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, arrayName, index] = arrayMatch;
        return obj[arrayName]?.[parseInt(index, 10)];
      }
      return obj[prop];
    }, data);

    // Apply formatter if specified
    if (formatter && value != null) {
      switch (formatter) {
        case 'currency':
          return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: data.currency || 'GBP',
          }).format(value);
        case 'date':
          return new Date(value).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          });
        case 'dateShort':
          return new Date(value).toLocaleDateString('en-GB');
        case 'number':
          return new Intl.NumberFormat('en-GB').format(value);
        default:
          return String(value);
      }
    }

    return value != null ? String(value) : '';
  });
}

/**
 * Generate line items table HTML
 */
function generateLineItemsTable(lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return '<p><em>No line items</em></p>';
  }

  const rows = lineItems.map(item => `
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">${item.description || ''}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.qty || 0}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.rate || 0}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.total || 0}</td>
    </tr>
  `).join('');

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <thead>
        <tr style="background-color: #f8f9fa;">
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Description</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Quantity</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Rate</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Default contract template
 */
function getDefaultTemplate() {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Contract {{contractRef}}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 20px; }
    h1 { color: #1a202c; border-bottom: 2px solid #2d3748; padding-bottom: 10px; }
    h2 { color: #2d3748; margin-top: 30px; }
    .header { margin-bottom: 30px; }
    .section { margin: 20px 0; }
    .field { margin: 10px 0; }
    .label { font-weight: bold; color: #4a5568; }
    .value { color: #1a202c; }
    .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 0.9em; color: #718096; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Subcontract Agreement</h1>
    <p><strong>Contract Reference:</strong> {{contractRef}}</p>
    <p><strong>Generated:</strong> {{generatedAt|date}}</p>
  </div>

  <div class="section">
    <h2>1. Parties</h2>
    <div class="field">
      <span class="label">Contractor (Buyer):</span>
      <span class="value">{{project.name}}</span>
    </div>
    <div class="field">
      <span class="label">Subcontractor (Supplier):</span>
      <span class="value">{{supplier.name}}</span>
    </div>
  </div>

  <div class="section">
    <h2>2. Works Description</h2>
    <div class="field">
      <span class="label">Title:</span>
      <span class="value">{{title}}</span>
    </div>
    <div class="field">
      <span class="label">Package:</span>
      <span class="value">{{package.name}}</span>
    </div>
  </div>

  <div class="section">
    <h2>3. Contract Sum</h2>
    <div class="field">
      <span class="label">Total Value:</span>
      <span class="value">{{value|currency}}</span>
    </div>
    <div class="field">
      <span class="label">Currency:</span>
      <span class="value">{{currency}}</span>
    </div>
  </div>

  <div class="section">
    <h2>4. Programme</h2>
    <div class="field">
      <span class="label">Commencement Date:</span>
      <span class="value">{{startDate|dateShort}}</span>
    </div>
    <div class="field">
      <span class="label">Completion Date:</span>
      <span class="value">{{endDate|dateShort}}</span>
    </div>
  </div>

  <div class="section">
    <h2>5. Payment Terms</h2>
    <div class="field">
      <span class="label">Payment Terms:</span>
      <span class="value">{{paymentTerms}}</span>
    </div>
    <div class="field">
      <span class="label">Retention:</span>
      <span class="value">{{retentionPct}}%</span>
    </div>
  </div>

  <div class="section">
    <h2>6. Schedule of Works</h2>
    {{lineItemsTable}}
  </div>

  <div class="section">
    <h2>7. Notes</h2>
    <p>{{notes}}</p>
  </div>

  <div class="footer">
    <p>This document was generated automatically on {{generatedAt|date}}.</p>
    <p><strong>Status:</strong> {{status}}</p>
  </div>
</body>
</html>
  `;
}

async function generateContractDoc({ tenantId, contractId, templateKey }) {
  if (!tenantId) {
    throw new Error("tenantId is required");
  }
  if (!contractId) {
    throw new Error("contractId is required");
  }

  // Fetch contract with all related data
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      project: { select: { id: true, name: true, code: true } },
      package: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true, email: true, phone: true } },
      lineItems: { orderBy: { id: 'asc' } },
    },
  });

  if (!contract) {
    throw new Error(`Contract ${contractId} not found`);
  }

  // Fetch template if specified
  let templateHtml = getDefaultTemplate();
  if (templateKey) {
    const template = await prisma.contractTemplate.findFirst({
      where: { tenantId, key: templateKey },
    });
    if (template?.bodyHtml) {
      templateHtml = template.bodyHtml;
    }
  }

  // Prepare data for template substitution
  const templateData = {
    contractRef: contract.contractRef || `C-${contract.id}`,
    title: contract.title || 'Untitled Contract',
    value: contract.value || 0,
    currency: contract.currency || 'GBP',
    status: contract.status || 'draft',
    startDate: contract.startDate || new Date(),
    endDate: contract.endDate || new Date(),
    paymentTerms: contract.paymentTerms || 'Net 30 days',
    retentionPct: contract.retentionPct || 0,
    notes: contract.notes || 'No additional notes.',
    generatedAt: new Date(),
    project: contract.project || { name: 'N/A' },
    package: contract.package || { name: 'N/A' },
    supplier: contract.supplier || { name: 'N/A' },
    lineItems: contract.lineItems || [],
  };

  // Generate line items table
  const lineItemsTableHtml = generateLineItemsTable(contract.lineItems);
  templateHtml = templateHtml.replace('{{lineItemsTable}}', lineItemsTableHtml);

  // Substitute all template variables
  const renderedHtml = substituteVariables(templateHtml, templateData);

  // Save to file system
  const documentsDir = path.join(__dirname, "..", "uploads", "documents");
  await fs.mkdir(documentsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `contract-${contractId}-${timestamp}.html`;
  const storagePath = path.join("uploads", "documents", fileName);
  const absolutePath = path.join(__dirname, "..", storagePath);

  await fs.writeFile(absolutePath, renderedHtml, "utf8");

  // Create document record
  const document = await prisma.document.create({
    data: {
      tenantId,
      filename: fileName,
      mimeType: "text/html",
      size: Buffer.byteLength(renderedHtml, 'utf8'),
      storageKey: storagePath,
      uploadedById: null,
    },
  });

  return { documentId: document.id };
}

module.exports = { generateContractDoc };
