import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { apiGet, apiPost, apiPut, toastOk, toastErr } from "@/lib/api";
import { validate, hasErrors } from "@/lib/validation";
import Input from "@/components/forms/Input.jsx";
import Textarea from "@/components/forms/Textarea.jsx";
import Select from "@/components/forms/Select.jsx";

export default function TaskEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isEdit = !!id && id !== 'new';
  const projectId = Number(params.get('projectId')) || undefined;
  const [m, setM] = React.useState({ title:"", dueDate:"", assigneeId:"", status:"open", notes:"" });
  const [errors, setErrors] = React.useState({});
  const [loading, setLoading] = React.useState(isEdit);

  React.useEffect(()=>{ (async()=>{
    if(!isEdit) return;
    try {
      const res = await apiGet(`/api/tasks/${id}`);
      const t = res?.data || res || {};
      setM({ id: t.id, title: t.title||"", dueDate: t.dueDate?String(t.dueDate).slice(0,10):"", assigneeId: t.assigneeId?String(t.assigneeId):"", status: t.status||"open", notes: t.description||"" });
    } catch(e){ toastErr(e, 'Failed to load task'); }
    finally { setLoading(false); }
  })(); }, [isEdit, id]);

  const rules = { title: [{ type: 'required' }], dueDate: [{ type: 'date' }] };

  async function save(){
    const errs = validate(m, rules); setErrors(errs); if (hasErrors(errs)) return;
    try {
      const body = { ...m, projectId: projectId || (m.projectId || null), description: m.notes };
      const saved = m.id ? await apiPut(`/api/tasks/${m.id}`, body) : await apiPost('/api/tasks', body);
      toastOk('Task saved');
      location.href = projectId ? `/projects/${projectId}/tasks` : `/tasks`;
    } catch(e){ if (e.fieldErrors) setErrors(e.fieldErrors); toastErr(e, 'Failed to save task'); }
  }

  if (loading) return <div className="p-4 text-sm text-slate-600">Loading…</div>;
  return (
    <div className="p-4 space-y-3">
      <h1 className="text-lg font-semibold">{isEdit ? 'Edit Task' : 'New Task'}</h1>
      <Input id="title" label="Title" required value={m.title} onChange={(e)=>setM(s=>({...s,title:e.target.value}))} error={errors['title']} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input id="dueDate" label="Due date" type="date" value={m.dueDate} onChange={(e)=>setM(s=>({...s,dueDate:e.target.value}))} error={errors['dueDate']} />
        <Select id="status" label="Status" value={m.status} onChange={(e)=>setM(s=>({...s,status:e.target.value}))}
          options={["open","in_progress","blocked","done"].map(x=>({value:x,label:x.replace("_"," ")}))} />
        <Input id="assigneeId" label="Assignee ID" value={m.assigneeId} onChange={(e)=>setM(s=>({...s,assigneeId:e.target.value}))} error={errors['assigneeId']} />
      </div>
      <Textarea id="notes" label="Notes" value={m.notes} onChange={(e)=>setM(s=>({...s,notes:e.target.value}))} error={errors['notes']} />
      <div className="flex gap-2">
        <button onClick={save} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">Save</button>
        <a href={projectId ? `/projects/${projectId}/tasks` : "/tasks"} className="text-sm underline">Cancel</a>
      </div>
    </div>
  );
}

