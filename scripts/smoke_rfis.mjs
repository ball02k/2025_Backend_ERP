const base = `http://localhost:${process.env.PORT || 3001}/api`;
const j = async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`); return r.json(); };

async function login() {
  const res = await fetch(`${base}/dev/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
  const data = await res.json(); if (!res.ok || !data.token) throw new Error('Login failed'); return data.token;
}

(async () => {
  const token = await login();
  const auth = { Authorization: `Bearer ${token}`, 'x-tenant-id': process.env.TENANT_DEFAULT || 'demo' };
  // Find a project
  const projects = await j(await fetch(`${base}/projects?limit=1&offset=0`, { headers: auth }));
  const projectId = (projects.projects?.[0]?.id) || (projects.items?.[0]?.id);
  if (!projectId) throw new Error('No project found');

  // Create
  const created = await j(await fetch(`${base}/rfis`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify({ projectId, rfiNumber: `RFI-${Date.now()}`, subject: 'Smoke RFI', question: 'What is the detail?', status: 'open' }) }));
  const id = created.id || created.data?.id;

  // Get
  await j(await fetch(`${base}/rfis/${id}`, { headers: auth }));

  // List
  await j(await fetch(`${base}/rfis?projectId=${projectId}`, { headers: auth }));

  // Patch
  await j(await fetch(`${base}/rfis/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify({ status: 'answered', responseText: 'See attached', respondedAt: new Date().toISOString() }) }));

  // Delete
  const del = await fetch(`${base}/rfis/${id}`, { method: 'DELETE', headers: auth });
  if (!del.ok) throw new Error(`Delete failed ${del.status}`);

  console.log('RFIs smoke OK');
})().catch((e) => { console.error(String(e)); process.exit(1); });

