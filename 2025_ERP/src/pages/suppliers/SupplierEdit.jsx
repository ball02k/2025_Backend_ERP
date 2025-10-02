import React from "react";
import { useParams } from "react-router-dom";
import { apiGet, apiPost, apiPut, toastOk, toastErr } from "@/lib/api";
import { validate, hasErrors } from "@/lib/validation";
import Input from "@/components/forms/Input.jsx";
import Textarea from "@/components/forms/Textarea.jsx";

export default function SupplierEdit() {
  const { id } = useParams();
  const isEdit = !!id && id !== 'new';
  const [m, setM] = React.useState({ name:"", email:"", phone:"", address:"" });
  const [errors, setErrors] = React.useState({});
  const [loading, setLoading] = React.useState(isEdit);

  React.useEffect(()=>{ (async()=>{
    if(!isEdit) return;
    try {
      const res = await apiGet(`/api/suppliers/${id}`);
      const s = res?.data || res || {};
      setM({ id: s.id, name: s.name||"", email: s.email||"", phone: s.phone||"", address: s.address||"" });
    } catch(e){ toastErr(e, 'Failed to load supplier'); }
    finally { setLoading(false); }
  })(); }, [isEdit, id]);

  const rules = { name: [{ type: 'required' }], email: [{ type: 'email', message: 'Enter a valid email' }] };

  async function save(){
    const errs = validate(m, rules); setErrors(errs); if (hasErrors(errs)) return;
    try {
      const saved = m.id ? await apiPut(`/api/suppliers/${m.id}`, m) : await apiPost('/api/suppliers', m);
      const row = saved?.data || saved;
      toastOk('Supplier saved');
      location.href = `/suppliers/${row.id || id}`;
    } catch(e){ if (e.fieldErrors) setErrors(e.fieldErrors); toastErr(e, 'Failed to save supplier'); }
  }

  if (loading) return <div className="p-4 text-sm text-slate-600">Loading…</div>;
  return (
    <div className="p-4 space-y-3">
      <h1 className="text-lg font-semibold">{isEdit ? 'Edit Supplier' : 'New Supplier'}</h1>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input id="name" label="Supplier Name" required value={m.name} onChange={(e)=>setM(s=>({...s,name:e.target.value}))} error={errors['name']} />
        <Input id="email" label="Email" type="email" value={m.email} onChange={(e)=>setM(s=>({...s,email:e.target.value}))} error={errors['email']} />
        <Input id="phone" label="Phone" value={m.phone} onChange={(e)=>setM(s=>({...s,phone:e.target.value}))} error={errors['phone']} />
        <Textarea id="address" label="Address" value={m.address} onChange={(e)=>setM(s=>({...s,address:e.target.value}))} error={errors['address']} />
      </div>
      <div className="flex gap-2">
        <button onClick={save} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">Save</button>
        <a href="/suppliers" className="text-sm underline">Cancel</a>
      </div>
    </div>
  );
}

