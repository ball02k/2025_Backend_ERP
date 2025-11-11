const express = require('express');
const router = express.Router();
const { prisma, toDecimal, Prisma } = require('../lib/prisma.js');
const { writeAudit } = require('../lib/audit.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');
const fs = require('fs');
const path = require('path');
const { localPath } = require('../utils/storage.cjs');

/** Very small CSV parser (robust delimiter detection, quotes supported, headers required). */
function parseCsvString(csvText) {
  // Normalise newlines to handle CRLF, LF and lone CR (old Mac)
  const raw = String(csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n').filter((l) => l != null && l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  const makeSplitter = (delim) => (l) => {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') {
        if (inQ && l[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === delim && !inQ) { out.push(cur); cur = ''; }
      else { cur += ch; }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const makeRegexSplitter = (re) => (l) => {
    // regex-based split, without quote sensitivity (best-effort fallback)
    return String(l || '').split(re).map((s) => s.trim());
  };

  const normaliseHeader = (h) => String(h || '')
    .replace(/^\uFEFF/, '') // strip BOM if present
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_');

  // Pick delimiter by matching expected header names first, then fall back to scoring
  const candidates = [
    ',', ';', '\t', '|',
    '，', '；',            // full-width comma/semicolon
    '\u001F', '\u001E', // Unit/Record separators (some exports)
    '\u001D', '\u001C', // Group/File separators
    '\v'                 // vertical tab
  ];
  const scorers = candidates.map((d) => ({ d, fn: makeSplitter(eval('"' + d + '"')) }));
  const sample = lines.slice(0, Math.min(lines.length, 10));
  const expected = new Set(['cost_code','description','quantity','unit','rate']);
  let bestPick = null;
  let bestMatch = -1;
  for (const sc of scorers) {
    const headCells = sc.fn(lines[0]);
    const normHeads = headCells.map((h) => String(h || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/[\s\-]+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_+/g, '_'));
    let matches = 0; for (const h of normHeads) if (expected.has(h)) matches++;
    if (matches > bestMatch || (matches === bestMatch && headCells.length > (bestPick?.cols || 0))) {
      bestPick = { sc, cols: headCells.length };
      bestMatch = matches;
    }
  }
  if (!bestPick || bestMatch <= 0) {
    // Fallback: heuristic scoring across first lines
    let bestScore = -1; let picked = scorers[0];
    for (const sc of scorers) {
      let score = 0;
      for (const l of sample) {
        const cnt = sc.fn(l).length;
        score += cnt > 1 ? Math.min(cnt, 40) : 0;
      }
      if (score > bestScore) { bestScore = score; picked = sc; }
    }
    bestPick = { sc: picked, cols: picked.fn(lines[0]).length };
  }
  let split = bestPick.sc.fn;

  // First pass with detected delimiter
  let headerCells = split(lines[0]);
  // Fallbacks if detection failed (no delimiter found)
  if (headerCells.length === 1) {
    const headLine = lines[0];
    // Try explicit tab
    if (/\t/.test(headLine)) {
      headerCells = headLine.split(/\t/);
      split = makeSplitter('\t');
    } else if (/[|]/.test(headLine)) {
      headerCells = headLine.split('|');
      split = makeSplitter('|');
    } else {
      // Try Unicode space delimiters as a single-char separator repeated 1+ times
      const spaceDelims = [
        /\u00A0+/g, // NBSP
        /[\u2000-\u200B\u202F\u205F\u3000]+/g, // various unicode spaces
        /\s{2,}/g, // 2+ ASCII spaces as last resort
      ];
      let picked = null;
      for (const re of spaceDelims) {
        const cells = headLine.split(re).map((s) => s.trim());
        if (cells.length >= 5) { picked = re; headerCells = cells; break; }
      }
      if (picked) {
        split = makeRegexSplitter(picked);
      } else {
        // Try control separators often used by legacy systems
        const ctrls = ['\u001F','\u001E','\u001D','\u001C','\v'];
        for (const c of ctrls) {
          const ch = eval('"' + c + '"');
          const cells = headLine.split(ch).map((s) => s.trim());
          if (cells.length >= 5) { headerCells = cells; split = makeSplitter(ch); break; }
        }
        // As a final heuristic, pick the most frequent non-word character in header line
        if (headerCells.length === 1) {
          const freq = new Map();
          for (const ch of headLine) {
            if (!(/[A-Za-z0-9_\-]/.test(ch))) freq.set(ch, (freq.get(ch) || 0) + 1);
          }
          const sorted = Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]);
          for (const [ch] of sorted) {
            const cells = headLine.split(ch).map((s)=>s.trim());
            if (cells.length >= 5) { headerCells = cells; split = makeSplitter(ch); break; }
          }
        }
      }
    }
  }

  const headers = headerCells.map((h) => normaliseHeader(h));
  const rows = lines.slice(1).map((line) => {
    let cols = split(line);
    if (cols.length === 1) {
      // Try with same delimiter but ignoring quotes in case of malformed quoting
      const delimChar = eval('"' + (bestPick?.sc?.d || ',') + '"');
      if (delimChar) cols = String(line || '').split(delimChar).map((s) => s.trim());
    }
    if (cols.length === 1) {
      if (/\t/.test(line)) cols = line.split(/\t/);
      else if (/[|]/.test(line)) cols = line.split('|');
      else if (/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/.test(line)) cols = line.split(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]+/);
      else if (/\s{2,}/.test(line)) cols = line.split(/\s{2,}/);
      else if (/[\u001F\u001E\u001D\u001C\v]/.test(line)) cols = line.split(/[\u001F\u001E\u001D\u001C\v]/);
    }
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] ?? '').trim(); });
    return obj;
  });
  return { headers, rows };
}

