// seed-utils.cjs
// Helper utilities for seeding

const fs = require('fs');
const path = require('path');

/**
 * Score a tender submission based on weighted criteria
 * @param {Object} weights - Weight configuration {price, programme, technical, hs, esg}
 * @param {number} priceScore - Price score (0-100, lower price = higher score)
 * @param {number} programmeScore - Programme score (0-100)
 * @param {number} technicalScore - Technical score (0-100)
 * @param {number} hsScore - H&S score (0-100)
 * @param {number} esgScore - ESG score (0-100)
 * @returns {number} Weighted total score
 */
function calculateWeightedScore(weights, priceScore, programmeScore, technicalScore, hsScore, esgScore) {
  const total =
    (priceScore * weights.price) / 100 +
    (programmeScore * weights.programme) / 100 +
    (technicalScore * weights.technical) / 100 +
    (hsScore * weights.hs) / 100 +
    (esgScore * weights.esg) / 100;

  return Math.round(total * 10) / 10;
}

/**
 * Generate a realistic score for a submission
 * @param {number} priceRank - Price ranking (1 = cheapest, 2 = mid, 3 = most expensive)
 * @param {string} supplierName - Supplier name for consistency
 * @returns {Object} Score breakdown
 */
function generateRealisticScore(priceRank, supplierName) {
  // Base scores on supplier tier (deterministic based on name)
  const nameHash = supplierName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const tier = nameHash % 3; // 0 = excellent, 1 = good, 2 = acceptable

  const baseScores = {
    0: { technical: 85, programme: 88, hs: 90, esg: 82 }, // Excellent
    1: { technical: 75, programme: 78, hs: 80, esg: 72 }, // Good
    2: { technical: 65, programme: 68, hs: 70, esg: 62 }  // Acceptable
  };

  const base = baseScores[tier];

  // Add some variance
  const variance = () => Math.floor(Math.random() * 10) - 5;

  // Price score: cheapest gets best score
  const priceScore = priceRank === 1 ? 95 : priceRank === 2 ? 82 : 70;

  return {
    price: priceScore,
    programme: Math.max(60, Math.min(95, base.programme + variance())),
    technical: Math.max(60, Math.min(95, base.technical + variance())),
    hs: Math.max(60, Math.min(95, base.hs + variance())),
    esg: Math.max(60, Math.min(95, base.esg + variance()))
  };
}

/**
 * Generate realistic answer text for a question
 * @param {string} questionKey - Question key
 * @param {string} supplierName - Supplier name
 * @param {number} quality - Quality tier (0-2, 0 = best)
 * @returns {string|number} Answer text or number
 */
