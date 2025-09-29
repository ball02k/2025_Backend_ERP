const { prisma } = require('../utils/prisma.cjs');
const { getOcrProvider } = require('../services/ocr/index.cjs');

async function runOcrWorkerOnce() {
  const job = await prisma.ocrJob.findFirst({ where: { status: 'queued' } });
  if (!job) return;
  await prisma.ocrJob.update({ where: { id: job.id }, data: { status: 'processing' } });
  try {
    const provider = getOcrProvider();
    const result = await provider.extractInvoiceFields({ documentId: job.documentId });
    await prisma.ocrJob.update({ where: { id: job.id }, data: { status: 'done', resultJson: result } });
    if (job.invoiceId) {
      const f = (result && result.fields) || {};
      await prisma.invoice.update({
        where: { id: job.invoiceId },
        data: {
          ocrStatus: 'done',
          ocrResultJson: result,
          number: f.invoiceNumber || undefined,
          issueDate: f.issueDate ? new Date(f.issueDate) : undefined,
          dueDate: f.dueDate ? new Date(f.dueDate) : undefined,
          net: f.subtotal != null ? Number(f.subtotal) : undefined,
          vat: f.vatTotal != null ? Number(f.vatTotal) : undefined,
          gross: f.grandTotal != null ? Number(f.grandTotal) : undefined,
          // extras if present
          matchStatus: f.poNumberRef ? 'auto_matched' : undefined,
        },
      });
    }
  } catch (e) {
    await prisma.ocrJob.update({ where: { id: job.id }, data: { status: 'failed', error: String(e && e.message || e) } });
  }
}

module.exports = { runOcrWorkerOnce };

