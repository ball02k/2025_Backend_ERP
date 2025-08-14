const { PrismaClient, Prisma } = require('@prisma/client');

let _prisma;
function getPrisma(){ if(!_prisma) _prisma = new PrismaClient(); return _prisma; }

// Decimal helper (not used much here but kept for consistency)
const dec = v => (v == null ? null : new Prisma.Decimal(v));

module.exports = { prisma: getPrisma(), Prisma, dec };