/** Load a document file buffer by id from S3 or local storage. */
async function loadDocumentBufferById(tenantId, fileId) {
  const idBig = BigInt(String(fileId));
  const doc = await prisma.document.findFirst({
    where: { id: idBig, tenantId },
    select: { storageKey: true, filename: true },
  });
  if (!doc) throw new Error('DOCUMENT_NOT_FOUND');

  // Check environment variable for storage provider
  const STORAGE_PROVIDER = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();

  // Handle S3 storage
  if (STORAGE_PROVIDER === 's3') {

    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: doc.storageKey,
    });

    const response = await s3.send(command);
    const buf = Buffer.from(await response.Body.transformToByteArray());
    return { buf, filename: doc.filename || path.basename(doc.storageKey) };
  }

  // Handle local storage
  const p = localPath(doc.storageKey);
  if (!fs.existsSync(p)) throw new Error('FILE_NOT_FOUND');
  const buf = fs.readFileSync(p);
  return { buf, filename: path.basename(p) };
}

/** Decode uploaded CSV buffer into string, handling UTF-8/UTF-8 BOM/UTF-16LE/UTF-16BE */
function decodeCsvBuffer(buf) {
  if (!buf || buf.length === 0) return '';
  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf8');
  }
  // UTF-16 LE BOM
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.slice(2).toString('utf16le');
  }
  // UTF-16 BE BOM -> swap to LE then decode
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    const swapped = Buffer.allocUnsafe(buf.length - 2);
    for (let i = 2; i + 1 < buf.length; i += 2) { swapped[i - 2] = buf[i + 1]; swapped[i - 1] = buf[i]; }
    return swapped.toString('utf16le');
  }
  // Heuristic: many NUL bytes -> likely UTF-16LE without BOM
  const nulCount = Math.min(2000, buf.length);
  let zeros = 0; for (let i = 0; i < nulCount; i++) if (buf[i] === 0x00) zeros++;
  if (zeros > nulCount / 4) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8');
}

function toNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const cleaned = String(raw)
    .replace(/[,\s]+/g, '')
    .replace(/[£$]/g, '')
    .replace(/\(([^)]+)\)/, '-$1');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Validate and normalise one preview row */
