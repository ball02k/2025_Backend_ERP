const express = require('express');
const router = express.Router({ mergeParams: true });
const { z } = require('zod');
const { prisma, toDecimal } = require('../lib/prisma.js');
const { callLLMJSON } = require('../lib/llm.provider.cjs');
const { matchCostCode } = require('../lib/costCodeMatcher.cjs');
const { requireProjectMember } = require('../middleware/membership.cjs');

// Validation schemas
const SuggestionRequestSchema = z.object({
  limit: z.number().int().min(3).max(50).default(10),
  useProjectScope: z.boolean().default(true),
  packageIds: z.array(z.number().int()).default([]),
  useHistorical: z.boolean().default(true),
  notes: z.string().max(500).optional(),
});

const AISuggestionSchema = z.object({
  description: z.string().min(3).max(280),
  qty: z.number().nonnegative(),
  rate: z.number().nonnegative(),
  unit: z.string().max(32).optional(),
  costCodeId: z.number().int().optional(),
  costCodeText: z.string().max(64).optional(),
  packageId: z.number().int().optional(),
  rationale: z.string().max(500).optional(),
});

const AISuggestionsSchema = z.object({
  items: z.array(AISuggestionSchema).max(50),
});

const AcceptItemSchema = z.object({
  description: z.string().min(1).max(280),
  qty: z.number().nonnegative(),
  rate: z.number().nonnegative(),
  unit: z.string().max(32).optional(),
  packageId: z.number().int().optional(),
  costCodeId: z.number().int().optional(),
  groupId: z.number().int().optional(),
});

const AcceptRequestSchema = z.object({
  items: z.array(AcceptItemSchema).min(1).max(50),
});

/**
 * POST /api/projects/:projectId/budgets/suggest
 * Generate AI budget line suggestions
 */
router.post('/:projectId/budgets/suggest', requireProjectMember, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid projectId' } });
    }

    // Validate request body
    const input = SuggestionRequestSchema.parse(req.body);
    const tenantId = req.user?.tenantId || 'demo';

    // 1. Fetch project context
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        sitePostcode: true,
      },
    });

    if (!project) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    // 2. Fetch selected packages
    let packages = [];
    if (input.packageIds.length > 0) {
      packages = await prisma.package.findMany({
        where: {
          projectId,
          id: { in: input.packageIds },
        },
        select: { id: true, name: true, scopeSummary: true, trade: true },
      });
    }

    // 3. Fetch historical budget examples (if requested)
    let budgetExamples = [];
    if (input.useHistorical) {
      budgetExamples = await prisma.budgetLine.findMany({
        where: { tenantId, projectId },
        select: {
          description: true,
          qty: true,
          rate: true,
          unit: true,
          costCode: { select: { code: true, description: true } },
          packageItems: {
            take: 1,
            select: { package: { select: { name: true } } },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });
    }

    // 4. Fetch available cost codes
    const costCodes = await prisma.costCode.findMany({
      where: { tenantId },
      select: { id: true, code: true, description: true },
      orderBy: { code: 'asc' },
      take: 100,
    });

    // 5. Build prompts
    const scopeText = input.useProjectScope && project.description ? project.description : '';

    const packagesText = packages.length > 0
      ? packages.map((p) => `ID ${p.id}: ${p.name}${p.trade ? ` (${p.trade})` : ''}${p.scopeSummary ? ` - ${p.scopeSummary.substring(0, 100)}` : ''}`).join('\n')
      : 'No specific packages selected';

    const examplesText = budgetExamples.length > 0
      ? budgetExamples
          .map((b) => {
            const pkg = b.packageItems[0]?.package?.name || '';
            const cc = b.costCode ? `${b.costCode.code}` : '';
            return `${b.description} | qty:${Number(b.qty)} | rate:${Number(b.rate)} | unit:${b.unit || 'ea'} | code:${cc} | pkg:${pkg}`;
          })
          .join('\n')
      : 'No historical budget lines available';

    const codesText = costCodes.length > 0
      ? costCodes.map((c) => `ID ${c.id} - ${c.code}${c.description ? `: ${c.description}` : ''}`).join('\n')
      : 'No cost codes configured';

    const guidanceText = input.notes || 'Generate realistic, distinct budget lines aligned with project scope and selected packages.';

    const systemPrompt = `You are a construction cost planning assistant that outputs strict JSON of suggested budget lines for a given project. Follow the schema exactly. Do not include explanations outside JSON.`;

    const userPrompt = `PROJECT:
- Name: ${project.name}
- Type: ${project.type || 'n/a'}
- Address: ${project.sitePostcode || 'n/a'}

SCOPE/NOTES:
${scopeText || 'No project scope provided'}

SELECTED PACKAGES:
${packagesText}

RECENT BUDGET EXAMPLES (style + typical magnitudes):
${examplesText}

AVAILABLE COST CODES:
${codesText}

GUIDANCE:
${guidanceText}

OUTPUT REQUIREMENTS:
- Propose up to ${input.limit} **distinct** lines aligned with the scope and packages.
- Prefer available cost codes; if unsure, set costCodeId null and provide costCodeText guess.
- Choose realistic qty and rate values based on examples and scope; keep rationale concise.
- Return items in this structure (follow property names exactly):

{
  "items": [
    {
      "description": "string (3-280 chars)",
      "qty": number >= 0,
      "rate": number >= 0,
      "unit": "string (optional, <=32 chars)",
      "packageId": number (optional),
      "costCodeId": number (optional),
      "costCodeText": "string (optional)",
      "rationale": "string (optional, <=500 chars)"
    }
  ]
}`;

    // JSON Schema for structured output
    const jsonSchema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string', minLength: 3, maxLength: 280 },
              qty: { type: 'number', minimum: 0 },
              rate: { type: 'number', minimum: 0 },
              unit: { type: 'string', maxLength: 32 },
              packageId: { type: 'integer' },
              costCodeId: { type: 'integer' },
              costCodeText: { type: 'string', maxLength: 64 },
              rationale: { type: 'string', maxLength: 500 },
            },
            required: ['description', 'qty', 'rate'],
          },
        },
      },
      required: ['items'],
    };

    // 6. Call LLM (provider-agnostic)
    let aiResponse;
    try {
      aiResponse = await callLLMJSON({
        system: systemPrompt,
        user: userPrompt,
        jsonSchema,
        maxTokens: 4096,
      });
    } catch (error) {
      console.error('[suggest] LLM error:', {
        message: error.message,
        code: error.code,
        preview: JSON.stringify(error).substring(0, 200),
      });
      return res.status(502).json({
        error: {
          code: 'UPSTREAM_INVALID',
          message: 'AI suggestions unavailable. Please try again later.',
        },
      });
    }

    // 7. Validate and process suggestions
    let validated;
    try {
      validated = AISuggestionsSchema.parse(aiResponse);
    } catch (error) {
      console.error('[suggest] Validation error:', error.message, 'Raw:', JSON.stringify(aiResponse).substring(0, 200));
      return res.status(502).json({
        error: {
          code: 'UPSTREAM_INVALID',
          message: 'AI response validation failed',
        },
      });
    }

    // 8. Enrich suggestions with cost code matching and totals
    const suggestions = validated.items.map((item) => {
      let costCodeId = item.costCodeId || null;
      let needsAttention = false;

      // Fuzzy match cost code if not provided but text is
      if (!costCodeId && item.costCodeText) {
        const match = matchCostCode(item.costCodeText, costCodes);
        costCodeId = match.costCodeId;
        needsAttention = match.needsAttention;
      }

      // Compute total
      const qty = Number(item.qty) || 0;
      const rate = Number(item.rate) || 0;
      const total = qty * rate;

      return {
        description: item.description,
        qty,
        rate,
        total,
        unit: item.unit || 'ea',
        packageId: item.packageId || null,
        costCodeId,
        rationale: item.rationale || '',
        needsAttention,
      };
    });

    return res.json({
      projectId,
      count: suggestions.length,
      suggestions,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.errors },
      });
    }

    console.error('[suggest] Unexpected error:', error);
    return res.status(500).json({
      error: { code: 'INTERNAL', message: 'Failed to generate suggestions' },
    });
  }
});

