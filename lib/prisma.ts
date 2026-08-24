/**
 * Prisma Client - TypeScript Singleton
 *
 * TypeScript-compatible Prisma client instance for use in TypeScript files.
 * The CommonJS version (prisma.cjs) remains for existing CommonJS modules.
 */

import { PrismaClient } from '@prisma/client';

// Singleton instance
let prismaInstance: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

// Named export for convenience
export const prisma = getPrisma();

// Default export
export default prisma;
