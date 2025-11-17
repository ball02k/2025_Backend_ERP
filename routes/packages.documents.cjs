const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { makeStorageKey, localPath } = require('../utils/storage.cjs');
const fs = require('fs');

// GET /api/packages/:id/documents
router.get('/:id/documents', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const packageId = Number(req.params.id);
    if (!Number.isFinite(packageId)) return res.status(400).json({ error: 'Invalid packageId' });

    let docs = [];
    try {
      docs = await prisma.document.findMany({
        where: {
          tenantId,
          links: { some: { tenantId, entityType: 'package', entityId: packageId } },
        },
        orderBy: { uploadedAt: 'desc' },
        include: { links: true },
      });
    } catch (e) {
      console.warn('packages_documents.list fallback', e?.code || e?.message || e);
      docs = [];
    }

    const items = docs.map((d) => ({
      id: d.id,
      title: d.filename,
      filename: d.filename,
      mimeType: d.mimeType,
      size: d.size,
      createdAt: d.uploadedAt,
      downloadUrl: `/api/documents/${d.id}/download`,
    }));
    res.json({ items, total: items.length });
  } catch (err) {
    console.error(err);
    res.json({ items: [], total: 0 });
  }
});

// POST /api/packages/:id/documents
router.post('/:id/documents', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const packageId = Number(req.params.id);
    if (!Number.isFinite(packageId)) return res.status(400).json({ error: 'Invalid packageId' });

    const ct = String(req.headers['content-type'] || '').toLowerCase();
    if (!ct.startsWith('multipart/form-data')) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }
    const m = /boundary=([^;]+)\b/.exec(ct);
    if (!m) return res.status(400).json({ error: 'Missing multipart boundary' });
    const boundary = '--' + m[1];

    // Read entire request into a buffer
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

    const text = raw.toString('binary');
    const parts = text.split(boundary).filter((p) => p.trim() && p.indexOf('\r\n\r\n') !== -1);
    if (!parts.length) return res.status(400).json({ error: 'No multipart parts' });

    // Find the file part
    const filePart = parts.find((p) => /name="file"/i.test(p)) || parts[0];
    const headerEnd = filePart.indexOf('\r\n\r\n');
    if (headerEnd === -1) return res.status(400).json({ error: 'Malformed multipart part' });
    const headerText = filePart.slice(0, headerEnd);

    const fnMatch = /filename="([^"]+)"/i.exec(headerText);
    const filenameRaw = fnMatch ? fnMatch[1] : 'file.bin';
    const ctMatch = /content-type:\s*([^\r\n]+)/i.exec(headerText);
    const mimeType = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';

    const contentStart = headerEnd + 4;
    let content = filePart.slice(contentStart);
    content = content.replace(/\r?\n--$/, '');
    const buf = Buffer.from(content, 'binary');

    // Persist locally
    const storageKey = makeStorageKey(filenameRaw);
    const dest = localPath(storageKey);
    await fs.promises.mkdir(require('path').dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, buf);

    // Record in DB and link to package
    const created = await prisma.document.create({
      data: {
        tenantId,
        filename: filenameRaw,
        mimeType,
        size: buf.length,
        storageKey,
        uploadedById: req.user.id ? String(req.user.id) : null,
      },
    });

    await prisma.documentLink.create({
      data: {
        tenantId,
        documentId: created.id,
        entityType: 'package',
        entityId: packageId,
        linkType: 'package',
      },
    });

    res.status(201).json({ data: { id: created.id, filename: created.filename } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;