/**
 * POST /api/projects/:projectId/budgets/suggest/accept
 * Accept and persist selected suggestions
 */
router.post('/:projectId/budgets/suggest/accept', requireProjectMember, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid projectId' } });
    }

    const input = AcceptRequestSchema.parse(req.body);
    const tenantId = req.user?.tenantId || 'demo';

    // Prepare budget lines for creation
    const budgetLines = input.items.map((item) => {
      const qty = toDecimal(item.qty, { fallback: 0 });
      const rate = toDecimal(item.rate, { fallback: 0 });
      const total = toDecimal(Number(item.qty) * Number(item.rate), { fallback: 0 });

      return {
        tenantId,
        projectId,
        description: item.description,
        qty,
        rate,
        total,
        amount: total,
        unit: item.unit || 'ea',
        costCodeId: item.costCodeId || null,
        groupId: item.groupId || null,
        position: 0,
        sortOrder: 0,
      };
    });

    // Create budget lines
    const result = await prisma.budgetLine.createMany({
      data: budgetLines,
      skipDuplicates: false,
    });

    // Create package associations if packageId provided
    for (const [idx, item] of input.items.entries()) {
      if (item.packageId) {
        // Find the created budget line ID (since createMany doesn't return IDs directly,
        // we need to query for the most recent lines matching our descriptions)
        const createdLine = await prisma.budgetLine.findFirst({
          where: {
            tenantId,
            projectId,
            description: item.description,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (createdLine) {
          await prisma.packageItem.create({
            data: {
              tenantId,
              packageId: item.packageId,
              budgetLineId: createdLine.id,
            },
          }).catch((err) => {
            // Ignore duplicate errors
            if (!err.code?.includes('Unique')) {
              console.warn('[accept] Failed to link package:', err.message);
            }
          });
        }
      }
    }

    return res.json({ created: result.count });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.errors },
      });
    }

    console.error('[suggest/accept] Error:', error);
    return res.status(500).json({
      error: { code: 'INTERNAL', message: 'Failed to accept suggestions' },
    });
  }
});

module.exports = router;
