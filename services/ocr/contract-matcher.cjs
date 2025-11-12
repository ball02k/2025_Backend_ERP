// ==============================================================================
// CONTRACT MATCHER - Find matching contract for payment application
// ==============================================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Contract Matcher Service
 *
 * Matches extracted payment application data to existing contracts
 * using multiple strategies with confidence scoring.
 */
class ContractMatcher {
  constructor() {
    this.strategies = [
      { name: 'exactContractRef', weight: 100, minScore: 90 },
      { name: 'supplierAndRef', weight: 80, minScore: 70 },
      { name: 'supplierAndProject', weight: 60, minScore: 50 },
      { name: 'supplierName', weight: 40, minScore: 30 },
    ];
  }

  /**
   * Find matching contract for extracted payment application data
   * @param {Object} extractedData - Extracted payment application data
   * @param {String} tenantId - Tenant ID
   * @param {String} emailSender - Email sender (for supplier matching)
   * @returns {Object} - Matching result with contract and confidence
   */
  async findMatch(extractedData, tenantId, emailSender = null) {
    console.log('[ContractMatcher] Finding matching contract...');
    console.log('[ContractMatcher] Extracted:', {
      contractRef: extractedData.contractRef,
      supplierName: extractedData.supplierName,
      supplierEmail: extractedData.supplierEmail || emailSender,
    });

    const candidates = [];

    // Strategy 1: Exact contract reference match
    if (extractedData.contractRef) {
      const matches = await this.matchByContractRef(
        extractedData.contractRef,
        tenantId
      );
      candidates.push(...matches.map(m => ({ ...m, strategy: 'exactContractRef' })));
    }

    // Strategy 2: Supplier email + contract ref
    if ((extractedData.supplierEmail || emailSender) && extractedData.contractRef) {
      const matches = await this.matchBySupplierAndRef(
        extractedData.supplierEmail || emailSender,
        extractedData.contractRef,
        tenantId
      );
      candidates.push(...matches.map(m => ({ ...m, strategy: 'supplierAndRef' })));
    }

    // Strategy 3: Supplier name + project name
    if (extractedData.supplierName && extractedData.contractName) {
      const matches = await this.matchBySupplierAndProject(
        extractedData.supplierName,
        extractedData.contractName,
        tenantId
      );
      candidates.push(...matches.map(m => ({ ...m, strategy: 'supplierAndProject' })));
    }

    // Strategy 4: Supplier email only
    if (extractedData.supplierEmail || emailSender) {
      const matches = await this.matchBySupplierEmail(
        extractedData.supplierEmail || emailSender,
        tenantId
      );
      candidates.push(...matches.map(m => ({ ...m, strategy: 'supplierName' })));
    }

    // Remove duplicates and score
    const scored = this.scoreAndRank(candidates);

    if (scored.length === 0) {
      console.log('[ContractMatcher] No matching contracts found');
      return {
        matched: false,
        confidence: 0,
        contract: null,
        suggestions: [],
      };
    }

    const best = scored[0];
    const isConfident = best.confidence >= 70;

    console.log(`[ContractMatcher] ${isConfident ? 'Matched' : 'Suggested'} contract: ${best.contract.contractRef} (${best.confidence}% confidence)`);

    return {
      matched: isConfident,
      confidence: best.confidence,
      contract: isConfident ? best.contract : null,
      suggestions: scored.slice(0, 5), // Top 5 suggestions
      method: best.strategy,
    };
  }

