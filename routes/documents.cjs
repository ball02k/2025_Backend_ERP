const express = require('express');
const router = express.Router();
const { prisma, Prisma } = require('../utils/prisma.cjs');
const { makeStorageKey, signKey, verifyKey, writeLocalStream } = require('../utils/storage.cjs');

// Helper: CSV tag utils
const toCsv = (arr) =>
  Array.from(
    new Set((arr || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean))
  ).join(',');
const hasTag = (csv, tag) =>
  (csv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(String(tag).toLowerCase());

const DEV = process.env.NODE_ENV !== 'production';
const STORAGE_PROVIDER = (process.env.STORAGE_PROVIDER || 'local').toLowerCase(); // 'local' | 's3'

// S3 (lazy)
let S3Client, PutObjectCommand, getSignedUrl, s3;
function ensureS3(){
  if (STORAGE_PROVIDER !== 's3') return;
  if (!S3Client) {
    ({ S3Client, PutObjectCommand } = require('@aws-sdk/client-s3'));
    ({ getSignedUrl } = require('@aws-sdk/s3-request-presigner'));

    // Debug logging for S3 configuration
    console.log('🔧 S3 Config:', {
      provider: STORAGE_PROVIDER,
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT,
      bucket: process.env.S3_BUCKET,
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY
    });

    s3 = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
}

// LIST
router.get('/', async (req, res) => {
  const {
    q,
    tag,
    from,
    to,
    projectId,
    variationId,
    limit = 50,
    offset = 0,
    includeDeleted,
  } = req.query;

  const where = {
    ...(includeDeleted ? {} : { is_deleted: false }),
    ...(projectId || variationId
      ? {
          links: {
            some: {
              ...(projectId ? { projectId: Number(projectId) } : {}),
              ...(variationId ? { variationId: Number(variationId) } : {}),
            },
          },
        }
      : {}),
  };

  if (q) {
    where.OR = [
      { fileName: { contains: q, mode: 'insensitive' } },
      { storageKey: { contains: q, mode: 'insensitive' } },
      { tags: { contains: String(q).toLowerCase() } },
    ];
  }

  if (from || to) {
    where.uploadedAt = {};
    if (from) where.uploadedAt.gte = new Date(from);
    if (to) where.uploadedAt.lte = new Date(to);
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: { links: true },
        orderBy: { uploadedAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.document.count({ where }),
    ]);

    const filtered = tag ? rows.filter((r) => hasTag(r.tags, tag)) : rows;

    res.json({
      data: filtered,
      meta: { total, limit: Number(limit), offset: Number(offset) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch documents', details: DEV ? String(err.message) : undefined });
  }
});

// DETAIL
router.get('/:id', async (req, res) => {
  try {
    const id = BigInt(req.params.id);
    const doc = await prisma.document.findUnique({
      where: { id },
      include: { links: true },
    });
    if (!doc || doc.is_deleted) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: doc });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid id' });
  }
});

// INIT upload (presign S3 or issue local upload URL)
router.post('/init', async (req, res) => {
  console.log('🚨 INIT ENDPOINT CALLED - STORAGE_PROVIDER:', process.env.STORAGE_PROVIDER || 'undefined');
  try {
    const { fileName, contentType } = req.body || {};
    if (!fileName) return res.status(400).json({ error: 'fileName is required' });

    const storageKey = makeStorageKey(fileName);
    if (STORAGE_PROVIDER === 's3') {
      ensureS3();
      const bucket = process.env.S3_BUCKET;
      if (!bucket) return res.status(500).json({ error: 'S3_BUCKET not configured' });

      // Log config for debugging
      console.log('🔧 Generating presigned URL with:', {
        endpoint: process.env.S3_ENDPOINT,
        bucket,
        key: storageKey,
        contentType: contentType || 'application/octet-stream'
      });

      const cmd = new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        ContentType: contentType || 'application/octet-stream'
      });

      const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 900 });

      console.log('📤 Generated presigned URL:', uploadUrl.substring(0, 150) + '...');

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
async function completeHandler(req, res) {
  try {
    const { storageKey, storageProvider, fileName, size, contentType, projectId, variationId, uploadedBy, tags } = req.body || {};

    if (!storageKey || !storageProvider || !fileName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (size != null && (isNaN(size) || Number(size) < 0)) {
      return res.status(400).json({ error: 'Invalid size' });
    }
    if (contentType && typeof contentType !== 'string') {
      return res.status(400).json({ error: 'Invalid contentType' });
    }

    const created = await prisma.document.create({
      data: {
        storageKey,
        storageProvider,
        fileName,
        size: size != null ? BigInt(size) : null,
        contentType: contentType || null,
        uploadedBy: uploadedBy || null,
        tags: toCsv(tags),
      },
    });

    if (projectId || variationId) {
      await prisma.documentLink.create({
        data: {
          documentId: created.id,
          projectId: projectId ? Number(projectId) : null,
          variationId: variationId ? Number(variationId) : null,
        },
      });
    }

    return res.json({ data: created });
  } catch (e) {
    // P2021 = table/view not found; give a helpful hint
    if (e.code === 'P2021') {
      return res.status(500).json({ error: 'Schema not migrated. Run: npm run db:migrate' });
    }
    return res.status(500).json({ error: 'Failed to complete document', details: String(e.message || e) });
  }
}

router.post('/complete', completeHandler);

// SOFT DELETE
router.delete('/:id', async (req, res) => {
  try {
    const id = BigInt(req.params.id);
    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing || existing.is_deleted) return res.status(404).json({ error: 'Not found' });
    const updated = await prisma.document.update({
      where: { id },
      data: { is_deleted: true, deletedAt: new Date() },
    });
    return res.json({ data: updated });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid id' });
  }
});

// POST /api/documents/:id/link
router.post('/:id/link', async (req, res) => {
  const { projectId, variationId, note } = req.body || {};
  if (!projectId && !variationId)
    return res.status(400).json({ error: 'Provide projectId or variationId' });
  try {
    const id = BigInt(req.params.id);
    const doc = await prisma.document.findFirst({
      where: { id, is_deleted: false },
    });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const link = await prisma.documentLink.create({
      data: {
        documentId: id,
        projectId: projectId ? Number(projectId) : null,
        variationId: variationId ? Number(variationId) : null,
        note: note || null,
      },
    });
    return res.json({ data: link });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid ids' });
  }
});

// POST /api/documents/:id/unlink
router.post('/:id/unlink', async (req, res) => {
  const { projectId, variationId } = req.body || {};
  if (!projectId && !variationId)
    return res.status(400).json({ error: 'Provide projectId or variationId' });
  try {
    const id = BigInt(req.params.id);
    const where = {
      documentId: id,
      ...(projectId ? { projectId: Number(projectId) } : {}),
      ...(variationId ? { variationId: Number(variationId) } : {}),
    };
    const result = await prisma.documentLink.deleteMany({ where });
    return res.json({ data: { deleted: result.count } });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid ids' });
  }
});

module.exports = router;
// Force deploy Mon 10 Nov 2025 16:55:42 GMT
