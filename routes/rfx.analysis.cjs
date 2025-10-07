const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { workbookOpen, workbookClose, sheet } = require('../lib/xmlExcel.cjs');

// GET /rfx/:rfxId/analysis.xlsx.xml
router.get('/rfx/:rfxId/analysis.xlsx.xml', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const rfxId = Number(req.params.rfxId);
    const rfx = await prisma.request.findFirst({ where: { id: rfxId } }).catch(() => null);
    const subs = await prisma.rFxSubmission.findMany({ where: { tenantId, rfxId } });

    const pricingData = [['SupplierId', 'Item', 'Description', 'Qty', 'Unit', 'Rate', 'Total']];
    subs.forEach((s) => {
      (s.pricing || []).forEach((p) => {
        pricingData.push([s.supplierId, p.item, p.description, p.qty ?? '', p.unit ?? '', p.rate ?? '', p.total ?? '']);
      });
    });

    const nonPriceData = [['SupplierId', 'Question', 'Response']];
    subs.forEach((s) => {
      (s.answers || []).forEach((a) => {
        nonPriceData.push([s.supplierId, a.question, a.response]);
      });
    });

    const suppliers = subs.map((s) => s.supplierId);
    const uniq = [...new Set(suppliers)];
    const header = ['SupplierId', 'TotalPrice', 'PriceScore', 'NonPriceScore', 'OverallScore', 'Rank'];
    const analysis = [header];
    uniq.forEach((sid, idx) => {
      const r = 2 + idx;
      const totalPriceF = { f: `SUMIF('Pricing Data'!A:A, A${r}, 'Pricing Data'!G:G)` };
      const minRange = `B$2:B$${1 + uniq.length}`;
      const priceScoreF = { f: `IF(B${r}=0,0,MIN(${minRange})/B${r}*100)` };
      const nonPriceScoreF = { f: `IFERROR(AVERAGEIF('Non Price Data'!A:A, A${r}, 'Non Price Data'!C:C),0)` };
      const overallF = { f: `(C${r}*0.6)+(D${r}*0.4)` };
      const rankF = { f: `RANK.EQ(E${r}, E$2:E$${1 + uniq.length}, 0)` };
      analysis.push([sid, totalPriceF, priceScoreF, nonPriceScoreF, overallF, rankF]);
    });

    const reqRows = [
      ['Request Title', rfx?.title || `RFx ${rfxId}`],
      ['Project', rfx?.projectId || ''],
      ['Package', rfx?.packageId || ''],
      ['Suppliers', uniq.length],
    ];

    const xml = [
      workbookOpen(),
      sheet('Request Details', reqRows),
      sheet('Pricing Data', pricingData),
      sheet('Non Price Data', nonPriceData),
      sheet('Bid Analysis', analysis),
      sheet('Final Scores', [['SupplierId', 'OverallScore', 'Rank'], ...analysis.slice(1).map((row) => [row[0], row[4], row[5]])]),
      workbookClose(),
    ].join('');

    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename="RFx_${rfxId}_Bid_Analysis.xml"`);
    res.send(xml);
  } catch (e) {
    next(e);
  }
});

module.exports = router;

