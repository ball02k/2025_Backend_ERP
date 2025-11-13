const { prisma } = require('../utils/prisma.cjs');

async function main() {
  const tenantId = process.env.SEED_TENANT_ID || 'demo';
  const seeds = [
    { code: 'PRELIM', name: 'Preliminaries', keywords: ['welfare','hoarding','scaffold'], costCodePrefixes: ['01-'] },
    { code: 'GROUND', name: 'Groundworks', keywords: ['excavate','trench','pile','blinding'], costCodePrefixes: ['02-'] },
    { code: 'RC', name: 'Reinforced Concrete', keywords: ['rebar','formwork','shutter','slab'], costCodePrefixes: ['04-','02-015'] },
    { code: 'STEEL', name: 'Structural Steel', keywords: ['steelwork','beams','columns','connections'], costCodePrefixes: ['03-'] },
    { code: 'ROOF', name: 'Roofing', keywords: ['roof','membrane','gutter','soffit'], costCodePrefixes: ['06-'] },
    { code: 'ENVELOPE', name: 'Envelope', keywords: ['cladding','curtain','glazing','facade'], costCodePrefixes: ['05-','07-'] },
    { code: 'MEP', name: 'M&E', keywords: ['ductwork','ahu','chiller','boiler','containment','cable','switchgear','sprinkler'], costCodePrefixes: ['08-'] },
    { code: 'FITOUT', name: 'Fit-Out', keywords: ['partition','plasterboard','joinery','doorset','carpet','vinyl','paint'], costCodePrefixes: ['09-','11-','12-'] },
  ];
  for (const s of seeds) {
    await prisma.packageTaxonomy.upsert({
      where: { tenantId_code: { tenantId, code: s.code } },
      update: { name: s.name, keywords: s.keywords, costCodePrefixes: s.costCodePrefixes, isActive: true },
      create: { tenantId, code: s.code, name: s.name, keywords: s.keywords, costCodePrefixes: s.costCodePrefixes }
    });
  }
  console.log('Seeded scope taxonomy for tenant:', tenantId);
}

main().catch(e=>{ console.error(e); process.exit(1); }).finally(()=>process.exit(0));

