import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost, toastOk, toastErr } from '@/lib/api';
import FinanceBreadcrumb from '@/components/finance/FinanceBreadcrumb';

export default function PoDetail() {
  const params = useParams();
  const projectParam = params.id && params.poId ? params.id : undefined; // under /projects/:id/finance/pos/:poId
  const id = params.poId || params.id; // works for both /finance/pos/:id and nested
  const [po, setPo] = useState<any>(null);

  async function load() {
    const data = await apiGet(`/api/finance/pos/${id}`);
    setPo(data);
  }
  useEffect(() => { if (id) load(); }, [id]);

  async function issue() {
    try { await apiPost(`/api/finance/pos/${id}/issue`); toastOk('PO issued'); await load(); }
    catch (e) { toastErr(e, 'Failed to issue PO'); }
  }
  async function receipt() {
    try { await apiPost(`/api/finance/pos/${id}/receipt`, { note: 'Received' }); toastOk('Receipt recorded'); await load(); }
    catch (e) { toastErr(e, 'Failed to receipt'); }
  }
  async function close() {
    try { await apiPost(`/api/finance/pos/${id}/close`); toastOk('PO closed'); await load(); }
    catch (e) { toastErr(e, 'Failed to close PO'); }
  }
  async function genPdf() {
    try { await apiPost(`/api/finance/pos/${id}/generate-pdf`); toastOk('PDF generated'); }
    catch (e) { toastErr(e, 'Failed to generate PDF'); }
  }

  if (!po) return <div className="p-4">Loading…</div>;
  return (
    <div className="p-4 space-y-3">
      <FinanceBreadcrumb section="pos" />
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
