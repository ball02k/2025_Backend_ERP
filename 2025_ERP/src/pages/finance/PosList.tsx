import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProjectFinance } from '@/pages/project/FinanceContext';
import { apiGet, apiPost } from '@/lib/api';
import FinanceBreadcrumb from '@/components/finance/FinanceBreadcrumb';

type PO = { id: number; code: string; supplier?: string; status?: string; orderDate?: string; total?: number; documentId?: number; documentUrl?: string|null };

export default function PosList() {
  const { id: projectParam } = useParams();
  const ctx = useProjectFinance?.() || ({} as any);
  const projectId = Number.isFinite(ctx.projectId) ? Number(ctx.projectId) : (projectParam ? Number(projectParam) : undefined);
  const [rows, setRows] = useState<PO[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');

  async function load() {
    const query: any = { q };
    if (Number.isFinite(projectId)) query.projectId = projectId;
    const data = await apiGet<any>(`/api/finance/pos`, query);
    const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
    setRows(items);
    setTotal(Number(data?.total ?? items.length ?? 0));
  }
  useEffect(() => { load(); }, [projectId]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-semibold">Purchase Orders</h1>
        {Number.isFinite(projectId) && (
          <button
            className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
            onClick={async () => {
              try {
                const po = await apiPost('/api/finance/pos', { projectId });
                location.href = Number.isFinite(projectId) ? `/projects/${projectId}/finance/pos/${po.id}` : `/finance/pos/${po.id}`;
              } catch (_) { /* ignore, DataGrid pages already show errors */ }
            }}
          >
            New PO
          </button>
        )}
      </div>
      <FinanceBreadcrumb section="pos" />
      <div className="flex gap-2 mb-3">
        <input className="border rounded px-3 py-2" placeholder="Search" value={q} onChange={e=>setQ(e.target.value)} />
        <button className="border rounded px-3 py-2" onClick={load}>Search</button>
      </div>
      <div className="text-sm text-slate-600 mb-2">Total: {total}</div>
      <div className="overflow-auto">
        <table className="min-w-[640px] w-full text-sm border">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2 border">Code</th>
              <th className="text-left p-2 border">Supplier</th>
              <th className="text-left p-2 border">Status</th>
              <th className="text-left p-2 border">Order Date</th>
              <th className="text-right p-2 border">Total</th>
              <th className="text-left p-2 border">Doc</th>
              <th className="text-left p-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(Array.isArray(rows) ? rows : []).map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="p-2 border"><Link className="text-blue-700" to={Number.isFinite(projectId) ? `/projects/${projectId}/finance/pos/${r.id}` : `/finance/pos/${r.id}`}>{r.code}</Link></td>
                <td className="p-2 border">{r.supplier || '—'}</td>
                <td className="p-2 border">{r.status || '—'}</td>
                <td className="p-2 border">{r.orderDate ? new Date(r.orderDate).toLocaleDateString() : '—'}</td>
                <td className="p-2 border text-right">{r.total ?? 0}</td>
                <td className="p-2 border">
                  {r.documentId ? (
                    <a className="text-blue-700 underline" href={r.documentUrl || `/api/documents/${r.documentId}/download`} target="_blank" rel="noreferrer">View</a>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="p-2 border">
                  <button
                    className="text-sm border rounded px-2 py-1"
                    onClick={async () => {
                      await apiPost(`/api/finance/pos/${r.id}/generate-pdf`);
                      await load();
                    }}
                  >
                    Generate PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
