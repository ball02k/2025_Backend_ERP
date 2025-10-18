// routes/budgets-ocr.cjs
// OCR-based PDF import for budgets (Tesseract + Tabula)
//
// Installation hints:
//   macOS/Linux: brew install tesseract
//   Download tabula.jar: https://github.com/tabulapdf/tabula-java/releases
//   Place in ./bin/tabula.jar (repo-tracked or local)
//
// Gracefully degrades if tools missing

const express = require('express');
const router = express.Router({ mergeParams: true });
const { prisma } = require('../lib/prisma.js');
const { writeAudit } = require('../lib/audit.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');
const { localPath } = require('../utils/storage.cjs');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

// Import the existing CSV handlers
const { previewHandler, commitHandler } = require('./budgets.import.cjs');

/**
 * Check if a system command exists
 */
async function hasCmd(cmd) {
  return new Promise((resolve) => {
    const checkCmd = process.platform === 'win32' ? 'where' : 'which';
    execFile(checkCmd, [cmd], (err) => resolve(!err));
  });
}

/**
 * Run Tesseract OCR on a PDF to extract raw text
 * Returns text content or empty string if tool missing
 */
async function runTesseract(pdfPath) {
  const hasTesseract = await hasCmd('tesseract');
  if (!hasTesseract) {
    console.warn('[OCR] Tesseract not found. Install with: brew install tesseract');
    return '';
  }

  try {
    // tesseract input.pdf stdout -l eng
    const { stdout } = await execFileAsync('tesseract', [pdfPath, 'stdout', '-l', 'eng'], {
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: 120000, // 2 minutes
    });
    return stdout || '';
  } catch (err) {
    console.error('[OCR] Tesseract error:', err.message);
    return '';
  }
}

/**
 * Run Tabula to extract tables from PDF to CSV
 * Writes to outCsvPath if successful
 */
async function runTabulaToCsv(pdfPath, outCsvPath) {
  const tabulaJar = path.join(__dirname, '../bin/tabula.jar');
  if (!fs.existsSync(tabulaJar)) {
    console.warn('[OCR] tabula.jar not found at:', tabulaJar);
    console.warn('      Download from: https://github.com/tabulapdf/tabula-java/releases');
    return false;
  }

  const hasJava = await hasCmd('java');
  if (!hasJava) {
    console.warn('[OCR] Java not found. Tabula requires Java runtime.');
    return false;
  }

  try {
    // java -jar ./bin/tabula.jar -p all -f CSV -o output.csv input.pdf
    await execFileAsync(
      'java',
      ['-jar', tabulaJar, '-p', 'all', '-f', 'CSV', '-o', outCsvPath, pdfPath],
      {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000,
      },
    );
    return fs.existsSync(outCsvPath) && fs.statSync(outCsvPath).size > 0;
  } catch (err) {
    console.error('[OCR] Tabula error:', err.message);
    return false;
  }
}

/**
 * Normalize table CSV from Tabula into budget import schema
 * Returns { rows, csvText, notes }
 */
