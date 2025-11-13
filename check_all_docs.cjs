const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
function localPath(storageKey){ return path.join(UPLOAD_DIR, storageKey); }

async function check() {
  try {
    const docs = await prisma.document.findMany({
      select: { id: true, filename: true, storageKey: true },
      take: 20,
      orderBy: { uploadedAt: 'desc' }
    });

    console.log(`Found ${docs.length} documents\n`);

    for (const doc of docs) {
      const resolvedPath = localPath(doc.storageKey);
      const exists = fs.existsSync(resolvedPath);
      const status = exists ? '✓' : '✗ MISSING';

      console.log(`${status} ID: ${doc.id.toString()}`);
      console.log(`  File: ${doc.filename}`);
      console.log(`  Key: ${doc.storageKey}`);
      console.log(`  Resolved: ${resolvedPath}`);
      if (!exists) {
        console.log(`  ⚠️  FILE NOT FOUND AT THIS PATH!`);
      }
      console.log('');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
