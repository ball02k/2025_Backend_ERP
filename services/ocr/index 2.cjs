const { HttpOcr } = require('./providers/http.cjs');
const { StubOcr } = require('./providers/stub.cjs');

const OCR_MODE = process.env.OCR_MODE || 'stub'; // 'stub' | 'http'
const OCR_HTTP_URL = process.env.OCR_HTTP_URL || '';
const OCR_HTTP_KEY = process.env.OCR_HTTP_KEY || '';

let provider;
if (OCR_MODE === 'http' && OCR_HTTP_URL) provider = new HttpOcr(OCR_HTTP_URL, OCR_HTTP_KEY);
else provider = new StubOcr();

function getOcrProvider() { return provider; }

module.exports = { getOcrProvider };

