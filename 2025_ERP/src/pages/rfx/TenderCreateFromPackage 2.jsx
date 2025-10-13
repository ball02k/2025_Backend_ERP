import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiPost, toastErr, toastOk } from '@/lib/api';

export default function TenderCreateFromPackage(){
  const { id: projectId, packageId } = useParams();
  const nav = useNavigate();
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', issueDate: '', dueDate: '', scoringWeights: {}, questions: [] });

  async function load(){
    setLoading(true);
    try {
      const data = await apiGet(`/api/projects/${projectId}/packages/${packageId}`);
      setPkg(data);
      setForm((f)=>({ ...f, title: f.title || `RFx for ${data?.name || ''}` }));
    } catch(e){ toastErr(e, 'Failed to load package'); }
    setLoading(false);
  }
  useEffect(()=>{ if(projectId && packageId) load(); }, [projectId, packageId]);

  async function submit(e){
    e?.preventDefault?.();
    try {
      const body = { title: form.title, issueDate: form.issueDate || undefined, dueDate: form.dueDate || undefined, scoringWeights: form.scoringWeights || {}, questions: form.questions || [] };
      await apiPost(`/api/projects/${projectId}/packages/${packageId}/create-tender`, body);
      toastOk('RFx draft created');
      nav(`/rfx`);
    } catch(e){ toastErr(e, 'Failed to create tender'); }
  }

  if (loading) return <div className="p-4 text-sm text-slate-600">Loading…</div>;
  if (!pkg) return null;
  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-semibold">Create Tender from “{pkg.name}”</h1>
      <form className="space-y-3" onSubmit={submit}>
        <div>
          <label className="block text-sm mb-1">Title</label>
          <input className="border rounded w-full px-2 py-1" value={form.title} onChange={e=>setForm(f=>({ ...f, title: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1">Issue Date</label>
            <input type="date" className="border rounded w-full px-2 py-1" value={form.issueDate} onChange={e=>setForm(f=>({ ...f, issueDate: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm mb-1">Due Date</label>
            <input type="date" className="border rounded w-full px-2 py-1" value={form.dueDate} onChange={e=>setForm(f=>({ ...f, dueDate: e.target.value }))} />
          </div>
        </div>
        {/* Simple JSON editors for scoring/questions placeholders */}
        <div>
          <label className="block text-sm mb-1">Scoring Weights (JSON)</label>
          <textarea className="border rounded w-full px-2 py-1 h-24" placeholder="{ \"technical\": 70, \"commercial\": 30 }" onChange={(e)=>{
            try { setForm(f=>({ ...f, scoringWeights: JSON.parse(e.target.value||'{}') })); } catch {}
          }} />
        </div>
        <div>
          <label className="block text-sm mb-1">Questions (JSON Array)</label>
          <textarea className="border rounded w-full px-2 py-1 h-24" placeholder='[{ "text":"Explain approach", "type":"text", "weight":50 }]' onChange={(e)=>{
            try { setForm(f=>({ ...f, questions: JSON.parse(e.target.value||'[]') })); } catch {}
          }} />
        </div>
        <div className="flex items-center gap-2 justify-end">
          <button type="button" className="border rounded px-3 py-2" onClick={()=>nav(-1)}>Cancel</button>
          <button className="border rounded px-3 py-2 bg-slate-900 text-white">Create Tender</button>
        </div>
      </form>
    </div>
  );
}

