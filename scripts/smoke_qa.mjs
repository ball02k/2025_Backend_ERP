const base = `http://localhost:${process.env.PORT || 3001}/api`;
const j = async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`); return r.json(); };

async function login() { const r = await fetch(`${base}/dev/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) }); const x = await r.json(); if (!r.ok || !x.token) throw new Error('Login failed'); return x.token; }

(async () => {
  const token = await login(); const auth = { Authorization: `Bearer ${token}`, 'x-tenant-id': process.env.TENANT_DEFAULT || 'demo' };
  const p = await j(await fetch(`${base}/projects?limit=1&offset=0`, { headers: auth }));
  const projectId = (p.projects?.[0]?.id) || (p.items?.[0]?.id);
  if (!projectId) throw new Error('No project found');

  const rec = await j(await fetch(`${base}/qa/records`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify({ projectId, type: 'inspection', title: 'Smoke QA Record', status: 'open' }) }));
  const recId = rec.id || rec.data?.id;
  await j(await fetch(`${base}/qa/records/${recId}`, { headers: auth }));
  await j(await fetch(`${base}/qa/records/${recId}/items`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify({ item: 'Check anchor fixings', result: 'open' }) }));
  await j(await fetch(`${base}/qa/records`, { headers: auth }));
  await j(await fetch(`${base}/qa/records/${recId}`, { method: 'PATCH', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify({ status: 'pass', closedAt: new Date().toISOString() }) }));
  const del = await fetch(`${base}/qa/records/${recId}`, { method: 'DELETE', headers: auth });
  if (!del.ok) throw new Error(`Delete failed ${del.status}`);
  console.log('QA smoke OK');
})().catch((e)=>{ console.error(String(e)); process.exit(1); });

