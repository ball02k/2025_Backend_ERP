const Anthropic = require('@anthropic-ai/sdk');

/**
 * Call Claude with strict JSON schema output
 * @param {Object} options
 * @param {string} options.system - System prompt
 * @param {string} options.user - User prompt
 * @param {Object} options.jsonSchema - JSON schema for structured output
 * @param {number} [options.maxTokens=4096] - Max tokens for response
 * @param {string} [options.model='claude-3-5-sonnet-20241022'] - Model to use
 * @returns {Promise<Object>} Parsed JSON response
 */
async function callClaude({ system, user, jsonSchema, maxTokens = 4096, model = 'claude-3-5-sonnet-20241022' }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [
        {
          role: 'user',
          content: user,
        },
      ],
      tools: [
        {
          name: 'generate_suggestions',
          description: 'Generate budget line suggestions in structured format',
          input_schema: jsonSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'generate_suggestions' },
    });

    // Extract tool use result
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse) {
      throw new Error('No tool use in Claude response');
    }

    return toolUse.input;
  } catch (error) {
    console.error('[llm.claude] Error calling Claude:', {
      message: error.message,
      code: error.code,
      type: error.type,
    });
    throw error;
  }
}

module.exports = { callClaude };
