const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');
const { requirePerm } = require('../middleware/checkPermission.cjs');
const { ooSign, ensureDir } = require('../lib/onlyoffice.cjs');
const path = require('path');
const fs = require('fs/promises');

const DS_URL = process.env.ONLYOFFICE_DS_URL || 'http://localhost:8082';
const OO_SECRET = process.env.ONLYOFFICE_JWT_SECRET || 'change_me';
const APP_BASE = process.env.APP_BASE_URL || 'http://localhost:3001';
const FILE_DIR = process.env.FILE_STORAGE_DIR || './uploads/contracts';

/**
 * Get or seed initial DOCX file for a contract
 */
async function getOrSeedDocx(tenantId, contractId) {
  // Use latest ContractFile if exists; else seed from a template
  const latest = await prisma.contractFile.findFirst({
    where: { tenantId, contractId },
    orderBy: { createdAt: 'desc' }
  });

  if (latest) {
    return {
      url: `${APP_BASE}/static/contracts/${contractId}/${path.basename(latest.path)}`,
      path: latest.path
    };
  }

  // Seed from repo template (provide one in /Documents/contract-templates/base.docx)
  const tplPath = path.resolve('./Documents/contract-templates/base.docx');
  const exists = await fs.stat(tplPath).then(() => true).catch(() => false);

  if (!exists) {
    throw new Error('Missing base.docx template at Documents/contract-templates/base.docx');
  }

  const ts = Date.now();
  const destDir = path.resolve(FILE_DIR, String(contractId));
  await ensureDir(destDir);
  const dest = path.join(destDir, `${ts}.docx`);
  await fs.copyFile(tplPath, dest);

  await prisma.contractFile.create({
    data: {
      tenantId,
      contractId,
      path: dest,
      size: (await fs.stat(dest)).size
    }
  });

  return {
    url: `${APP_BASE}/static/contracts/${contractId}/${path.basename(dest)}`,
    path: dest
  };
}

/**
 * GET /contracts/:id/onlyoffice/config
 * Returns ONLYOFFICE editor configuration for iframe
 */
router.get('/contracts/:id/onlyoffice/config', requireAuth, requirePerm('contracts:edit'), async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = req.user?.id;
  const contractId = Number(req.params.id);

  if (!tenantId || !userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: { supplier: true, project: true }
    });

    if (!contract) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Contract not found' });
    }

    const file = await getOrSeedDocx(tenantId, contractId);
    const docKey = `${tenantId}-${contractId}-${Date.now()}`; // unique per session
    const callbackUrl = `${APP_BASE}/api/onlyoffice/callback?contractId=${contractId}&tenantId=${tenantId}`;

    const cfg = {
      document: {
        fileType: 'docx',
        key: docKey,
        title: contract.title || `Subcontract ${contract.contractRef || contractId}`,
        url: file.url,
        permissions: {
          comment: true,
          edit: true,
          download: false,
          print: true,
          review: true // track changes
        }
      },
      editorConfig: {
        callbackUrl,
        lang: 'en-GB',
        customization: {
          autosave: true,
          forcesave: true
        },
        user: {
          id: String(userId),
          name: req.user?.name || `User ${userId}`
        }
      }
    };

    // Sign with JWT
    cfg.token = ooSign(cfg, OO_SECRET);

    res.json({ docServerUrl: DS_URL, config: cfg });
  } catch (error) {
    console.error('OnlyOffice config error:', error);
    res.status(500).json({ error: 'Failed to generate editor config', message: error.message });
  }
});

/**
 * GET /contracts/:id/onlyoffice/file
 * Serve current docx (optional - can also use /static/contracts path)
 */
router.get('/contracts/:id/onlyoffice/file', requireAuth, async (req, res) => {
  const tenantId = req.user?.tenantId;
  const contractId = Number(req.params.id);

  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const fileRec = await prisma.contractFile.findFirst({
      where: { tenantId, contractId },
      orderBy: { createdAt: 'desc' }
    });

    if (!fileRec) {
      return res.status(404).send('No file found');
    }

    res.sendFile(path.resolve(fileRec.path));
  } catch (error) {
    console.error('File serve error:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

/**
 * POST /api/onlyoffice/callback
 * OnlyOffice save callback (Document Server → our API)
 * Note: No auth header from DS; validate minimal payload and query
 */
router.post('/onlyoffice/callback', async (req, res) => {
  const contractId = Number(req.query.contractId);
  const tenantId = req.query.tenantId;
  const status = req.body?.status; // 2=MustSave, 6=MustForceSave
  const url = req.body?.url;       // DS temp file URL

  console.log('[OnlyOffice Callback]', { contractId, tenantId, status, url: url?.substring(0, 50) });

  if (![2, 6].includes(status) || !url || !contractId || !tenantId) {
    return res.json({ error: 0 });
  }

  try {
    // Download the updated file from ONLYOFFICE
    const resp = await fetch(url);
    const buf = Buffer.from(await resp.arrayBuffer());

    const destDir = path.resolve(FILE_DIR, String(contractId));
    await fs.mkdir(destDir, { recursive: true });
    const ts = Date.now();
    const dest = path.join(destDir, `${ts}.docx`);
    await fs.writeFile(dest, buf);

    // Persist file record
    await prisma.contractFile.create({
      data: {
        tenantId,
        contractId,
        path: dest,
        size: buf.length
      }
    });

    // Optionally add a ContractVersion row to mirror file versions
    const doc = await prisma.contractDocument.findFirst({
      where: { tenantId, contractId, active: true }
    });

    if (doc) {
      const versionCount = await prisma.contractVersion.count({
        where: { tenantId, contractDocId: doc.id }
      });

      await prisma.contractVersion.create({
        data: {
          tenantId,
          contractDocId: doc.id,
          versionNo: versionCount + 1,
          contentJson: { onlyofficeFile: path.basename(dest) } // metadata pointer
        }
      });
    }

    console.log('[OnlyOffice] Saved new version:', dest);
  } catch (e) {
    console.error('OO callback save error', e);
    // Still respond OK so DS doesn't keep retrying forever
  }

  res.json({ error: 0 });
});

module.exports = router;
