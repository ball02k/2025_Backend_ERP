/**
 * CVR Integration Hooks
 *
 * Provides hooks to automatically create CVR commitments and actuals
 * when contracts, variations, POs, invoices, and payment applications change status
 *
 * Usage: Call these hooks from your existing services when financial events occur
 */

const { createCommitment, createActual, updateCommitmentStatus, updateActualStatus } = require('./cvr.cjs');

/**
 * Hook: Contract signed
 * Creates CVR commitment when contract status changes to 'signed' or 'active'
 */
async function onContractSigned(contract, tenantId, userId) {
  try {
    // Only create commitment if contract has a value
    if (!contract.value || Number(contract.value) === 0) {
      console.log(`[CVR Hook] Skipping contract ${contract.id} - no value`);
      return null;
    }

    // Check if commitment already exists
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const existing = await prisma.cVRCommitment.findFirst({
      where: {
        tenantId,
        sourceType: 'CONTRACT',
        sourceId: contract.id,
      },
    });

    if (existing) {
      console.log(`[CVR Hook] Commitment already exists for contract ${contract.id}`);
      return existing;
    }

    const commitment = await createCommitment({
      tenantId,
      projectId: contract.projectId,
      budgetLineId: null, // Contracts may not link directly to budget lines
      sourceType: 'CONTRACT',
      sourceId: contract.id,
      amount: contract.value,
      description: `Contract: ${contract.title}`,
      reference: contract.contractRef,
      costCode: null,
      effectiveDate: contract.signedAt || new Date(),
      createdBy: userId,
    });

    console.log(`[CVR Hook] Created commitment ${commitment.id} for contract ${contract.id}`);
    return commitment;
  } catch (err) {
    console.error('[CVR Hook] Error in onContractSigned:', err);
    // Don't throw - we don't want CVR tracking to break the main workflow
    return null;
  }
}

/**
 * Hook: Variation approved
 * Creates CVR commitment when variation is approved
 */
async function onVariationApproved(variation, tenantId, userId) {
  try {
    // Only create commitment if variation has a value
    const value = variation.approvedValue || variation.value;
    if (!value || Number(value) === 0) {
      console.log(`[CVR Hook] Skipping variation ${variation.id} - no value`);
      return null;
    }

    // Check if commitment already exists
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const existing = await prisma.cVRCommitment.findFirst({
      where: {
        tenantId,
        sourceType: 'VARIATION',
        sourceId: variation.id,
      },
    });

    if (existing) {
      console.log(`[CVR Hook] Commitment already exists for variation ${variation.id}`);
      return existing;
    }

    const commitment = await createCommitment({
      tenantId,
      projectId: variation.projectId,
      budgetLineId: variation.budgetLineId,
      sourceType: 'VARIATION',
      sourceId: variation.id,
      amount: value,
      description: `Variation: ${variation.title}`,
      reference: variation.variationNumber || variation.reference,
      costCode: null,
      effectiveDate: variation.approvedAt || variation.approvedDate || new Date(),
      createdBy: userId,
    });

    console.log(`[CVR Hook] Created commitment ${commitment.id} for variation ${variation.id}`);
    return commitment;
  } catch (err) {
    console.error('[CVR Hook] Error in onVariationApproved:', err);
    return null;
  }
}

/**
 * Hook: Payment Application certified
 * Creates CVR actual when payment application is certified
 */