function normaliseTableCsv(rawCsv, projectCode, packageCode) {
  const notes = [];
  const lines = rawCsv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) {
    notes.push('No data extracted from PDF tables');
    return { rows: [], csvText: '', notes };
  }

  // Parse CSV
  const rows = lines.map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    return cols;
  });

  // Detect header row by common BoQ keywords
  const headerKeywords = ['description', 'item', 'work', 'unit', 'qty', 'quantity', 'rate', 'price', 'total', 'amount'];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const rowLower = rows[i].map((c) => c.toLowerCase());
    const matches = rowLower.filter((c) => headerKeywords.some((kw) => c.includes(kw)));
    if (matches.length >= 3) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    notes.push('Could not detect header row - using first row as header');
    headerIdx = 0;
  }

  const headers = rows[headerIdx].map((h) =>
    h.toLowerCase().replace(/[\s\-]+/g, '_').replace(/[^a-z0-9_]/g, ''),
  );

  // Map columns to budget schema
  const descIdx = headers.findIndex((h) => ['description', 'item', 'work_item', 'desc'].includes(h));
  const unitIdx = headers.findIndex((h) => ['unit', 'uom', 'measure'].includes(h));
  const qtyIdx = headers.findIndex((h) => ['qty', 'quantity', 'quan'].includes(h));
  const rateIdx = headers.findIndex((h) => ['rate', 'unit_rate', 'price', 'unit_price'].includes(h));
  const totalIdx = headers.findIndex((h) => ['total', 'amount', 'value', 'line_total'].includes(h));

  if (descIdx === -1) notes.push('Description column not detected - using first column');
  if (unitIdx === -1) notes.push('Unit column not detected - defaulting to "ea"');
  if (qtyIdx === -1) notes.push('Quantity column not detected - using 0');
  if (rateIdx === -1 && totalIdx === -1) notes.push('Rate/Total columns not detected - amounts may be incorrect');

  // Build normalized rows
  const dataRows = rows.slice(headerIdx + 1);
  const normalised = [];
  let costCodeSeq = 1;

  for (const row of dataRows) {
    if (row.length === 0 || row.every((c) => !c)) continue;

    const description = descIdx >= 0 && row[descIdx] ? row[descIdx] : row[0] || '';
    if (!description.trim()) continue;

    const unit = unitIdx >= 0 && row[unitIdx] ? row[unitIdx] : 'ea';
    const qtyStr = qtyIdx >= 0 && row[qtyIdx] ? row[qtyIdx] : '0';
    const rateStr = rateIdx >= 0 && row[rateIdx] ? row[rateIdx] : '0';
    const totalStr = totalIdx >= 0 && row[totalIdx] ? row[totalIdx] : '';

    const cleanNumber = (s) => {
      const clean = String(s).replace(/[£$,\s]/g, '');
      const num = parseFloat(clean);
      return isNaN(num) ? 0 : num;
    };

    let qty = cleanNumber(qtyStr);
    let rate = cleanNumber(rateStr);
    let total = cleanNumber(totalStr);

    // Compute missing values
    if (total === 0 && qty !== 0 && rate !== 0) {
      total = qty * rate;
    } else if (rate === 0 && qty !== 0 && total !== 0) {
      rate = total / qty;
    }

    const costCode = `ITEM${String(costCodeSeq).padStart(3, '0')}`;
    costCodeSeq++;

    normalised.push({
      project_code: projectCode || '',
      package_code: packageCode || '',
      cost_code: costCode,
      item_description: description,
      unit,
      qty,
      rate_gbp: rate,
      total_gbp: total,
    });
  }

  // Generate CSV text
  const csvHeaders = 'project_code,package_code,cost_code,item_description,unit,qty,rate_gbp,total_gbp';
  const csvLines = normalised.map((r) =>
    [
      r.project_code,
      r.package_code,
      r.cost_code,
      `"${r.item_description.replace(/"/g, '""')}"`,
      r.unit,
      r.qty,
      r.rate_gbp,
      r.total_gbp,
    ].join(','),
  );
  const csvText = [csvHeaders, ...csvLines].join('\n');

  return { rows: normalised, csvText, notes };
}

/**
 * POST /api/projects/:projectId/budgets/ocr/preview
 * Extract tables from PDF, return preview + CSV text
 */
router.post('/preview', requireAuth, async (req, res) => {
  let tmpDir = null;
  try {
    const tenantId = req.user?.tenantId || 'demo';
    const projectId = Number(req.params.projectId);
    const { documentId, packageCode, groupName } = req.body || {};

    if (!documentId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'documentId required' } });
    }

    // Fetch document
    const docIdBig = BigInt(String(documentId));
    const doc = await prisma.document.findFirst({
      where: { id: docIdBig, tenantId },
      select: { storageKey: true, filename: true },
    });

    if (!doc) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    const filePath = localPath(doc.storageKey);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: { code: 'FILE_NOT_FOUND', message: 'File not found on disk' } });
    }

    // Fetch project for project_code
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { projectCode: true, name: true },
    });
    const projectCode = project?.projectCode || `PROJ${projectId}`;

    // Create temp workspace
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
    const tmpCsv = path.join(tmpDir, 'tabula-output.csv');

    const notes = [];
    let rows = [];
    let csvText = '';
    let confidence = 0;

    // Try Tabula first (structured tables)
    const tabulaSuccess = await runTabulaToCsv(filePath, tmpCsv);
    if (tabulaSuccess) {
      const rawCsv = fs.readFileSync(tmpCsv, 'utf8');
      const normalised = normaliseTableCsv(rawCsv, projectCode, packageCode);
      rows = normalised.rows;
      csvText = normalised.csvText;
      notes.push(...normalised.notes);
      confidence = rows.length > 0 ? 0.8 : 0.3;
      notes.push(`Tabula extracted ${rows.length} rows`);
    } else {
      notes.push('Tabula extraction failed or not available');
    }

    // Fallback: Try Tesseract for text extraction (keywords only)
    if (rows.length === 0) {
      const text = await runTesseract(filePath);
      if (text) {
        notes.push('Tesseract text extraction completed - manual parsing required');
        notes.push('No structured tables detected - please use CSV import');
        confidence = 0.1;
      } else {
        notes.push('Tesseract not available or extraction failed');
      }
    }

    // Cleanup
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // Detect columns
    const detectedColumns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return res.json({
      preview: { rows },
      csvText,
      hints: { detectedColumns, confidence },
      notes,
    });
  } catch (error) {
    console.error('[OCR Preview] Error:', error);
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'OCR preview failed', details: error.message },
    });
  }
});

