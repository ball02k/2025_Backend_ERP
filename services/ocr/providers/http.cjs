class HttpOcr {
  constructor(url, apiKey) {
    this.url = url;
    this.apiKey = apiKey;
  }
  async extractInvoiceFields(input) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify(input || {}),
    });
    if (!res.ok) throw new Error(`OCR HTTP error ${res.status}`);
    const data = await res.json();
    return { provider: 'http', ...data };
  }
}

module.exports = { HttpOcr };

