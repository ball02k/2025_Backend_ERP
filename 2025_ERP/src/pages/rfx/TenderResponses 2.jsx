import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPatch, toastErr, toastOk } from '@/lib/api';
import { hasAwardPermission, awardTender } from '@/lib/procurement';

export default function TenderResponses(){
  const { id } = useParams(); // tenderId
  const nav = useNavigate();
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [awardOpen, setAwardOpen] = React.useState(false);
  const [canAward, setCanAward] = React.useState(false);
  const [award, setAward] = React.useState({ responseId: null, contractRef: '', startDate: '', endDate: '' });

  async function load(){
    setLoading(true); setError('');
    try {
      const res = await apiGet(`/api/tenders/${id}/responses`);
      setRows(Array.isArray(res) ? res : []);
    } catch(e){ setError(e?.message || 'Failed to load responses'); }
    setLoading(false);
  }
  React.useEffect(()=>{ if(id) load(); }, [id]);
  React.useEffect(()=>{ (async()=>{ try { setCanAward(await hasAwardPermission()); } catch { setCanAward(false); } })(); }, []);

  const totalScore = (r) => Number(r.autoScore||0) + Number(r.manualScore||0);

  async function saveScore(r, v, notes){
    try {
      const body = { manualScore: Number(v||0), notes: notes ?? r.notes ?? null };
      await apiPatch(`/api/tenders/${id}/responses/${r.id}/score`, body);
      toastOk('Saved');
      await load();
    } catch(e){ toastErr(e, 'Failed to save score'); }
  }

  async function doAward(e){
    e?.preventDefault?.();
    try {
      const res = await awardTender(id, award);
      toastOk('Awarded');
      const pid = rows?.[0]?.tender?.projectId || '';
      const cid = res?.contractId;
      if (cid) {
        // If contracts route exists, go there; else fall back to project page
        try { nav(`/projects/${pid}/contracts/${cid}`); } catch { nav(`/projects/${pid}`); }
      } else {
        nav(`/projects/${pid}`);
      }
    } catch(e){
      if (e?.status === 403) toastErr(e, 'Forbidden: Missing procurement:award');
      else toastErr(e, 'Failed to award');
    }
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Tender Responses</h1>
        <button className="border rounded px-3 py-2 disabled:opacity-50" disabled={!canAward} onClick={()=>setAwardOpen(true)}>
          {canAward ? 'Award' : 'Award (no permission)'}
        </button>
      </div>
      <table className="w-full text-sm border rounded overflow-hidden">
        <thead className="bg-slate-100">
          <tr>
            <th className="text-left p-2">Supplier</th>
            <th className="text-right p-2">Price</th>
            <th className="text-right p-2">Lead Time</th>
            <th className="text-right p-2">Auto</th>
            <th className="text-right p-2">Manual</th>
            <th className="text-right p-2">Total</th>
            <th className="text-left p-2">Notes</th>
            <th className="text-left p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r)=> (
            <tr key={r.id} className="border-t">
              <td className="p-2">{r.supplier?.name || r.supplierId}</td>
              <td className="p-2 text-right">{Number(r.priceTotal||0).toFixed(2)}</td>
              <td className="p-2 text-right">{r.leadTimeDays ?? '—'}</td>
              <td className="p-2 text-right">{Number(r.autoScore||0).toFixed(2)}</td>
              <td className="p-2 text-right">
                <input type="number" className="w-20 border rounded px-1 py-0.5 text-right" defaultValue={Number(r.manualScore||0)} onBlur={(e)=>saveScore(r, e.target.value, r.notes)} />
              </td>
              <td className="p-2 text-right">{totalScore(r).toFixed(2)}</td>
              <td className="p-2">
                <input className="w-64 border rounded px-2 py-1" defaultValue={r.notes || ''} onBlur={(e)=>saveScore(r, r.manualScore, e.target.value)} />
              </td>
              <td className="p-2">
                <label className="inline-flex items-center gap-1 text-sm">
                  <input type="radio" name="award" onChange={()=>setAward(a=>({ ...a, responseId: r.id }))} />
                  Select
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {awardOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={()=>setAwardOpen(false)} />
          <div className="absolute left-1/2 top-16 -translate-x-1/2 w-full max-w-xl bg-white rounded-xl shadow-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Award Contract</div>
              <button className="border rounded px-2 py-1" onClick={()=>setAwardOpen(false)}>Close</button>
            </div>
            <form className="space-y-3" onSubmit={doAward}>
              <div>
                <label className="block text-sm mb-1">Winning Response</label>
                <select className="border rounded w-full px-2 py-1" value={award.responseId || ''} onChange={e=>setAward(a=>({ ...a, responseId: Number(e.target.value)||null }))} required>
                  <option value="">Select response…</option>
                  {rows.map(r => (<option key={r.id} value={r.id}>{r.supplier?.name || r.supplierId} — {Number(r.priceTotal||0).toFixed(2)}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Contract Ref</label>
                <input className="border rounded w-full px-2 py-1" value={award.contractRef || ''} onChange={e=>setAward(a=>({ ...a, contractRef: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Start Date</label>
                  <input type="date" className="border rounded w-full px-2 py-1" value={award.startDate || ''} onChange={e=>setAward(a=>({ ...a, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm mb-1">End Date</label>
                  <input type="date" className="border rounded w-full px-2 py-1" value={award.endDate || ''} onChange={e=>setAward(a=>({ ...a, endDate: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" className="border rounded px-3 py-2" onClick={()=>setAwardOpen(false)}>Cancel</button>
                <button className="border rounded px-3 py-2 bg-slate-900 text-white">Award</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
