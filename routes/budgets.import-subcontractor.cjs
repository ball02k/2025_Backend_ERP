/**
 * Budget Import for Subcontractor Mode (Task 2.3)
 *
 * When project role is SUBCONTRACTOR or DIRECT_TO_CLIENT, this import flow
 * allows importing the Main Contractor's budget breakdown instead of creating
 * internal packages. This is fundamentally different from PC mode:
 *
 * - No packages created
 * - Preserves MC's original references and descriptions
 * - Saves column mappings for reuse with specific MCs
 * - Auto-suggests mappings based on patterns
 * - Validates against upstream contract value
 *
 * Routes:
 * - POST /api/projects/:projectId/budget/parse - Parse file and suggest mappings
 * - POST /api/projects/:projectId/budget/import - Apply mappings and create lines
 */

const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const { prisma, toDecimal, Prisma } = require('../lib/prisma.js');
const XLSX = require('xlsx');

router.use(requireAuth);

/**
 * Smart column detection - suggests mappings based on header patterns
 */
function suggestColumnMappings(headers) {
  const suggestions = {};

  const patterns = {
    reference: /^(ref|reference|item.*ref|ref.*no|item.*no|line.*ref|mc.*ref|external.*ref)$/i,
    description: /^(desc|description|item.*desc|work.*desc|scope|item|work)$/i,
    quantity: /^(qty|quantity|amount|no\.)$/i,
    unit: /^(unit|uom|u\/m|measure)$/i,
    rate: /^(rate|unit.*rate|price|unit.*price)$/i,
    total: /^(total|amount|value|line.*total|sum|subtotal)$/i,
  };

  headers.forEach((header, index) => {
    const normalized = String(header || '').trim().toLowerCase();

    for (const [field, pattern] of Object.entries(patterns)) {
      if (pattern.test(normalized)) {
        suggestions[field] = index;
        break;
      }
    }
  });

  return suggestions;
}

/**
 * Parse Excel/CSV file and extract rows with headers
 * Uses XLSX library which handles both Excel and CSV formats
 */
function parseFile(buffer, filename) {
  // XLSX library can handle both CSV and Excel formats
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

  if (!data.length) return { headers: [], rows: [] };

  const headers = data[0].map(h => String(h || '').trim());
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = String(row[i] ?? '').trim();
    });
    return obj;
  });

  return { headers, rows };
}

/**
 * POST /api/projects/:projectId/budget/parse
 * Parse uploaded file and return preview with suggested column mappings
 */
