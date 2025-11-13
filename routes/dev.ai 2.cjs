// routes/dev.ai.cjs
const express = require('express');
const router = express.Router();
const { generateJSON } = require('../lib/llm.provider.cjs');

router.post('/echo', async (req, res) => {
  try {
    const { prompt, schemaHint } = req.body || {};
    const json = await generateJSON({
      system: 'Return only valid JSON. No prose.',
      prompt: prompt || 'Return {"ok": true, "note": "pong"}',
      schemaHint: schemaHint || 'object { ok: boolean, note: string }',
    });
    return res.json(json);
  } catch (err) {
    console.error('[dev.ai.echo] error', err);
    return res.status(500).json({ error: 'ai_failed', detail: String(err?.message || err) });
  }
});

module.exports = router;