function validateRow(r) {
  const errors = [];
  // Support a few header variants by looking at both underscored and condensed keys
  const quantity = toNumber(r.quantity ?? r.qty);
  let rate = toNumber(r.rate ?? r.unit_rate);
  let total = toNumber(r.total ?? r.amount ?? r.value ?? r.line_total);
  if (total == null && quantity != null && rate != null) {
    total = Number(new Prisma.Decimal(quantity).mul(new Prisma.Decimal(rate)).toFixed(2));
  }
  if (rate == null && quantity != null && total != null) {
    const qDec = new Prisma.Decimal(quantity);
    if (!qDec.isZero()) {
      rate = Number(new Prisma.Decimal(total).div(qDec).toFixed(2));
    }
  }
  const unit = (r.unit || '').trim();
  const cost_code = (r.cost_code ?? r.costcode ?? r.code ?? r.cost_code_id ?? '').trim();
  const description = (r.description ?? r.desc ?? '').trim();

  if (!cost_code) errors.push('Missing cost_code');
  if (!description) errors.push('Missing description');
  if (!unit) errors.push('Missing unit');
  if (quantity == null || quantity < 0) errors.push('Invalid quantity');
  if (rate == null && total == null) errors.push('Invalid rate/total');

  const amount = total != null ? total : (quantity != null && rate != null ? Number(new Prisma.Decimal(quantity).mul(new Prisma.Decimal(rate)).toFixed(2)) : null);

  return {
    normalised: {
      costCode: cost_code.toUpperCase(),
      description,
      quantity,
      unit,
      rate,
      total: amount,
      amount,
      currency: r.currency || null,
      vatRate: r.vat_rate != null && r.vat_rate !== '' ? toNumber(r.vat_rate) : null,
      group: r.group || null,
      notes: r.notes || null,
    },
    errors,
  };
}

async function previewHandler(req, res) {
  try {
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const userId = req.user.id;
    const projectId = Number(req.params.projectId);
    const { fileId, columnMap } = req.body || {};
    if (!fileId) return res.status(400).json({ error: 'fileId required' });

    // Do not hard-fail on missing Project row; mirror existing budget routes that operate with projectId directly
    // If you need strict validation, re-enable the check below.
    // const project = await prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true } });
    // if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });

    const { buf, filename } = await loadDocumentBufferById(tenantId, fileId);
    const text = decodeCsvBuffer(buf);
    const { headers, rows } = parseCsvString(text);
    if (headers.length === 0) return res.status(400).json({ error: 'Empty CSV' });

    const mapKey = (k) => {
      if (!columnMap) return String(k).toLowerCase();
      const m = columnMap[k] || columnMap[String(k).toLowerCase()];
      return m ? String(m).toLowerCase() : String(k).toLowerCase();
    };
    const mapped = rows.map((r) => {
      const m = {}; Object.keys(r).forEach((k) => { m[mapKey(k)] = r[k]; }); return m;
    });

    let errorCount = 0;
    const previewRows = mapped.map((r, idx) => {
      const { normalised, errors } = validateRow(r);
      if (errors.length) errorCount++;
      return { rowNumber: idx + 2, ...normalised, errors };
    });

    const totals = {
      sumAmount: Number(
        previewRows
          .reduce(
            (acc, row) => acc.add(row.amount != null ? new Prisma.Decimal(row.amount) : new Prisma.Decimal(0)),
            new Prisma.Decimal(0),
          )
          .toFixed(2),
      ),
    };

    // Persist preview as ImportJob when table exists; otherwise fall back to ephemeral preview
    try {
      const job = await prisma.importJob.create({
        data: {
          tenantId, projectId, filename, status: 'preview',
          rowCount: previewRows.length,
          errorCount,
          preview: { headers, sample: previewRows.slice(0, 200), totals },
        },
      });
      await writeAudit({
        prisma,
        req,
        userId,
        entity: 'ImportJob',
        entityId: job.id,
        action: 'IMPORT_PREVIEW',
        changes: { filename, status: 'preview', totals },
      });
      return res.json({ jobId: job.id, rowCount: job.rowCount, errorCount, preview: job.preview });
    } catch (e) {
      // P2021: relation does not exist (migrations not applied) — return ephemeral preview
      return res.json({ jobId: null, rowCount: previewRows.length, errorCount, preview: { headers, sample: previewRows.slice(0, 200), totals } });
    }
  } catch (e) {
    console.error('[budgets:import]', e);
    res.status(500).json({ error: 'Import preview failed', details: String(e.message || e) });
  }
}

// DRY-RUN: build preview (both colon and slash variants)
router.post('/projects/:projectId/budgets:import', requireAuth, previewHandler);
router.post('/projects/:projectId/budgets/import', requireAuth, previewHandler);
router.post('/:projectId/budgets:import', requireAuth, previewHandler);
router.post('/:projectId/budgets/import', requireAuth, previewHandler);

