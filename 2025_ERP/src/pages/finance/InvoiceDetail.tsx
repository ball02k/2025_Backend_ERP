import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost } from '@/lib/api';
import FinanceBreadcrumb from '@/components/finance/FinanceBreadcrumb';

export default function InvoiceDetail() {
  const params = useParams();
  const projectParam = params.id && params.invoiceId ? params.id : undefined; // under /projects/:id/finance/invoices/:invoiceId
  const invoiceId = Number(params.invoiceId || params.id);
  const [inv, setInv] = useState<any>(null);
  const [match, setMatch] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    if (drawerOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  async function load() {
    const data = await apiGet(`/api/finance/invoices/${invoiceId}`);
    setInv(data);
  }
  useEffect(() => { if (invoiceId) load(); }, [invoiceId]);

  async function tryMatch() {
    const res = await apiPost(`/api/finance/match/attempt`, { invoiceId });
    setMatch(res);
  }
  async function accept(poId: number) {
    await apiPost(`/api/finance/match/${poId}/accept`, { invoiceId });
    await load();
  }

  if (!inv) return <div className="p-4">Loading…</div>;
  return (
    <>
    <div className="p-4 space-y-3">
      <FinanceBreadcrumb section="invoices" />
      <h1 className="text-xl font-semibold">Invoice {inv.number}</h1>
      <div className="text-sm text-slate-600">Status: {inv.status}</div>
      <div className="text-sm text-slate-600">Gross: {inv.gross}</div>
      <div className="flex gap-2 my-2">
        <button className="border rounded px-3 py-2" onClick={tryMatch}>Try Match</button>
        <button className="border rounded px-3 py-2" onClick={()=>{ setDrawerOpen(true); tryMatch(); }}>Open Matching Drawer</button>
      </div>
      {match && (
        <div className="border rounded p-3">
          <div className="font-semibold mb-2">Match Candidates</div>
          <ul className="list-disc pl-6 text-sm">
            {(match.candidates || []).map((c:any) => (
              <li key={c.id}>
                PO {c.code} — variance {c.variance}
                <button className="ml-2 text-blue-700" onClick={()=>accept(c.id)}>Accept</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
    {drawerOpen && (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/30 transition-opacity" onClick={()=>setDrawerOpen(false)} />
        <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl border-l p-4 overflow-y-auto transition-transform duration-200 ease-out translate-x-0">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Matching for {inv.number}</div>
            <button className="border rounded px-2 py-1" onClick={()=>setDrawerOpen(false)}>Close</button>
          </div>
          {!match && <div className="text-sm text-slate-600">Loading candidates…</div>}
          {match && (
            <div>
              {(!match.candidates || match.candidates.length===0) && (
                <div className="text-sm text-slate-600">No candidates found.</div>
              )}
              {!!(match.candidates||[]).length && (
                <ul className="text-sm space-y-2">
                  {match.candidates.map((c:any) => (
                    <li key={c.id} className="flex items-center justify-between border rounded px-2 py-1">
                      <div>
                        <div className="font-medium">PO {c.code || c.id}</div>
                        <div className="text-slate-600">Variance: {c.variance} · Within tolerance: {c.within ? 'Yes' : 'No'}</div>
                      </div>
                      <button className="border rounded px-2 py-1" onClick={async()=>{ await accept(c.id); setDrawerOpen(false); }}>Accept</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}
