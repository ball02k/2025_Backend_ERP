import React from "react";
import DataGrid from "@/components/datagrid/DataGrid.jsx";
import { apiGet } from "@/lib/api";

export default function AuditList() {
  const columns = [
    { key: "createdAt", header: "Time", sortable: true, filter: { type: "date" },
      render: (r) => r.createdAt ? new Date(r.createdAt).toLocaleString("en-GB") : "—" },
    { key: "userName", header: "Actor", sortable: true, filter: { type: "text", placeholder: "name/id…" },
      render: (r) => r.userId ? <a href={`/users/${r.userId}`} className="text-blue-700 hover:underline">{r.userName || `User #${r.userId}`}</a> : (r.userName || "—") },
    { key: "action", header: "Action", sortable: true, filter: { type: "text", placeholder: "e.g. create…" } },
    { key: "entityType", header: "Entity", sortable: true, filter: { type: "text", placeholder: "project/supplier/…" },
      render: (r) => {
        const map = { project: `/projects/${r.entityId}`, supplier: `/suppliers/${r.entityId}`, invoice: `/finance/invoices/${r.entityId}`, po: `/finance/pos/${r.entityId}`, document: `/documents/${String(r.entityId)}` };
        const to = map[r.entityType] || "#";
        return r.entityId ? <a href={to} className="text-blue-700 hover:underline">{`${r.entityType} #${r.entityId}`}</a> : r.entityType;
      } },
    { key: "meta", header: "Meta", filter: { type: "text", placeholder: "contains…" },
      render: (r) => <span className="truncate inline-block max-w-[380px] align-top text-gray-600">{JSON.stringify(r.meta || {}).slice(0,180)}</span> },
  ];

  const fetcher = async ({ limit, offset, orderBy, filters }) => {
    const qs = new URLSearchParams({ limit, offset, orderBy: orderBy || "createdAt.desc" });
    if (filters.createdAt) qs.set("date", filters.createdAt);
    if (filters.userName) qs.set("user", filters.userName);
    if (filters.action) qs.set("action", filters.action);
    if (filters.entityType) qs.set("entityType", filters.entityType);
    if (filters.meta) qs.set("q", filters.meta);
    const res = await apiGet(`/api/audit?${qs.toString()}`);
    const items = Array.isArray(res) ? res : res.items || [];
    const total = Array.isArray(res) ? items.length : res.total ?? items.length;
    return { items, total };
  };

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">Audit</h1>
      <DataGrid columns={columns} fetcher={fetcher} stateKey="grid:audit" />
    </div>
  );
}

