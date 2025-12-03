/**
 * Purchase Order Service
 *
 * Handles CRUD operations and workflow for Purchase Orders
 * Integrates with CVR system to track commitments
 */

const { PrismaClient } = require('@prisma/client');
const { createCommitment, updateCommitmentStatus, deleteCommitment } = require('./cvr.cjs');

const prisma = new PrismaClient();

/**
 * Generate next PO code for project
 */
async function generatePOCode(tenantId, projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { code: true },
  });

  const count = await prisma.purchaseOrder.count({
    where: { tenantId, projectId },
  });

  return `PO-${project.code}-${String(count + 1).padStart(4, '0')}`;
}

/**
 * Create a new Purchase Order (Draft status)
 */
async function createPurchaseOrder({
  tenantId,
  projectId,
  supplierId,
  contractId,
  budgetLineId,
  code,
  supplier,
  orderDate,
  lines,
  createdBy,
  // NEW: Enhanced fields for contract type integration
  poType,
  milestoneId,
  milestoneNumber,
  packageId,
  paymentApplicationId,
  pdfUrl,
  pdfGeneratedAt,
  expectedDeliveryDate,
  actualDeliveryDate,
  deliveryStatus,
  internalNotes,
  supplierNotes,
}) {
  // Generate code if not provided
  if (!code) {
    code = await generatePOCode(tenantId, projectId);
  }

  // Calculate total from lines
  const total = (lines || []).reduce((sum, line) => sum + Number(line.lineTotal || 0), 0);

  const po = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      projectId,
      supplierId,
      contractId,
      budgetLineId,
      code,
      supplier,
      status: 'DRAFT',
      orderDate: orderDate || new Date(),
      total,
      // NEW: Enhanced fields (all optional)
      poType,
      milestoneId,
      milestoneNumber,
      packageId,
      paymentApplicationId,
      pdfUrl,
      pdfGeneratedAt,
      expectedDeliveryDate,
      actualDeliveryDate,
      deliveryStatus,
      internalNotes,
      supplierNotes,
      lines: lines && lines.length > 0 ? {
        create: lines.map((line) => ({
          tenantId,
          item: line.item,
          qty: line.qty,
          unit: line.unit,
          unitCost: line.unitCost,
          lineTotal: line.lineTotal,
        })),
      } : undefined,
    },
    include: {
      lines: true,
      package: true,
      milestone: true,
      paymentApplication: true,
    },
  });

  return po;
}

/**
 * Update Purchase Order
 */
async function updatePurchaseOrder(id, tenantId, updates) {
  const { lines, ...poUpdates } = updates;

  // Recalculate total if lines provided
  if (lines && Array.isArray(lines)) {
    const total = lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0);
    poUpdates.total = total;
  }

  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: poUpdates,
    include: {
      lines: true,
      package: true,
      milestone: true,
      paymentApplication: true,
    },
  });

  // Update lines if provided
  if (lines) {
    // Delete existing lines
    await prisma.pOLine.deleteMany({ where: { poId: id } });

    // Create new lines
    await prisma.pOLine.createMany({
      data: lines.map((line) => ({
        tenantId,
        poId: id,
        item: line.item,
        qty: line.qty,
        unit: line.unit,
        unitCost: line.unitCost,
        lineTotal: line.lineTotal,
      })),
    });
  }

  return await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      lines: true,
      package: true,
      milestone: true,
      paymentApplication: true,
    },
  });
}

/**
 * Submit PO for approval (DRAFT → SUBMITTED)
 */
async function submitPurchaseOrder(id, tenantId, submittedBy) {
  return await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: 'SUBMITTED',
      submittedDate: new Date(),
    },
    include: { lines: true },
  });
}

/**
 * Approve Purchase Order (SUBMITTED → APPROVED)
 * Creates CVR commitment
 */
async function approvePurchaseOrder(id, tenantId, approvedBy) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { lines: true, budgetLine: true },
  });

  if (!po) throw new Error('Purchase Order not found');
  if (po.status !== 'SUBMITTED') {
    throw new Error('Can only approve SUBMITTED purchase orders');
  }

  // Update PO status
  const updatedPO = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedDate: new Date(),
      approvedBy,
    },
    include: { lines: true },
  });

  // Create CVR commitment
  await createCommitment({
    tenantId,
    projectId: po.projectId,
    budgetLineId: po.budgetLineId,
    sourceType: 'PURCHASE_ORDER',
    sourceId: po.id,
    amount: po.total,
    description: `PO ${po.code} - ${po.supplier}`,
    reference: po.code,
    costCode: po.budgetLine?.costCodeId?.toString(),
    effectiveDate: new Date(),
    createdBy: approvedBy,
  });

  return updatedPO;
}

