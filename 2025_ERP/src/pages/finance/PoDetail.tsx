import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost } from '@/lib/api';

export default function PoDetail() {
  const { id } = useParams();
  const [po, setPo] = useState<any>(null);

  async function load() {
    const data = await apiGet(`/api/finance/pos/${id}`);
    setPo(data);
  }
  useEffect(() => { if (id) load(); }, [id]);

  async function issue() { await apiPost(`/api/finance/pos/${id}/issue`); await load(); }
  async function receipt() { await apiPost(`/api/finance/pos/${id}/receipt`, { note: 'Received' }); await load(); }
  async function close() { await apiPost(`/api/finance/pos/${id}/close`); await load(); }
  async function genPdf() { await apiPost(`/api/finance/pos/${id}/generate-pdf`); await load(); }

  if (!po) return <div className="p-4">Loading…</div>;
  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-semibold">PO {po.code}</h1>
      <div className="text-sm text-slate-600">Supplier: {po.supplier || '—'}</div>
      <div className="text-sm text-slate-600">Status: {po.status}</div>
      <div className="text-sm text-slate-600">Total: {po.total}</div>
      {po.document?.id && (
        <div className="text-sm">
          Document: <a className="text-blue-700 underline" href={po.document.downloadUrl} target="_blank" rel="noreferrer">Open</a>
        </div>
      )}
      <div className="flex flex-wrap gap-2 my-2">
        <button className="border rounded px-3 py-2" onClick={issue}>Issue</button>
        <button className="border rounded px-3 py-2" onClick={receipt}>Receipt</button>
        <button className="border rounded px-3 py-2" onClick={close}>Close</button>
        <button className="border rounded px-3 py-2" onClick={genPdf}>Generate PDF</button>
      </div>
      <section>
        <h2 className="font-semibold mb-2">Lines</h2>
        <div className="overflow-auto">
          <table className="min-w-[640px] w-full text-sm border">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left p-2 border">Item</th>
                <th className="text-right p-2 border">Qty</th>
                <th className="text-left p-2 border">Unit</th>
                <th className="text-right p-2 border">Unit Cost</th>
                <th className="text-right p-2 border">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {(po.lines || []).map((l:any) => (
                <tr key={l.id}>
                  <td className="p-2 border">{l.item}</td>
                  <td className="p-2 border text-right">{l.qty}</td>
                  <td className="p-2 border">{l.unit}</td>
                  <td className="p-2 border text-right">{l.unitCost}</td>
                  <td className="p-2 border text-right">{l.lineTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className="font-semibold mb-2">Receipts</h2>
        <ul className="list-disc pl-6 text-sm">
          {(po.deliveries || []).map((d:any) => (
            <li key={d.id}>{d.receivedAt ? new Date(d.receivedAt).toLocaleString() : 'Pending'} — {d.note || ''}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
