const router = require('express').Router();
const { prisma } = require('../utils/prisma.cjs');
const { writeAudit } = require('../lib/audit.cjs');

function getTenantId(req) {
  return req.user?.tenantId || req.tenantId || 'demo';
}

function getUserId(req) {
  const raw = req.user?.id ?? req.userId ?? null;
  return raw != null ? Number(raw) : null;
}

// Simple mustache-like template replacement: {{path.to.field}}
function render(template, ctx) {
  return String(template || '').replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, path) => {
    const keys = String(path).split('.').map(s => s.trim());
    let v = ctx;
    for (const k of keys) v = (v && v[k] !== undefined) ? v[k] : '';
    return v == null ? '' : String(v);
  });
}

// Generate contract document from template
router.post('/contracts/:id/generate-doc', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = Number(req.params.id);
    const templateId = Number(req.body?.templateId);

    const [contract, template] = await Promise.all([
      prisma.contract.findFirst({ where: { tenantId, id } }),
      templateId ? prisma.contractTemplate.findFirst({ where: { tenantId, id: templateId } }) : null,
    ]);

    if (!contract) return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
    if (!template) return res.status(400).json({ error: 'TEMPLATE_REQUIRED' });

    const [project, supplier, lines, pkg] = await Promise.all([
      prisma.project.findFirst({ where: { tenantId, id: contract.projectId } }),
      prisma.supplier.findFirst({ where: { tenantId, id: contract.supplierId } }),
      prisma.contractLine.findMany({ where: { tenantId, contractId: id }, orderBy: [{ id: 'asc' }] }),
      contract.packageId ? prisma.package.findFirst({ where: { id: contract.packageId } }) : null,
    ]);

    const ctx = {
      project: { id: project?.id, code: project?.code, name: project?.name },
      contract: contract,
      supplier: { id: supplier?.id, name: supplier?.name },
      package: pkg ? { id: pkg.id, name: pkg.name, code: pkg.code } : {},
      totals: {
        linesCount: lines.length,
        net: String(contract.net ?? ''),
        gross: String(contract.gross ?? ''),
        vatRate: String(contract.vatRate ?? ''),
        retentionPct: String(contract.retentionPct ?? ''),
      }
    };

    const html = render(template.bodyHtml, ctx);

    // Store via Documents module (text/html content)
    const doc = await prisma.document.create({
      data: {
        tenantId,
        fileName: `contract-${id}-${Date.now()}.html`,
        mimeType: 'text/html',
        size: BigInt(Buffer.byteLength(html, 'utf8')),
        content: html,
      }
    });

    // Link document to contract
    try {
      await prisma.documentLink.create({
        data: {
          tenantId,
          documentId: doc.id,
          entityType: 'Contract',
          entityId: BigInt(id),
        }
      });
    } catch (_) { }

    await writeAudit({
      prisma,
      req,
      userId,
      entity: 'Contract',
      entityId: id,
      action: 'CONTRACT_GENERATE_DOC',
      changes: { templateId, documentId: String(doc.id) },
    });

    res.status(201).json({ documentId: String(doc.id) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
