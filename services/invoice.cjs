/**
 * Invoice Service
 *
 * Handles CRUD operations and workflow for Invoices
 * Integrates with CVR system to track actuals
 */

const { PrismaClient } = require('@prisma/client');
const { createActual, updateActualStatus, deleteActual } = require('./cvr.cjs');
const { markPurchaseOrderInvoiced } = require('./purchaseOrder.cjs');

const prisma = new PrismaClient();
const invoiceColumnCache = new Map();

async function hasInvoiceColumn(columnName) {
  if (invoiceColumnCache.has(columnName)) {
    return invoiceColumnCache.get(columnName);
  }

  const rows = await prisma.$queryRaw`
    SELECT 1 AS present
    FROM information_schema.columns
    WHERE table_schema = ${'public'}
      AND table_name = ${'Invoice'}
      AND column_name = ${columnName}
    LIMIT 1
  `;
  const present = rows.length > 0;
  invoiceColumnCache.set(columnName, present);
  return present;
}

function invoiceSelect(includeDirection = false) {
  return {
    id: true,
    tenantId: true,
    projectId: true,
    supplierId: true,
    budgetLineId: true,
    contractId: true,
    number: true,
    issueDate: true,
    dueDate: true,
    net: true,
    vat: true,
    gross: true,
    status: true,
    documentId: true,
    ocrStatus: true,
    ocrResultJson: true,
    poNumberRef: true,
    matchStatus: true,
    matchedPoId: true,
    source: true,
    packageId: true,
    receivedDate: true,
    matchedDate: true,
    approvedDate: true,
    approvedBy: true,
    paidDate: true,
    paidAmount: true,
    paymentRef: true,
    disputeReason: true,
    createdAt: true,
    updatedAt: true,
    ...(includeDirection ? { direction: true } : {}),
    project: { select: { code: true, name: true } },
    supplier: { select: { id: true, name: true } },
    contract: { select: { id: true, title: true } },
    budgetLine: { select: { id: true, code: true, description: true } },
  };
}

function withLegacyDirection(invoice) {
  return invoice && invoice.direction == null
    ? { ...invoice, direction: 'INBOUND' }
    : invoice;
}

/**
 * Create a new Invoice (RECEIVED status)
 */
async function createInvoice({
  tenantId,
  projectId,
  supplierId,
  contractId,
  budgetLineId,
  number,
  issueDate,
  dueDate,
  net,
  vat,
  gross,
  poNumberRef,
  matchedPoId,
  source,
  createdBy,
}) {
  const hasDirection = await hasInvoiceColumn('direction');
  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      projectId,
      supplierId,
      contractId,
      budgetLineId,
      number,
      issueDate: issueDate || new Date(),
      dueDate,
      net,
      vat,
      gross,
      status: 'RECEIVED',
      receivedDate: new Date(),
      poNumberRef,
      matchedPoId,
      source: source || 'MANUAL',
    },
    select: invoiceSelect(hasDirection),
  });

  // Create CVR actual record
  await createActual({
    tenantId,
    projectId,
    budgetLineId,
    sourceType: 'INVOICE',
    sourceId: invoice.id,
    amount: net, // Use net amount (excluding VAT)
    description: `Invoice ${number}`,
    reference: number,
    incurredDate: issueDate || new Date(),
    createdBy,
  });

  return withLegacyDirection(invoice);
}

/**
 * Update Invoice
 */
async function updateInvoice(id, tenantId, updates) {
  return await prisma.invoice.update({
    where: { id },
    data: updates,
  });
}

/**
 * Match Invoice to Purchase Order (RECEIVED → MATCHED)
 */
async function matchInvoiceToPO(invoiceId, poId, tenantId, matchedBy) {
  const invoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: 'MATCHED',
      matchedDate: new Date(),
      matchedPoId: poId,
      matchStatus: 'MATCHED',
    },
  });

  // Update PO status to INVOICED
  await markPurchaseOrderInvoiced(poId, tenantId);

  return invoice;
}

/**
 * Approve Invoice (MATCHED → APPROVED)
 * Updates CVR actual status to CERTIFIED
 */
async function approveInvoice(id, tenantId, approvedBy) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new Error('Invoice not found');

  if (!['RECEIVED', 'MATCHED'].includes(invoice.status)) {
    throw new Error('Can only approve RECEIVED or MATCHED invoices');
  }

  const updatedInvoice = await prisma.invoice.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedDate: new Date(),
      approvedBy,
    },
  });

  // Update CVR actual to CERTIFIED
  const actual = await prisma.cVRActual.findFirst({
    where: {
      tenantId,
      sourceType: 'INVOICE',
      sourceId: id,
    },
  });

  if (actual) {
    await updateActualStatus(actual.id, 'CERTIFIED', new Date());
  }

  return updatedInvoice;
}

