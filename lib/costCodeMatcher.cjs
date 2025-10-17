/**
 * Fuzzy match cost code text to available cost codes
 * @param {string} text - Cost code text from AI (e.g., "03.010 Concrete" or "Concrete")
 * @param {Array<{id: number, code: string, description?: string}>} costCodes - Available cost codes
 * @returns {{costCodeId: number | null, needsAttention: boolean}}
 */
function matchCostCode(text, costCodes) {
  if (!text || !costCodes || costCodes.length === 0) {
    return { costCodeId: null, needsAttention: false };
  }

  const normalized = text.trim().toLowerCase();

  // 1. Try exact code match (e.g., "03.010" or "03-010")
  for (const cc of costCodes) {
    const code = (cc.code || '').toLowerCase().replace(/[-._]/g, '');
    const searchCode = normalized.replace(/[-._]/g, '');
    if (code && searchCode.startsWith(code)) {
      return { costCodeId: cc.id, needsAttention: false };
    }
  }

  // 2. Try code prefix match
  for (const cc of costCodes) {
    const code = (cc.code || '').toLowerCase();
    if (code && normalized.startsWith(code)) {
      return { costCodeId: cc.id, needsAttention: false };
    }
  }

  // 3. Try description contains match (case-insensitive)
  const words = normalized.split(/\s+/).filter(Boolean);
  for (const cc of costCodes) {
    const desc = (cc.description || '').toLowerCase();
    const code = (cc.code || '').toLowerCase();
    const combined = `${code} ${desc}`;

    // High confidence: multiple word matches
    const matchCount = words.filter((w) => w.length > 2 && combined.includes(w)).length;
    if (matchCount >= 2) {
      return { costCodeId: cc.id, needsAttention: false };
    }
  }

  // 4. Try single significant word match (lower confidence)
  for (const cc of costCodes) {
    const desc = (cc.description || '').toLowerCase();
    const code = (cc.code || '').toLowerCase();
    const combined = `${code} ${desc}`;

    for (const word of words) {
      if (word.length > 3 && combined.includes(word)) {
        return { costCodeId: cc.id, needsAttention: true }; // Flag for review
      }
    }
  }

  // No match found
  return { costCodeId: null, needsAttention: true };
}

/**
 * Calculate simple Levenshtein distance (for future enhancements)
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

module.exports = { matchCostCode, levenshteinDistance };
