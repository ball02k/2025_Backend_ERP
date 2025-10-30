const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Generate next job number: JOB-2025-0001, JOB-2025-0002, etc.
 */
async function generateJobNumber(tenantId) {
  const currentYear = new Date().getFullYear();
  const prefix = `JOB-${currentYear}-`;

  // Find last job number for this year and tenant
  const lastJob = await prisma.job.findFirst({
    where: {
      tenantId,
      jobNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      jobNumber: 'desc',
    },
  });

  let nextNumber = 1;
  if (lastJob) {
    const lastNumberStr = lastJob.jobNumber.replace(prefix, '');
    const lastNumber = parseInt(lastNumberStr, 10);
    nextNumber = lastNumber + 1;
  }

  // Pad with zeros (e.g., 0001, 0002, etc.)
  const paddedNumber = nextNumber.toString().padStart(4, '0');
  return `${prefix}${paddedNumber}`;
}

/**
 * Generate next worker number: WKR-0001, WKR-0002, etc.
 */
async function generateWorkerNumber(tenantId) {
  const prefix = 'WKR-';

  const lastWorker = await prisma.worker.findFirst({
    where: {
      tenantId,
      workerNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      workerNumber: 'desc',
    },
  });

  let nextNumber = 1;
  if (lastWorker) {
    const lastNumberStr = lastWorker.workerNumber.replace(prefix, '');
    const lastNumber = parseInt(lastNumberStr, 10);
    nextNumber = lastNumber + 1;
  }

  const paddedNumber = nextNumber.toString().padStart(4, '0');
  return `${prefix}${paddedNumber}`;
}

/**
 * Generate next equipment number: EQP-0001, EQP-0002, etc.
 */
async function generateEquipmentNumber(tenantId) {
  const prefix = 'EQP-';

  const lastEquipment = await prisma.equipment.findFirst({
    where: {
      tenantId,
      equipmentNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      equipmentNumber: 'desc',
    },
  });

  let nextNumber = 1;
  if (lastEquipment) {
    const lastNumberStr = lastEquipment.equipmentNumber.replace(prefix, '');
    const lastNumber = parseInt(lastNumberStr, 10);
    nextNumber = lastNumber + 1;
  }

  const paddedNumber = nextNumber.toString().padStart(4, '0');
  return `${prefix}${paddedNumber}`;
}

module.exports = {
  generateJobNumber,
  generateWorkerNumber,
  generateEquipmentNumber,
};
