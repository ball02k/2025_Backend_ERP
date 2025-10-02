import React from "react";
import DataGrid from "@/components/datagrid/DataGrid.jsx";
import { apiGet } from "@/lib/api";

export default function ReportList() {
  const columns = [
    { key: "name", header: "Report", sortable: true, filter: { type: "text", placeholder: "name…" } },
    { key: "type", header: "Type", sortable: true, filter: { type: "select",
      options: ["Financial","Procurement","Delivery","Carbon","QA","H&S","Other"].map(x=>({value:x,label:x})) } },
    { key: "lastRunAt", header: "Last run", sortable: true, render: (r) => r.lastRunAt ? new Date(r.lastRunAt).toLocaleString("en-GB") : "—" },
    { key: "status", header: "Status", sortable: true, filter: { type: "select",
      options: ["ok","failed","queued","stale"].map(x=>({value:x,label:x})) } },
    { key: "actions", header: "Actions", render: (r) => (
      <div className="text-sm">
        <a className="mr-2 underline" href={`/reports/${r.id}`}>Open</a>
        <a className="underline" href={`/reports/${r.id}/run`}>Run</a>
      </div>
    )},
  ];

  const fetcher = async ({ limit, offset, orderBy, filters }) => {
    const qs = new URLSearchParams({ limit, offset, orderBy: orderBy || "name.asc" });
    if (filters.name) qs.set("q", filters.name);
    if (filters.type) qs.set("type", filters.type);
    if (filters.status) qs.set("status", filters.status);
    const res = await apiGet(`/api/reports?${qs.toString()}`);
    const items = Array.isArray(res) ? res : res.items || [];
    const total = Array.isArray(res) ? items.length : res.total ?? items.length;
    return { items, total };
  };

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">Reports</h1>
      <DataGrid columns={columns} fetcher={fetcher} stateKey="grid:reports" />
    </div>
  );
}

