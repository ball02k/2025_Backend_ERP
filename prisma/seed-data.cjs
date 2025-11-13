// seed-data.cjs
// Deterministic fixtures for seeding

// Trade categories
const trades = [
  { code: 'MECH', name: 'Mechanical' },
  { code: 'ELEC', name: 'Electrical' },
  { code: 'ROOF', name: 'Roofing' },
  { code: 'CIV', name: 'Civils' },
  { code: 'JOIN', name: 'Joinery' },
  { code: 'GRND', name: 'Groundworks' },
  { code: 'PLUMB', name: 'Plumbing' },
  { code: 'PAINT', name: 'Painting & Decorating' }
];

// Cost code structure
const costCodes = [
  { code: 'A1010', name: 'Preliminaries - Site Setup' },
  { code: 'A1020', name: 'Preliminaries - Welfare' },
  { code: 'B2010', name: 'Substructure - Foundations' },
  { code: 'B2020', name: 'Substructure - Basement' },
  { code: 'C3010', name: 'Structure - Frame' },
  { code: 'C3020', name: 'Structure - Floors' },
  { code: 'D4010', name: 'Envelope - External Walls' },
  { code: 'D4020', name: 'Envelope - Windows' },
  { code: 'E5010', name: 'Services - Mechanical' },
  { code: 'E5020', name: 'Services - Electrical' },
  { code: 'F6010', name: 'Fit-Out - Partitions' },
  { code: 'F6020', name: 'Fit-Out - Finishes' }
];

// Tender question templates
const tenderQuestions = [
  {
    key: 'EXPERIENCE',
    text: 'Describe your company experience with similar projects over £1M in the last 3 years.',
    type: 'textarea',
    weight: 15.0,
    isRequired: true
  },
  {
    key: 'QC',
    text: 'Detail your quality control procedures and testing regimes.',
    type: 'textarea',
    weight: 10.0,
    isRequired: true
  },
  {
    key: 'YEARS_EXP',
    text: 'How many years of experience does your company have in this trade?',
    type: 'number',
    weight: 10.0,
    isRequired: true
  },
  {
    key: 'SAFETY',
    text: 'Describe your H&S program, EMR rating, and recent safety performance.',
    type: 'textarea',
    weight: 15.0,
    isRequired: true
  },
  {
    key: 'TIMELINE',
    text: 'Proposed timeline for completion (weeks)?',
    type: 'number',
    weight: 10.0,
    isRequired: true
  },
  {
    key: 'METHODOLOGY',
    text: 'Describe your construction methodology and approach to this work.',
    type: 'textarea',
    weight: 15.0,
    isRequired: true
  },
  {
    key: 'COMPANY_INFO',
    text: 'Company name and primary contact information.',
    type: 'text',
    weight: 0,
    isRequired: true
  },
  {
    key: 'LICENSE',
    text: 'Business license number and insurance details.',
    type: 'text',
    weight: 0,
    isRequired: true
  },
  {
    key: 'SUBCONTRACTORS',
    text: 'List your key subcontractors for this work.',
    type: 'textarea',
    weight: 0,
    isRequired: true
  },
  {
    key: 'REFERENCES',
    text: 'Provide three client references from similar projects.',
    type: 'textarea',
    weight: 0,
    isRequired: true
  },
  {
    key: 'PRICE_TOTAL',
    text: 'Total lump sum bid amount (GBP)',
    type: 'number',
    weight: 20.0,
    isRequired: true
  },
  {
    key: 'PRICE_BREAKDOWN',
    text: 'Provide itemized pricing breakdown.',
    type: 'textarea',
    weight: 5.0,
    isRequired: true
  }
];

// Demo clients
const demoClients = [
  {
    name: 'Westshire County Council',
    regNo: 'GB12345678',
    address: '1 County Hall, Westshire, WS1 1AA, UK'
  },
  {
    name: 'City Estates Development Ltd',
    regNo: 'GB87654321',
    address: '45 Commercial Street, London, EC1M 5BL, UK'
  }
];

