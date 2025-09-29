import React from "react";
import { useParams } from "react-router-dom";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm mb-1">{label}</span>
      {children}
    </label>
  );
}

export default function OnboardPublic() {
  const { token } = useParams();
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [supplier, setSupplier] = React.useState(null);
  const [form, setForm] = React.useState({ email: "", phone: "", insurancePolicyNumber: "", insuranceExpiry: "" });
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async ()=>{
      try {
        const r = await fetch(`/public/onboard/${token}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Invalid or expired link");
        if (!alive) return;
        setSupplier(j?.supplier || null);
        setForm(f => ({ ...f, email: j?.supplier?.email || "", phone: j?.supplier?.phone || "" }));
      } catch (e) { if (alive) setErr(e.message || "Failed to open link"); }
      finally { if (alive) setLoading(false); }
    })();
    return ()=> { alive = false; };
  }, [token]);

  async function submit() {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/public/onboard/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok) throw new Error(j?.error || "Submission failed");
      setDone(true);
    } catch (e) { setErr(e.message || "Submission failed"); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="p-8 text-sm text-slate-600">Loading…</div>;
  if (err) return <div className="p-8 text-sm text-red-600">Error: {err}</div>;
  if (!supplier) return <div className="p-8 text-sm text-red-600">Supplier not found</div>;
  if (done) return <div className="p-8 text-sm text-green-700">Thank you — your onboarding details were submitted.</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-6">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Supplier Onboarding</h1>
        <p className="text-sm text-slate-600 mb-4">For: <span className="font-medium">{supplier.name}</span></p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Email">
            <input className="w-full rounded-md border px-3 py-2" value={form.email} onChange={(e)=>setForm(f=>({...f, email:e.target.value}))} />
          </Field>
          <Field label="Phone">
            <input className="w-full rounded-md border px-3 py-2" value={form.phone} onChange={(e)=>setForm(f=>({...f, phone:e.target.value}))} />
          </Field>
          <Field label="Insurance Policy No.">
            <input className="w-full rounded-md border px-3 py-2" value={form.insurancePolicyNumber} onChange={(e)=>setForm(f=>({...f, insurancePolicyNumber:e.target.value}))} />
          </Field>
          <Field label="Insurance Expiry (YYYY-MM-DD)">
            <input className="w-full rounded-md border px-3 py-2" placeholder="YYYY-MM-DD" value={form.insuranceExpiry} onChange={(e)=>setForm(f=>({...f, insuranceExpiry:e.target.value}))} />
          </Field>
        </div>

        {!!err && <div className="text-sm text-red-600 mt-3">{err}</div>}

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={submit} disabled={busy} className="px-3 py-2 rounded-md bg-blue-600 text-white">
            {busy ? "Submitting…" : "Submit"}
          </button>
        </div>

        <p className="text-xs text-slate-500 mt-4">
          By submitting, you confirm the details are accurate. Your secure link will expire automatically.
        </p>
      </div>
    </div>
  );
}