/**
 * POST /api/projects/:projectId/budgets/ocr/commit
 * Forward CSV text to existing CSV importer
 */
router.post('/commit', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || 'demo';
    const userId = req.user.id;
    const projectId = Number(req.params.projectId);
    const { csvText } = req.body || {};

    if (!csvText || typeof csvText !== 'string') {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'csvText required' } });
    }

    // Create a temporary document for the CSV text
    const tmpFilename = `ocr-import-${Date.now()}.csv`;
    const tmpBuffer = Buffer.from(csvText, 'utf8');

    // Write to temp file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-commit-'));
    const tmpPath = path.join(tmpDir, tmpFilename);
    fs.writeFileSync(tmpPath, tmpBuffer);

    try {
      // Create a Document record for the CSV
      const storageKey = `temp/ocr-${Date.now()}.csv`;
      const targetPath = localPath(storageKey);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(tmpPath, targetPath);

      const doc = await prisma.document.create({
        data: {
          tenantId,
          storageKey,
          filename: tmpFilename,
          mimeType: 'text/csv',
          size: BigInt(tmpBuffer.length),
          provider: 'local',
          entityType: 'project',
          entityId: BigInt(projectId),
          category: 'import:budgets:ocr',
        },
      });

      // Call existing CSV import preview handler
      const mockReq = {
        ...req,
        params: { projectId: String(projectId) },
        body: { fileId: String(doc.id) },
      };

      // Use a mock response to capture preview result
      let previewResult = null;
      const mockRes = {
        json: (data) => {
          previewResult = data;
        },
        status: (code) => ({
          json: (data) => {
            previewResult = { error: data, statusCode: code };
          },
        }),
      };

      await previewHandler(mockReq, mockRes);

      if (previewResult?.error) {
        return res.status(previewResult.statusCode || 500).json(previewResult.error);
      }

      // Now commit the import
      const commitReq = {
        ...req,
        params: { projectId: String(projectId) },
        body: {
          jobId: previewResult.jobId,
          fileId: String(doc.id),
          createMissingCostCodes: true,
          duplicatePolicy: 'skip',
        },
      };

      let commitResult = null;
      const commitRespo = {
        json: (data) => {
          commitResult = data;
        },
        status: (code) => ({
          json: (data) => {
            commitResult = { error: data, statusCode: code };
          },
        }),
      };

      await commitHandler(commitReq, commitRespo);

      // Write audit log for OCR import
      await writeAudit({
        prisma,
        req,
        userId,
        entity: 'BudgetImport',
        entityId: previewResult.jobId || null,
        action: 'CREATE',
        changes: {
          source: 'OCR',
          projectId,
          rowCount: commitResult?.created || 0,
          notes: 'Imported via PDF OCR (Tabula + Tesseract)',
        },
      });

      // Cleanup temp files
      fs.rmSync(tmpDir, { recursive: true, force: true });

      return res.json(commitResult || { created: 0, errors: 0, status: 'committed' });
    } catch (err) {
      // Cleanup on error
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      throw err;
    }
  } catch (error) {
    console.error('[OCR Commit] Error:', error);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'OCR commit failed', details: error.message },
    });
  }
});

module.exports = router;
