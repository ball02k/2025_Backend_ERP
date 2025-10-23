const { prisma } = require('../utils/prisma.cjs');

async function main() {
  const knownTenants = await prisma.contractTemplate.findMany({ distinct: ['tenantId'], select: { tenantId: true } });
  const tenantIds = knownTenants.length ? knownTenants.map((t) => t.tenantId) : ['demo'];

  const templates = [
    {
      key: 'nec4-shortform',
      name: 'NEC4 Short Form (Mock)',
      version: 'v1.0',
      bodyHtml: `
        <html><body>
        <h1>Contract: {{contract.title}}</h1>
        <p>Project: {{project.code}} – {{project.name}}</p>
        <p>Supplier: {{supplier.name}}</p>
        <p>Package: {{package.code}} – {{package.name}}</p>
        <p>Reference: {{contract.contractNumber}}</p>
        <p>Award Date: {{contract.awardDate}}</p>
        <p>Net: £{{totals.net}}, VAT: {{totals.vatRate}}, Gross: £{{totals.gross}}</p>
        <p>Retention %: {{totals.retentionPct}}</p>
        <hr/>
        <p>Standard terms placeholder…</p>
        </body></html>
      `
    },
    {
      key: 'jct-standard',
      name: 'JCT Standard Form (Mock)',
      version: 'v2023',
      bodyHtml: `
        <html><body>
        <h1>JCT Standard Building Contract</h1>
        <h2>Contract: {{contract.title}}</h2>
        <p><strong>Project:</strong> {{project.code}} – {{project.name}}</p>
        <p><strong>Contractor:</strong> {{supplier.name}}</p>
        <p><strong>Package:</strong> {{package.name}}</p>
        <p><strong>Contract Number:</strong> {{contract.contractNumber}}</p>
        <p><strong>Date:</strong> {{contract.awardDate}}</p>
        <hr/>
        <h3>Financial Summary</h3>
        <p>Net Value: £{{totals.net}}</p>
        <p>VAT Rate: {{totals.vatRate}}</p>
        <p>Gross Value: £{{totals.gross}}</p>
        <p>Retention: {{totals.retentionPct}}%</p>
        <hr/>
        <h3>Terms & Conditions</h3>
        <p>Standard JCT terms and conditions apply as per 2023 edition...</p>
        </body></html>
      `
    },
    {
      key: 'simple-letter',
      name: 'Simple Letter of Intent',
      version: 'v1.0',
      bodyHtml: `
        <html><body style="font-family: Arial, sans-serif;">
        <div style="margin: 20px;">
          <h2>Letter of Intent</h2>
          <p>Date: {{contract.awardDate}}</p>
          <p>To: {{supplier.name}}</p>
          <p>Project: {{project.name}} ({{project.code}})</p>
          <p>Contract Reference: {{contract.contractNumber}}</p>
          <hr/>
          <p>Dear Sir/Madam,</p>
          <p>We are pleased to confirm our intention to enter into a contract with your organization for the following works:</p>
          <p><strong>Package:</strong> {{package.name}}</p>
          <p><strong>Value:</strong> £{{totals.net}} (plus VAT at {{totals.vatRate}})</p>
          <p>Retention: {{totals.retentionPct}}%</p>
          <p>This letter of intent is subject to formal contract documentation being agreed and executed.</p>
          <p>Yours faithfully,</p>
          <p>[Project Manager]</p>
        </div>
        </body></html>
      `
    }
  ];

  for (const tenantId of tenantIds) {
    for (const tpl of templates) {
      await prisma.contractTemplate.upsert({
        where: { tenantId_key: { tenantId, key: tpl.key } },
        create: { tenantId, ...tpl },
        update: { name: tpl.name, version: tpl.version, bodyHtml: tpl.bodyHtml },
      });
      console.log(`✓ Seeded ${tpl.key} for tenant ${tenantId}`);
    }
  }

  console.log('Contract templates seeding complete');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
