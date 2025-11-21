/**
 * PO Generation Service
 *
 * Handles automatic PO generation based on package strategies:
 * - SINGLE_ON_AWARD: One PO for entire contract value when signed
 * - MILESTONE_BASED: Multiple POs generated at project milestones
 * - CALL_OFF: POs generated on demand from framework agreement
 */

const { prisma } = require('../utils/prisma.cjs');
const { createCommitment } = require('./cvr.cjs');

/**
 * Generate PO code for a project
 */
async function generatePOCode(tenantId, projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { code: true },
  });

  const count = await prisma.purchaseOrder.count({
    where: { tenantId, projectId },
  });

  return `PO-${project?.code || 'GEN'}-${String(count + 1).padStart(4, '0')}`;
}

/**
 * Main entry point - generates POs based on contract and package strategy
 */
async function generateFromContract(contractId, userId, tenantId) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, tenantId },
    include: {
      package: {
        include: {
          milestones: true,
        },
      },
      lineItems: true,
      supplier: true,
      project: true,
    },
  });

  if (!contract) {
    throw new Error('Contract not found');
  }

  // Check if already generated
  if (contract.poGenerated) {
    console.log(`POs already generated for contract ${contract.id}`);
    return null;
  }

  // Determine strategy (package level takes precedence)
  const strategy = contract.package?.poStrategy || 'MANUAL';
  console.log(`Generating POs for contract ${contract.contractRef} using strategy: ${strategy}`);

  let result;
  switch (strategy) {
    case 'SINGLE_ON_AWARD':
      result = await generateSinglePO(contract, userId, tenantId);
      break;
    case 'MILESTONE_BASED':
      result = await generateMilestonePOs(contract, userId, tenantId);
      break;
    case 'CALL_OFF':
      result = await setupCallOffFramework(contract, userId, tenantId);
      break;
    case 'MANUAL':
    default:
      console.log('Manual PO generation - skipping automatic creation');
      return null;
  }

  // Mark contract as having generated POs
  if (result) {
    await prisma.contract.update({
      where: { id: contractId },
      data: { poGenerated: true },
    });
  }

  return result;
}

/**
 * Strategy 1: Generate single PO for entire contract value
 */
async function generateSinglePO(contract, userId, tenantId) {
  const poCode = await generatePOCode(tenantId, contract.projectId);

  // Calculate total from line items or use contract value
  const lineItems = contract.lineItems || [];
  const total = lineItems.length > 0
    ? lineItems.reduce((sum, item) => sum + Number(item.total || item.amount || 0), 0)
    : Number(contract.value || 0);

  // Create PO with lines
  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      projectId: contract.projectId,
      contractId: contract.id,
      packageId: contract.packageId,
      supplierId: contract.supplierId,
      budgetLineId: lineItems[0]?.budgetLineId || null,
      code: poCode,
      supplier: contract.supplier?.name || 'Unknown',
      status: 'DRAFT',
      orderDate: new Date(),
      total,
      poType: 'CONTRACT',
      internalNotes: `Auto-generated from contract ${contract.contractRef}`,
      lines: {
        create: lineItems.length > 0
          ? lineItems.map(item => ({
              tenantId,
              item: item.description || 'Contract Item',
              qty: item.quantity || 1,
              unit: item.unit || 'ITEM',
              unitCost: Number(item.unitPrice || item.total || 0),
              lineTotal: Number(item.total || item.amount || 0),
            }))
          : [{
              tenantId,
              item: `Contract ${contract.contractRef}: ${contract.title}`,
              qty: 1,
              unit: 'LUMP',
              unitCost: total,
              lineTotal: total,
            }],
      },
    },
    include: { lines: true },
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      userId,
      entity: 'PurchaseOrder',
      entityId: String(purchaseOrder.id),
      action: 'auto_generated',
      changes: {
        contractId: contract.id,
        strategy: 'SINGLE_ON_AWARD',
        amount: total,
      },
    },
  });

  console.log(`Created PO ${poCode} for contract ${contract.contractRef}`);
  return purchaseOrder;
}

/**
 * Strategy 2: Generate POs based on milestones
 */
async function generateMilestonePOs(contract, userId, tenantId) {
  const milestones = contract.package?.milestones || [];

  if (!milestones.length) {
    console.log('No milestones defined - falling back to single PO');
    return await generateSinglePO(contract, userId, tenantId);
  }

  const contractValue = Number(contract.value || 0);
  const purchaseOrders = [];

  for (const milestone of milestones) {
    const poCode = await generatePOCode(tenantId, contract.projectId);
    const milestoneAmount = (contractValue * Number(milestone.percentage || 0)) / 100;

    const po = await prisma.purchaseOrder.create({
      data: {
        tenantId,
        projectId: contract.projectId,
        contractId: contract.id,
        packageId: contract.packageId,
        supplierId: contract.supplierId,
        milestoneId: milestone.id,
        milestoneNumber: milestone.milestoneNumber,
        code: poCode,
        supplier: contract.supplier?.name || 'Unknown',
        status: 'DRAFT',
        orderDate: new Date(),
        expectedDeliveryDate: milestone.expectedDate,
        total: milestoneAmount,
        poType: 'MILESTONE',
        internalNotes: `Milestone: ${milestone.description} (${milestone.percentage}%)`,
        lines: {
          create: [{
            tenantId,
            item: `${milestone.description || `Milestone ${milestone.milestoneNumber}`}`,
            qty: 1,
            unit: 'MILESTONE',
            unitCost: milestoneAmount,
            lineTotal: milestoneAmount,
          }],
        },
      },
      include: { lines: true },
    });

    purchaseOrders.push(po);
  }

  // Create audit log
  await prisma.auditLog.create({
    data: {
      userId,
      entity: 'PurchaseOrder',
      entityId: 'MULTIPLE',
      action: 'auto_generated_milestone',
      changes: {
        contractId: contract.id,
        strategy: 'MILESTONE_BASED',
        count: purchaseOrders.length,
        totalAmount: contractValue,
      },
    },
  });

  console.log(`Created ${purchaseOrders.length} milestone POs for contract ${contract.contractRef}`);
  return purchaseOrders;
}