async function commitHandler(req, res) {
  try {
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const userId = req.user.id;
    const projectId = Number(req.params.projectId);
    const { jobId, fileId, createMissingCostCodes = false, duplicatePolicy = 'skip' } = req.body || {};

    // Do not hard-fail on missing Project row; consumers already operate on projectId directly in other routes
    // const project = await prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true } });
    // if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });

    let job = null;
    if (jobId != null) {
      job = await prisma.importJob.findFirst({ where: { id: Number(jobId), tenantId, projectId } }).catch(()=>null);
      if (job && String(job.status).toLowerCase() === 'committed') return res.json({ ok: true, alreadyCommitted: true });
    }

    if (!fileId) return res.status(400).json({ error: 'fileId required' });
    const { buf } = await loadDocumentBufferById(tenantId, fileId);
    const text = decodeCsvBuffer(buf);
    const { rows } = parseCsvString(text);

    let created = 0, skipped = 0, errors = 0;
    for (const r of rows) {
      const { normalised, errors: rowErrors } = validateRow(r);
      if (rowErrors.length) { errors++; continue; }

      const { costCode, description, quantity, unit, rate, amount, total, currency, vatRate, group } = normalised;

      // Ensure cost code
      let cc = await prisma.costCode.findFirst({ where: { tenantId, code: costCode } });
      if (!cc && createMissingCostCodes) {
        cc = await prisma.costCode.create({ data: { tenantId, code: costCode, description: '' } });
      }
      // If still not found, proceed with a null costCodeId rather than dropping the row
      const costCodeId = cc ? cc.id : null;

      // Optional: map group label -> existing/created BudgetGroup
      let groupId = null;
      if (group && group.trim()) {
        const found = await prisma.budgetGroup.findFirst({ where: { tenantId, projectId, name: String(group).trim() }, select: { id: true } });
        if (found) groupId = found.id;
        else {
          const g = await prisma.budgetGroup.create({ data: { tenantId, projectId, name: String(group).trim(), isSystem: false } });
          groupId = g.id;
        }
      }

      // Duplicate policy: skip if same description + cost code
      const dup = await prisma.budgetLine.findFirst({
        where: { tenantId, projectId, costCodeId: costCodeId, description },
        select: { id: true },
      }).catch(()=>null);
      if (dup && duplicatePolicy === 'skip') { skipped++; continue; }

      const qtyDec = toDecimal(quantity ?? 0);
      const rateDec = toDecimal(rate ?? 0);
      const totalDec = toDecimal(total ?? amount ?? 0);

      const createdLine = await prisma.budgetLine.create({
        data: {
          tenantId,
          projectId,
          costCodeId: costCodeId,
          description,
          qty: qtyDec,
          unit: unit ? String(unit) : 'ea',
          rate: rateDec,
          total: totalDec,
          amount: totalDec,
          groupId,
        },
      });

      created++;
      await writeAudit({
        prisma,
        req,
        userId,
        entity: 'BudgetLine',
        entityId: createdLine.id,
        action: 'BUDGET_IMPORT_CREATE',
        changes: {
          costCode,
          description,
          qty: Number(qtyDec),
          rate: Number(rateDec),
          total: Number(totalDec),
          groupId,
        },
      });
    }

    if (job && job.id) {
      await prisma.importJob.update({ where: { id: job.id }, data: { status: 'committed', errorCount: errors } }).catch(()=>{});
    }
    // Attempt to recompute project financials, if hook available
    try {
      const { recomputeProjectFinancials } = require('./hooks.recompute.cjs');
      await recomputeProjectFinancials(tenantId, projectId);
    } catch (_) {}

    await writeAudit({
      prisma,
      req,
      userId,
      entity: 'BudgetImport',
      entityId: job?.id ?? `file:${fileId}`,
      action: 'IMPORT_COMMIT',
      changes: { created, skipped, errors, projectId },
    });

    res.json({ created, skipped, errors, status: 'committed' });
  } catch (e) {
    console.error('[budgets:commit]', e);
    res.status(500).json({ error: 'Commit failed' });
  }
}

// COMMIT: write BudgetLine rows (idempotent per jobId) — both colon and slash variants
router.post('/projects/:projectId/budgets:commit', requireAuth, commitHandler);
router.post('/projects/:projectId/budgets/commit', requireAuth, commitHandler);
router.post('/:projectId/budgets:commit', requireAuth, commitHandler);
router.post('/:projectId/budgets/commit', requireAuth, commitHandler);

module.exports = router;
// Expose handlers for reuse in other routers
module.exports.previewHandler = previewHandler;
module.exports.commitHandler = commitHandler;
