import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { apiGet, apiPost, toastErr, toastOk } from '@/lib/api';

export default function PackagesPage() {
  const { id: projectId } = useParams();
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [budget, setBudget] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', tradeCategory: '', attachments: [], budgetIds: [] });

  async function load() {
    setLoading(true); setError('');
    try {
      const data = await apiGet(`/api/projects/${projectId}/packages`);
      const list = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
      setItems(list);
    } catch (e) { setError(e?.message || 'Failed to load packages'); }
    setLoading(false);
  }
  async function loadBudget() {
    try {
      const data = await apiGet(`/api/projects/${projectId}/budget`);
      setBudget(Array.isArray(data?.items) ? data.items : []);
    } catch { setBudget([]); }
  }
  useEffect(() => { if (projectId) { load(); } }, [projectId]);

  const totalById = useMemo(() => {
    const map = new Map();
    items.forEach((p) => map.set(p.id, Number(p.budgetTotal || 0)));
    return map;
  }, [items]);

  async function createPackage(e) {
    e?.preventDefault?.();
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        tradeCategory: form.tradeCategory || null,
        attachments: (form.attachments && form.attachments.length) ? form.attachments : null,
        budgetIds: form.budgetIds || [],
      };
      const created = await apiPost(`/api/projects/${projectId}/packages`, payload);
      toastOk('Package created');
      setShowCreate(false);
      setForm({ name: '', description: '', tradeCategory: '', attachments: [], budgetIds: [] });
      setItems((prev) => [created, ...prev]);
    } catch (e) { toastErr(e, 'Failed to create package'); }
  }

  async function createTender(pkg) {
    try {
      await apiPost(`/api/projects/${projectId}/packages/${pkg.id}/create-tender`, { title: `RFx for ${pkg.name}` });
      toastOk('RFx draft created');
    } catch (e) { toastErr(e, 'Failed to create tender'); }
  }

  if (loading) return <div className="p-4 text-sm text-slate-600">Loading packages…</div>;
  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Packages</h1>
        <button
          className="border rounded px-3 py-2"
          onClick={() => { setShowCreate(true); loadBudget(); }}
        >New Package</button>
      </div>
      <table className="w-full text-sm border rounded overflow-hidden">
        <thead className="bg-slate-100">
          <tr>
            <th className="text-left p-2">Name</th>
            <th className="text-left p-2">Trade Category</th>
            <th className="text-right p-2">Budget Total</th>
            <th className="text-left p-2">Status</th>
            <th className="text-left p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="p-2">
                <Link className="text-blue-700 hover:underline" to={`/projects/${projectId}/packages/${p.id}`}>{p.name}</Link>
              </td>
              <td className="p-2">{p.tradeCategory || p.trade || ''}</td>
              <td className="p-2 text-right">{(totalById.get(p.id) || 0).toFixed(2)}</td>
              <td className="p-2">{p.status}</td>
              <td className="p-2">
                <button className="text-blue-700 mr-3" onClick={() => nav(`/projects/${projectId}/packages/${p.id}`)}>View</button>
                <button className="text-blue-700" onClick={() => createTender(p)}>Create Tender</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showCreate && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowCreate(false)} />
          <div className="absolute left-1/2 top-16 -translate-x-1/2 w-full max-w-2xl bg-white rounded-xl shadow-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Create Package</div>
              <button className="border rounded px-2 py-1" onClick={() => setShowCreate(false)}>Close</button>
            </div>
            <form className="space-y-3" onSubmit={createPackage}>
              <div>
                <label className="block text-sm mb-1">Name</label>
                <input className="border rounded w-full px-2 py-1" value={form.name} onChange={e=>setForm(f=>({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-sm mb-1">Description</label>
                <textarea className="border rounded w-full px-2 py-1" value={form.description} onChange={e=>setForm(f=>({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm mb-1">Trade Category</label>
                <input className="border rounded w-full px-2 py-1" value={form.tradeCategory} onChange={e=>setForm(f=>({ ...f, tradeCategory: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm mb-1">Budget Lines</label>
                <div className="h-56 overflow-auto border rounded p-2 space-y-1">
                  {budget.map((b) => (
                    <label key={b.id} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" checked={(form.budgetIds||[]).includes(b.id)} onChange={(e)=>{
                        const checked = e.target.checked;
                        setForm((f)=>{
                          const set = new Set(f.budgetIds || []);
                          if (checked) set.add(b.id); else set.delete(b.id);
                          return { ...f, budgetIds: Array.from(set) };
                        });
                      }} />
                      <div className="grow">
                        <div className="truncate">{b.code || b.description || `#${b.id}`}</div>
                        {!!(b.packages||[]).length && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(b.packages||[]).map((p) => (
                              <a key={p.id} href={`/projects/${projectId}/packages/${p.id}`} className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[11px]">{p.name}</a>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-slate-600 whitespace-nowrap">{Number(b.amount||0).toFixed(2)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1">Attachment IDs (comma-separated)</label>
                <input className="border rounded w-full px-2 py-1" placeholder="e.g. 101,102" onChange={e=>{
                  const parts = String(e.target.value||'').split(',').map(s=>s.trim()).filter(Boolean);
                  setForm(f=>({ ...f, attachments: parts }));
                }} />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button type="button" className="border rounded px-3 py-2" onClick={()=>setShowCreate(false)}>Cancel</button>
                <button className="border rounded px-3 py-2 bg-slate-900 text-white">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
