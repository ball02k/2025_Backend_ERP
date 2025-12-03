const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const contractTypes = [
  {
    id: 'nec4-ecc-option-a',
    name: 'NEC4 ECC Option A (Priced Contract with Activity Schedule)',
    framework: 'NEC4',
    category: 'PRICED_CONTRACT',
    description: 'Fixed price lump sum contract with agreed activity schedule. Price risk lies with the Contractor.',
    paymentBasis: 'LUMP_SUM',
    retentionRate: 5.00,
    paymentTerms: 'Payment within 7 days of assessment date',
    suggestedPOStrategy: 'SINGLE_ON_AWARD',
  },
  {
    id: 'nec4-ecc-option-b',
    name: 'NEC4 ECC Option B (Priced Contract with Bill of Quantities)',
    framework: 'NEC4',
    category: 'PRICED_CONTRACT',
    description: 'Remeasurement contract based on actual quantities multiplied by bill rates. Some price risk shared.',
    paymentBasis: 'REMEASUREMENT',
    retentionRate: 5.00,
    paymentTerms: 'Payment within 7 days of assessment date',
    suggestedPOStrategy: 'MILESTONE_BASED',
  },
  {
    id: 'nec4-ecc-option-c',
    name: 'NEC4 ECC Option C (Target Contract with Activity Schedule)',
    framework: 'NEC4',
    category: 'TARGET_COST',
    description: 'Target cost contract with pain/gain share mechanism. Cost risk is shared between parties.',
    paymentBasis: 'COST_PLUS',
    retentionRate: 0.00,
    paymentTerms: 'Payment within 7 days of assessment date',
    suggestedPOStrategy: 'MILESTONE_BASED',
  },
  {
    id: 'nec4-ecc-option-d',
    name: 'NEC4 ECC Option D (Target Contract with Bill of Quantities)',
    framework: 'NEC4',
    category: 'TARGET_COST',
    description: 'Target cost contract with remeasurement and pain/gain share. Cost and quantity risk shared.',
    paymentBasis: 'COST_PLUS',
    retentionRate: 0.00,
    paymentTerms: 'Payment within 7 days of assessment date',
    suggestedPOStrategy: 'MILESTONE_BASED',
  },
  {
    id: 'nec4-ecc-option-e',
    name: 'NEC4 ECC Option E (Cost Reimbursable Contract)',
    framework: 'NEC4',
    category: 'COST_REIMBURSABLE',
    description: 'Full cost reimbursement plus fee. All cost risk lies with the Employer.',
    paymentBasis: 'COST_PLUS',
    retentionRate: 0.00,
    paymentTerms: 'Payment within 7 days of assessment date',
    suggestedPOStrategy: 'CALL_OFF',
  },
  {
    id: 'nec4-ecc-option-f',
    name: 'NEC4 ECC Option F (Management Contract)',
    framework: 'NEC4',
    category: 'MANAGEMENT',
    description: 'Management fee contract where Contractor manages defined work packages. Fee-based payment.',
    paymentBasis: 'COST_PLUS',
    retentionRate: 0.00,
    paymentTerms: 'Payment within 7 days of assessment date',
    suggestedPOStrategy: 'MILESTONE_BASED',
  },
  {
    id: 'jct-db-2016',
    name: 'JCT Design & Build 2016',
    framework: 'JCT',
    category: 'PRICED_CONTRACT',
    description: 'Traditional UK design and build contract with contractor responsible for both design and construction.',
    paymentBasis: 'LUMP_SUM',
    retentionRate: 5.00,
    paymentTerms: 'Payment within 14 days of interim valuation',
    suggestedPOStrategy: 'MILESTONE_BASED',
  },
  {
    id: 'jct-sbc-2016',
    name: 'JCT Standard Building Contract 2016',
    framework: 'JCT',
    category: 'PRICED_CONTRACT',
    description: 'Traditional JCT form for larger projects where design is by employer. With quantities or without.',
    paymentBasis: 'REMEASUREMENT',
    retentionRate: 5.00,
    paymentTerms: 'Payment within 14 days of interim valuation',
    suggestedPOStrategy: 'MILESTONE_BASED',
  },
  {
    id: 'jct-mw-2016',
    name: 'JCT Minor Works 2016',
    framework: 'JCT',
    category: 'PRICED_CONTRACT',
    description: 'Simplified JCT form for smaller projects, typically under £250k in value.',
    paymentBasis: 'LUMP_SUM',
    retentionRate: 3.00,
    paymentTerms: 'Payment within 14 days',
    suggestedPOStrategy: 'SINGLE_ON_AWARD',
  },
  {
    id: 'jct-mc-2016',
    name: 'JCT Management Contract 2016',
    framework: 'JCT',
    category: 'MANAGEMENT',
    description: 'Management contracting form where contractor coordinates works packages for a fee.',
    paymentBasis: 'COST_PLUS',
    retentionRate: 3.00,
    paymentTerms: 'Payment within 14 days of interim valuation',
    suggestedPOStrategy: 'CALL_OFF',
  },
  {
    id: 'fidic-red-2017',
    name: 'FIDIC Red Book 2017',
    framework: 'FIDIC',
    category: 'PRICED_CONTRACT',
    description: 'Conditions of Contract for Construction (employer design). Widely used internationally.',
    paymentBasis: 'REMEASUREMENT',
    retentionRate: 5.00,
    paymentTerms: 'Payment within 28 days of statement',
    suggestedPOStrategy: 'MILESTONE_BASED',
  },
  {
    id: 'fidic-yellow-2017',
    name: 'FIDIC Yellow Book 2017',
    framework: 'FIDIC',
    category: 'PRICED_CONTRACT',
    description: 'Conditions of Contract for Plant & Design-Build. Contractor responsible for design.',
    paymentBasis: 'LUMP_SUM',
    retentionRate: 5.00,
    paymentTerms: 'Payment within 28 days of statement',
    suggestedPOStrategy: 'MILESTONE_BASED',
  },
  {
    id: 'bespoke',
    name: 'Bespoke Contract',
    framework: 'BESPOKE',
    category: 'PRICED_CONTRACT',
    description: 'Custom contract terms negotiated specifically for this project.',
    paymentBasis: 'LUMP_SUM',
    retentionRate: null,
    paymentTerms: 'As per contract terms',
    suggestedPOStrategy: 'SINGLE_ON_AWARD',
  },
];

async function main() {
  console.log('Seeding ContractType table...');

  for (const ct of contractTypes) {
    await prisma.contractType.upsert({
      where: { id: ct.id },
      update: ct,
      create: { ...ct, tenantId: 'demo' },
    });
    console.log(`✓ Created/updated: ${ct.name}`);
  }

  console.log(`\nSeeded ${contractTypes.length} contract types successfully.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