  /**
   * Match by exact contract reference
   * @param {String} contractRef - Contract reference from OCR
   * @param {String} tenantId - Tenant ID
   * @returns {Array} - Matching contracts
   */
  async matchByContractRef(contractRef, tenantId) {
    const contracts = await prisma.contract.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'LIVE'] },
        OR: [
          { contractRef: { contains: contractRef, mode: 'insensitive' } },
          { title: { contains: contractRef, mode: 'insensitive' } },
          { reference: { contains: contractRef, mode: 'insensitive' } },
        ],
      },
      include: {
        supplier: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });

    return contracts.map(contract => ({
      contract,
      score: this.calculateReferenceMatchScore(contractRef, contract.contractRef),
    }));
  }

  /**
   * Match by supplier email and contract reference
   * @param {String} email - Supplier email
   * @param {String} contractRef - Contract reference
   * @param {String} tenantId - Tenant ID
   * @returns {Array} - Matching contracts
   */
  async matchBySupplierAndRef(email, contractRef, tenantId) {
    // Find supplier first
    const suppliers = await prisma.supplier.findMany({
      where: {
        tenantId,
        OR: [
          { email: { contains: email, mode: 'insensitive' } },
          { contactEmail: { contains: email, mode: 'insensitive' } },
        ],
      },
    });

    if (suppliers.length === 0) return [];

    const supplierIds = suppliers.map(s => s.id);

    const contracts = await prisma.contract.findMany({
      where: {
        tenantId,
        supplierId: { in: supplierIds },
        status: { in: ['ACTIVE', 'LIVE'] },
        OR: [
          { contractRef: { contains: contractRef, mode: 'insensitive' } },
          { title: { contains: contractRef, mode: 'insensitive' } },
        ],
      },
      include: {
        supplier: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });

    return contracts.map(contract => ({
      contract,
      score: 90, // High confidence when both supplier and ref match
    }));
  }

  /**
   * Match by supplier name and project name
   * @param {String} supplierName - Supplier name from OCR
   * @param {String} projectName - Project/contract name from OCR
   * @param {String} tenantId - Tenant ID
   * @returns {Array} - Matching contracts
   */
  async matchBySupplierAndProject(supplierName, projectName, tenantId) {
    const contracts = await prisma.contract.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'LIVE'] },
        supplier: {
          name: { contains: supplierName, mode: 'insensitive' },
        },
        OR: [
          { title: { contains: projectName, mode: 'insensitive' } },
          { project: { name: { contains: projectName, mode: 'insensitive' } } },
        ],
      },
      include: {
        supplier: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });

    return contracts.map(contract => ({
      contract,
      score: 70, // Medium confidence
    }));
  }

  /**
   * Match by supplier email only
   * @param {String} email - Supplier email
   * @param {String} tenantId - Tenant ID
   * @returns {Array} - Matching contracts
   */
  async matchBySupplierEmail(email, tenantId) {
    // Find supplier first
    const suppliers = await prisma.supplier.findMany({
      where: {
        tenantId,
        OR: [
          { email: { contains: email, mode: 'insensitive' } },
          { contactEmail: { contains: email, mode: 'insensitive' } },
        ],
      },
    });

    if (suppliers.length === 0) return [];

    const supplierIds = suppliers.map(s => s.id);

    const contracts = await prisma.contract.findMany({
      where: {
        tenantId,
        supplierId: { in: supplierIds },
        status: { in: ['ACTIVE', 'LIVE'] },
      },
      include: {
        supplier: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'desc' }, // Most recent contracts first
    });

    return contracts.map(contract => ({
      contract,
      score: 50, // Lower confidence when only supplier matches
    }));
  }

  /**
   * Calculate string match score (Levenshtein-like)
   * @param {String} str1 - First string
   * @param {String} str2 - Second string
   * @returns {Number} - Match score (0-100)
   */
  calculateReferenceMatchScore(str1, str2) {
    if (!str1 || !str2) return 0;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    // Exact match
    if (s1 === s2) return 100;

    // Contains match
    if (s1.includes(s2) || s2.includes(s1)) return 90;

    // Fuzzy match using similarity ratio
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    const editDistance = this.levenshteinDistance(s1, s2);
    const maxLength = longer.length;

    if (maxLength === 0) return 100;

    const similarity = ((maxLength - editDistance) / maxLength) * 100;
    return Math.max(0, similarity);
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {String} str1 - First string
   * @param {String} str2 - Second string
   * @returns {Number} - Edit distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Score and rank contract candidates
   * @param {Array} candidates - Contract candidates
   * @returns {Array} - Scored and ranked contracts
   */
  scoreAndRank(candidates) {
    // Remove duplicates (same contract ID)
    const unique = [];
    const seen = new Set();

    for (const candidate of candidates) {
      const key = candidate.contract.id;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(candidate);
      }
    }

    // Apply strategy weights
    for (const candidate of unique) {
      const strategy = this.strategies.find(s => s.name === candidate.strategy);
      if (strategy) {
        candidate.confidence = Math.min(100, (candidate.score * strategy.weight) / 100);
      } else {
        candidate.confidence = candidate.score;
      }
    }

    // Sort by confidence desc
    unique.sort((a, b) => b.confidence - a.confidence);

    return unique;
  }

  /**
   * Get previous applications for a contract
   * @param {Number} contractId - Contract ID
   * @param {String} tenantId - Tenant ID
   * @returns {Array} - Previous applications
   */
  async getPreviousApplications(contractId, tenantId) {
    const applications = await prisma.applicationForPayment.findMany({
      where: {
        contractId,
        tenantId,
        status: { in: ['CERTIFIED', 'PAYMENT_NOTICE_SENT', 'APPROVED', 'PAID'] },
      },
      orderBy: { applicationNumber: 'desc' },
      take: 1,
    });

    return applications;
  }

  /**
   * Calculate next application number for a contract
   * @param {Number} contractId - Contract ID
   * @param {String} tenantId - Tenant ID
   * @returns {Number} - Next application number
   */
  async getNextApplicationNumber(contractId, tenantId) {
    const lastApp = await prisma.applicationForPayment.findFirst({
      where: { contractId, tenantId },
      orderBy: { applicationNumber: 'desc' },
    });

    return (lastApp?.applicationNumber || 0) + 1;
  }
}

module.exports = new ContractMatcher();
