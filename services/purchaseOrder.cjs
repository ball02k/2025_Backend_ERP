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
}) {
  // Generate code if not provided
  if (!code) {
    code = await generatePOCode(tenantId, projectId);
  }

  // Calculate total from lines
  const total = lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0);

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
      lines: {
        create: lines.map((line) => ({
          tenantId,
          item: line.item,
          qty: line.qty,
          unit: line.unit,
          unitCost: line.unitCost,
          lineTotal: line.lineTotal,
        })),
      },
    },
    include: { lines: true },
  });

  return po;
}

/**
 * Update Purchase Order
 */
async function updatePurchaseOrder(id, tenantId, updates) {
  const { lines, ...poUpdates } = updates;

  // Recalculate total if lines provided
  if (lines) {
    const total = lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0);
    poUpdates.total = total;
  }

  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: poUpdates,
    include: { lines: true },
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
    include: { lines: true },
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
    },
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
};
