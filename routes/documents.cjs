const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { makeStorageKey, signKey, verifyKey, writeLocalStream } = require('../utils/storage.cjs');

const DEV = process.env.NODE_ENV !== 'production';
const STORAGE_PROVIDER = (process.env.STORAGE_PROVIDER || 'local').toLowerCase(); // 'local' | 's3'

// S3 (lazy)
let S3Client, PutObjectCommand, getSignedUrl, s3;
function ensureS3(){
  if (STORAGE_PROVIDER !== 's3') return;
  if (!S3Client) {
    ({ S3Client, PutObjectCommand } = require('@aws-sdk/client-s3'));
    ({ getSignedUrl } = require('@aws-sdk/s3-request-presigner'));
    s3 = new S3Client({
      region: process.env.S3_REGION,
      credentials: (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) ? {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      } : undefined,
    });
  }
}

// LIST
router.get('/', async (req, res) => {
  try {
    const { projectId, variationId, q, limit = 20, offset = 0 } = req.query;
    const where = { is_deleted: false };
    if (q) where.fileName = { contains: String(q), mode: 'insensitive' };
    if (projectId || variationId) {
      where.links = { some: {
        ...(projectId ? { projectId: Number(projectId) } : {}),
        ...(variationId ? { variationId: Number(variationId) } : {}),
      } };
    }

    const [rows, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
        skip: Number(offset) || 0,
        take: Number(limit) || 20,
        include: { links: { select: { id: true, projectId: true, variationId: true, note: true } } },
      }),
      prisma.document.count({ where }),
    ]);

    res.json({ data: rows ?? [], meta: { total: Number(total)||0, limit: Number(limit)||20, offset: Number(offset)||0 } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch documents', details: DEV ? String(err.message) : undefined });
  }
});

// DETAIL
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.document.findFirst({ where: { id, is_deleted: false }, include: { links: true } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch document', details: DEV ? String(err.message) : undefined });
  }
});

// INIT upload (presign S3 or issue local upload URL)
router.post('/init', async (req, res) => {
  try {
    const { fileName, contentType } = req.body || {};
    if (!fileName) return res.status(400).json({ error: 'fileName is required' });

    const storageKey = makeStorageKey(fileName);
    if (STORAGE_PROVIDER === 's3') {
      ensureS3();
      const bucket = process.env.S3_BUCKET;
      if (!bucket) return res.status(500).json({ error: 'S3_BUCKET not configured' });
      const cmd = new PutObjectCommand({ Bucket: bucket, Key: storageKey, ContentType: contentType || 'application/octet-stream' });
      const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 900 });
      return res.json({ data: { provider: 's3', storageKey, uploadUrl, bucket } });
    } else {
      const token = signKey(storageKey);
      const uploadUrl = `/api/documents/local/upload/${encodeURIComponent(storageKey)}?token=${token}`;
      return res.json({ data: { provider: 'local', storageKey, uploadUrl, token } });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to init upload', details: DEV ? String(err.message) : undefined });
  }
});

// LOCAL upload (stream body to disk)
router.put('/local/upload/:key', async (req, res) => {
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

// COMPLETE: record metadata & optional links
router.post('/complete', async (req, res) => {
  try {
    const {
      storageProvider, storageKey, fileName, contentType, size,
      etag, checksum_sha256, uploadedBy, projectId, variationId, note, tags
    } = req.body || {};

    if (!storageProvider || !storageKey || !fileName) {
      return res.status(400).json({ error: 'storageProvider, storageKey, fileName are required' });
    }

    const doc = await prisma.document.create({
      data: {
        storageProvider: String(storageProvider),
        storageKey: String(storageKey),
        fileName: String(fileName),
        contentType: contentType || null,
        size: size != null ? BigInt(size) : null,
        etag: etag || null,
        checksum_sha256: checksum_sha256 || null,
        tags: tags || null,
        uploadedBy: uploadedBy || null,
        links: (projectId || variationId) ? {
          create: [{
            projectId: projectId ? Number(projectId) : null,
            variationId: variationId ? Number(variationId) : null,
            note: note || null
          }],
        } : undefined,
      },
      include: { links: true },
    });

    res.status(201).json({ data: doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to complete upload', details: DEV ? String(err.message) : undefined });
  }
});

// SOFT DELETE
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const doc = await prisma.document.update({ where: { id }, data: { is_deleted: true } });
    res.json({ data: doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete document', details: DEV ? String(err.message) : undefined });
  }
});

module.exports = router;
