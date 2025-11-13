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

/**
 * Compute RFx scoring with optional normalization.
 * Returns { score, sections: [...], normalization, latestResponseId }
 */
async function computeRequestScore({ tenantId, requestId, supplierId, scaleCfg = {}, prisma = prismaSingleton }) {
  const doNormalize = !!scaleCfg.normalize;
  const perQuestionCfg = (scaleCfg && scaleCfg.perQuestion) || {};

  const [sections, questions, responses] = await Promise.all([
    prisma.requestSection.findMany({ where: { tenantId, requestId }, orderBy: [{ order: 'asc' }] }),
    prisma.requestQuestion.findMany({ where: { tenantId, requestId } }),
    prisma.requestResponse.findMany({ where: { tenantId, requestId, supplierId, status: 'submitted' } }),
  ]);

  const mergedAnswers = responses
    .sort((a, b) => (a.stage === b.stage ? a.id - b.id : a.stage - b.stage))
    .reduce((acc, r) => ({ ...acc, ...(r.answers || {}) }), {});

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
      const ans = mergedAnswers[q.id] ?? mergedAnswers[String(q.id)] ?? mergedAnswers[q.prompt];
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
      if (doNormalize && base != null && Number.isFinite(Number(base))) {
        const min = num(qCfg.min ?? scaleCfg.defaultMin);
        const max = num(qCfg.max ?? scaleCfg.defaultMax);
        if (min != null && max != null && Number.isFinite(min) && Number.isFinite(max) && max > min) {
          const norm = clamp01((Number(base) - min) / (max - min));
          const tMax = num(scaleCfg.targetMax);
          usedBase = tMax != null ? norm * tMax : norm;
          usedMin = min; usedMax = max; targetMax = tMax;
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
        normalization: doNormalize ? { min: usedMin, max: usedMax, targetMax } : undefined,
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
    normalization: doNormalize ? { defaultMin: scaleCfg.defaultMin ?? null, defaultMax: scaleCfg.defaultMax ?? null, targetMax: scaleCfg.targetMax ?? null } : undefined,
    latestResponseId: latest ? latest.id : null,
  };
}

module.exports = { computeRequestScore };

