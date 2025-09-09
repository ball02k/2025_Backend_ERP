const base = `http://localhost:${process.env.PORT || 3001}/api`;
const j = async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`); return r.json(); };

async function login(){ const r = await fetch(`${base}/dev/login`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({}) }); const x = await r.json(); if(!r.ok||!x.token) throw new Error('Login failed'); return x.token; }

(async () => {
  const token = await login(); const auth = { Authorization: `Bearer ${token}`, 'x-tenant-id': process.env.TENANT_DEFAULT || 'demo' };
  const p = await j(await fetch(`${base}/projects?limit=1&offset=0`, { headers: auth }));
  const projectId = (p.projects?.[0]?.id) || (p.items?.[0]?.id);
  if (!projectId) throw new Error('No project found');

  const body = { projectId, scope:'1', category:'Fuel-diesel', activityDate: new Date().toISOString(), quantity: 10, unit:'L', emissionFactor: 2.68, factorUnit:'kgCO2e/unit', periodMonth: (new Date().getUTCMonth()+1), periodYear: (new Date().getUTCFullYear()) };
  const created = await j(await fetch(`${base}/carbon/entries`, { method:'POST', headers:{'content-type':'application/json', ...auth}, body: JSON.stringify(body) }));
  const id = created.id || created.data?.id;
  await j(await fetch(`${base}/carbon/entries/${id}`, { headers: auth }));
  await j(await fetch(`${base}/carbon/entries?projectId=${projectId}`, { headers: auth }));
  await j(await fetch(`${base}/carbon/entries/${id}`, { method:'PATCH', headers:{'content-type':'application/json', ...auth}, body: JSON.stringify({ quantity: 12 }) }));
  const del = await fetch(`${base}/carbon/entries/${id}`, { method:'DELETE', headers: auth }); if(!del.ok) throw new Error(`Delete failed ${del.status}`);
  console.log('Carbon smoke OK');
})().catch((e)=>{ console.error(String(e)); process.exit(1); });

