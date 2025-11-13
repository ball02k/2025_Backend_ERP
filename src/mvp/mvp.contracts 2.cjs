const router = require('express').Router({ mergeParams: true });
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Upload a contract PDF (base64) and store file URL
router.post('/contracts/:id/upload', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { filename, base64 } = req.body || {};
    if (!filename || !base64) return res.status(400).json({ error: 'filename and base64 required' });
    const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(uploadsDir, `${id}_${Date.now()}_${safe}`);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    const relUrl = `/uploads/${path.basename(filePath)}`;
    const upd = await prisma.contract.update({ where: { id }, data: { pdfUrl: relUrl } });
    res.json({ id: upd.id, pdfUrl: relUrl });
  } catch (e) { next(e); }
});

// List contracts for a project with computed status
router.get('/projects/:projectId/contracts', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const rows = await prisma.contract.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' } });
    const now = new Date();
    const items = rows.map((c) => ({
      id: c.id, projectId: c.projectId, supplierId: c.supplierId, title: c.title, value: c.value, originalValue: c.originalValue,
      endDate: c.endDate, managedByUserId: c.managedByUserId, pdfUrl: c.pdfUrl,
      status: (!c.endDate || new Date(c.endDate) >= now) ? 'Active' : 'Expired',
    }));
    res.json(items);
  } catch (e) { next(e); }
});

module.exports = router;
