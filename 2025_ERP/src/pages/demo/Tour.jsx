import React from "react";

const steps = [
  { id: 1, title: "Open a Project", href: "/projects", detail: "See overview, tabs and cross-links (≤2 clicks)." },
  { id: 2, title: "Procurement → PO", href: "/finance/pos", detail: "Create from blank or pre-populate, preview document." },
  { id: 3, title: "Invoices → Auto-match", href: "/finance/invoices", detail: "Upload a PDF; OCR stub extracts and links to a PO." },
  { id: 4, title: "Documents hub", href: "/documents", detail: "Filter by Project/Category; open preview; see links." },
  { id: 5, title: "Variations", href: "/variations", detail: "Create, link to Project; see Financials tab update." },
];

export default function Tour() {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Demo Tour</h1>
      <ol className="space-y-2">
        {steps.map(s=> (
          <li key={s.id} className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{s.title}</div>
                <div className="text-sm text-gray-600">{s.detail}</div>
              </div>
              <a className="rounded-md border px-3 py-1.5 text-sm underline" href={s.href}>Go</a>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-gray-500">Note: destructive actions are disabled in demo.</p>
    </div>
  );
}

