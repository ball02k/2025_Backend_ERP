import React from "react";
import { apiGet } from "@/lib/api";

export default function FinanceSettings() {
  const [form, setForm] = React.useState({ vatRateDefault: 0.2, matchTolerance: 5, currency: 'GBP', inboundEmailEnabled: true });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const data = await apiGet('/api/settings/finance');
        if (alive && data && typeof data === 'object') setForm({
          vatRateDefault: Number(data.vatRateDefault ?? 0.2),
          matchTolerance: Number(data.matchTolerance ?? 5),
          currency: String(data.currency ?? 'GBP'),
          inboundEmailEnabled: Boolean(data.inboundEmailEnabled ?? true),
        });
      } catch (e) { if (alive) setError(e?.message || 'Failed to load'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Finance Settings</h1>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {!loading && (
      <div className="rounded-xl border bg-white p-4 shadow-sm grid gap-3 max-w-md">
        <label className="grid gap-1">
          <span className="text-xs text-slate-600">Default VAT Rate</span>
          <input type="number" step="0.01" className="border rounded px-2 py-1"
            value={isFinite(form.vatRateDefault) ? String(form.vatRateDefault) : ''}
            onChange={(e)=>setForm(f=>({ ...f, vatRateDefault: Number(e.target.value || '0') }))} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-slate-600">Match Tolerance (£)</span>
          <input type="number" step="0.01" className="border rounded px-2 py-1"
            value={isFinite(form.matchTolerance) ? String(form.matchTolerance) : ''}
            onChange={(e)=>setForm(f=>({ ...f, matchTolerance: Number(e.target.value || '0') }))} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-slate-600">Currency</span>
          <input className="border rounded px-2 py-1"
            value={form.currency ?? ''}
            onChange={(e)=>setForm(f=>({ ...f, currency: e.target.value }))} />
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={!!form.inboundEmailEnabled} onChange={(e)=>setForm(f=>({ ...f, inboundEmailEnabled: e.target.checked }))} />
          <span>Inbound email integration enabled</span>
        </label>
      </div>
      )}
      {loading && <div className="text-sm text-slate-500">Loading…</div>}
    </div>
  );
}