// Demo projects
const demoProjects = [
  {
    code: 'A40-VIADUCT-2025',
    name: 'A40 Viaduct Strengthening Works',
    description: 'Major structural strengthening of the A40 viaduct including bearing replacements, deck repairs, and traffic management. Critical infrastructure project requiring minimal disruption to existing traffic flows.',
    location: 'A40, Westshire, UK',
    value: 12500000,
    startDate: new Date('2025-03-01'),
    endDate: new Date('2026-03-31'),
    status: 'Active'
  },
  {
    code: 'CITY-HALL-2025',
    name: 'City Hall Refurbishment',
    description: 'Complete MEP upgrade, roof replacement, heritage facade repairs, and internal fit-out for Grade II listed building. Works to be phased to maintain partial building occupation.',
    location: 'Central Business District, London, UK',
    value: 4800000,
    startDate: new Date('2025-02-10'),
    endDate: new Date('2025-12-20'),
    status: 'Active'
  }
];

// Generate budget lines for a project
function generateBudgetLines(projectName) {
  const groups = [
    { name: 'Preliminaries', costCodePrefix: 'A' },
    { name: 'Substructure', costCodePrefix: 'B' },
    { name: 'Superstructure', costCodePrefix: 'C' },
    { name: 'External Envelope', costCodePrefix: 'D' },
    { name: 'MEP Services', costCodePrefix: 'E' },
    { name: 'Internal Fit-Out', costCodePrefix: 'F' }
  ];

  const items = [
    'Site establishment and welfare',
    'Temporary works and scaffolding',
    'Excavation and earthworks',
    'Foundation concrete',
    'Structural steel frame',
    'Floor slabs and screeds',
    'External cladding system',
    'Window and door installation',
    'HVAC ductwork and equipment',
    'Electrical distribution',
    'Lighting systems',
    'Internal partitions',
    'Ceiling systems',
    'Wall finishes',
    'Floor finishes'
  ];

  const lines = [];
  let lineNumber = 1;

  groups.forEach((group, groupIndex) => {
    const itemsInGroup = 15 + Math.floor(Math.random() * 10);

    for (let i = 0; i < itemsInGroup; i++) {
      const item = items[Math.floor(Math.random() * items.length)];
      const qty = Math.floor(50 + Math.random() * 500);
      const rate = Math.floor(20 + Math.random() * 500);
      const unit = ['m²', 'm³', 'm', 'nr', 'sum'][Math.floor(Math.random() * 5)];

      lines.push({
        code: `${group.costCodePrefix}${String(groupIndex + 1).padStart(2, '0')}${String(lineNumber).padStart(2, '0')}`,
        group: group.name,
        description: `${item} - ${projectName}`,
        qty,
        unit,
        rate,
        total: qty * rate
      });

      lineNumber++;
    }
  });

  return lines;
}

// Package grouping strategy
function groupLinesIntoPackages(lines) {
  const packages = {};

  lines.forEach(line => {
    const prefix = line.code[0];
    let packageKey;

    switch (prefix) {
      case 'A':
        packageKey = 'PRELIMINARIES';
        break;
      case 'B':
        packageKey = 'CIV';
        break;
      case 'C':
        packageKey = 'CIV';
        break;
      case 'D':
        packageKey = 'ROOF';
        break;
      case 'E':
        if (line.description.toLowerCase().includes('elect')) {
          packageKey = 'ELEC';
        } else {
          packageKey = 'MECH';
        }
        break;
      case 'F':
        packageKey = 'JOIN';
        break;
      default:
        packageKey = 'MISC';
    }

    if (!packages[packageKey]) {
      packages[packageKey] = [];
    }
    packages[packageKey].push(line);
  });

  return packages;
}

module.exports = {
  trades,
  costCodes,
  tenderQuestions,
  demoClients,
  demoProjects,
  generateBudgetLines,
  groupLinesIntoPackages
};
