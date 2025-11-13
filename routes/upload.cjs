const express = require('express');
const router = express.Router();
const multer = require('multer');
const { storageService } = require('../services/storage.factory.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  }
});

/**
 * POST /api/upload
 * Upload a file (automatically uses local or Oracle based on environment)
 */
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const ext = req.file.originalname.split('.').pop();
    const filename = `${timestamp}_${random}_${req.file.originalname}`;

    // Upload using storage service (local or Oracle based on env)
    const result = await storageService.uploadFile(req.file, filename);

    console.log(`📤 File uploaded: ${filename} (${process.env.FILE_STORAGE_TYPE || 'local'})`);

    res.json({
      success: true,
      file: {
        url: result.url,
        filename: result.filename,
        size: result.size,
        mimetype: result.mimetype
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: error.message
    });
  }
});

/**
 * GET /api/upload/:filename
 * Get a file (signed URL or direct serve)
 */
router.get('/:filename', requireAuth, async (req, res) => {
  try {
    const { filename } = req.params;

    if (process.env.FILE_STORAGE_TYPE === 'local' || process.env.NODE_ENV === 'development') {
      // For local, serve file directly
      const result = await storageService.getFile(filename);
      res.sendFile(result.filepath);
    } else {
      // For Oracle, redirect to signed URL
      const url = await storageService.getSignedUrl(filename);
      res.redirect(url);
    }
  } catch (error) {
    console.error('Get file error:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

/**
 * DELETE /api/upload/:filename
 * Delete a file
 */
router.delete('/:filename', requireAuth, async (req, res) => {
  try {
    const { filename } = req.params;
    await storageService.deleteFile(filename);

    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
