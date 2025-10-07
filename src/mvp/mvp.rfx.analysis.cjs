const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { workbookOpen, workbookClose, sheet } = require('./mvp.xmlExcel.cjs');

router.get('/rfx/:rfxId/analysis.xlsx.xml', async (req, res, next) => {
  try {
    const tenantId = req.tenantId; const rfxId = Number(req.params.rfxId);
    const rfx = await prisma.request.findFirst({ where: { id: rfxId } }).catch(() => null);
    const subs = await prisma.rFxSubmission.findMany({ where: { tenantId, rfxId } });
    const pricingData = [['SupplierId', 'Item', 'Description', 'Qty', 'Unit', 'Rate', 'Total']];
    subs.forEach((s) => (s.pricing || []).forEach((p) => pricingData.push([s.supplierId, p.item, p.description, p.qty ?? '', p.unit ?? '', p.rate ?? '', p.total ?? ''])));
    const nonPriceData = [['SupplierId', 'Question', 'Response']];
    subs.forEach((s) => (s.answers || []).forEach((a) => nonPriceData.push([s.supplierId, a.question, a.response])));
    const suppliers = [...new Set(subs.map((s) => s.supplierId))];
    const header = ['SupplierId', 'TotalPrice', 'PriceScore', 'NonPriceScore', 'OverallScore', 'Rank'];
    const analysis = [header];
    suppliers.forEach((sid, i) => {
      const r = 2 + i; const totalPriceF = { f: `SUMIF('Pricing Data'!A:A, A${r}, 'Pricing Data'!G:G)` }; const minRange = `B$2:B$${1 + suppliers.length}`; const priceScoreF = { f: `IF(B${r}=0,0,MIN(${minRange})/B${r}*100)` }; const nonPriceScoreF = { f: `IFERROR(AVERAGEIF('Non Price Data'!A:A, A${r}, 'Non Price Data'!C:C),0)` }; const overallF = { f: `(C${r}*0.6)+(D${r}*0.4)` }; const rankF = { f: `RANK.EQ(E${r}, E$2:E$${1 + suppliers.length}, 0)` }; analysis.push([sid, totalPriceF, priceScoreF, nonPriceScoreF, overallF, rankF]);
    });
    const reqRows = [['Request Title', rfx?.title || `RFx ${rfxId}`], ['Project', rfx?.projectId || ''], ['Package', rfx?.packageId || ''], ['Suppliers', suppliers.length]];
    const xml = [workbookOpen(), sheet('Request Details', reqRows), sheet('Pricing Data', pricingData), sheet('Non Price Data', nonPriceData), sheet('Bid Analysis', analysis), sheet('Final Scores', [['SupplierId', 'OverallScore', 'Rank'], ...analysis.slice(1).map((row) => [row[0], row[4], row[5]])]), workbookClose()].join('');
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename="RFx_${rfxId}_Bid_Analysis.xml"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(xml);
  } catch (e) { next(e); }
});

module.exports = router;
