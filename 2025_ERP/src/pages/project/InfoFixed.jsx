import React, { useContext, useEffect, useState, useMemo, useCallback, useRef, useSyncExternalStore } from "react";
import { useParams } from "react-router-dom";
import { apiGet, apiPut } from "@/lib/api";
import { AppContext } from "@/context/AppContext.jsx";
import { AuthContext } from "@/context/AuthContext.jsx";
import { TenantContext } from "@/context/TenantContext.jsx";

export default function InfoFixed() {
  if (typeof import.meta !== 'undefined' && import.meta?.env?.DEV) console.warn("Rendering InfoFixed.jsx ✅");

  // ---- FIXED ORDER: contexts -> refs -> state -> external store -> memos -> callbacks -> effects ----
  const app = useContext(AppContext);
  const auth = useContext(AuthContext);
  const tenant = useContext(TenantContext);

  const mountedRef = useRef(false);

  const { id: projectIdParam } = useParams();
  const projectId = Number(projectIdParam);

  const [project, setProject] = useState(null);
  const [form, setForm] = useState({ name:"", code:"", status:"", type:"", description:"" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // If you have a central project store, wire it here; else stub a no-op:
  const subscribeProject = useCallback(() => () => {}, []);
  const getProjectSnapshot = useCallback(() => ({}), []);
  const projectStore = useSyncExternalStore(subscribeProject, getProjectSnapshot, getProjectSnapshot);

  const canEdit = useMemo(() => Boolean(auth?.canEditProject ?? true), [auth]);
  const title   = useMemo(() => project?.name ? `Project: ${project.name}` : "Project Info", [project]);

  const onChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }, []);

  const load = useCallback(async () => {
    if (!Number.isFinite(projectId)) return;
    setLoading(true);
    try {
      // canonical /api path, tolerate wrapped payloads
      const data = await apiGet(`/api/projects/${projectId}`);
      const proj = data?.project ?? data?.data ?? data ?? null;
      setProject(proj);
      setForm({
        name: proj?.name ?? "", code: proj?.code ?? "", status: proj?.status ?? "",
        type: proj?.type ?? "", description: proj?.description ?? ""
      });
    } catch (e) {
      console.error("InfoFixed load error", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const onCancel = useCallback(() => {
    if (!project) return;
    setForm({
      name: project?.name ?? "", code: project?.code ?? "", status: project?.status ?? "",
      type: project?.type ?? "", description: project?.description ?? ""
    });
  }, [project]);

  const onSave = useCallback(async () => {
    if (!canEdit || !Number.isFinite(projectId)) return;
    setSaving(true);
    try {
      const updated = await apiPut(`/api/projects/${projectId}`, form);
      const proj = updated?.project ?? updated?.data ?? updated ?? null;
      setProject(proj);
    } catch (e) {
      console.error("InfoFixed save error", e);
    } finally {
      setSaving(false);
    }
  }, [canEdit, form, projectId]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    load();
  }, [load]);

  // ---- Render AFTER all hooks are declared (no early returns above) ----
  if (!Number.isFinite(projectId)) return <div className="text-sm text-gray-500">Invalid project id.</div>;
  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;
  if (!project) return <div className="text-sm text-gray-500">Project not found.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{title}</h3>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 rounded border" onClick={onCancel}>Reset</button>
            <button className="px-3 py-1 rounded bg-gray-900 text-white disabled:opacity-50"
                    onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          ["name","Name"],["code","Code"],["status","Status"],["type","Type"]
        ].map(([n, label]) => (
          <label key={n} className="block">
            <span className="block text-xs text-gray-500">{label}</span>
            <input name={n} value={form[n]} onChange={onChange}
                   className="mt-1 w-full rounded border px-3 py-2" />
          </label>
        ))}
        <label className="block md:col-span-2">
          <span className="block text-xs text-gray-500">Description</span>
          <textarea name="description" rows={3} value={form.description} onChange={onChange}
                    className="mt-1 w-full rounded border px-3 py-2" />
        </label>
      </div>
    </div>
  );
}

