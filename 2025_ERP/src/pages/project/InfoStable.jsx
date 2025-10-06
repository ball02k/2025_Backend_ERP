import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { apiGet, apiPut } from "@/lib/api";

/* runtime marker */ if (typeof import.meta !== 'undefined' && import.meta?.env?.DEV) console.warn("Rendering InfoStable.jsx");

export default function InfoStable() {
  // ---- FIXED ORDER: refs -> state -> memos -> callbacks -> effects ----
  const { id: projectIdParam } = useParams();
  const projectId = Number(projectIdParam);

  const mountedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    status: "",
    type: "",
    description: "",
  });

  const canEdit = true; // while building; wire RBAC later

  const title = useMemo(() => (project?.name ? `Project: ${project.name}` : "Project Info"), [project]);

  const load = useCallback(async () => {
    if (!Number.isFinite(projectId)) return;
    setLoading(true);
    try {
      const data = await apiGet(`/api/projects/${projectId}`);
      const proj = (data && (data.project || data.data)) ? (data.project || data.data) : data;
      setProject(proj || null);
      setForm({
        name: proj?.name ?? "",
        code: proj?.code ?? "",
        status: proj?.status ?? "",
        type: proj?.type ?? "",
        description: proj?.description ?? "",
      });
    } catch (e) {
      console.error("InfoStable load error", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const onChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }, []);

  const onCancel = useCallback(() => {
    if (!project) return;
    setForm({
      name: project?.name ?? "",
      code: project?.code ?? "",
      status: project?.status ?? "",
      type: project?.type ?? "",
      description: project?.description ?? "",
    });
    setEdit(false);
  }, [project]);

  const onSave = useCallback(async () => {
    if (!canEdit || !Number.isFinite(projectId)) return;
    setSaving(true);
    try {
      const updated = await apiPut(`/api/projects/${projectId}`, form);
      const proj = (updated && (updated.project || updated.data)) ? (updated.project || updated.data) : updated;
      setProject(proj || null);
      setEdit(false);
    } catch (e) {
      console.error("InfoStable save error", e);
    } finally {
      setSaving(false);
    }
  }, [canEdit, form, projectId]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    load();
  }, [load]);

  // ---- RENDER BRANCHING AFTER hooks (no early returns before hooks) ----
  if (!Number.isFinite(projectId)) return <div className="text-sm text-gray-500">Invalid project id.</div>;
  if (loading) return <div className="text-sm text-gray-500">Loading project…</div>;
  if (!project) return <div className="text-sm text-gray-500">Project not found.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{title}</h3>
        {canEdit && (
          <div className="flex items-center gap-2">
            {!edit ? (
              <button className="px-3 py-1 rounded bg-gray-900 text-white" onClick={() => setEdit(true)}>Edit</button>
            ) : (
              <>
                <button className="px-3 py-1 rounded border" onClick={onCancel}>Cancel</button>
                <button className="px-3 py-1 rounded bg-gray-900 text-white disabled:opacity-50"
                        onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-xs text-gray-500">Name</span>
          <input name="name" value={edit ? form.name : (project?.name ?? "")}
                 onChange={onChange} disabled={!edit}
                 className="mt-1 w-full rounded border px-3 py-2" />
        </label>

        <label className="block">
          <span className="block text-xs text-gray-500">Code</span>
          <input name="code" value={edit ? form.code : (project?.code ?? "")}
                 onChange={onChange} disabled={!edit}
                 className="mt-1 w-full rounded border px-3 py-2" />
        </label>

        <label className="block">
          <span className="block text-xs text-gray-500">Status</span>
          <input name="status" value={edit ? form.status : (project?.status ?? "")}
                 onChange={onChange} disabled={!edit}
                 className="mt-1 w-full rounded border px-3 py-2" />
        </label>

        <label className="block">
          <span className="block text-xs text-gray-500">Type</span>
          <input name="type" value={edit ? form.type : (project?.type ?? "")}
                 onChange={onChange} disabled={!edit}
                 className="mt-1 w-full rounded border px-3 py-2" />
        </label>

        <label className="block md:col-span-2">
          <span className="block text-xs text-gray-500">Description</span>
          <textarea name="description" rows={3}
                    value={edit ? form.description : (project?.description ?? "")}
                    onChange={onChange} disabled={!edit}
                    className="mt-1 w-full rounded border px-3 py-2" />
        </label>
      </div>
    </div>
  );
}
