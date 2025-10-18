// lib/llm.provider.cjs
const fetch = require('node-fetch');
const { log } = require('./logger.cjs');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const MODEL_PROVIDER = (process.env.MODEL_PROVIDER || 'ollama').toLowerCase();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '25000', 10); // 25s

console.log('[LLM] Initialized with provider:', MODEL_PROVIDER, OPENAI_API_KEY ? '(OpenAI key present)' : '(No OpenAI key)');

function buildJsonGuardPrompt(userPrompt, schemaHint) {
  return [
    'You are a backend microservice that returns ONLY strict JSON.',
    'DO NOT include prose, explanations, or markdown—return a single JSON object.',
    schemaHint ? `Schema (informal): ${schemaHint}` : null,
    '',
    'Reply with one valid JSON object that conforms to the schema. NOTHING else.',
    '',
    userPrompt,
  ].filter(Boolean).join('\n');
}

async function fetchWithTimeout(url, options, label) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
  try {
    log(`[LLM] → ${label} ${url}`);
    const res = await fetch(url, { ...options, signal: ac.signal });
    log(`[LLM] ← ${label} ${res.status}`);
    return res;
  } catch (err) {
    log(`[LLM] ✖ ${label} error:`, err?.name, err?.message);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

async function callOpenAI({ system, prompt, schemaHint }) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      system ? { role: 'system', content: system } : null,
      { role: 'user', content: buildJsonGuardPrompt(prompt, schemaHint) },
    ].filter(Boolean),
    temperature: 0.2,
  };
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }, 'openai');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '{}';
  return JSON.parse(content);
}

async function callOllama({ system, prompt, schemaHint }) {
  // Use generate (single shot) with strict JSON prompt guard
  const res = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: [
        system ? `SYSTEM:\n${system}\n` : '',
        buildJsonGuardPrompt(prompt, schemaHint),
      ].join('\n'),
      options: {
        temperature: 0.2,
        top_p: 0.9,
      },
      stream: false,
    }),
  }, 'ollama');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }
  const data = await res.json();
  // Ollama returns a "response" string; ensure we parse JSON only
  const raw = (data.response || '').trim();
  // Try to extract first JSON object if model prepends text by mistake
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  const jsonSlice = firstBrace >= 0 && lastBrace > firstBrace ? raw.slice(firstBrace, lastBrace + 1) : raw;
  return JSON.parse(jsonSlice);
}

async function generateJSON({ system, prompt, schemaHint } = {}) {
  // 1) Prefer OpenAI when key present
  if (OPENAI_API_KEY) {
    try {
      log('[LLM] Using OpenAI');
      return await callOpenAI({ system, prompt, schemaHint });
    } catch (err) {
      log('[LLM] OpenAI failed, considering fallback:', err?.message);
      // fall through to Ollama if allowed
      if (MODEL_PROVIDER !== 'ollama') throw err;
    }
  }
  // 2) Fallback / default → Ollama
  log('[LLM] Using Ollama');
  return callOllama({ system, prompt, schemaHint });
}

module.exports = {
  generateJSON,
};
