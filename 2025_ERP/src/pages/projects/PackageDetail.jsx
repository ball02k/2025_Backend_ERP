import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiPost, toastErr, toastOk } from '@/lib/api';

export default function PackageDetail(){
  const { id: projectId, packageId } = useParams();
  const nav = useNavigate();
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showTender, setShowTender] = useState(false);
  const [tenderForm, setTenderForm] = useState({ title: '', issueDate: '', dueDate: '' });

  async function load(){
    setLoading(true); setError('');
    try {
      const data = await apiGet(`/api/projects/${projectId}/packages/${packageId}`);
      setPkg(data);
      setTenderForm((f)=>({ ...f, title: `RFx for ${data?.name || ''}` }));
    } catch(e){ setError(e?.message || 'Failed to load package'); }
    setLoading(false);
  }
  useEffect(()=>{ if(projectId && packageId) load(); }, [projectId, packageId]);

  const budgetTotal = useMemo(()=>{
    if (!pkg) return 0;
    return (pkg.budgetItems||[]).reduce((s,bi)=> s + Number(bi?.budgetLine?.amount || 0), 0);
  }, [pkg]);

  async function createTender(e){
    e?.preventDefault?.();
    try {
      const body = { title: tenderForm.title || `RFx for ${pkg?.name || ''}`, issueDate: tenderForm.issueDate || undefined, dueDate: tenderForm.dueDate || undefined };
      await apiPost(`/api/projects/${projectId}/packages/${packageId}/create-tender`, body);
      toastOk('RFx draft created');
      setShowTender(false);
      nav(`/rfx`);
    } catch(e){ toastErr(e, 'Failed to create tender'); }
  }

  if (loading) return <div className="p-4 text-sm text-slate-600">Loading…</div>;
  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>;
  if (!pkg) return null;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{pkg.name}</h1>
        <div className="flex items-center gap-2">
          <button className="border rounded px-3 py-2" onClick={()=>setShowTender(true)}>Create Tender</button>
          {!!(pkg.tenders||[]).length && (
            <button className="border rounded px-3 py-2" onClick={()=>{
              const t = (pkg.tenders||[])[0];
              if (t) nav(`/tenders/${t.id}/responses`);
            }}>Responses</button>
          )}
          <button className="border rounded px-3 py-2" onClick={()=>nav(`/projects/${projectId}/packages`)}>Back</button>
        </div>
      </div>
      <div className="text-sm text-slate-600">Status: {pkg.status}</div>
      {!!pkg.tradeCategory && <div className="text-sm text-slate-600">Trade: {pkg.tradeCategory}</div>}
      {!pkg.tradeCategory && !!pkg.trade && <div className="text-sm text-slate-600">Trade: {pkg.trade}</div>}

      <div className="border rounded p-3">
        <div className="font-semibold mb-2">Budget Lines</div>
        {!(pkg.budgetItems||[]).length && <div className="text-sm text-slate-600">No budget lines linked.</div>}
        {!!(pkg.budgetItems||[]).length && (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-1">Code</th>
                <th className="text-left p-1">Description</th>
                <th className="text-right p-1">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pkg.budgetItems.map((bi)=> (
                <tr key={bi.id} className="border-t">
                  <td className="p-1">{bi.budgetLine?.code || ''}</td>
                  <td className="p-1">{bi.budgetLine?.description || ''}</td>
                  <td className="p-1 text-right">{Number(bi.budgetLine?.amount || 0).toFixed(2)}</td>
                </tr>
              ))}
              <tr className="border-t font-semibold">
                <td className="p-1" colSpan={2}>Total</td>
                <td className="p-1 text-right">{budgetTotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {showTender && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={()=>setShowTender(false)} />
          <div className="absolute left-1/2 top-16 -translate-x-1/2 w-full max-w-xl bg-white rounded-xl shadow-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Create Tender from Package</div>
              <button className="border rounded px-2 py-1" onClick={()=>setShowTender(false)}>Close</button>
            </div>
            <form className="space-y-3" onSubmit={createTender}>
              <div>
                <label className="block text-sm mb-1">Title</label>
                <input className="border rounded w-full px-2 py-1" value={tenderForm.title} onChange={e=>setTenderForm(f=>({ ...f, title: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Issue Date</label>
                  <input type="date" className="border rounded w-full px-2 py-1" value={tenderForm.issueDate} onChange={e=>setTenderForm(f=>({ ...f, issueDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm mb-1">Due Date</label>
                  <input type="date" className="border rounded w-full px-2 py-1" value={tenderForm.dueDate} onChange={e=>setTenderForm(f=>({ ...f, dueDate: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" className="border rounded px-3 py-2" onClick={()=>setShowTender(false)}>Cancel</button>
                <button className="border rounded px-3 py-2 bg-slate-900 text-white">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
