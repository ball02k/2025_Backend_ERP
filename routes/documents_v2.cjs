const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const {
  makeStorageKey,
  signKey,
  verifyKey,
  writeLocalStream,
  localPath,
} = require('../utils/storage.cjs');

const STORAGE_PROVIDER = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
const DEV = process.env.NODE_ENV !== 'production';

let S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, getSignedUrl, s3;
function ensureS3() {
  if (STORAGE_PROVIDER !== 's3') return;
  if (!S3Client) {
    ({ S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3'));
    ({ getSignedUrl } = require('@aws-sdk/s3-request-presigner'));
    s3 = new S3Client({
      region: process.env.S3_REGION,
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }
}

// POST /api/documents/init
router.post('/init', async (req, res) => {
  try {
    // Accept both new and legacy field names from FE
    const body = req.body || {};
    const filename = body.filename || body.fileName;
    const mimeType = body.mimeType || body.contentType;
    if (!filename) return res.status(400).json({ error: 'filename is required' });
    const storageKey = makeStorageKey(filename);

    if (STORAGE_PROVIDER === 's3') {
      ensureS3();
      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: storageKey,
        ContentType: mimeType || 'application/octet-stream',
      });
      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      return res.json({ data: { storageKey, uploadUrl } });
    }

    const token = signKey(storageKey);
    const uploadUrl = `/api/documents/upload/${encodeURIComponent(storageKey)}?token=${token}`;
    return res.json({ data: { storageKey, uploadUrl, token, provider: 'local' } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to init upload', details: DEV ? String(err.message) : undefined });
  }
});

// PUT /api/documents/upload/:key (local only)
router.put('/upload/:key', async (req, res) => {
  try {
    if (STORAGE_PROVIDER !== 'local') return res.status(400).json({ error: 'Local uploads disabled' });
    const key = decodeURIComponent(req.params.key);
    const token = req.query.token;
    if (!verifyKey(key, token)) return res.status(403).json({ error: 'Invalid token' });
    const result = await writeLocalStream(req, key);
    res.status(201).json({ data: { storageKey: key, size: result.size } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload', details: DEV ? String(err.message) : undefined });
  }
});

// POST /api/documents/complete
router.post('/complete', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const body = req.body || {};
    // Accept legacy aliases (fileName/contentType) and pass-through extra fields
    const storageKey = body.storageKey;
    const filename = body.filename || body.fileName;
    const mimeType = body.mimeType || body.contentType || 'application/octet-stream';
    const size = body.size != null ? body.size : body.fileSize;
    const sha256 = body.sha256 || body.hash || null;
    const projectId = body.projectId;
    const variationId = body.variationId;

    if (!storageKey || !filename || size == null)
      return res.status(400).json({ error: 'Missing required fields' });

    const created = await prisma.document.create({
      data: {
        tenantId,
        storageKey,
        filename,
        mimeType,
        size: Number(size),
        sha256: sha256 || null,
        uploadedById: req.user.id ? String(req.user.id) : null,
      },
    });

    if (projectId || variationId) {
      await prisma.documentLink.create({
        data: {
          tenantId,
          documentId: created.id,
          projectId: projectId ? Number(projectId) : null,
          variationId: variationId ? Number(variationId) : null,
          linkType: projectId ? 'project' : 'variation',
        },
      });
    }

    res.json({ data: created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to complete upload', details: DEV ? String(err.message) : undefined });
  }
});

// GET /api/documents
router.get('/', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { q, projectId, variationId, rfiId, qaRecordId, hsEventId, carbonEntryId, limit = 50, offset = 0 } = req.query;

    const where = { tenantId };

    if (q) {
      where.OR = [
        { filename: { contains: q, mode: 'insensitive' } },
        { storageKey: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (projectId || variationId || rfiId || qaRecordId || hsEventId || carbonEntryId) {
      where.links = {
        some: {
          tenantId,
          ...(projectId ? { projectId: Number(projectId) } : {}),
          ...(variationId ? { variationId: Number(variationId) } : {}),
          ...(rfiId ? { rfiId: Number(rfiId) } : {}),
          ...(qaRecordId ? { qaRecordId: Number(qaRecordId) } : {}),
          ...(hsEventId ? { hsEventId: Number(hsEventId) } : {}),
          ...(carbonEntryId ? { carbonEntryId: Number(carbonEntryId) } : {}),
        },
      };
    }

    const [data, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: { links: true },
        orderBy: { uploadedAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.document.count({ where }),
    ]);

    // Provide both modern and legacy shapes
    res.json({
      data,
      items: data,
      meta: { total: Number(total), limit: Number(limit), offset: Number(offset) },
      total: Number(total),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list documents', details: DEV ? String(err.message) : undefined });
  }
});

// GET /api/documents/:id
router.get('/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = BigInt(req.params.id);
    const doc = await prisma.document.findFirst({ where: { id, tenantId }, include: { links: true } });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ data: doc });
  } catch (err) {
    res.status(400).json({ error: 'Invalid id' });
  }
});

// GET /api/documents/:id/download
router.get('/:id/download', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = BigInt(req.params.id);
    const doc = await prisma.document.findFirst({ where: { id, tenantId } });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (STORAGE_PROVIDER === 's3') {
      ensureS3();
      const command = new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: doc.storageKey });
      const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
      return res.json({ url });
    }

    return res.sendFile(localPath(doc.storageKey));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to download document', details: DEV ? String(err.message) : undefined });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = BigInt(req.params.id);
    const existing = await prisma.document.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await prisma.$transaction([
      prisma.documentLink.deleteMany({ where: { tenantId, documentId: id } }),
      prisma.document.delete({ where: { id } }),
    ]);

    // Return a compatibility flag some callers expect
    res.json({ data: { id: Number(id), is_deleted: true } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete document', details: DEV ? String(err.message) : undefined });
  }
});

// POST /api/documents/:id/link
router.post('/:id/link', async (req, res) => {
  const { projectId, variationId, rfiId, qaRecordId, hsEventId, carbonEntryId } = req.body || {};
  if (!projectId && !variationId && !rfiId && !qaRecordId && !hsEventId && !carbonEntryId)
    return res.status(400).json({ error: 'Provide a valid link target' });

  try {
    const tenantId = req.user.tenantId;
    const id = BigInt(req.params.id);
    const doc = await prisma.document.findFirst({ where: { id, tenantId } });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const link = await prisma.documentLink.create({
      data: {
        tenantId,
        documentId: id,
        projectId: projectId ? Number(projectId) : null,
        variationId: variationId ? Number(variationId) : null,
        rfiId: rfiId ? Number(rfiId) : null,
        qaRecordId: qaRecordId ? Number(qaRecordId) : null,
        hsEventId: hsEventId ? Number(hsEventId) : null,
        carbonEntryId: carbonEntryId ? Number(carbonEntryId) : null,
        linkType: projectId ? 'project' : variationId ? 'variation' : rfiId ? 'rfi' : qaRecordId ? 'qa' : hsEventId ? 'hs' : 'carbon',
      },
    });

    res.json({ data: link });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to link document', details: DEV ? String(err.message) : undefined });
  }
});

// POST /api/documents/:id/unlink
router.post('/:id/unlink', async (req, res) => {
  const { projectId, variationId, rfiId, qaRecordId, hsEventId, carbonEntryId } = req.body || {};
  if (!projectId && !variationId && !rfiId && !qaRecordId && !hsEventId && !carbonEntryId)
    return res.status(400).json({ error: 'Provide a valid unlink target' });
  try {
    const tenantId = req.user.tenantId;
    const id = BigInt(req.params.id);
    const where = {
      tenantId,
      documentId: id,
      ...(projectId ? { projectId: Number(projectId) } : {}),
      ...(variationId ? { variationId: Number(variationId) } : {}),
      ...(rfiId ? { rfiId: Number(rfiId) } : {}),
      ...(qaRecordId ? { qaRecordId: Number(qaRecordId) } : {}),
      ...(hsEventId ? { hsEventId: Number(hsEventId) } : {}),
      ...(carbonEntryId ? { carbonEntryId: Number(carbonEntryId) } : {}),
    };
    const result = await prisma.documentLink.deleteMany({ where });
    res.json({ data: { deleted: result.count } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to unlink document', details: DEV ? String(err.message) : undefined });
  }
});

module.exports = router;
