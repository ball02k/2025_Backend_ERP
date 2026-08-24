const { prisma: prismaSingleton } = require('../utils/prisma.cjs');

function getMCQScore(options, answer) {
  if (answer == null) return null;
  if (Array.isArray(options)) {
    const found = options.find((o) => String(o?.value) === String(answer));
    return found && Number.isFinite(Number(found.score)) ? Number(found.score) : null;
  }
  if (options && typeof options === 'object') {
    const sc = options[String(answer)];
    return Number.isFinite(Number(sc)) ? Number(sc) : null;
  }
  return null;
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

function getAnswer(answers, question) {
  return answers?.[question.id] ?? answers?.[String(question.id)] ?? answers?.[question.prompt];
}

function isPriceQuestion(question, questionCfg = {}, scaleCfg = {}) {
  const cfgType = String(questionCfg.type || questionCfg.mode || '').toLowerCase();
  const prompt = String(question?.prompt || '').toLowerCase();
  const qtype = String(question?.qType || '').toLowerCase();
  const lowerBest = questionCfg.lowestBest === true || questionCfg.lowerBest === true || scaleCfg?.price?.lowestBest === true;

  if (cfgType === 'price' || questionCfg.price === true) return true;
  if (lowerBest && (qtype === 'number' || qtype === 'numeric')) return true;
  return /\b(price|tender sum|tender total|contract sum|total bid)\b/.test(prompt);
}

function mergeResponsesBySupplier(responses) {
  const bySupplier = new Map();
  const sorted = [...responses].sort((a, b) => (a.stage === b.stage ? a.id - b.id : a.stage - b.stage));
  for (const response of sorted) {
    const supplierKey = Number(response.supplierId);
    if (!Number.isFinite(supplierKey)) continue;
    bySupplier.set(supplierKey, {
      ...(bySupplier.get(supplierKey) || {}),
      ...(response.answers || {}),
    });
  }
  return bySupplier;
}

function buildPriceBenchmarks({ questions, responsesBySupplier, perQuestionCfg, scaleCfg }) {
  const benchmarks = new Map();
  for (const question of questions) {
    const questionCfg = perQuestionCfg[question.id] || perQuestionCfg[String(question.id)] || question.calc || {};
    if (!isPriceQuestion(question, questionCfg, scaleCfg)) continue;

    const values = [];
    for (const answers of responsesBySupplier.values()) {
      const value = num(getAnswer(answers, question));
      if (value != null && value > 0) values.push(value);
    }
    if (!values.length) continue;

    benchmarks.set(question.id, {
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    });
  }
  return benchmarks;
}

/**
 * Compute RFx scoring with optional normalization.
 * Returns { score, sections: [...], normalization, latestResponseId }
 */
async function computeRequestScore({ tenantId, requestId, supplierId, scaleCfg = {}, prisma = prismaSingleton }) {
  const doNormalize = !!scaleCfg.normalize;
  const perQuestionCfg = (scaleCfg && scaleCfg.perQuestion) || {};

  const [sections, questions, allResponses] = await Promise.all([
    prisma.requestSection.findMany({ where: { tenantId, requestId }, orderBy: [{ order: 'asc' }] }),
    prisma.requestQuestion.findMany({ where: { tenantId, requestId } }),
    prisma.requestResponse.findMany({ where: { tenantId, requestId, status: 'submitted' } }),
  ]);

  const responses = allResponses.filter((response) => Number(response.supplierId) === Number(supplierId));
  const mergedAnswers = responses
    .sort((a, b) => (a.stage === b.stage ? a.id - b.id : a.stage - b.stage))
    .reduce((acc, r) => ({ ...acc, ...(r.answers || {}) }), {});
  const responsesBySupplier = mergeResponsesBySupplier(allResponses);
  const priceBenchmarks = buildPriceBenchmarks({ questions, responsesBySupplier, perQuestionCfg, scaleCfg });

  const bySection = new Map();
  for (const q of questions) {
    const sid = q.sectionId;
    if (!bySection.has(sid)) bySection.set(sid, []);
    bySection.get(sid).push(q);
  }

  let totalWeighted = 0;
  let totalSectionWeights = 0;
  const sectionBreakdown = [];

  for (const section of sections) {
    const qs = bySection.get(section.id) || [];
    let sectionSum = 0;
    let qWeights = 0;
    const qBreakdown = [];
    for (const q of qs) {
      const ans = getAnswer(mergedAnswers, q);
      let base = null;
      const qtype = String(q.qType || '').toLowerCase();
      if (qtype === 'mcq' || qtype === 'select' || qtype === 'single_choice') base = getMCQScore(q.options, ans);
      else if (qtype === 'number' || qtype === 'numeric' || qtype === 'score') base = num(ans);
      else {
        const scoresMap = mergedAnswers._scores || {};
        base = num(scoresMap[q.id] ?? scoresMap[String(q.id)] ?? mergedAnswers[`score_${q.id}`]);
      }
      const w = q.weight ? Number(q.weight) : 1;
      const qCfg = perQuestionCfg[q.id] || perQuestionCfg[String(q.id)] || q.calc || {};
      let usedBase = base;
      let usedMin = null;
      let usedMax = null;
      let targetMax = null;
      let scoringMethod = null;
      const priceBenchmark = priceBenchmarks.get(q.id);
      if (priceBenchmark && base != null && Number(base) > 0) {
        const priceScale = scaleCfg.price && typeof scaleCfg.price === 'object' ? scaleCfg.price : {};
        const tMax = num(qCfg.targetMax ?? priceScale.targetMax ?? scaleCfg.targetMax ?? scaleCfg.defaultMax ?? 10) ?? 10;
        usedBase = clamp01(priceBenchmark.min / Number(base)) * tMax;
        usedMin = priceBenchmark.min;
        usedMax = priceBenchmark.max;
        targetMax = tMax;
        scoringMethod = 'lowest_price';
      } else if (doNormalize && base != null && Number.isFinite(Number(base))) {
        const min = num(qCfg.min ?? scaleCfg.defaultMin);
        const max = num(qCfg.max ?? scaleCfg.defaultMax);
        if (min != null && max != null && Number.isFinite(min) && Number.isFinite(max) && max > min) {
          const norm = clamp01((Number(base) - min) / (max - min));
          const tMax = num(scaleCfg.targetMax);
          usedBase = tMax != null ? norm * tMax : norm;
          usedMin = min; usedMax = max; targetMax = tMax;
          scoringMethod = 'linear_normalized';
        }
      }
      if (usedBase != null && Number.isFinite(Number(usedBase))) {
        sectionSum += Number(usedBase) * w;
        qWeights += w;
      }
      qBreakdown.push({
        questionId: q.id,
        prompt: q.prompt,
        qType: q.qType,
        baseScore: base,
        effectiveBase: usedBase,
        weight: w,
        scoringMethod,
        normalization: (doNormalize || priceBenchmark) ? { min: usedMin, max: usedMax, targetMax } : undefined,
      });
    }
    const sectionWeight = section.weight ? Number(section.weight) : 1;
    const sectionScore = qWeights > 0 ? sectionSum / qWeights : 0;
    totalWeighted += sectionScore * sectionWeight;
    totalSectionWeights += sectionWeight;
    const questionsOut = qBreakdown.map((qb) => ({
      ...qb,
      contribution: qb.effectiveBase != null && qWeights > 0 ? (Number(qb.effectiveBase) * qb.weight) / qWeights : 0,
      weightedRaw: qb.effectiveBase != null ? Number(qb.effectiveBase) * qb.weight : 0,
    }));
    sectionBreakdown.push({ sectionId: section.id, title: section.title, weight: sectionWeight, score: sectionScore, questions: questionsOut });
  }

  const totalScore = totalSectionWeights > 0 ? totalWeighted / totalSectionWeights : 0;
  const latest = responses.sort((a, b) => (a.submittedAt && b.submittedAt ? new Date(b.submittedAt) - new Date(a.submittedAt) : b.id - a.id))[0];

  return {
    score: totalScore,
    sections: sectionBreakdown,
    normalization: (doNormalize || priceBenchmarks.size > 0)
      ? {
          defaultMin: scaleCfg.defaultMin ?? null,
          defaultMax: scaleCfg.defaultMax ?? null,
          targetMax: scaleCfg.targetMax ?? null,
          priceBenchmarks: Object.fromEntries(priceBenchmarks),
        }
      : undefined,
    latestResponseId: latest ? latest.id : null,
  };
}

module.exports = { computeRequestScore };
