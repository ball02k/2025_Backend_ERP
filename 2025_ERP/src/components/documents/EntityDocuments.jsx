import React from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { isDemo } from "@/lib/demo";

const ACCEPT = [
  "application/pdf","application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png","image/jpeg"
];
const MAX_MB = 25;

export default function EntityDocuments({ entityType, entityId, projectId, title = "Documents" }) {
  const [filters, setFilters] = React.useState({ q: "", category: "" });
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ entityType, entityId: String(entityId) });
      if (filters.category) qs.set("category", filters.category);
      const res = await apiGet(`/api/documents/links?${qs.toString()}`);
      const items = Array.isArray(res) ? res : (res.items || []);
      const list = items
        .map((x) => ({ ...x, ...(x.document || {}) }))
        .filter((x) => !filters.q || ((x.title || x.filename || "").toLowerCase().includes(filters.q.toLowerCase())));
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, filters]);

  React.useEffect(() => { load(); }, [load]);

  async function initUpload(file) {
    const init = await apiPost('/api/documents/init', { filename: file.name, mimeType: file.type });
    const { storageKey, uploadUrl, provider, token } = init?.data || init;
    if (!storageKey) throw new Error('No storageKey');

    // local provider: PUT file stream to /api/documents/upload/:key with token
    if (provider === 'local' || uploadUrl?.includes('/api/documents/upload/')) {
      const url = uploadUrl || `/api/documents/upload/${encodeURIComponent(storageKey)}?token=${encodeURIComponent(token || '')}`;
      const resp = await fetch(url, { method: 'PUT', body: file });
      if (!resp.ok) throw new Error('Upload failed');
      const body = await resp.json().catch(() => ({}));
      return { storageKey, size: body?.data?.size || file.size };
    }

    // s3: browser uploads directly to signed URL
    if (uploadUrl) {
      const resp = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
      if (!resp.ok) throw new Error('S3 upload failed');
      return { storageKey, size: file.size };
    }

    throw new Error('Unsupported storage provider');
  }

  async function onUploadFiles(files) {
    setBusy(true);
    try {
      for (const f of files) {
        if (f.size > MAX_MB * 1024 * 1024) { console.warn(`File too large: ${f.name}`); continue; }
        if (ACCEPT.length && !ACCEPT.includes(f.type)) { console.warn(`Unsupported type for ${f.name}`); continue; }

        try {
          const up = await initUpload(f);
          const completed = await apiPost('/api/documents/complete', {
            storageKey: up.storageKey,
            filename: f.name,
            mimeType: f.type || 'application/octet-stream',
            size: up.size,
            entityType,
            entityId,
            category: filters.category || null,
            // Optional project context for back-compat reports
            projectId: projectId || null,
          });
          const id = completed?.data?.id || completed?.id;
          if (!id) console.warn('Upload complete but no document id');
        } catch (e) {
          console.error('Failed to upload', f.name, e);
        }
      }
    } finally {
      setBusy(false);
      await load();
    }
  }

  async function unlink(documentId) {
    if (!confirm('Remove this document from the record (file remains in library)?')) return;
    await apiDelete(`/api/documents/${String(documentId)}/link`, { entityType, entityId });
    await load();
  }

  return (
    <section aria-labelledby="docs-title" className="rounded-2xl border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 id="docs-title" className="text-base font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search title/filename…"
            value={filters.q}
            onChange={(e)=>setFilters(f=>({ ...f, q: e.target.value }))}
            className="w-56 rounded-md border px-2 py-1 text-sm"
            aria-label="Search documents"
          />
          <select
            value={filters.category}
            onChange={(e)=>setFilters(f=>({ ...f, category: e.target.value }))}
            className="rounded-md border px-2 py-1 text-sm"
            aria-label="Filter by category"
            title="Filter by category"
          >
            <option value="">All categories</option>
            {["Contract","Insurance","H&S","Certificate","Drawing","Spec","RFI","QA","Carbon","Invoice","PO","Other"].map(x=> (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
          <a
            className="rounded-md border px-2 py-1 text-sm"
            href={`/documents?entityType=${encodeURIComponent(entityType)}&entityId=${entityId}`}
            title="Open in Documents library"
          >Open in Documents</a>
          <label className={`rounded-md ${busy? 'bg-slate-400':'bg-blue-600 hover:bg-blue-700'} px-3 py-1.5 text-sm text-white cursor-pointer`}>
            Upload
            <input
              type="file"
              multiple
              onChange={(e)=> onUploadFiles(Array.from(e.target.files || []))}
              accept={ACCEPT.join(",")}
              className="hidden"
              aria-label="Upload documents"
              disabled={busy}
            />
          </label>
        </div>
      </div>

      <div className="overflow-x-auto p-3">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th scope="col" className="px-2 py-1">Document</th>
              <th scope="col" className="px-2 py-1">Project</th>
              <th scope="col" className="px-2 py-1">Category</th>
              <th scope="col" className="px-2 py-1">Type / Size</th>
              <th scope="col" className="px-2 py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-500">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-2 py-6 text-center text-gray-500">No documents yet.</td></tr>
            )}
            {!loading && rows.map((d) => (
              <tr key={`${String(d.id)}-${String(d.entityId||entityId)}`} className="hover:bg-slate-50">
                <td className="px-2 py-1">
                  <a href={`/documents/${String(d.id)}`} className="text-blue-700 hover:underline">
                    {d.title || d.filename || `Document ${String(d.id)}`}
                  </a>
                </td>
                <td className="px-2 py-1">
                  {d.projectId ? (
                    <a href={`/projects/${Number(d.projectId)}`} className="text-blue-700 hover:underline">Project #{Number(d.projectId)}</a>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-2 py-1">{d.category || filters.category || "—"}</td>
                <td className="px-2 py-1 text-gray-600">{(d.mimeType || "file")}{d.size ? ` · ${Math.round(d.size/1024)} KB` : ""}</td>
                <td className="px-2 py-1">
                  {d.id && (
                    <div className="flex items-center gap-3">
                      <a href={`/api/documents/${String(d.id)}/download`} className="underline">Download</a>
                      <button
                        onClick={() => { if (!isDemo()) unlink(d.id); }}
                        aria-disabled={isDemo()}
                        title={isDemo() ? 'Disabled in demo' : 'Unlink'}
                        className="text-red-700 underline"
                      >
                        Unlink
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
