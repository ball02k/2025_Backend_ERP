const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { makeStorageKey, localPath } = require('../utils/storage.cjs');
const fs = require('fs');

// Compatibility routes to support FE calls like /api/projects/:id/documents

// GET /api/projects/:id/documents
router.get('/:id/documents', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

    let docs = [];
    try {
      docs = await prisma.document.findMany({
        where: {
          tenantId,
          links: { some: { tenantId, projectId } },
        },
        orderBy: { uploadedAt: 'desc' },
        include: { links: true },
      });
    } catch (e) {
      // Graceful fallback when tables/migrations not present in dev
      console.warn('project_documents.list fallback', e?.code || e?.message || e);
      docs = [];
    }

    // Shape a simple list compatible with FE expectations
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
    // Return empty list to avoid blocking UI in dev
    res.json({ items: [], total: 0 });
  }
});

// POST /api/projects/:id/documents (local only; basic multipart parser for single file field named "file")
router.post('/:id/documents', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

    const ct = String(req.headers['content-type'] || '').toLowerCase();
    if (!ct.startsWith('multipart/form-data')) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }
    const m = /boundary=([^;]+)\b/.exec(ct);
    if (!m) return res.status(400).json({ error: 'Missing multipart boundary' });
    const boundary = '--' + m[1];

    // Read entire request into a buffer (sufficient for dev uploads)
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

    const text = raw.toString('binary');
    const parts = text.split(boundary).filter((p) => p.trim() && p.indexOf('\r\n\r\n') !== -1);
    if (!parts.length) return res.status(400).json({ error: 'No multipart parts' });

    // Find the file part (name="file")
    const filePart = parts.find((p) => /name="file"/i.test(p)) || parts[0];
    const headerEnd = filePart.indexOf('\r\n\r\n');
    if (headerEnd === -1) return res.status(400).json({ error: 'Malformed multipart part' });
    const headerText = filePart.slice(0, headerEnd);
    // Derive filename and mime type
    const fnMatch = /filename="([^"]+)"/i.exec(headerText);
    const filenameRaw = fnMatch ? fnMatch[1] : 'file.bin';
    const ctMatch = /content-type:\s*([^\r\n]+)/i.exec(headerText);
    const mimeType = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';

    // Extract content (between double CRLF and the trailing CRLF before boundary)
    const contentStart = headerEnd + 4; // skip CRLFCRLF
    // Slice off trailing CRLF-- if present
    let content = filePart.slice(contentStart);
    content = content.replace(/\r?\n--$/, '');
    // Convert back to Buffer from binary string
    const buf = Buffer.from(content, 'binary');

    // Persist locally
    const storageKey = makeStorageKey(filenameRaw);
    const dest = localPath(storageKey);
    await fs.promises.mkdir(require('path').dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, buf);

    // Record in DB and link to project
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
        projectId,
        linkType: 'project',
      },
    });

    res.status(201).json({ data: { id: created.id, filename: created.filename } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;
