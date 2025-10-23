const RULES = [
  { code: 'MECH', name: 'Mechanical', keywords: ['mechanical', 'hvac', 'chiller', 'duct', 'fan coil', 'ahu', 'boiler', 'pump', 'ventilation', 'air handling'] },
  { code: 'ELEC', name: 'Electrical', keywords: ['electrical', 'cable', 'conduit', 'switchgear', 'mccb', 'rcbo', 'distribution board', 'containment', 'lighting', 'breaker', 'socket', 'fuse', 'wiring', 'busbar'] },
  { code: 'PLMB', name: 'Plumbing', keywords: ['plumb', 'pipe', 'soil', 'waste', 'svp', 'potable', 'hot water', 'cold water', 'sanitary', 'upvc', 'copper', 'heating', 'manifold'] },
  { code: 'ROOF', name: 'Roofing', keywords: ['roof', 'felt', 'sar', 'epdm', 'membrane', 'slate', 'tile', 'parapet', 'gutter', 'soffit', 'fascia'] },
  { code: 'JOIN', name: 'Joinery', keywords: ['joinery', 'door', 'frame', 'architrave', 'skirting', 'cabinet', 'bespoke', 'timber', 'casework', 'wardrobe'] },
  { code: 'FINI', name: 'Finishes', keywords: ['paint', 'plaster', 'skim', 'floor', 'carpet', 'vinyl', 'tile', 'trowel', 'finish', 'gypsum', 'decor', 'studwall', 'drywall'] },
  { code: 'GLAZ', name: 'Glazing', keywords: ['glaz', 'glass', 'curtain wall', 'window', 'bifold', 'slider', 'vision panel', 'shopfront'] },
  { code: 'STRC', name: 'Structure', keywords: ['steel', 'structural', 'rsj', 'ub', 'uc', 'pad', 'pile', 'rc', 'concrete', 'rebar', 'slab', 'foundation', 'column', 'beam', 'purlin', 'truss'] },
  { code: 'CIVL', name: 'Civils & Groundworks', keywords: ['ground', 'excav', 'trench', 'earthwork', 'drain', 'manhole', 'kerb', 'paving', 'sub-base', 'hardscape', 'retaining wall', 'road', 'asphalt', 'resurfacing'] },
  { code: 'LAND', name: 'Landscaping', keywords: ['landscape', 'soft', 'planting', 'turf', 'irrigation', 'tree', 'hedge', 'mulch', 'topsoil', 'planter'] },
  { code: 'FIRE', name: 'Fire Protection', keywords: ['sprinkler', 'fire alarm', 'detection', 'smoke', 'wet riser', 'dry riser', 'firestopping', 'intumescent', 'fx', 'fire curtain'] },
  { code: 'TEMP', name: 'Temporary Works', keywords: ['scaffold', 'temporary', 'hoarding', 'protection', 'weathering', 'site setup', 'welfare', 'generator', 'tower crane', 'gantry'] },
  { code: 'ENVR', name: 'Environmental & Sustainability', keywords: ['pv', 'photovoltaic', 'solar', 'bms', 'energy', 'sustain', 'ev charger', 'wind turbine', 'rainwater', 'leed', 'breeam'] },
  { code: 'ITAV', name: 'IT / AV / Security', keywords: ['data', 'network', 'cat6', 'server', 'rack', 'wifi', 'av', 'audio visual', 'cctv', 'security', 'access control', 'pa system', 'alarm'] },
  { code: 'INTF', name: 'Interiors', keywords: ['ceiling', 'partition', 'fit out', 'furniture', 'wall covering', 'acoustic', 'office', 'raised floor', 'feature wall', 'joinery'] },
];

function tokenise(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((word) => word.length > 2);
}

function combineText(line) {
  return [line.description, line.costCode?.code, line.costCode?.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchRule(line) {
  const text = combineText(line);
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      return rule;
    }
  }
  return null;
}

function scorePackage(lineTokens, pkg) {
  const tokens = new Set([
    ...tokenise(pkg.name),
    ...tokenise(pkg.trade),
    ...tokenise(pkg.scopeSummary),
    ...tokenise(pkg.costCode?.code),
  ]);

  let score = 0;
  const hits = [];

  for (const token of tokens) {
    if (lineTokens.has(token)) {
      score += 1;
      hits.push({ type: 'keyword', value: token });
    }
  }

  return { score, hits };
}

function describeHits(hits, pkgName) {
  if (!Array.isArray(hits) || hits.length === 0) {
    return `No strong keyword match found, defaulting to ${pkgName}.`;
  }
  const words = hits
    .filter((hit) => hit?.type === 'keyword' && hit.value)
    .map((hit) => hit.value)
    .slice(0, 6);
  if (words.length === 0) {
    return `Matched heuristics for ${pkgName}.`;
  }
  return `Matched keywords: ${words.join(', ')}.`;
}

