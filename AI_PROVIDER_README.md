# AI Provider Configuration

This backend now supports **provider-agnostic AI** integration, allowing you to choose between:
- **OpenAI** (commercial, requires API key)
- **Ollama** (free/local, runs on your machine)

## Quick Start

### Option 1: OpenAI (Recommended for Production)

1. Set environment variables in `.env`:
   ```bash
   MODEL_PROVIDER=openai
   OPENAI_API_KEY=sk-your-actual-api-key-here
   ```

2. Restart the backend server:
   ```bash
   npm run dev
   ```

3. You should see in the logs:
   ```
   [LLM] Initialized with provider: openai
   ```

### Option 2: Ollama (Free/Local)

1. Install Ollama:
   ```bash
   # macOS
   brew install ollama

   # Or download from https://ollama.ai
   ```

2. Pull a model (recommended: llama3.1:8b):
   ```bash
   ollama pull llama3.1:8b
   ```

3. Start Ollama server:
   ```bash
   ollama serve
   ```

4. Set environment variables in `.env`:
   ```bash
   MODEL_PROVIDER=ollama
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=llama3.1:8b
   ```

5. Restart the backend server:
   ```bash
   npm run dev
   ```

6. You should see in the logs:
   ```
   [LLM] Initialized with provider: ollama
   [LLM] Using Ollama at http://localhost:11434 with model llama3.1:8b
   ```

## How It Works

All AI-powered features (budget suggestions, package suggestions, etc.) now use the unified `callLLMJSON()` function from `lib/llm.provider.cjs`.

### Supported Features
- ✅ Budget line suggestions (`POST /api/projects/:id/budgets/suggest`)
- ✅ Package suggestions (future endpoints)
- ✅ Structured JSON output with schema validation

### Implementation Details

The provider automatically routes requests based on `MODEL_PROVIDER`:

```javascript
const { callLLMJSON } = require('./lib/llm.provider.cjs');

const result = await callLLMJSON({
  system: 'You are a construction cost assistant...',
  user: 'Generate budget lines for...',
  jsonSchema: { type: 'object', properties: {...} },
  maxTokens: 1200
});
```

**OpenAI Mode:**
- Uses `gpt-4o-mini` model
- Leverages JSON Schema mode for strict output
- Requires valid `OPENAI_API_KEY`

**Ollama Mode:**
- Uses local model (default: `llama3.1:8b`)
- Includes schema in prompt with extraction logic
- No API key required (100% free)

## Switching Providers

Simply change `MODEL_PROVIDER` in your `.env` file and restart:

```bash
# Switch to OpenAI
MODEL_PROVIDER=openai

# Switch to Ollama
MODEL_PROVIDER=ollama
```

## Troubleshooting

### OpenAI Errors
- **"OPENAI_API_KEY not configured"**: Add your API key to `.env`
- **401 Unauthorized**: Check your API key is valid
- **429 Rate Limit**: You've exceeded your OpenAI quota

### Ollama Errors
- **"Ollama API error"**: Ensure Ollama is running (`ollama serve`)
- **"Model not found"**: Pull the model first (`ollama pull llama3.1:8b`)
- **Connection refused**: Check `OLLAMA_BASE_URL` points to correct host/port

### General
- Check logs for `[LLM] Initialized with provider: <provider>` to confirm active provider
- All LLM calls log `[LLM] Calling provider: <provider>, maxTokens: <n>`

## Migration Notes

### Removed Dependencies
- ❌ `@anthropic-ai/sdk` (Claude-specific)

### Added Dependencies
- ✅ `node-fetch@3.3.2` (for HTTP requests to OpenAI/Ollama)

### Breaking Changes
- None! All API endpoints remain identical
- Frontend code requires zero changes
- Only backend `.env` configuration changes

## Performance Comparison

| Provider | Speed | Cost | Quality | Local |
|----------|-------|------|---------|-------|
| OpenAI (gpt-4o-mini) | Fast | ~$0.15/1M tokens | Excellent | No |
| Ollama (llama3.1:8b) | Medium | Free | Good | Yes |

## Recommended Setup

- **Development**: Use Ollama (free, no API key needed)
- **Production**: Use OpenAI (faster, more reliable, better quality)

## Example Output

Both providers return identical structured JSON:

```json
{
  "items": [
    {
      "description": "Concrete foundation slab",
      "qty": 120,
      "rate": 85.50,
      "unit": "m²",
      "costCodeId": 5,
      "packageId": null,
      "rationale": "Based on project scope and historical rates"
    }
  ]
}
```

## Support

For issues or questions:
1. Check this README
2. Review logs for `[LLM]` prefixed messages
3. Verify `.env` configuration matches your chosen provider
4. Ensure provider service is running (OpenAI API or Ollama server)
