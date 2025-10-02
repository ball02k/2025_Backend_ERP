import React from "react";
import { useParams } from 'react-router-dom';
import { apiPost, toastOk, toastErr } from "@/lib/api";
import { validate, hasErrors } from "@/lib/validation";
import Input from "@/components/forms/Input.jsx";

export default function InvoiceNew() {
  const { id: projectParam } = useParams();
  const projectId = projectParam ? Number(projectParam) : undefined;
  const [m, setM] = React.useState({ supplierId:"", projectId: projectId ? String(projectId) : "", invoiceNumber:"", issueDate:"", dueDate:"" });
  const [errors, setErrors] = React.useState({});
  const rules = { supplierId: [{ type: 'required' }], invoiceNumber: [{ type: 'required' }], issueDate: [{ type: 'date' }], dueDate: [{ type: 'date' }] };

  async function save(){
    const errs = validate(m, rules); setErrors(errs); if (hasErrors(errs)) return;
    try {
      const saved = await apiPost('/api/finance/invoices', { ...m, supplierId:Number(m.supplierId)||0, projectId: m.projectId?Number(m.projectId):null });
      const row = saved?.data || saved;
      toastOk('Invoice saved');
      location.href = `/finance/invoices/${row.id}`;
    } catch(e){ if (e.fieldErrors) setErrors(e.fieldErrors); toastErr(e, 'Failed to save invoice'); }
  }

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-lg font-semibold">New Invoice</h1>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input id="invoiceNumber" label="Invoice number" required value={m.invoiceNumber} onChange={(e)=>setM(s=>({...s,invoiceNumber:e.target.value}))} error={errors['invoiceNumber']} />
        <Input id="supplierId" label="Supplier ID" required value={m.supplierId} onChange={(e)=>setM(s=>({...s,supplierId:e.target.value}))} error={errors['supplierId']} />
        <Input id="projectId" label="Project ID" value={m.projectId} onChange={(e)=>setM(s=>({...s,projectId:e.target.value}))} error={errors['projectId']} />
        <Input id="issueDate" label="Issue date" type="date" value={m.issueDate} onChange={(e)=>setM(s=>({...s,issueDate:e.target.value}))} error={errors['issueDate']} />
        <Input id="dueDate" label="Due date" type="date" value={m.dueDate} onChange={(e)=>setM(s=>({...s,dueDate:e.target.value}))} error={errors['dueDate']} />
      </div>
      <div className="flex gap-2">
        <button onClick={save} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">Save</button>
        <a href={Number.isFinite(projectId) ? `/projects/${projectId}/finance/invoices` : `/finance/invoices`} className="text-sm underline">Cancel</a>
      </div>
    </div>
  );
}
