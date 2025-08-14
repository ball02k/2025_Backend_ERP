// Replace with real DB tables when ready.
async function resolve(id, kind, prisma) {
  // e.g., query a Lookup table by id & kind; for now, return null to enforce strings unless you wire it up.
  // const row = await prisma.lookup.findFirst({ where: { id: BigInt(id), kind } });
  // return row?.value || null;
  return null;
}
module.exports = { resolve };
