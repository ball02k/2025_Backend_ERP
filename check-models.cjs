const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$')).forEach(k => console.log(k));