import React from 'react';
import { apiGet, apiPost } from '@/lib/api';

export default function AddFromLibrary({ entityType, entityId, onAdded }) {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState([]);
  const [busy, setBusy] = React.useState(false);

  const search = async () => {
    setBusy(true);
    try {
      const res = await apiGet(`/api/documents`, { q, limit: 20, orderBy: 'createdAt.desc' });
      setRows(Array.isArray(res) ? res : (res.items || []));
    } finally {
      setBusy(false);
    }
  };

  const link = async (docId) => {
    await apiPost(`/api/documents/${String(docId)}/link`, { entityType, entityId });
    onAdded?.();
  };

  return (
    <div className="rounded-xl border p-3">
      <div className="flex gap-2">
        <input className="flex-1 rounded-md border px-2 py-1 text-sm" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search library…" />
        <button onClick={search} disabled={busy} className="rounded-md border px-3 py-1.5 text-sm">{busy ? 'Searching…' : 'Search'}</button>
      </div>
      <ul className="mt-2 space-y-1">
        {rows.map((d) => (
          <li key={String(d.id)} className="flex items-center justify-between rounded border px-2 py-1">
            <span className="truncate">{d.title || d.filename || `Document ${String(d.id)}`}</span>
            <button onClick={()=>link(d.id)} className="text-sm underline">Link</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

