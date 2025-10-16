const { PrismaClient, Prisma } = require('@prisma/client');

// Ensure we reuse a single Prisma client across hot reloads/tests
if (!global.__PRISMA_CLIENT__) {
  global.__PRISMA_CLIENT__ = new PrismaClient({
    log: process.env.DEBUG_PRISMA ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  });
}

const prisma = global.__PRISMA_CLIENT__;

function toDecimal(value, { fallback = 0, allowNull = false } = {}) {
  if (value instanceof Prisma.Decimal) return value;
  if (value === null || value === undefined || value === '') {
    if (allowNull) return null;
    return new Prisma.Decimal(fallback);
  }
  try {
    return new Prisma.Decimal(value);
  } catch (err) {
    throw Object.assign(new Error('Invalid decimal value'), { cause: err });
  }
}

module.exports = { prisma, Prisma, toDecimal };
