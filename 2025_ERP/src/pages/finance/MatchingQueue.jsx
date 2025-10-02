import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProjectFinance } from '@/pages/project/FinanceContext';
import { apiGet } from '@/lib/api';
import FinanceBreadcrumb from '@/components/finance/FinanceBreadcrumb';

export default function MatchingQueue() {
  const { id: projectParam } = useParams();
  const ctx = useProjectFinance?.() || {};
  const projectId = Number.isFinite(ctx.projectId) ? Number(ctx.projectId) : (projectParam ? Number(projectParam) : undefined);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const query = { matchStatus: 'needs_review', limit: 50 };
      if (Number.isFinite(projectId)) query.projectId = projectId;
      const data = await apiGet('/api/finance/invoices', query);
      setRows(Array.isArray(data?.items) ? data.items : []);
    } catch (e) { setError(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }
  React.useEffect(() => { load(); }, [projectId]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Matching Queue</h1>
      </div>
      <FinanceBreadcrumb section="matching" />
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="rounded-xl border bg-white overflow-auto">
        <table className="min-w-[640px] w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2 border">Invoice</th>
              <th className="text-left p-2 border">Status</th>
              <th className="text-left p-2 border">Issue Date</th>
              <th className="text-right p-2 border">Gross</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="p-4 text-center text-slate-500">Loading…</td></tr>
            )}
            {!loading && (!Array.isArray(rows) || rows.length === 0) && (
              <tr><td colSpan={4} className="p-4 text-center text-slate-500">No invoices need review</td></tr>
            )}
            {!loading && (Array.isArray(rows) ? rows : []).map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="p-2 border"><Link className="text-blue-700" to={Number.isFinite(projectId) ? `/projects/${projectId}/finance/matching/${r.id}` : `/finance/matching/${r.id}`}>{r.number || `INV #${r.id}`}</Link></td>
                <td className="p-2 border">{r.matchStatus || r.status || '—'}</td>
                <td className="p-2 border">{r.issueDate ? new Date(r.issueDate).toLocaleDateString() : '—'}</td>
                <td className="p-2 border text-right">{r.gross ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
