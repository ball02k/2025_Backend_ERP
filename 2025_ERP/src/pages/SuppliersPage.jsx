import React from "react";
import { apiGet, apiPost } from "@/lib/api";

// Tiny fallback shell if you don’t have AppShell
function Shell({ children }) { return <div className="min-h-screen bg-slate-50">{children}</div>; }
// Try to use existing AppShell if present (via Vite glob); fall back otherwise
const shells = import.meta.glob('../components/layout/AppShell.{tsx,jsx}', { eager: true });
const MaybeShell = Object.values(shells)[0]?.default || Shell;

// Minimal toast fallback (no new deps). If you have a ToastProvider, replace these with it.
function useToasts() {
  return {
    push: (msg, type = "info") => {
      console[type === "error" ? "error" : "log"](`[${type}] ${msg}`);
    },
  };
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function SuppliersPage() {
  const { push } = useToasts();
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  const [obModal, setObModal] = React.useState({ open: false, supplier: null, link: "", busy: false });

  React.useEffect(() => {
    let alive = true;
    (async ()=>{
      try {
        const d = await apiGet("/api/suppliers", { limit: 200, offset: 0 });
        const list = d?.data || d?.items || d || [];
        if (alive) setRows(Array.isArray(list) ? list : []);
      } catch (e) { if (alive) setErr(e.message || "Failed to load suppliers"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  async function genOnboardingLink(s) {
    setObModal(m => ({ ...m, open: true, supplier: s, busy: true, link: "" }));
    try {
      const res = await apiPost(`/api/suppliers/${s.id}/onboarding-link`, {});
      const url = res?.data?.url || res?.url || "";
      if (!url) throw new Error("No link returned");
      setObModal(m => ({ ...m, link: url, busy: false }));
      push("Onboarding link generated", "success");
    } catch (e) {
      setObModal(m => ({ ...m, busy: false }));
      push(e.message || "Failed to generate onboarding link", "error");
    }
  }

  function copyLink() {
    if (!obModal.link) return;
    try {
      navigator.clipboard.writeText(obModal.link);
      push("Link copied to clipboard", "success");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = obModal.link; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
      push("Link copied", "success");
    }
  }

  return (
    <MaybeShell>
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          <h1 className="text-xl font-semibold text-slate-900">Suppliers</h1>
          <a
            href="/suppliers/new"
            className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
          >New Supplier</a>
        </div>

        {loading && <div className="text-sm text-slate-500">Loading…</div>}
        {!loading && err && <div className="text-sm text-red-600">Error: {err}</div>}

        {!loading && !err && rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Trade</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{s.name}</td>
                    <td className="px-4 py-3">{s.email || "—"}</td>
                    <td className="px-4 py-3">{s.trade || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => genOnboardingLink(s)}
                        className="px-3 py-1 rounded-lg border text-sm hover:bg-slate-50"
                      >
                        Generate onboarding link
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={obModal.open}
        onClose={() => setObModal({ open:false, supplier:null, link:"", busy:false })}
        title={obModal.supplier ? `Onboarding: ${obModal.supplier.name}` : "Onboarding"}
      >
        {obModal.busy ? (
          <div className="text-sm text-slate-500">Generating link…</div>
        ) : obModal.link ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Share this link with the supplier to complete onboarding. This link expires automatically.
            </p>
            <div className="flex items-center gap-2">
              <input readOnly value={obModal.link} className="flex-1 rounded-md border px-3 py-2 text-sm" />
              <button onClick={copyLink} className="px-3 py-2 rounded-md border text-sm hover:bg-slate-50">Copy</button>
            </div>
            <div className="text-xs text-slate-500">If the link stops working, generate a new one.</div>
          </div>
        ) : (
          <div className="text-sm text-red-600">Could not generate a link. Ensure backend endpoint is deployed.</div>
        )}
      </Modal>
    </MaybeShell>
  );
}
