/**
 * Provider-agnostic LLM utility
 * Supports OpenAI and Ollama (free/local) based on MODEL_PROVIDER env var
 */

const PROVIDER = process.env.MODEL_PROVIDER || 'openai';

console.log(`[LLM] Initialized with provider: ${PROVIDER}`);

/**
 * Call LLM with JSON schema output
 * @param {Object} options
 * @param {string} options.system - System prompt
 * @param {string} options.user - User prompt
 * @param {Object} options.jsonSchema - JSON schema for structured output
 * @param {number} [options.maxTokens=1200] - Max tokens for response
 * @returns {Promise<Object>} Parsed JSON response
 */
async function callLLMJSON({ system, user, jsonSchema, maxTokens = 1200 }) {
  console.log(`[LLM] Calling provider: ${PROVIDER}, maxTokens: ${maxTokens}`);

  if (PROVIDER === 'openai') {
    return await callOpenAI({ system, user, jsonSchema, maxTokens });
  }

  if (PROVIDER === 'ollama') {
    return await callOllama({ system, user, jsonSchema, maxTokens });
  }

  throw new Error(`Unknown MODEL_PROVIDER: ${PROVIDER}. Expected 'openai' or 'ollama'.`);
}

/**
 * OpenAI implementation using JSON schema mode
 */
async function callOpenAI({ system, user, jsonSchema, maxTokens }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured. Set it in your .env file.');
  }

  try {
    const fetch = (await import('node-fetch')).default;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: maxTokens,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'ERPOutput',
            schema: jsonSchema,
            strict: true,
          },
        },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[LLM] OpenAI error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    // Extract content from OpenAI response
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('[LLM] OpenAI call failed:', error.message);
    throw error;
  }
}

/**
 * Ollama implementation (free/local)
 */
async function callOllama({ system, user, jsonSchema, maxTokens }) {
  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';

  console.log(`[LLM] Using Ollama at ${base} with model ${model}`);

  const prompt = `${system}

---

${user}

---

IMPORTANT: Return ONLY valid JSON matching this exact schema. Do not include any explanatory text before or after the JSON.

Schema: ${JSON.stringify(jsonSchema, null, 2)}`;

  try {
    const fetch = (await import('node-fetch')).default;

    const response = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          num_predict: maxTokens,
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[LLM] Ollama error:', response.status, errorText);
      throw new Error(`Ollama API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const responseText = data.response;

    if (!responseText) {
      throw new Error('No response from Ollama');
    }

    // Extract JSON from response (Ollama might include extra text)
    const extracted = extractJSON(responseText);
    return JSON.parse(extracted);
  } catch (error) {
    console.error('[LLM] Ollama call failed:', error.message);
    throw error;
  }
}

/**
 * Extract JSON object from text that might contain extra content
 */
function extractJSON(text) {
  // Try to find JSON object boundaries
  const startIndex = text.indexOf('{');
  const endIndex = text.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    // Try array format
    const arrStart = text.indexOf('[');
    const arrEnd = text.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
      return text.slice(arrStart, arrEnd + 1);
    }
    throw new Error('No JSON found in response');
  }

  return text.slice(startIndex, endIndex + 1);
}

module.exports = { callLLMJSON };
