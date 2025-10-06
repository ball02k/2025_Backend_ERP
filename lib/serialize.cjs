function safeJson(x) {
  return JSON.parse(JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

module.exports = { safeJson };

