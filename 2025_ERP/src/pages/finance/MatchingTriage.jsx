import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiPost } from '@/lib/api';

export default function MatchingTriage() {
  const params = useParams();
  const navigate = useNavigate();
  const projectParam = params.id; // present under /projects/:id/finance/matching/:invoiceId
  const invoiceId = Number(params.invoiceId || params.id);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  async function attempt() {
    setLoading(true); setError('');
    try {
      const res = await apiPost('/api/finance/match/attempt', { invoiceId });
      setResult(res || null);
    } catch (e) { setError(e?.message || 'Failed to attempt match'); }
    finally { setLoading(false); }
  }

  async function accept(poId) {
    try {
      await apiPost(`/api/finance/match/${poId}/accept`, { invoiceId });
      // After accept, go to invoice detail (project-scoped if known)
      if (projectParam) navigate(`/projects/${projectParam}/finance/invoices`);
      else navigate(`/finance/invoices/${invoiceId}`);
    } catch (e) { setError(e?.message || 'Failed to accept match'); }
  }

  React.useEffect(() => { if (Number.isFinite(invoiceId)) attempt(); }, [invoiceId]);

  const backHref = projectParam ? `/projects/${projectParam}/finance/matching` : `/finance/matching`;

  return (
    <div className="p-4 space-y-4">
      <div className="text-sm"><a className="underline" href={backHref}>Back to Matching Queue</a></div>
      <h1 className="text-lg font-semibold">Match Invoice #{invoiceId}</h1>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {loading && <div className="text-sm text-slate-600">Loading candidates…</div>}
      {!loading && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="font-medium mb-2">Candidates</div>
          {(!result?.candidates || result.candidates.length === 0) && (
            <div className="text-sm text-slate-600">No suitable POs found.</div>
          )}
          {!!(result?.candidates || []).length && (
            <table className="min-w-[520px] w-full text-sm border">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-2 border">PO</th>
                  <th className="text-right p-2 border">Variance</th>
                  <th className="text-left p-2 border">Within Tolerance</th>
                  <th className="text-left p-2 border">Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.candidates.map((c) => (
                  <tr key={c.id}>
                    <td className="p-2 border">{c.code || `PO #${c.id}`}</td>
                    <td className="p-2 border text-right">{c.variance}</td>
                    <td className="p-2 border">{c.within ? 'Yes' : 'No'}</td>
                    <td className="p-2 border">
                      <button className="border rounded px-2 py-1" onClick={() => accept(c.id)}>Accept</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

