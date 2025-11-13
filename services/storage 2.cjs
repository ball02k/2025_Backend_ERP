const fs = require('fs');
const path = require('path');
const { prisma } = require('../utils/prisma.cjs');
const { makeStorageKey, localPath } = require('../utils/storage.cjs');

async function ensureDir(p) {
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
}

async function saveBufferAsDocument(buffer, filename, mimeType, tenantId, projectId) {
  const storageKey = makeStorageKey(filename);
  const fullPath = localPath(storageKey);
  await ensureDir(fullPath);
  await fs.promises.writeFile(fullPath, buffer);
  const created = await prisma.document.create({
    data: {
      tenantId,
      storageKey,
      filename,
      mimeType: mimeType || 'application/octet-stream',
      size: buffer.length,
      uploadedById: null,
    },
  });
  if (projectId != null) {
    await prisma.documentLink.create({
      data: { tenantId, documentId: created.id, projectId: Number(projectId), linkType: 'project' },
    });
  }
  return created.id; // BigInt
}

async function saveHtmlAsDocument(html, filename, tenantId, projectId) {
  const buffer = Buffer.from(String(html || ''), 'utf8');
  return saveBufferAsDocument(buffer, filename, 'text/html', tenantId, projectId);
}

module.exports = { saveBufferAsDocument, saveHtmlAsDocument };

