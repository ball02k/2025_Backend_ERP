const api = `http://localhost:${process.env.PORT || 3001}/api`;
const base = `${api}/variations`;
const j = async (r) => {
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  }
  return r.json();
};

async function login() {
  const res = await fetch(`http://localhost:${process.env.PORT || 3001}/api/dev/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  const data = await res.json();
  if (!res.ok || !data.token) throw new Error('Login failed');
  return data.token;
}

(async () => {
  const token = await login();
  const auth = { Authorization: `Bearer ${token}`, 'x-tenant-id': process.env.TENANT_DEFAULT || 'demo' };

  const projs = await j(await fetch(`${api}/projects?limit=1`, { headers: auth }));
  const projectId = projs.projects?.[0]?.id || 1;
  const list = await j(await fetch(`${base}?projectId=${projectId}&limit=3`, { headers: auth }));
  const count = (Array.isArray(list.items) ? list.items.length : Array.isArray(list.data) ? list.data.length : 0);
  console.log('list.count', count, 'projectId', projectId);

  const created = await j(await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({
      projectId,
      title: 'Smoke test',
      reference: `CE-${Date.now()}`,
      contractType: 'NEC4',
      status: 'proposed',
      type: 'compensation_event',
      value: '2500.00',
      costImpact: '2000.00',
      lines: [ { description: 'Paint', qty: '5.000', rate: '100.00', value: '500.00', sort: 1 } ]
    })
  }));
  console.log('created.id', created.data?.id, 'status', created.data?.status);

  const detail = await j(await fetch(`${base}/${created.data.id}`, { headers: auth }));
  console.log('detail.lines', Array.isArray(detail.data?.lines) ? detail.data.lines.length : 0);

  const st = await j(await fetch(`${base}/${created.data.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ toStatus: 'approved' })
  }));
  console.log('status.now', st.data?.status);
})().catch(e => { console.error(String(e)); process.exit(1); });
