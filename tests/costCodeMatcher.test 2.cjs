const { matchCostCode, levenshteinDistance } = require('../lib/costCodeMatcher.cjs');

describe('costCodeMatcher', () => {
  const mockCostCodes = [
    { id: 1, code: '03.010', description: 'Concrete Work' },
    { id: 2, code: '05.020', description: 'Structural Steel' },
    { id: 3, code: '09.010', description: 'Drywall and Taping' },
    { id: 4, code: '22.010', description: 'Plumbing' },
    { id: 5, code: '23.010', description: 'HVAC' },
  ];

  describe('matchCostCode', () => {
    test('exact code match with punctuation', () => {
      const result = matchCostCode('03.010', mockCostCodes);
      expect(result.costCodeId).toBe(1);
      expect(result.needsAttention).toBe(false);
    });

    test('exact code match with alternative punctuation', () => {
      const result = matchCostCode('03-010', mockCostCodes);
      expect(result.costCodeId).toBe(1);
      expect(result.needsAttention).toBe(false);
    });

    test('code prefix match', () => {
      const result = matchCostCode('03.010 - Concrete foundations', mockCostCodes);
      expect(result.costCodeId).toBe(1);
      expect(result.needsAttention).toBe(false);
    });

    test('description match with multiple words (high confidence)', () => {
      const result = matchCostCode('structural steel beams', mockCostCodes);
      expect(result.costCodeId).toBe(2);
      expect(result.needsAttention).toBe(false);
    });

    test('description match with single word (low confidence)', () => {
      const result = matchCostCode('plumbing fixtures', mockCostCodes);
      expect(result.costCodeId).toBe(4);
      expect(result.needsAttention).toBe(true);
    });

    test('case insensitive matching', () => {
      const result = matchCostCode('CONCRETE', mockCostCodes);
      expect(result.costCodeId).toBe(1);
      expect(result.needsAttention).toBe(true); // Single word match
    });

    test('no match returns null with attention flag', () => {
      const result = matchCostCode('nonexistent category', mockCostCodes);
      expect(result.costCodeId).toBe(null);
      expect(result.needsAttention).toBe(true);
    });

    test('empty text returns null without attention', () => {
      const result = matchCostCode('', mockCostCodes);
      expect(result.costCodeId).toBe(null);
      expect(result.needsAttention).toBe(false);
    });

    test('null text returns null without attention', () => {
      const result = matchCostCode(null, mockCostCodes);
      expect(result.costCodeId).toBe(null);
      expect(result.needsAttention).toBe(false);
    });

    test('empty cost codes array returns null without attention', () => {
      const result = matchCostCode('concrete', []);
      expect(result.costCodeId).toBe(null);
      expect(result.needsAttention).toBe(false);
    });

    test('multi-word description match (drywall)', () => {
      const result = matchCostCode('drywall taping', mockCostCodes);
      expect(result.costCodeId).toBe(3);
      expect(result.needsAttention).toBe(false);
    });

    test('acronym match (HVAC)', () => {
      // "hvac" is 4 chars (>3) so matches on single word, which flags needsAttention
      const result = matchCostCode('hvac systems', mockCostCodes);
      expect(result.costCodeId).toBe(5);
      expect(result.needsAttention).toBe(true); // Single significant word match
    });

    test('filters out short words in matching', () => {
      // "a" and "be" should be ignored (length <= 2)
      const result = matchCostCode('a be concrete', mockCostCodes);
      expect(result.costCodeId).toBe(1);
    });
  });

  describe('levenshteinDistance', () => {
    test('identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    test('one character difference', () => {
      expect(levenshteinDistance('hello', 'hallo')).toBe(1);
    });

    test('completely different strings', () => {
      expect(levenshteinDistance('abc', 'xyz')).toBe(3);
    });

    test('empty strings', () => {
      expect(levenshteinDistance('', '')).toBe(0);
    });

    test('one empty string', () => {
      expect(levenshteinDistance('hello', '')).toBe(5);
      expect(levenshteinDistance('', 'world')).toBe(5);
    });

    test('insertion operations', () => {
      expect(levenshteinDistance('cat', 'cats')).toBe(1);
    });

    test('deletion operations', () => {
      expect(levenshteinDistance('cats', 'cat')).toBe(1);
    });

    test('substitution operations', () => {
      expect(levenshteinDistance('cat', 'bat')).toBe(1);
    });
  });
});