/**
 * Mark Invoice as Paid (APPROVED → PAID)
 * Updates CVR actual status to PAID
 */
async function markInvoicePaid(id, tenantId, paidAmount, paidDate, paymentRef) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new Error('Invoice not found');

  const updatedInvoice = await prisma.invoice.update({
    where: { id },
    data: {
      status: 'PAID',
      paidDate: paidDate || new Date(),
      paidAmount,
      paymentRef,
    },
  });

  // Update CVR actual to PAID
  const actual = await prisma.cVRActual.findFirst({
    where: {
      tenantId,
      sourceType: 'INVOICE',
      sourceId: id,
    },
  });

  if (actual) {
    await updateActualStatus(actual.id, 'PAID', null, paidDate || new Date());
  }

  return updatedInvoice;
}

/**
 * Dispute Invoice
 */
async function disputeInvoice(id, tenantId, disputeReason) {
  return await prisma.invoice.update({
    where: { id },
    data: {
      status: 'DISPUTED',
      disputeReason,
    },
  });
}

/**
 * Cancel Invoice
 * Reverses CVR actual record
 */
async function cancelInvoice(id, tenantId, cancelReason) {
  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      disputeReason: cancelReason, // Reuse field
    },
  });

  // Find and delete/reverse CVR actual
  const actual = await prisma.cVRActual.findFirst({
    where: {
      tenantId,
      sourceType: 'INVOICE',
      sourceId: id,
    },
  });

  if (actual) {
    await updateActualStatus(actual.id, 'REVERSED');
  }

  return invoice;
}

/**
 * Delete Invoice (and CVR actual if exists)
 */
async function deleteInvoice(id, tenantId) {
  // Find and delete CVR actual
  const actual = await prisma.cVRActual.findFirst({
    where: {
      tenantId,
      sourceType: 'INVOICE',
      sourceId: id,
    },
  });

  if (actual) {
    await deleteActual(actual.id);
  }

  // Delete invoice
  return await prisma.invoice.delete({ where: { id } });
}

/**
 * Get Invoices with filters
 */
async function getInvoices(tenantId, filters = {}) {
  const { projectId, status, supplierId, budgetLineId, direction, limit = 50, offset = 0 } = filters;
  const hasDirection = await hasInvoiceColumn('direction');

  const where = {
    tenantId,
    ...(projectId && { projectId }),
    ...(status && { status }),
    ...(supplierId && { supplierId }),
    ...(budgetLineId && { budgetLineId }),
    // Task 2.5: Direction filtering - OUTBOUND (we raise to MC/client) or INBOUND (we receive from subs)
    ...(hasDirection && direction && (direction === 'OUTBOUND' || direction === 'INBOUND') && { direction }),
  };

  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      select: invoiceSelect(hasDirection),
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.invoice.count({ where }),
  ]);

  return { items: items.map(withLegacyDirection), total };
}

/**
 * Get single Invoice by ID
 */
async function getInvoiceById(id, tenantId) {
  const hasDirection = await hasInvoiceColumn('direction');
  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId },
    select: invoiceSelect(hasDirection),
  });
  return withLegacyDirection(invoice);
}

/**
 * Get invoices awaiting approval
 */
async function getInvoicesAwaitingApproval(tenantId, projectId = null) {
  const hasDirection = await hasInvoiceColumn('direction');
  const where = {
    tenantId,
    status: { in: ['RECEIVED', 'MATCHED'] },
    ...(projectId && { projectId }),
  };

  const invoices = await prisma.invoice.findMany({
    where,
    select: invoiceSelect(hasDirection),
    orderBy: { issueDate: 'asc' },
  });
  return invoices.map(withLegacyDirection);
}

/**
 * Get overdue invoices
 */
async function getOverdueInvoices(tenantId, projectId = null) {
  const hasDirection = await hasInvoiceColumn('direction');
  const where = {
    tenantId,
    status: { in: ['APPROVED', 'MATCHED', 'RECEIVED'] },
    dueDate: { lt: new Date() },
    ...(projectId && { projectId }),
  };

  const invoices = await prisma.invoice.findMany({
    where,
    select: invoiceSelect(hasDirection),
    orderBy: { dueDate: 'asc' },
  });
  return invoices.map(withLegacyDirection);
}

module.exports = {
  createInvoice,
  updateInvoice,
  matchInvoiceToPO,
  approveInvoice,
  markInvoicePaid,
  disputeInvoice,
  cancelInvoice,
  deleteInvoice,
  getInvoices,
  getInvoiceById,
  getInvoicesAwaitingApproval,
  getOverdueInvoices,
};
