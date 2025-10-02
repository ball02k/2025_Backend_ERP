import React from "react";
import { useParams } from "react-router-dom";
import { apiGet, apiPost, apiPut, toastOk, toastErr } from "@/lib/api";
import { validate, hasErrors } from "@/lib/validation";
import Input from "@/components/forms/Input.jsx";
import Textarea from "@/components/forms/Textarea.jsx";

export default function ProjectEdit() {
  const { id } = useParams();
  const isEdit = !!id && id !== 'new';
  const [model, setModel] = React.useState({ name:"", clientId:"", contractValue:"", startDate:"", endDate:"", notes:"" });
  const [errors, setErrors] = React.useState({});
  const [loading, setLoading] = React.useState(isEdit);

  React.useEffect(() => { (async ()=>{
    if (!isEdit) return;
    try {
      const res = await apiGet(`/api/projects/${id}`);
      const proj = res?.data || res || {};
      setModel({
        id: proj.id,
        name: proj.name || "",
        clientId: proj.clientId != null ? String(proj.clientId) : "",
        contractValue: proj.contractValue != null ? String(proj.contractValue) : "",
        startDate: proj.startDate ? String(proj.startDate).slice(0,10) : "",
        endDate: proj.endDate ? String(proj.endDate).slice(0,10) : "",
        notes: proj.description || "",
      });
    } catch (e) { toastErr(e, 'Failed to load project'); }
    finally { setLoading(false); }
  })(); }, [isEdit, id]);

  const rules = {
    name: [{ type: "required" }],
    clientId: [{ type: "required" }],
    contractValue: [{ type: "min", value: 0, message: "Must be ≥ 0" }],
    startDate: [{ type: "date" }],
    endDate: [{ type: "date" }],
  };

  const onSave = async () => {
    const errs = validate(model, rules);
    setErrors(errs);
    if (hasErrors(errs)) { window.scrollTo(0,0); return; }
    try {
      const body = { ...model, clientId: Number(model.clientId)||null, contractValue: Number(model.contractValue)||0, description: model.notes };
      const saved = model.id ? await apiPut(`/api/projects/${model.id}`, body) : await apiPost("/api/projects", body);
      const proj = saved?.data || saved;
      toastOk("Project saved");
      location.href = `/projects/${proj.id}`;
    } catch (e) {
      if (e.fieldErrors) setErrors(e.fieldErrors);
      toastErr(e, "Failed to save project");
    }
  };

  if (loading) return <div className="p-4 text-sm text-slate-600">Loading…</div>;
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">{isEdit ? "Edit Project" : "New Project"}</h1>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input id="name" label="Name" required value={model.name} onChange={(e)=>setModel(m=>({...m,name:e.target.value}))} error={errors["name"]} />
        <Input id="clientId" label="Client ID" required value={model.clientId} onChange={(e)=>setModel(m=>({...m,clientId:e.target.value}))} error={errors["clientId"]} />
        <Input id="contractValue" label="Contract Value (GBP)" type="number" value={model.contractValue} onChange={(e)=>setModel(m=>({...m,contractValue:e.target.value}))} error={errors["contractValue"]} />
        <Input id="startDate" label="Start date" type="date" value={model.startDate} onChange={(e)=>setModel(m=>({...m,startDate:e.target.value}))} error={errors["startDate"]} />
        <Input id="endDate" label="End date" type="date" value={model.endDate} onChange={(e)=>setModel(m=>({...m,endDate:e.target.value}))} error={errors["endDate"]} />
        <Textarea id="notes" label="Notes" value={model.notes} onChange={(e)=>setModel(m=>({...m,notes:e.target.value}))} error={errors["notes"]} />
      </div>

      <div className="flex gap-2">
        <button onClick={onSave} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">Save</button>
        <a href="/projects" className="text-sm underline">Cancel</a>
      </div>
    </div>
  );
}

