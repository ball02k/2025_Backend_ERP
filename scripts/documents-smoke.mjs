const base = `http://localhost:${process.env.PORT || 3001}/api`;
const j = async (r) => {
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  }
  return r.json();
};

(async () => {
  const created = await j(
    await fetch(`${base}/documents/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        storageProvider: 'local',
        storageKey: `smoke-${Date.now()}`,
        fileName: 'smoke.txt',
        size: 123,
        contentType: 'text/plain',
      }),
    })
  );

  const docId = created.data.id;

  const g1 = await fetch(`${base}/documents/${docId}`).then((r) => r.json());
  console.log('getById:', !!g1.data);

  await fetch(`${base}/documents/${docId}/link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: 1 }),
  }).then((r) => r.json());

  const listQ = await fetch(
    `${base}/documents?q=${encodeURIComponent(created.data.fileName.split('.')[0])}`
  ).then((r) => r.json());
  console.log('filter q count:', listQ.meta?.total, listQ.data?.length);

  await fetch(`${base}/documents/${docId}/unlink`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: 1 }),
  }).then((r) => r.json());

  const del = await fetch(`${base}/documents/${docId}`, {
    method: 'DELETE',
  }).then((r) => r.json());
  console.log('deleted:', !!del.data?.is_deleted);
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
