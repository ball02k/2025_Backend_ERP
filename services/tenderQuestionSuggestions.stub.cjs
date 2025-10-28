// Temporary heuristic-based question suggestion generator.
// Replace with real AI integration once the provider is available.
const stripHtml = (value) => {
  if (!value) return '';
  return String(value).replace(/<[^>]*>/g, ' ');
};

const TEMPLATE_DEFINITIONS = [
  {
    key: 'methodology',
    category: 'Delivery & Methodology',
    responseType: 'text',
    required: true,
    keywords: ['method', 'approach', 'programme', 'delivery', 'build'],
    prompt: (ctx) => {
      const name = ctx.packageName || ctx.tenderTitle;
      return `Describe your proposed methodology for delivering ${name}. Include sequencing, resource allocation, and risk controls.`;
    },
    guidance: 'Outline phases, key activities, and how you will maintain quality and safety standards.',
    baseScore: 0.62,
  },
  {
    key: 'experience',
    category: 'Experience',
    responseType: 'text',
    required: true,
    keywords: ['experience', 'reference', 'past project', 'track record'],
    prompt: (ctx) => `Provide details of recent projects similar to this tender, highlighting scope, contract value, and client references.`,
    guidance: 'Focus on projects completed within the last five years that are similar in size or complexity.',
    baseScore: 0.58,
  },
  {
    key: 'health_safety',
    category: 'Compliance',
    responseType: 'file',
    required: true,
    keywords: ['safety', 'cdm', 'construction phase', 'risk'],
    prompt: () => 'Upload your current health and safety policy and any relevant risk assessments.',
    guidance: 'Include RAMS, insurance certificates, and any accreditation documents.',
    baseScore: 0.66,
  },
  {
    key: 'sustainability',
    category: 'Sustainability',
    responseType: 'text',
    required: false,
    keywords: ['carbon', 'sustainability', 'esg', 'environment'],
    prompt: (ctx) => `Explain how you will meet the sustainability requirements for ${ctx.packageName || 'this tender'}, including waste, carbon, and social value commitments.`,
    guidance: 'Reference any certifications, KPIs, or reporting you can provide.',
    baseScore: 0.52,
  },
  {
    key: 'timeline',
    category: 'Programme',
    responseType: 'file',
    required: false,
    keywords: ['timeline', 'programme', 'schedule'],
    prompt: () => 'Upload a draft delivery programme highlighting key milestones and dependencies.',
    guidance: 'A Gantt chart or similar format is acceptable.',
    baseScore: 0.48,
  },
  {
    key: 'commercial',
    category: 'Commercial & Contract',
    responseType: 'single',
    options: ['Yes', 'No', 'With Exceptions'],
    required: true,
    keywords: ['contract', 'terms', 'conditions'],
    prompt: () => 'Can you comply with the proposed contract terms without reservations?',
    guidance: 'If you have exceptions, detail them in the clarification log.',
    baseScore: 0.6,
  },
  {
    key: 'innovation',
    category: 'Innovation & Added Value',
    responseType: 'text',
    required: false,
    keywords: ['innovation', 'value', 'alternative'],
    prompt: () => 'Describe any innovations or added value solutions you can bring to this opportunity.',
    guidance: 'Consider programme improvements, cost savings, or risk mitigation.',
    baseScore: 0.44,
  },
];

const DEFAULT_LIMIT = 6;

const normalise = (value = '') => value.toLowerCase().replace(/\s+/g, ' ').trim();

const ensureArray = (input) => {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .filter(Boolean)
      .map((value) => {
        if (typeof value === 'string') return value;
        if (typeof value === 'object') {
          return value?.label || value?.name || value?.value || JSON.stringify(value);
        }
        return String(value);
      })
      .filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/[\n,]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (typeof input === 'object') {
    const candidate = input?.label || input?.name || input?.value;
    if (candidate) return [candidate];
  }
  return [String(input)];
};

const collectText = (tender) => {
  const chunks = [];
  if (tender.title) chunks.push(tender.title);
  if (tender.description) chunks.push(tender.description);
  if (tender.package?.name) chunks.push(tender.package.name);
  if (tender.package?.description) chunks.push(tender.package.description);
  if (Array.isArray(tender.rfxSection)) {
    tender.rfxSection.forEach((section) => {
      if (section?.title) chunks.push(section.title);
      if (Array.isArray(section.rfxQuestion)) {
        section.rfxQuestion.forEach((q) => {
          if (q?.prompt) chunks.push(q.prompt);
        });
      }
    });
  }
  return normalise(stripHtml(chunks.join(' ')));
};

