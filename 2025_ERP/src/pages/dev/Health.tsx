import React from 'react';
import { apiGet } from '@/lib/api';

const ENDPOINTS = [
  { path: '/api/me', label: 'Auth /me' },
  { path: '/api/projects?limit=1', label: 'Projects list' },
  { path: '/api/suppliers?limit=1', label: 'Suppliers list' },
  { path: '/api/documents?limit=1', label: 'Documents list' },
  { path: '/api/finance/invoices?limit=1', label: 'Invoices list (if enabled)' },
  { path: '/api/finance/pos?limit=1', label: 'POs list (if enabled)' },
];

function summarize(d: any) {
  if (!d) return '—';
  if (Array.isArray(d)) return `array(${d.length})`;
  if (typeof d === 'object') {
    const keys = Object.keys(d);
    return `{${keys.slice(0,5).join(', ')}${keys.length>5?'…':''}}`;
  }
  return String(d).slice(0,120);
}

export default function Health(){
  const [rows, setRows] = React.useState<any[]>([]);
  React.useEffect(()=>{
    (async()=>{
      const out: any[] = [];
      for (const e of ENDPOINTS) {
        const start = Date.now();
        try {
          const data = await apiGet(e.path);
          out.push({ ...e, ok: true, ms: Date.now() - start, detail: summarize(data) });
        } catch (err: any) {
          out.push({ ...e, ok: false, ms: Date.now() - start, error: String(err?.message || err) });
        }
      }
      setRows(out);
    })();
  },[]);

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">System Health</h1>
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <table className="min-w-full text-sm">
          <thead><tr><th>Endpoint</th><th>Result</th><th>Latency</th><th>Detail/Error</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.path} className={r.ok ? '' : 'text-red-700'}>
                <td className="py-1 pr-4 font-mono">{r.path}</td>
                <td className="pr-4">{r.ok ? 'OK' : 'FAIL'}</td>
                <td className="pr-4">{r.ms} ms</td>
                <td className="pr-4">{r.ok ? r.detail : r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Feature flags removed; no special Recovery Mode tip needed */}
    </div>
  );
}
