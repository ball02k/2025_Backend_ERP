import React from "react";
import DataGrid from "@/components/datagrid/DataGrid.jsx";
import { apiGet } from "@/lib/api";

export default function MeetingList() {
  const columns = [
    { key: "title", header: "Meeting", sortable: true, filter: { type: "text", placeholder: "title…" },
      render: (r) => <a href={`/meetings/${r.id}`} className="text-blue-700 hover:underline">{r.title || `Meeting #${r.id}`}</a> },
    { key: "projectId", header: "Project", serverKey: "projectId", sortable: true, filter: {
        type: "select", options: async () => {
          const res = await apiGet("/api/projects", { limit: 200, orderBy: "name.asc" });
          const arr = Array.isArray(res) ? res : res.items || [];
          return arr.map(p => ({ value: p.id, label: p.name }));
        }},
      render: (r) => r.project ? <a href={`/projects/${r.project.id}`} className="text-blue-700 hover:underline">{r.project.name}</a> : "—" },
    { key: "type", header: "Type", sortable: true, filter: { type: "select",
      options: ["Progress","Design","Commercial","H&S","QA","Other"].map(x=>({value:x,label:x})) } },
    { key: "date", header: "Date", sortable: true, filter: { type: "date" },
      render: (r) => r.date ? new Date(r.date).toLocaleString("en-GB") : "—" },
  ];

  const fetcher = async ({ limit, offset, orderBy, filters }) => {
    const qs = new URLSearchParams({ limit, offset, orderBy: orderBy || "date.desc" });
    if (filters.title) qs.set("q", filters.title);
    if (filters.projectId) qs.set("projectId", String(filters.projectId));
    if (filters.type) qs.set("type", filters.type);
    if (filters.date) qs.set("date", filters.date);
    const res = await apiGet(`/api/meetings?${qs.toString()}`);
    const items = Array.isArray(res) ? res : res.items || [];
    const total = Array.isArray(res) ? items.length : res.total ?? items.length;
    return { items, total };
  };

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">Meetings & Comms</h1>
      <DataGrid columns={columns} fetcher={fetcher} stateKey="grid:meetings" />
    </div>
  );
}

