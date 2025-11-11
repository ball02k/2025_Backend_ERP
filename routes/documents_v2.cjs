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
      forcePathStyle: true, // Critical for Oracle Cloud compatibility
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }
}

// POST /api/documents/init
router.post('/init', async (req, res) => {
  console.log('🚨 INIT ENDPOINT CALLED - STORAGE_PROVIDER:', STORAGE_PROVIDER);
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

      // Fix: AWS SDK v3 presigner doesn't respect custom endpoints for Oracle Cloud
      // Manually rewrite URL to use Oracle Cloud endpoint
      let finalUrl = uploadUrl;
      if (process.env.S3_ENDPOINT && uploadUrl.includes('amazonaws.com')) {
        const awsPattern = /https:\/\/([^.]+)\.s3\.([^.]+)\.amazonaws\.com\/([^?]+)(\?.*)/;
        const match = uploadUrl.match(awsPattern);
        if (match) {
          const [, bucket, region, key, queryString] = match;
          finalUrl = `${process.env.S3_ENDPOINT}/${bucket}/${key}${queryString}`;
          console.log('🔄 Rewrote AWS URL to Oracle Cloud:', finalUrl.substring(0, 150) + '...');
        }
      }

      console.log('📤 Generated presigned URL:', finalUrl.substring(0, 150) + '...');

      return res.json({ data: { storageKey, uploadUrl: finalUrl } });
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
    const entityType = body.entityType;
    const entityId = body.entityId;
    const linkCategory = body.category;

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

    // New polymorphic link support (preferred)
    if (entityType && entityId != null) {
      const docId = created.id;
      const existing = await prisma.documentLink.findFirst({
        where: { tenantId, documentId: docId, entityType: String(entityType), entityId: Number(entityId) },
      });
      if (existing) {
        await prisma.documentLink.update({ where: { id: existing.id }, data: { category: linkCategory || null } });
      } else {
        await prisma.documentLink.create({
          data: {
            tenantId,
            documentId: docId,
            entityType: String(entityType),
            entityId: Number(entityId),
            category: linkCategory || null,
            linkType: String(entityType),
          },
        });
      }
    } else if (projectId || variationId) {
      // Back-compat legacy link fields
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
    const { q, projectId, variationId, rfiId, qaRecordId, hsEventId, carbonEntryId, entityType, entityId, limit = 50, offset = 0, includeImports } = req.query;

    const where = { tenantId };

    if (q) {
      where.OR = [
        { filename: { contains: q, mode: 'insensitive' } },
        { storageKey: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (projectId || variationId || rfiId || qaRecordId || hsEventId || carbonEntryId || entityType || entityId) {
      where.links = {
        some: {
          tenantId,
          ...(projectId ? { projectId: Number(projectId) } : {}),
          ...(variationId ? { variationId: Number(variationId) } : {}),
          ...(rfiId ? { rfiId: Number(rfiId) } : {}),
          ...(qaRecordId ? { qaRecordId: Number(qaRecordId) } : {}),
          ...(hsEventId ? { hsEventId: Number(hsEventId) } : {}),
          ...(carbonEntryId ? { carbonEntryId: Number(carbonEntryId) } : {}),
          ...(entityType ? { entityType: String(entityType) } : {}),
          ...(entityId != null ? { entityId: Number(entityId) } : {}),
        },
      };
    }

    // By default hide import-temporary files (category starting with 'import:') unless includeImports=true|1
    const incImports = String(includeImports || '').toLowerCase();
    const showImports = incImports === 'true' || incImports === '1';
    if (!showImports) {
      where.AND = [
        ...(where.AND || []),
        { links: { none: { tenantId, category: { startsWith: 'import:' } } } },
      ];
    }

    let data = [], total = 0;
    try {
      const [rows, cnt] = await Promise.all([
        prisma.document.findMany({
          where,
          include: { links: true },
          orderBy: { uploadedAt: 'desc' },
          take: Number(limit),
          skip: Number(offset),
        }),
        prisma.document.count({ where }),
      ]);
      // Enrich with cross-links to parents
      const { buildLinks } = require('../lib/buildLinks.cjs');
      data = rows.map(d => {
        const out = { ...d, id: d.id.toString() };
        // links entries may include projectId/variationId; build pills
        const parent = {};
        const anyLink = Array.isArray(d.links) ? d.links[0] : null;
        if (anyLink) {
          if (anyLink.projectId) parent.projectId = anyLink.projectId;
          if (anyLink.variationId) parent.variationId = anyLink.variationId;
        }
        out.links = buildLinks('document', parent);
        return out;
      });
      total = Number(cnt || 0);
    } catch (e) {
      // Graceful fallback in dev when tables not present or migrations pending
      console.warn('documents.list fallback', e?.code || e?.message || e);
      data = [];
      total = 0;
    }

    // Provide both modern and legacy shapes
    res.json({
      data,
      items: data,
      meta: { total: Number(total), limit: Number(limit), offset: Number(offset) },
      total: Number(total),
    });
  } catch (err) {
    console.error(err);
    // Return empty list to avoid blocking UI in dev
    res.json({ data: [], items: [], meta: { total: 0, limit: Number(req.query?.limit || 50), offset: Number(req.query?.offset || 0) }, total: 0 });
  }
});

// GET /api/documents/:id
router.get('/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = BigInt(req.params.id);
    const doc = await prisma.document.findFirst({ where: { id, tenantId }, include: { links: true } });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const { buildLinks } = require('../lib/buildLinks.cjs');
    const out = { ...doc, id: doc.id.toString() };
    const parent = {};
    if (Array.isArray(doc.links)) {
      for (const l of doc.links) {
        if (l.projectId) parent.projectId = l.projectId;
        if (l.variationId) parent.variationId = l.variationId;
      }
    }
    out.links = buildLinks('document', parent);
    res.json({ data: out });
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
  const { projectId, variationId, rfiId, qaRecordId, hsEventId, carbonEntryId, poId } = req.body || {};
  if (!projectId && !variationId && !rfiId && !qaRecordId && !hsEventId && !carbonEntryId && !poId)
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
        poId: poId ? Number(poId) : null,
        linkType: projectId ? 'project' : variationId ? 'variation' : poId ? 'po' : rfiId ? 'rfi' : qaRecordId ? 'qa' : hsEventId ? 'hs' : 'carbon',
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
  const { projectId, variationId, rfiId, qaRecordId, hsEventId, carbonEntryId, poId } = req.body || {};
  if (!projectId && !variationId && !rfiId && !qaRecordId && !hsEventId && !carbonEntryId && !poId)
    return res.status(400).json({ error: 'Provide a valid unlink target' });
  try {
    const tenantId = req.user.tenantId;
    const id = BigInt(req.params.id);
    const where = {
      tenantId,
      documentId: id,
      ...(projectId ? { projectId: Number(projectId) } : {}),
      ...(variationId ? { variationId: Number(variationId) } : {}),
      ...(poId ? { poId: Number(poId) } : {}),
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
