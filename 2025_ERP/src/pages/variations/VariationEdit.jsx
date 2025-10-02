import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { apiGet, apiPost, apiPut, toastOk, toastErr } from "@/lib/api";
import { validate, hasErrors } from "@/lib/validation";
import Input from "@/components/forms/Input.jsx";
import Textarea from "@/components/forms/Textarea.jsx";

export default function VariationEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isEdit = !!id && id !== 'new';
  const projectId = Number(params.get('projectId')) || undefined;
  const [m, setM] = React.useState({ title:"", value:"", reason:"" });
  const [errors, setErrors] = React.useState({});
  const [loading, setLoading] = React.useState(isEdit);

  React.useEffect(()=>{ (async()=>{
    if(!isEdit) return;
    try {
      const res = await apiGet(`/api/variations/${id}`);
      const v = res?.data || res || {};
      setM({ id: v.id, title: v.title||"", value: v.value!=null?String(v.value):"", reason: v.reason || v.description || "" });
    } catch(e){ toastErr(e, 'Failed to load variation'); }
    finally { setLoading(false); }
  })(); }, [isEdit, id]);

  const rules = { title: [{ type: 'required' }], value: [{ type: 'required' }, { type: 'min', value: 0 }] };

  async function save(){
    const errs = validate(m, rules); setErrors(errs); if (hasErrors(errs)) return;
    try {
      const body = { ...m, projectId, value: Number(m.value) || 0 };
      const saved = m.id ? await apiPut(`/api/variations/${m.id}`, body) : await apiPost('/api/variations', body);
      const row = saved?.data || saved;
      toastOk('Variation saved');
      location.href = `/variations/${row.id || id}`;
    } catch(e){ if (e.fieldErrors) setErrors(e.fieldErrors); toastErr(e, 'Failed to save variation'); }
  }

  if (loading) return <div className="p-4 text-sm text-slate-600">Loading…</div>;
  return (
    <div className="p-4 space-y-3">
      <h1 className="text-lg font-semibold">{isEdit ? 'Edit Variation' : 'New Variation'}</h1>
      <Input id="title" label="Title" required value={m.title} onChange={(e)=>setM(s=>({...s,title:e.target.value}))} error={errors['title']} />
      <Input id="value" label="Value (GBP)" type="number" required value={m.value} onChange={(e)=>setM(s=>({...s,value:e.target.value}))} error={errors['value']} />
      <Textarea id="reason" label="Reason / Notes" value={m.reason} onChange={(e)=>setM(s=>({...s,reason:e.target.value}))} error={errors['reason']} />
      <div className="flex gap-2">
        <button onClick={save} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">Save</button>
        <a href={projectId ? `/projects/${projectId}/variations` : "/variations"} className="text-sm underline">Cancel</a>
      </div>
    </div>
  );
}

