import React from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost, toastErr, toastOk } from '@/lib/api';

export default function PublicRFx(){
  const { token } = useParams();
  const [data, setData] = React.useState(null);
  const [answers, setAnswers] = React.useState({});
  const [price, setPrice] = React.useState('');
  const [lead, setLead] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(()=>{
    let mounted = true;
    async function load(){
      setLoading(true); setError('');
      try {
        const res = await apiGet(`/public/rfx/${token}`);
        if (mounted) setData(res);
      } catch(e){ if (mounted) setError(e?.message || 'Invalid or expired link'); }
      setLoading(false);
    }
    if (token) load();
    return () => { mounted = false; };
  }, [token]);

  async function submit(e){
    e?.preventDefault?.();
    try {
      const payload = {
        priceTotal: Number(price||0),
        leadTimeDays: lead ? Number(lead) : null,
        answers: Object.entries(answers).map(([qid, value]) => ({ questionId: Number(qid), value })),
      };
      await apiPost(`/public/rfx/${token}/submit`, payload);
      toastOk('Submitted');
    } catch(e){ toastErr(e, 'Failed to submit'); }
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!data) return null;
  const tender = data.tender || {};

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">{tender.title}</h1>
      {tender.package && tender.package.scope && (
        <div className="border rounded p-3 text-sm">
          <div className="font-medium mb-1">Scope</div>
          <div className="whitespace-pre-wrap">{tender.package.scope}</div>
        </div>
      )}
      <form className="space-y-3" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1">Total Price</label>
            <input type="number" step="0.01" className="border rounded w-full px-2 py-1" value={price} onChange={e=>setPrice(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm mb-1">Lead Time (days)</label>
            <input type="number" className="border rounded w-full px-2 py-1" value={lead} onChange={e=>setLead(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="font-medium">Questions</div>
          {(tender.questions || []).map((q) => (
            <div key={q.id} className="border rounded p-2">
              <div className="text-sm mb-1">{q.text} <span className="text-slate-500">[{q.type}]</span></div>
              {q.type === 'number' ? (
                <input type="number" step="0.01" className="border rounded w-full px-2 py-1" onChange={e=>setAnswers(a=>({ ...a, [q.id]: e.target.value }))} />
              ) : q.type === 'text' ? (
                <textarea className="border rounded w-full px-2 py-1" onChange={e=>setAnswers(a=>({ ...a, [q.id]: e.target.value }))} />
              ) : (
                <input className="border rounded w-full px-2 py-1" onChange={e=>setAnswers(a=>({ ...a, [q.id]: e.target.value }))} />
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2">
          <button className="border rounded px-3 py-2 bg-slate-900 text-white">Submit</button>
        </div>
      </form>
    </div>
  );
}

