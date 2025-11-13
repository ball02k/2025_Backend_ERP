const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const docs = await prisma.document.findMany({
      where: { filename: { contains: 'budget' } },
      select: { id: true, filename: true, storageKey: true },
      take: 5,
      orderBy: { uploadedAt: 'desc' }
    });
    
    // Convert BigInt to string for JSON serialization
    const serializable = docs.map(doc => ({
      id: doc.id.toString(),
      filename: doc.filename,
      storageKey: doc.storageKey
    }));
    
    console.log(JSON.stringify(serializable, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