function generateAnswer(questionKey, supplierName, quality = 1) {
  const answers = {
    EXPERIENCE: [
      `${supplierName} has successfully completed 8 major projects exceeding £5M each over the past 3 years, including similar infrastructure and refurbishment works. Our portfolio demonstrates consistent delivery of complex projects on time and within budget.`,
      `${supplierName} has been involved in 5 projects over £1M in the last 3 years. We have relevant experience in this sector and can provide detailed case studies upon request.`,
      `${supplierName} has completed 3 projects in this sector over the last 3 years. We are expanding our portfolio and are committed to delivering high-quality work.`
    ],
    QC: [
      `Comprehensive QC program with certified technicians on-site throughout the works. ISO 9001 accredited with weekly inspections, full material testing regime, and detailed quality records maintained for all critical activities.`,
      `Standard QC testing per project specifications. Regular inspections by qualified personnel with material testing conducted at key stages. Quality documentation provided upon completion.`,
      `QC procedures following industry best practices. Inspections conducted as required with material testing for critical elements. Documentation provided at practical completion.`
    ],
    YEARS_EXP: [25, 15, 8],
    SAFETY: [
      `Zero OSHA/HSE recordable incidents in 2024. EMR rating: 0.67. Comprehensive H&S management system with full-time safety officer, daily toolbox talks, and monthly safety audits. All operatives CSCS certified.`,
      `OSHA/HSE compliant. EMR: 0.89. Two recordable incidents in 2024 (minor first aid). Regular safety meetings and toolbox talks. Comprehensive RAMS for all activities.`,
      `OSHA/HSE compliant. EMR: 1.15. Three recordable incidents in 2024. Standard safety procedures with RAMS and weekly safety briefings. Committed to continuous improvement.`
    ],
    TIMELINE: [16, 18, 22],
    METHODOLOGY: [
      `Phased approach with detailed programming to minimize disruption. Experienced project team with dedicated site management. Advanced sequencing to optimize critical path activities. Full BIM coordination and collaborative planning with all stakeholders.`,
      `Standard construction approach with experienced team. Phased delivery aligned with program requirements. Regular coordination meetings and proactive problem-solving.`,
      `Traditional construction methods with reliable delivery approach. Standard programming with buffer for contingencies. 22 weeks total duration including mobilization.`
    ],
    COMPANY_INFO: `${supplierName}, Contact: Project Manager`,
    LICENSE: `UK-REG-${Math.floor(Math.random() * 900000 + 100000)}`,
    SUBCONTRACTORS: quality === 0
      ? 'Tier 1 specialist subcontractors: Advanced Systems Ltd (M&E), Elite Facades Ltd (Envelope), Premier Testing Services (Quality)'
      : quality === 1
      ? 'Established subcontractor network including regional M&E and facade specialists'
      : 'To be confirmed based on project requirements and specialist scope definition',
    REFERENCES: quality === 0
      ? 'Reference 1: Metropolitan Council - Major Viaduct Project (£8M, 2023), Contact: Jane Smith, PM. Reference 2: City Infrastructure Authority - Bridge Strengthening (£6M, 2022), Contact: John Brown, Director. Reference 3: County Highways - Multiple Structures (£12M framework, 2021-2024), Contact: Sarah Johnson, Head of Projects.'
      : quality === 1
      ? 'Reference 1: Regional Council Project (£3M, 2023). Reference 2: Commercial Development (£2M, 2022). References available upon request.'
      : 'Reference 1: Local Authority Project (£1.5M, 2023). Reference 2: Industrial Park Development (£800K, 2022). Additional references available upon request.'
  };

  const answer = answers[questionKey];

  if (Array.isArray(answer)) {
    return answer[quality];
  }

  return answer;
}

/**
 * Create placeholder PDF content
 * @param {string} title - Document title
 * @returns {Buffer} PDF-like buffer
 */
function createPlaceholderPDF(title) {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 55 >>
stream
BT
/F1 12 Tf
100 700 Td
(${title}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
trailer
<< /Size 5 /Root 1 0 R >>
startxref
379
%%EOF`;

  return Buffer.from(content, 'utf-8');
}

/**
 * Read asset file if it exists, otherwise create placeholder
 * @param {string} filename - Asset filename
 * @returns {Buffer} File content
 */
function readOrCreateAsset(filename) {
  const assetPath = path.join(process.cwd(), 'seed_assets', filename);

  try {
    if (fs.existsSync(assetPath)) {
      return fs.readFileSync(assetPath);
    }
  } catch (err) {
    // File doesn't exist, create placeholder
  }

  // Create placeholder content
  const title = filename.replace(/\.(pdf|docx)$/, '').replace(/-/g, ' ').toUpperCase();
  return createPlaceholderPDF(title);
}

/**
 * Format currency for display
 * @param {number} amount - Amount in base currency
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
  return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Generate unique code with timestamp
 * @param {string} prefix - Code prefix
 * @returns {string} Unique code
 */
function generateUniqueCode(prefix) {
  const timestamp = Date.now();
  return `${prefix}-${timestamp}`;
}

module.exports = {
  calculateWeightedScore,
  generateRealisticScore,
  generateAnswer,
  readOrCreateAsset,
  createPlaceholderPDF,
  formatCurrency,
  generateUniqueCode
};
