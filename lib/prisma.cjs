const { PrismaClient } = require("@prisma/client");

let prismaInstance;

function getPrisma() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

module.exports = getPrisma();