/**
 * Issue Purchase Order (APPROVED → ISSUED)
 * Sends PO to supplier
 */
async function issuePurchaseOrder(id, tenantId) {
  return await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: 'ISSUED',
      issuedDate: new Date(),
    },
    include: { lines: true },
  });
}

/**
 * Mark PO as Invoiced (when invoice is received)
 */
async function markPurchaseOrderInvoiced(id, tenantId) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) throw new Error('Purchase Order not found');

  // Only update if not already in a final state
  if (!['INVOICED', 'PAID', 'CANCELLED'].includes(po.status)) {
    return await prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'INVOICED' },
      include: { lines: true },
    });
  }

  return po;
}

/**
 * Mark PO as Paid (when payment is made)
 */
async function markPurchaseOrderPaid(id, tenantId) {
  return await prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'PAID' },
    include: { lines: true },
  });
}

/**
 * Cancel Purchase Order
 * Updates CVR commitment status to CANCELLED
 */
async function cancelPurchaseOrder(id, tenantId, cancelReason, cancelledBy) {
  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancelledDate: new Date(),
      cancelReason,
    },
    include: { lines: true },
  });

  // Find and cancel CVR commitment
  const commitment = await prisma.cVRCommitment.findFirst({
    where: {
      tenantId,
      sourceType: 'PURCHASE_ORDER',
      sourceId: id,
    },
  });

  if (commitment) {
    await updateCommitmentStatus(commitment.id, 'CANCELLED', new Date());
  }

  return po;
}

/**
 * Delete Purchase Order (and CVR commitment if exists)
 */
async function deletePurchaseOrder(id, tenantId) {
  // Find and delete CVR commitment
  const commitment = await prisma.cVRCommitment.findFirst({
    where: {
      tenantId,
      sourceType: 'PURCHASE_ORDER',
      sourceId: id,
    },
  });

  if (commitment) {
    await deleteCommitment(commitment.id);
  }

  // Delete PO lines first
  await prisma.pOLine.deleteMany({ where: { poId: id } });

  // Delete PO
  return await prisma.purchaseOrder.delete({ where: { id } });
}

/**
 * Get Purchase Orders with filters
 */
