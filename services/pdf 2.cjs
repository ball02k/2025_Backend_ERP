const { poHtmlTemplate } = require('../templates/poHtml.cjs');
const { prisma } = require('../utils/prisma.cjs');
const { saveBufferAsDocument, saveHtmlAsDocument } = require('./storage.cjs');

const PDF_MODE = process.env.PDF_MODE || 'none'; // 'none' | 'http'
const PDF_HTTP_URL = process.env.PDF_HTTP_URL || '';
const TENANT_NAME_FALLBACK = process.env.APP_NAME || 'ERP';

async function generatePoPdfAndStore(poId, tenantId) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: Number(poId), tenantId },
    include: { lines: true, project: true },
  });
  if (!po) throw new Error('PO not found');
  const html = poHtmlTemplate({ po, tenantName: TENANT_NAME_FALLBACK });

  if (PDF_MODE === 'http' && PDF_HTTP_URL) {
    const resp = await fetch(PDF_HTTP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ html, filename: `PO-${po.code || po.id}.pdf` }),
    });
    if (!resp.ok) throw new Error(`PDF render failed: ${resp.status}`);
    const arr = await resp.arrayBuffer();
    const buf = Buffer.from(arr);
    const docId = await saveBufferAsDocument(buf, `PO-${po.code || po.id}.pdf`, 'application/pdf', tenantId, po.projectId);
    // link to PO for quick discovery
    try { await prisma.documentLink.create({ data: { tenantId, documentId: docId, projectId: po.projectId, poId: po.id, linkType: 'po' } }); } catch(_) {}
    return docId;
  }

  // Fallback: store HTML for preview
  const docId = await saveHtmlAsDocument(html, `PO-${po.code || po.id}.html`, tenantId, po.projectId);
  try { await prisma.documentLink.create({ data: { tenantId, documentId: docId, projectId: po.projectId, poId: po.id, linkType: 'po' } }); } catch(_) {}
  return docId;
}

module.exports = { generatePoPdfAndStore };