/**
 * Strategy 3: Setup call-off framework (no immediate POs)
 */
async function setupCallOffFramework(contract, userId, tenantId) {
  // For call-off, we just mark the contract as ready for on-demand POs
  // The actual POs are created via generateCallOffPO()

  console.log(`Call-off framework setup for contract ${contract.contractRef}`);

  // Create audit log
  await prisma.auditLog.create({
    data: {
      userId,
      entity: 'Contract',
      entityId: String(contract.id),
      action: 'calloff_framework_created',
      changes: {
        contractId: contract.id,
        strategy: 'CALL_OFF',
        totalValue: contract.value,
      },
    },
  });

  return {
    type: 'CALL_OFF_FRAMEWORK',
    contractId: contract.id,
    totalValue: contract.value,
    remainingValue: contract.value,
    message: 'Call-off framework ready - generate POs on demand',
  };
}

/**
 * Generate call-off PO from framework contract
 */
async function generateCallOffPO({ contractId, amount, description, userId, tenantId }) {
  const contract = await prisma.contract.findFirst({
    where: {
      id: contractId,
      tenantId,
      status: 'signed',
    },
    include: {
      supplier: true,
      package: true,
      lineItems: true,
    },
  });

  if (!contract) {
    throw new Error('Contract not found or not signed');
  }

  if (contract.package?.poStrategy !== 'CALL_OFF') {
    throw new Error('Contract is not configured for call-off orders');
  }

  // Calculate remaining value
  const existingPOs = await prisma.purchaseOrder.aggregate({
    where: { contractId, tenantId },
    _sum: { total: true },
  });

  const usedValue = Number(existingPOs._sum.total || 0);
  const remainingValue = Number(contract.value || 0) - usedValue;

  if (amount > remainingValue) {
    throw new Error(`Call-off amount (${amount}) exceeds remaining framework value (${remainingValue})`);
  }

  const poCode = await generatePOCode(tenantId, contract.projectId);

  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      projectId: contract.projectId,
      contractId: contract.id,
      packageId: contract.packageId,
      supplierId: contract.supplierId,
      budgetLineId: contract.lineItems?.[0]?.budgetLineId,
      code: poCode,
      supplier: contract.supplier?.name || 'Unknown',
      status: 'DRAFT',
      orderDate: new Date(),
      total: amount,
      poType: 'CALLOFF',
      internalNotes: `Call-off from framework ${contract.contractRef}: ${description}`,
      lines: {
        create: [{
          tenantId,
          item: description || 'Call-off order',
          qty: 1,
          unit: 'ITEM',
          unitCost: amount,
          lineTotal: amount,
        }],
      },
    },
    include: { lines: true },
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      userId,
      entity: 'PurchaseOrder',
      entityId: String(purchaseOrder.id),
      action: 'calloff_generated',
      changes: {
        contractId: contract.id,
        amount,
        remainingAfter: remainingValue - amount,
      },
    },
  });

  console.log(`Created call-off PO ${poCode} for ${amount} from contract ${contract.contractRef}`);
  return {
    purchaseOrder,
    remainingValue: remainingValue - amount,
  };
}

/**
 * Get call-off framework status for a contract
 */
async function getCallOffStatus(contractId, tenantId) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, tenantId },
    select: { id: true, value: true, contractRef: true },
  });

  if (!contract) {
    throw new Error('Contract not found');
  }

  const existingPOs = await prisma.purchaseOrder.findMany({
    where: { contractId, tenantId },
    select: {
      id: true,
      code: true,
      total: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const usedValue = existingPOs.reduce((sum, po) => sum + Number(po.total || 0), 0);
  const remainingValue = Number(contract.value || 0) - usedValue;

  return {
    contractId: contract.id,
    contractRef: contract.contractRef,
    totalValue: contract.value,
    usedValue,
    remainingValue,
    utilizationPercent: contract.value > 0 ? (usedValue / contract.value) * 100 : 0,
    purchaseOrders: existingPOs,
  };
}

module.exports = {
  generateFromContract,
  generateSinglePO,
  generateMilestonePOs,
  generateCallOffPO,
  getCallOffStatus,
  generatePOCode,
};
