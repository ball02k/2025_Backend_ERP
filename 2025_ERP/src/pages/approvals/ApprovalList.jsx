import React from "react";
import DataGrid from "@/components/datagrid/DataGrid.jsx";
import { apiGet } from "@/lib/api";

export default function ApprovalList() {
  const columns = [
    { key: "entityType", header: "Type", sortable: true, filter: { type: "select",
      options: ["po","invoice","variation","rfx","document","other"].map(x=>({value:x,label:x.toUpperCase()})) } },
    { key: "entityId", header: "Record", sortable: true, filter: { type: "text", placeholder: "id…" },
      render: (r) => {
        const map = { po: `/finance/pos/${r.entityId}`, invoice: `/finance/invoices/${r.entityId}`, variation: `/variations/${r.entityId}`, rfx: `/rfx/${r.entityId}`, document: `/documents/${String(r.entityId)}` };
        const to = map[r.entityType] || "#";
        return <a href={to} className="text-blue-700 hover:underline">{`${(r.entityType||'').toUpperCase()} #${r.entityId}`}</a>;
      } },
    { key: "status", header: "Status", sortable: true, filter: { type: "select",
      options: ["pending","approved","rejected"].map(x=>({value:x,label:x})) } },
    { key: "ownerId", header: "Owner", sortable: true, filter: { type: "text", placeholder: "user id…" } },
    { key: "createdAt", header: "Created", sortable: true, render: (r) => r.createdAt ? new Date(r.createdAt).toLocaleString("en-GB") : "—" },
  ];

  const fetcher = async ({ limit, offset, orderBy, filters }) => {
    const qs = new URLSearchParams({ limit, offset, orderBy: orderBy || "createdAt.desc" });
    if (filters.entityType) qs.set("entityType", filters.entityType);
    if (filters.entityId) qs.set("entityId", String(filters.entityId));
    if (filters.status) qs.set("status", filters.status);
    if (filters.ownerId) qs.set("ownerId", String(filters.ownerId));
    const res = await apiGet(`/api/approvals?${qs.toString()}`);
    const items = Array.isArray(res) ? res : res.items || [];
    const total = Array.isArray(res) ? items.length : res.total ?? items.length;
    return { items, total };
  };

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">Approvals</h1>
      <DataGrid columns={columns} fetcher={fetcher} stateKey="grid:approvals" />
    </div>
  );
}