const existingPrompts = (tender) => {
  const prompts = new Set();
  if (!Array.isArray(tender.rfxSection)) return prompts;
  tender.rfxSection.forEach((section) => {
    if (Array.isArray(section.rfxQuestion)) {
      section.rfxQuestion.forEach((q) => {
        if (q?.prompt) prompts.add(normalise(q.prompt));
      });
    }
  });
  return prompts;
};

const focusMatches = (focusTerms, keywords) => {
  if (!focusTerms.length || !keywords?.length) return [];
  const lowerFocus = focusTerms.map((term) => normalise(term));
  return keywords.filter((keyword) => lowerFocus.some((term) => term.includes(keyword) || keyword.includes(term)));
};

const keywordMatches = (contextText, keywords) => {
  if (!contextText || !keywords?.length) return [];
  const matches = keywords.filter((keyword) => contextText.includes(keyword));
  return matches;
};

const computeScore = ({ baseScore = 0.4, keywordHits = [], focusHits = [] }) => {
  const keywordBonus = Math.min(keywordHits.length * 0.08, 0.24);
  const focusBonus = Math.min(focusHits.length * 0.1, 0.2);
  const score = Math.min(0.95, baseScore + keywordBonus + focusBonus);
  return Number(score.toFixed(2));
};

const buildRationale = (template, { keywordHits, focusHits }) => {
  const reasons = [];
  if (keywordHits.length) {
    reasons.push(`Tender materials reference ${keywordHits.join(', ')}`);
  }
  if (focusHits.length) {
    reasons.push(`Focus areas include ${focusHits.join(', ')}`);
  }
  if (!reasons.length) {
    reasons.push(`Core ${template.category.toLowerCase()} coverage question.`);
  }
  return reasons.join(' and ');
};

const normaliseOptions = (options) => {
  if (!options) return undefined;
  if (Array.isArray(options)) return options.join(',');
  if (typeof options === 'string') return options;
  return String(options);
};

const toSuggestion = (template, ctx) => {
  const keywordHits = keywordMatches(ctx.contextText, template.keywords);
  const focusHits = focusMatches(ctx.focusTerms, template.keywords);
  const confidence = computeScore({ baseScore: template.baseScore, keywordHits, focusHits });
  const prompt = template.prompt(ctx);
  const suggestion = {
    key: template.key,
    category: template.category,
    prompt,
    responseType: template.responseType,
    required: template.required !== undefined ? !!template.required : true,
    confidence,
  };
  const guidance = typeof template.guidance === 'function' ? template.guidance(ctx) : template.guidance;
  if (guidance) suggestion.guidance = guidance;
  const rationale = template.rationale ? template.rationale(ctx, { keywordHits, focusHits }) : buildRationale(template, { keywordHits, focusHits });
  if (rationale) suggestion.rationale = rationale;
  const options = normaliseOptions(template.options);
  if (options) suggestion.options = options;
  return suggestion;
};

const stripExisting = (suggestions, usedPrompts) => {
  return suggestions.filter((item) => !usedPrompts.has(normalise(item.prompt)));
};

const uniqueSuggestions = (suggestions) => {
  const seen = new Set();
  return suggestions.filter((item) => {
    const key = normalise(item.prompt);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const parseLimit = (value) => {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return Math.min(12, Math.round(n));
  return DEFAULT_LIMIT;
};

const buildTenderQuestionSuggestions = ({ tender, focus, limit } = {}) => {
  if (!tender) return [];
  const focusTerms = ensureArray(focus);
  const usedPrompts = existingPrompts(tender);
  const contextText = collectText(tender);
  const ctx = {
    tenderTitle: tender.title || 'this tender',
    packageName: tender.package?.name || null,
    contextText,
    focusTerms,
  };
  const raw = TEMPLATE_DEFINITIONS.map((template) => ({
    template,
    suggestion: toSuggestion(template, ctx),
  }));
  const filtered = stripExisting(
    raw
      .map(({ template, suggestion }) => ({
        template,
        suggestion,
        sortScore: suggestion.confidence,
      }))
      .sort((a, b) => b.sortScore - a.sortScore)
      .map(({ suggestion }) => suggestion),
    usedPrompts
  );
  const unique = uniqueSuggestions(filtered);
  if (!unique.length) {
    return [
      {
        key: 'general_clarifications',
        category: 'General',
        prompt: `Provide any additional clarifications, exclusions, or assumptions relating to ${ctx.packageName || ctx.tenderTitle}.`,
        responseType: 'text',
        required: false,
        confidence: 0.35,
        rationale: 'Fallback question when no new gaps were detected.',
      },
    ];
  }
  const finalLimit = parseLimit(limit);
  return unique.slice(0, finalLimit);
};

module.exports = {
  buildTenderQuestionSuggestions,
};
