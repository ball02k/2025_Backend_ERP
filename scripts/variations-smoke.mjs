const base = `http://localhost:${process.env.PORT || 3001}/api/variations`;
const j = async (r)=>{ if(!r.ok){ throw new Error(`HTTP ${r.status}: ${await r.text()}`);} return r.json(); };

(async () => {
  const list = await j(await fetch(`${base}?limit=3`));
  console.log('list.meta', list.meta, 'count', list.data.length);

  const created = await j(await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: 1, type: 'VARIATION', title: 'Smoke test', referenceCode: `VAR-${Date.now()}`, status: 'draft',
      lines: [{ description: 'Paint', qty: 5, unit: 'hr', unit_cost: 30, unit_sell: 50 }]
    })
  }));
  console.log('created.id', created.data?.id, 'status', created.data?.status);

  const detail = await j(await fetch(`${base}/${created.data.id}`));
  console.log('detail.totals', detail.data?.totals);

  const st = await j(await fetch(`${base}/${created.data.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toStatus: 'submitted', note: 'Sent to QS' })
  }));
  console.log('status.now', st.data?.status);
})().catch(e => { console.error(String(e)); process.exit(1); });