async function generatePackageSuggestions({ prisma, tenantId, projectId }) {
  const [packages, lines] = await Promise.all([
    prisma.package.findMany({
      where: { projectId, project: { tenantId } },
      include: { costCode: { select: { code: true } }, budgetItems: { select: { budgetLineId: true } } },
    }),
    prisma.budgetLine.findMany({
      where: { tenantId, projectId },
      include: { packageItems: { select: { packageId: true } }, costCode: { select: { code: true, description: true } } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const packageIndex = new Map(packages.map((pkg) => [pkg.id, pkg]));
  const packagesMap = {
    UNASSIGNED: { name: 'Unassigned', packageId: null, isNew: false },
  };

  packages.forEach((pkg) => {
    packagesMap[`pkg:${pkg.id}`] = { name: pkg.name, packageId: pkg.id, isNew: false };
  });

  const suggestions = [];

  for (const line of lines) {
    const lineTokens = new Set(tokenise(line.description));
    const currentPackageId = line.packageItems[0]?.packageId ?? null;
    const rule = matchRule(line);
    let primary = null;
    let ranked = [];

    if (packages.length > 0) {
      ranked = packages
        .map((pkg) => {
          const { score, hits } = scorePackage(lineTokens, pkg);
          const adjusted = score + (pkg.budgetItems.some((it) => it.budgetLineId === line.id) ? 2 : 0);
          return {
            pkg,
            score: adjusted,
            hits,
            reason: describeHits(hits, pkg.name),
          };
        })
        .sort((a, b) => b.score - a.score);
    }

    if (currentPackageId && packageIndex.has(currentPackageId)) {
      const pkg = packageIndex.get(currentPackageId);
      primary = {
        pkg,
        code: `pkg:${pkg.id}`,
        confidence: 0.95,
        explain: [{ type: 'assignment', value: 'Existing package assignment' }],
        reason: 'Existing package assignment',
      };
    } else if (ranked.length > 0 && ranked[0].score > 0) {
      const top = ranked[0];
      const confidence = Math.min(0.9, Math.max(0.4, top.score / (lineTokens.size || 1)));
      primary = {
        pkg: top.pkg,
        code: `pkg:${top.pkg.id}`,
        confidence,
        explain: top.hits,
        reason: top.reason,
      };
    }

    if (!primary && rule) {
      const ruleKey = rule.code;
      packagesMap[ruleKey] ??= { name: rule.name, packageId: null, isNew: true, trade: rule.name };
      primary = {
        pkg: { id: null, name: rule.name },
        code: ruleKey,
        confidence: 0.75,
        explain: [{ type: 'keyword', value: rule.name }],
        reason: `Matched rule for ${rule.name}`,
      };
    }

    const alternatives = [];
    ranked
      .slice(0, 5)
      .filter((entry) => !primary || entry.pkg.id !== primary.pkg.id)
      .filter((entry) => entry.score > 0)
      .forEach((entry) => {
        const code = `pkg:${entry.pkg.id}`;
        alternatives.push({
          code,
          packageId: entry.pkg.id,
          name: entry.pkg.name,
          confidence: Math.min(0.8, Math.max(0.3, entry.score / (lineTokens.size || 1))),
        });
        packagesMap[code] ??= { name: entry.pkg.name, packageId: entry.pkg.id, isNew: false };
      });

    if (rule) {
      const ruleKey = rule.code;
      packagesMap[ruleKey] ??= { name: rule.name, packageId: null, isNew: true, trade: rule.name };
      if (!primary || primary.code !== ruleKey) {
        alternatives.unshift({
          code: ruleKey,
          packageId: null,
          name: rule.name,
          confidence: 0.65,
          isNew: true,
        });
      }
    }

    let packageCode = 'UNASSIGNED';
    let packageName = 'Unassigned';
    let packageId = null;
    let confidence = 0.25;
    let explain = [{ type: 'text', value: 'No matching package identified.' }];
    let reason = 'No matching package identified.';

    if (primary) {
      packageCode = primary.code;
      packageName = primary.pkg.name;
      packageId = primary.pkg.id;
      confidence = primary.confidence;
      explain = primary.explain;
      reason = primary.reason;
      packagesMap[packageCode] ??= { name: packageName, packageId, isNew: !packageId };
    }

    suggestions.push({
      id: `${line.id}:${packageCode}`,
      budgetLineId: line.id,
      packageCode,
      packageName,
      packageId,
      confidence: Number(confidence.toFixed(3)),
      explain,
      reason,
      alternatives: Array.from(new Set(alternatives.map((alt) => alt.code))),
      alternativeMeta: alternatives,
      isNew: !packageId && packageCode !== 'UNASSIGNED',
    });
  }

  const groups = suggestions.reduce((acc, suggestion) => {
    const code = suggestion.packageCode || 'UNASSIGNED';
    if (!acc[code]) {
      const meta =
        packagesMap[code] || {
          name: code,
          packageId: suggestion.packageId ?? null,
          isNew: suggestion.isNew || code === suggestion.packageCode,
        };
      acc[code] = {
        code,
        name: meta.name || code,
        packageId: meta.packageId ?? null,
        isNew: !!meta.isNew,
        suggestions: [],
      };
    }
    acc[code].suggestions.push(suggestion);
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    suggestions,
    groups: Object.values(groups),
    packages: packagesMap,
  };
}

module.exports = {
  generatePackageSuggestions,
};
