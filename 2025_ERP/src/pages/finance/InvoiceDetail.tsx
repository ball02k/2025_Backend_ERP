import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost } from '@/lib/api';

export default function InvoiceDetail() {
  const { id } = useParams();
  const [inv, setInv] = useState<any>(null);
  const [match, setMatch] = useState<any>(null);

  async function load() {
    const data = await apiGet(`/api/finance/invoices/${id}`);
    setInv(data);
  }
  useEffect(() => { if (id) load(); }, [id]);

  async function tryMatch() {
    const res = await apiPost(`/api/finance/match/attempt`, { invoiceId: Number(id) });
    setMatch(res);
  }
  async function accept(poId: number) {
    await apiPost(`/api/finance/match/${poId}/accept`, { invoiceId: Number(id) });
    await load();
  }

  if (!inv) return <div className="p-4">Loading…</div>;
  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-semibold">Invoice {inv.number}</h1>
      <div className="text-sm text-slate-600">Status: {inv.status}</div>
      <div className="text-sm text-slate-600">Gross: {inv.gross}</div>
      <div className="flex gap-2 my-2">
        <button className="border rounded px-3 py-2" onClick={tryMatch}>Try Match</button>
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
  );
}

