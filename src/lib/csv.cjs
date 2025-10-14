// Tiny CSV helpers: parse and stringify using basic split/join.
// Handles quotes for commas and trims whitespace. No external deps.

function parse(csvText) {
  const text = String(csvText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\uFEFF/, '');
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  const split = (line) => {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
      else { cur += ch; }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = split(lines[0]).map((h) => String(h || '').trim());
  const rows = lines.slice(1).map((l) => {
    const cells = split(l);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ''));
    return obj;
  });
  return { headers, rows };
}

function esc(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function stringify(headers, rows) {
  const head = headers.join(',');
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(',')).join('\n');
  return [head, body].filter(Boolean).join('\n');
}

module.exports = { parse, stringify };