async function getPurchaseOrders(tenantId, filters = {}) {
  const { projectId, status, supplierId, budgetLineId, limit = 50, offset = 0 } = filters;

  const where = {
    tenantId,
    ...(projectId && { projectId }),
    ...(status && { status }),
    ...(supplierId && { supplierId }),
    ...(budgetLineId && { budgetLineId }),
  };

  const [items, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: {
        lines: true,
        project: { select: { code: true, name: true } },
        contract: { select: { id: true, title: true } },
        budgetLine: { select: { id: true, code: true, description: true } },
        package: { select: { id: true, name: true, poStrategy: true } },
        milestone: { select: { id: true, milestoneNumber: true, description: true } },
        paymentApplication: { select: { id: true, applicationNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return { items, total };
}

/**
 * Get single Purchase Order by ID
 */
async function getPurchaseOrderById(id, tenantId) {
  return await prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
    include: {
      lines: true,
      project: { select: { code: true, name: true } },
      contract: { select: { id: true, title: true } },
      budgetLine: { select: { id: true, code: true, description: true } },
      package: { select: { id: true, name: true, poStrategy: true } },
      milestone: { select: { id: true, milestoneNumber: true, description: true } },
      paymentApplication: { select: { id: true, applicationNumber: true } },
    },
  });
}

/**
 * Update PO status manually
 * Validates allowed transitions
 */
async function updatePOStatus(id, tenantId, newStatus, notes, userId) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
  });

  if (!po) throw new Error('Purchase Order not found');

  // Define allowed status transitions
  const allowedTransitions = {
    'DRAFT': ['SUBMITTED', 'CANCELLED'],
    'SUBMITTED': ['APPROVED', 'DRAFT', 'CANCELLED'],
    'APPROVED': ['ISSUED', 'SENT', 'SUBMITTED', 'CANCELLED'],
    'ISSUED': ['SENT', 'CANCELLED'],
    'SENT': ['ACKNOWLEDGED', 'CANCELLED'],
    'ACKNOWLEDGED': ['GOODS_RECEIVED', 'CANCELLED'],
    'GOODS_RECEIVED': ['INVOICE_RECEIVED', 'CANCELLED'],
    'INVOICE_RECEIVED': ['PARTIALLY_PAID', 'PAID', 'CANCELLED'],
    'PARTIALLY_PAID': ['PAID', 'CANCELLED'],
    'PAID': [], // Terminal state
    'CANCELLED': ['DRAFT'], // Allow reactivation from cancelled
  };

  const allowed = allowedTransitions[po.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid status transition from ${po.status} to ${newStatus}`);
  }

  // Update timestamps based on new status
  const updates = { status: newStatus };

  if (newStatus === 'ACKNOWLEDGED') updates.acknowledgedAt = new Date();
  if (newStatus === 'PAID') {
    updates.paidAt = new Date();
    updates.paidAmount = po.total;
  }

  return await prisma.purchaseOrder.update({
    where: { id },
    data: updates,
    include: { lines: true },
  });
}

/**
 * Send Purchase Order to supplier
 * Methods: EMAIL or DOWNLOAD
 */
async function sendPurchaseOrder(id, tenantId, method, email, userId) {
  const po = await getPurchaseOrderById(id, tenantId);
  if (!po) throw new Error('Purchase Order not found');

  // Generate PDF
  const pdfBuffer = await generatePOPdf(id, tenantId);

  if (method === 'EMAIL') {
    // TODO: Integrate with email service
    // For now, just mark as sent
    console.log(`[PO Service] Would send email to ${email} with PO ${po.code}`);

    await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentBy: userId,
        sentMethod: 'EMAIL',
      },
    });

    return { success: true, message: 'PO sent via email', pdfUrl: null };
  } else if (method === 'DOWNLOAD') {
    // Mark as sent via download
    await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentBy: userId,
        sentMethod: 'DOWNLOAD',
      },
    });

    // Return PDF buffer for download
    return { success: true, message: 'PO ready for download', pdfBuffer };
  }

  throw new Error('Invalid send method. Use EMAIL or DOWNLOAD');
}

/**
 * Generate PO PDF document
 * Creates a professional purchase order document
 */
async function generatePOPdf(id, tenantId) {
  const po = await getPurchaseOrderById(id, tenantId);
  if (!po) throw new Error('Purchase Order not found');

  // Use PDFKit or similar library to generate PDF
  const PDFDocument = require('pdfkit');
  const fs = require('fs');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).text('PURCHASE ORDER', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`PO Number: ${po.code}`, { align: 'right' });
    doc.text(`Date: ${new Date(po.orderDate).toLocaleDateString()}`, { align: 'right' });
    doc.text(`Status: ${po.status}`, { align: 'right' });
    doc.moveDown();

    // Supplier info
    doc.fontSize(12).text('SUPPLIER:', { underline: true });
    doc.fontSize(10).text(po.supplier || 'N/A');
    doc.moveDown();

    // Project info
    doc.fontSize(12).text('PROJECT:', { underline: true });
    doc.fontSize(10).text(po.project?.name || 'N/A');
    doc.moveDown();

    // Line items table
    doc.fontSize(12).text('LINE ITEMS:', { underline: true });
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const itemX = 50;
    const qtyX = 250;
    const unitX = 300;
    const rateX = 350;
    const totalX = 450;

    // Table headers
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Description', itemX, tableTop);
    doc.text('Qty', qtyX, tableTop);
    doc.text('Unit', unitX, tableTop);
    doc.text('Rate (£)', rateX, tableTop);
    doc.text('Total (£)', totalX, tableTop);

    doc.font('Helvetica');
    let y = tableTop + 20;

    // Line items
    (po.lines || []).forEach((line) => {
      doc.text(line.item || '', itemX, y, { width: 190 });
      doc.text(line.qty?.toString() || '0', qtyX, y);
      doc.text(line.unit || 'ea', unitX, y);
      doc.text(Number(line.unitCost || 0).toFixed(2), rateX, y);
      doc.text(Number(line.lineTotal || 0).toFixed(2), totalX, y);
      y += 25;
    });

    // Total
    doc.moveDown();
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text(`TOTAL: £${Number(po.total || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, { align: 'right' });
    doc.font('Helvetica');

    // Footer
    doc.moveDown(2);
    doc.fontSize(9);
    if (po.internalNotes) {
      doc.text('Internal Notes:', { underline: true });
      doc.text(po.internalNotes);
      doc.moveDown();
    }
    if (po.supplierNotes) {
      doc.text('Supplier Notes:', { underline: true });
      doc.text(po.supplierNotes);
    }

    doc.end();
  });
}

/**
 * Mark PO as acknowledged by supplier
 */
async function acknowledgePurchaseOrder(id, tenantId, userId) {
  return await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date(),
    },
    include: { lines: true },
  });
}

module.exports = {
  createPurchaseOrder,
  updatePurchaseOrder,
  submitPurchaseOrder,
  approvePurchaseOrder,
  issuePurchaseOrder,
  markPurchaseOrderInvoiced,
  markPurchaseOrderPaid,
  cancelPurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderById,
  generatePOCode,
  updatePOStatus,
  sendPurchaseOrder,
  generatePOPdf,
  acknowledgePurchaseOrder,
};
