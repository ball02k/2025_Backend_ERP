const { PrismaClient, Prisma } = require('@prisma/client');

let prisma;
function getPrisma() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

// Decimal helper: number|string|null -> Prisma.Decimal|null
const dec = (v) => (v == null ? null : new Prisma.Decimal(v));

module.exports = { prisma: getPrisma(), Prisma, dec };