router.post('/projects/:projectId/budget/parse', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId;
    const { fileBuffer, filename, mainContractorId } = req.body;

    if (!fileBuffer) {
      return res.status(400).json({ error: 'fileBuffer is required' });
    }

    // Verify project exists and belongs to tenant
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: {
        id: true,
        projectRole: true,
        upstreamContract: {
          select: {
            contractValue: true,
            mainContractorId: true
          }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Validate project role
    if (project.projectRole !== 'SUBCONTRACTOR' && project.projectRole !== 'DIRECT_TO_CLIENT') {
      return res.status(400).json({
        error: 'Budget import is only available for SUBCONTRACTOR and DIRECT_TO_CLIENT projects',
        hint: 'Use the standard budget creation flow for Principal Contractor projects'
      });
    }

    // Parse file
    const buffer = Buffer.from(fileBuffer, 'base64');
    const { headers, rows } = parseFile(buffer, filename);

    if (!headers.length || !rows.length) {
      return res.status(400).json({ error: 'File is empty or could not be parsed' });
    }

    // Suggest column mappings
    const suggestedMappings = suggestColumnMappings(headers);

    // Check for saved mappings for this MC
    let savedMappings = [];
    if (mainContractorId || project.upstreamContract?.mainContractorId) {
      const mcId = mainContractorId || project.upstreamContract.mainContractorId;
      savedMappings = await prisma.importMapping.findMany({
        where: {
          tenantId,
          mainContractorId: mcId
        },
        select: {
          id: true,
          name: true,
          mappings: true,
          isDefault: true
        },
        orderBy: [
          { isDefault: 'desc' },
          { name: 'asc' }
        ]
      });
    }

    // Preview first 10 rows
    const preview = rows.slice(0, 10).map((row, index) => ({
      rowNumber: index + 2, // +2 because row 1 is headers and arrays are 0-indexed
      data: row
    }));

    // Calculate total from suggested total column if available
    let estimatedTotal = null;
    if (suggestedMappings.total !== undefined) {
      const totalColHeader = headers[suggestedMappings.total];
      estimatedTotal = rows.reduce((sum, row) => {
        const val = parseFloat(String(row[totalColHeader] || '0').replace(/[^0-9.-]/g, ''));
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
    }

    res.json({
      headers,
      preview,
      rowCount: rows.length,
      suggestedMappings,
      savedMappings,
      estimatedTotal,
      contractValue: project.upstreamContract?.contractValue || null,
      validation: {
        hasContract: !!project.upstreamContract,
        contractValueMatch: project.upstreamContract?.contractValue
          ? Math.abs(Number(project.upstreamContract.contractValue) - (estimatedTotal || 0)) < 0.01
          : null
      }
    });

  } catch (error) {
    console.error('[Budget Parse] Error:', error);
    res.status(500).json({
      error: 'Failed to parse file',
      message: error.message
    });
  }
});

/**
 * POST /api/projects/:projectId/budget/import
 * Apply column mappings and import budget lines
 */
router.post('/projects/:projectId/budget/import', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const {
      fileBuffer,
      filename,
      columnMappings,
      saveMappingAs,
      clearExisting = false
    } = req.body;

    if (!fileBuffer || !columnMappings) {
      return res.status(400).json({ error: 'fileBuffer and columnMappings are required' });
    }

    // Verify project and get upstream contract info
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: {
        id: true,
        projectRole: true,
        upstreamContract: {
          select: {
            mainContractorId: true,
            contractValue: true,
            contractRef: true
          }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Validate project role
    if (project.projectRole !== 'SUBCONTRACTOR' && project.projectRole !== 'DIRECT_TO_CLIENT') {
      return res.status(400).json({
        error: 'Budget import is only available for SUBCONTRACTOR and DIRECT_TO_CLIENT projects'
      });
    }

    // Parse file
    const buffer = Buffer.from(fileBuffer, 'base64');
    const { headers, rows } = parseFile(buffer, filename);

    // Clear existing budget lines if requested
    if (clearExisting) {
      const deleted = await prisma.budgetLine.deleteMany({
        where: {
          tenantId,
          projectId,
          source: 'IMPORTED_MC'
        }
      });
      console.log(`[Budget Import] Cleared ${deleted.count} existing imported lines`);
    }

    // Import rows
    let imported = 0;
    let skipped = 0;
    let errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;

      try {
        // Extract values using column mappings
        const reference = columnMappings.reference !== undefined
          ? String(row[headers[columnMappings.reference]] || '').trim()
          : null;

        const description = columnMappings.description !== undefined
          ? String(row[headers[columnMappings.description]] || '').trim()
          : '';

        const quantityStr = columnMappings.quantity !== undefined
          ? String(row[headers[columnMappings.quantity]] || '0')
          : '0';

        const unitStr = columnMappings.unit !== undefined
          ? String(row[headers[columnMappings.unit]] || 'ea').trim()
          : 'ea';

        const rateStr = columnMappings.rate !== undefined
          ? String(row[headers[columnMappings.rate]] || '0')
          : '0';

        const totalStr = columnMappings.total !== undefined
          ? String(row[headers[columnMappings.total]] || '0')
          : '0';

        // Parse numbers
        const quantity = parseFloat(quantityStr.replace(/[^0-9.-]/g, '')) || 0;
        const rate = parseFloat(rateStr.replace(/[^0-9.-]/g, '')) || 0;
        let total = parseFloat(totalStr.replace(/[^0-9.-]/g, '')) || 0;

        // Calculate total if not provided
        if (total === 0 && quantity && rate) {
          total = quantity * rate;
        }

        // Validate required fields
        if (!description) {
          errors.push({ row: rowNumber, error: 'Missing description' });
          skipped++;
          continue;
        }

        // Create budget line with import source
        await prisma.budgetLine.create({
          data: {
            tenantId,
            projectId,
            code: reference || null,
            description,
            qty: toDecimal(quantity),
            unit: unitStr,
            rate: toDecimal(rate),
            total: toDecimal(total),
            amount: toDecimal(total),

            // Task 2.3: Import tracking fields
            source: 'IMPORTED_MC',
            externalRef: reference,
            originalDescription: description
          }
        });

        imported++;

      } catch (error) {
        console.error(`[Budget Import] Error on row ${rowNumber}:`, error);
        errors.push({ row: rowNumber, error: error.message });
        skipped++;
      }
    }

    // Save mapping template if requested
    if (saveMappingAs && project.upstreamContract?.mainContractorId) {
      await prisma.importMapping.create({
        data: {
          tenantId,
          name: saveMappingAs,
          mainContractorId: project.upstreamContract.mainContractorId,
          mappings: columnMappings,
          isDefault: false
        }
      });
    }

    // Calculate imported total
    const importedLines = await prisma.budgetLine.findMany({
      where: {
        tenantId,
        projectId,
        source: 'IMPORTED_MC'
      },
      select: {
        total: true
      }
    });

    const importedTotal = importedLines.reduce((sum, line) => {
      return sum + Number(line.total || 0);
    }, 0);

    res.json({
      success: true,
      imported,
      skipped,
      errors: errors.slice(0, 20), // Limit error list
      importedTotal,
      contractValue: project.upstreamContract?.contractValue || null,
      valueMatch: project.upstreamContract?.contractValue
        ? Math.abs(Number(project.upstreamContract.contractValue) - importedTotal) < 0.01
        : null
    });

  } catch (error) {
    console.error('[Budget Import] Error:', error);
    res.status(500).json({
      error: 'Failed to import budget',
      message: error.message
    });
  }
});

module.exports = router;
