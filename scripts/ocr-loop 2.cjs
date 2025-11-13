#!/usr/bin/env node
process.env.JEST_WORKER_ID = process.env.JEST_WORKER_ID || '1';
const { runOcrWorkerOnce } = require('../workers/ocrWorker.cjs');

async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

(async function main(){
  console.log('[ocr-loop] starting');
  while (true) {
    try {
      await runOcrWorkerOnce();
    } catch (e) {
      console.error('[ocr-loop] error:', e && e.message || e);
    }
    await sleep(1000);
  }
})();

