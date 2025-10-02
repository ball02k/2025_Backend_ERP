import React from "react";
import { useParams } from "react-router-dom";
import { useProjectFinance } from "@/pages/project/FinanceContext";
import DataGrid from "@/components/datagrid/DataGrid.jsx";
import { apiGet } from "@/lib/api";
import FinanceBreadcrumb from '@/components/finance/FinanceBreadcrumb';

export default function ReceiptList() {
  const { id: projectParam } = useParams();
  const ctx = (typeof useProjectFinance === 'function' ? useProjectFinance() : {}) || {};
  const projectId = Number.isFinite(ctx.projectId) ? Number(ctx.projectId) : (projectParam ? Number(projectParam) : undefined);
  const columns = [
    { key: "receivedDate", header: "Date", sortable: true, filter: { type: "date" },
      render: (r) => r.receivedDate ? new Date(r.receivedDate).toLocaleDateString("en-GB") : "—" },
    { key: "purchaseOrderId", header: "PO", serverKey: "poId", sortable: true, filter: { type: "text", placeholder: "PO no/id…" },
      render: (r) => {
        const pid = Number.isFinite(projectId) ? Number(projectId) : (r.project?.id ? Number(r.project.id) : undefined);
        const href = pid ? `/projects/${pid}/finance/pos/${r.purchaseOrder?.id}` : `/finance/pos/${r.purchaseOrder?.id}`;
        return r.purchaseOrder
          ? (<a href={href} className="text-blue-700 hover:underline">{r.purchaseOrder.poNumber || `PO #${r.purchaseOrder.id}`}</a>)
          : <span className="text-gray-400">—</span>;
      } },
    { key: "projectId", header: "Project", serverKey: "projectId", sortable: true, filter: {
        type: "select", options: async () => {
          const res = await apiGet("/api/projects", { limit: 200, orderBy: "name.asc" });
          const arr = Array.isArray(res) ? res : res.items || [];
          return arr.map(p => ({ value: p.id, label: p.name }));
        }},
      render: (r) => r.project ? (<a href={`/projects/${r.project.id}`} className="text-blue-700 hover:underline">{r.project.name}</a>) : "—" },
    { key: "note", header: "Note", filter: { type: "text", placeholder: "contains…" } },
  ];

  const fetcher = async ({ limit, offset, orderBy, filters }) => {
    const qs = new URLSearchParams({ limit, offset, orderBy: orderBy || "receivedDate.desc" });
    if (filters.poId || filters.purchaseOrderId) qs.set("poId", String(filters.poId || filters.purchaseOrderId));
    if (Number.isFinite(projectId)) qs.set("projectId", String(projectId));
    else if (filters.projectId) qs.set("projectId", String(filters.projectId));
    if (filters.receivedDate) qs.set("date", filters.receivedDate);
    if (filters.note) qs.set("q", filters.note);
    const res = await apiGet(`/api/finance/receipts?${qs.toString()}`);
    const items = Array.isArray(res) ? res : res.items || [];
    const total = Array.isArray(res) ? items.length : res.total ?? items.length;
    return { items, total };
  };

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Receipts</h1>
      </div>
      <FinanceBreadcrumb section="receipts" />
      <DataGrid columns={columns} fetcher={fetcher} stateKey="grid:finance:receipts" />
    </div>
  );
}