async function onPaymentApplicationCertified(application, tenantId, userId) {
  try {
    // Use certified amount, fall back to claimed amount
    const amount = application.certifiedThisPeriod || application.claimedThisPeriod;
    if (!amount || Number(amount) === 0) {
      console.log(`[CVR Hook] Skipping payment application ${application.id} - no amount`);
      return null;
    }

    // Check if actual already exists
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const existing = await prisma.cVRActual.findFirst({
      where: {
        tenantId,
        sourceType: 'PAYMENT_APPLICATION',
        sourceId: application.id,
      },
    });

    if (existing) {
      console.log(`[CVR Hook] Actual already exists for payment application ${application.id}`);
      return existing;
    }

    const actual = await createActual({
      tenantId,
      projectId: application.projectId,
      budgetLineId: null, // Payment applications typically don't link to specific budget lines
      sourceType: 'PAYMENT_APPLICATION',
      sourceId: application.id,
      amount,
      description: `Payment Application: ${application.applicationNo}`,
      reference: application.applicationNo,
      costCode: null,
      incurredDate: application.applicationDate || new Date(),
      certifiedDate: application.certifiedDate || new Date(),
      paidDate: application.paidDate,
      createdBy: userId,
    });

    console.log(`[CVR Hook] Created actual ${actual.id} for payment application ${application.id}`);
    return actual;
  } catch (err) {
    console.error('[CVR Hook] Error in onPaymentApplicationCertified:', err);
    return null;
  }
}

/**
 * Hook: Payment Application paid
 * Updates CVR actual status to PAID
 */
async function onPaymentApplicationPaid(application, tenantId) {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const actual = await prisma.cVRActual.findFirst({
      where: {
        tenantId,
        sourceType: 'PAYMENT_APPLICATION',
        sourceId: application.id,
      },
    });

    if (!actual) {
      console.log(`[CVR Hook] No actual found for payment application ${application.id}`);
      return null;
    }

    const updated = await updateActualStatus(
      actual.id,
      'PAID',
      actual.certifiedDate,
      application.paidDate || new Date()
    );

    console.log(`[CVR Hook] Updated actual ${actual.id} to PAID for payment application ${application.id}`);
    return updated;
  } catch (err) {
    console.error('[CVR Hook] Error in onPaymentApplicationPaid:', err);
    return null;
  }
}

/**
 * Batch create commitments for existing contracts
 * Useful for migrating existing data
 */
async function batchCreateContractCommitments(tenantId, projectId = null) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  const where = {
    tenantId,
    ...(projectId && { projectId }),
    status: { in: ['signed', 'active'] },
  };

  const contracts = await prisma.contract.findMany({ where });
  const results = [];

  for (const contract of contracts) {
    const result = await onContractSigned(contract, tenantId, null);
    if (result) results.push(result);
  }

  console.log(`[CVR Hook] Batch created ${results.length} contract commitments`);
  return results;
}

/**
 * Batch create commitments for existing variations
 * Useful for migrating existing data
 */
async function batchCreateVariationCommitments(tenantId, projectId = null) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  const where = {
    tenantId,
    ...(projectId && { projectId }),
    status: 'approved',
  };

  const variations = await prisma.variation.findMany({ where });
  const results = [];

  for (const variation of variations) {
    const result = await onVariationApproved(variation, tenantId, null);
    if (result) results.push(result);
  }

  console.log(`[CVR Hook] Batch created ${results.length} variation commitments`);
  return results;
}

/**
 * Batch create actuals for existing payment applications
 * Useful for migrating existing data
 */
async function batchCreatePaymentApplicationActuals(tenantId, projectId = null) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  const where = {
    tenantId,
    ...(projectId && { projectId }),
    status: { in: ['certified', 'paid'] },
  };

  const applications = await prisma.applicationForPayment.findMany({ where });
  const results = [];

  for (const application of applications) {
    const result = await onPaymentApplicationCertified(application, tenantId, null);
    if (result) results.push(result);

    // Update to PAID if already paid
    if (application.status === 'paid' && result) {
      await onPaymentApplicationPaid(application, tenantId);
    }
  }

  console.log(`[CVR Hook] Batch created ${results.length} payment application actuals`);
  return results;
}

module.exports = {
  onContractSigned,
  onVariationApproved,
  onPaymentApplicationCertified,
  onPaymentApplicationPaid,
  batchCreateContractCommitments,
  batchCreateVariationCommitments,
  batchCreatePaymentApplicationActuals,
};
