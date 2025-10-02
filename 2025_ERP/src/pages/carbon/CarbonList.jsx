import React from "react";
import DataGrid from "@/components/datagrid/DataGrid.jsx";
import { apiGet } from "@/lib/api";

export default function CarbonList() {
  const columns = [
    { key: "reference", header: "Item", sortable: true, filter: { type: "text", placeholder: "ref/title…" },
      render: (r) => <a href={`/carbon/${r.id}`} className="text-blue-700 hover:underline">{r.title || r.reference || `Carbon #${r.id}`}</a> },
    { key: "projectId", header: "Project", serverKey: "projectId", sortable: true, filter: {
      type: "select", options: async () => {
        const res = await apiGet("/api/projects", { limit: 200, orderBy: "name.asc" });
        const arr = Array.isArray(res) ? res : res.items || [];
        return arr.map(p => ({ value: p.id, label: p.name }));
      }},
      render: (r) => r.project ? <a href={`/projects/${r.project.id}`} className="text-blue-700 hover:underline">{r.project.name}</a> : "—" },
    { key: "category", header: "Category", sortable: true, filter: { type: "select",
      options: ["A1-A3","A4","A5","B","C","Other"].map(x=>({value:x,label:x})) } },
    { key: "value", header: "tCO₂e", sortable: true,
      render: (r) => typeof r.value === "number" ? r.value.toLocaleString("en-GB") : "—" },
  ];

  const fetcher = async ({ limit, offset, orderBy, filters }) => {
    const qs = new URLSearchParams({ limit, offset, orderBy: orderBy || "createdAt.desc" });
    if (filters.reference) qs.set("q", filters.reference);
    if (filters.projectId) qs.set("projectId", String(filters.projectId));
    if (filters.category) qs.set("category", filters.category);
    const res = await apiGet(`/api/carbon/items?${qs.toString()}`);
    const items = Array.isArray(res) ? res : res.items || [];
    const total = Array.isArray(res) ? items.length : res.total ?? items.length;
    return { items, total };
  };

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">Carbon</h1>
      <DataGrid columns={columns} fetcher={fetcher} stateKey="grid:carbon" />
    </div>
  );
}

