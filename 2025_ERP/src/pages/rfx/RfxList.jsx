import React from "react";
import { Link } from "react-router-dom";
import DataGrid from "@/components/datagrid/DataGrid.jsx";
import { apiGet } from "@/lib/api";

export default function RfxList() {
  const columns = React.useMemo(() => [
    { key: "title", header: "RFx", sortable: true, filter: { type: "text", placeholder: "title/code…" },
      render: (r) => <Link to={`/rfx/${r.id}`} className="text-blue-700 hover:underline">{r.title || r.code || `RFx #${r.id}`}</Link> },
    { key: "projectId", header: "Project", serverKey: "projectId", sortable: true, filter: {
        type: "select", options: async () => {
          const res = await apiGet("/api/projects", { limit: 200, orderBy: "name.asc" });
          const arr = Array.isArray(res) ? res : res.items || [];
          return arr.map(p => ({ value: p.id, label: p.name }));
        }},
      render: (r) => r.project ? <Link to={`/projects/${r.project.id}`} className="text-blue-700 hover:underline">{r.project.name}</Link> : "—" },
    { key: "status", header: "Status", sortable: true, filter: { type: "select",
      options: ["draft","open","clarifying","closed","awarded","cancelled"].map(x=>({value:x,label:x})) } },
    { key: "dueDate", header: "Due", sortable: true, filter: { type: "date" },
      render: (r) => {
        const d = r.deadline || r.dueDate;
        return d ? new Date(d).toLocaleDateString("en-GB") : "—";
      } },
    { key: "submissions", header: "Subs", sortable: true,
      render: (r) => typeof r.submissionsCount === "number" ? r.submissionsCount : (r.submissions?.length ?? "—") },
  ], []);

  const fetcher = React.useCallback(async ({ limit, offset, orderBy, filters }) => {
    const qs = new URLSearchParams({ limit, offset, orderBy: orderBy || "dueDate.asc" });
    if (filters.title) qs.set("q", filters.title);
    if (filters.projectId) qs.set("projectId", String(filters.projectId));
    if (filters.status) qs.set("status", filters.status);
    if (filters.dueDate) qs.set("dueBy", filters.dueDate);
    // Backend exposes RFx under /api/requests
    const res = await apiGet(`/api/requests${qs.toString() ? `?${qs.toString()}` : ''}`);
    const items = Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : res.items || []);
    const total = Number(res?.total ?? (Array.isArray(items) ? items.length : 0));
    return { items, total };
  }, []);

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">RFx</h1>
      <DataGrid columns={columns} fetcher={fetcher} stateKey="grid:rfx" />
    </div>
  );
}
