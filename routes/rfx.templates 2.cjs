const router = require('express').Router({ mergeParams: true });
const { workbookOpen, workbookClose, sheet } = require('../lib/xmlExcel.cjs');

// POST /rfx/:rfxId/template
// body: { pricing:[{item,description,qty,unit}], questions:[string], requestTitle?, packageCode? }
router.post('/rfx/:rfxId/template', async (req, res) => {
  const { pricing = [], questions = [], requestTitle = '', packageCode = '' } = req.body || {};
  const reqRows = [
    ['Request Title', requestTitle],
    ['Package', packageCode],
    ['Instructions', 'Complete Pricing and Questions sheets. Return as XML or XLSX; XML preferred.'],
  ];
  const pricingRows = [
    ['SupplierId', 'Item', 'Description', 'Qty', 'Unit', 'Rate', 'Total'],
    ...pricing.map((p) => ['', p.item, p.description, p.qty, p.unit, '', '']),
  ];
  const questionRows = [
    ['SupplierId', 'Question', 'Response'],
    ...questions.map((q) => ['', q, '']),
  ];

  const xml = [
    workbookOpen(),
    sheet('Request Details', reqRows),
    sheet('Pricing', pricingRows),
    sheet('Questions', questionRows),
    workbookClose(),
  ].join('');

  res.setHeader('Content-Type', 'application/vnd.ms-excel');
  res.setHeader('Content-Disposition', `attachment; filename="RFx_${req.params.rfxId}_Response.xml"`);
  res.send(xml);
});

module.exports = router;

