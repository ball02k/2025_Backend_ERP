import React from "react";
import { useParams, Link } from "react-router-dom";
import { apiGet } from "@/lib/api";

export default function RfxDetail() {
  const { id } = useParams();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true); setError("");
      try {
        const res = await apiGet(`/api/requests/${id}/bundle`);
        const bundle = res?.data || res; // { request, sections }
        const row = bundle?.request ? { ...bundle.request, sections: bundle.sections || [] } : null;
        if (isMounted) setData(row);
      } catch (e) {
        if (isMounted) setError(e?.message || "Failed to load RFx");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [id]);

  if (loading) return <div className="p-4">Loading…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!data) return <div className="p-4">Not found</div>;

  const deadline = data?.deadline ? new Date(data.deadline).toLocaleString() : "—";

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{data.title || `RFx #${data.id}`}</h1>
        <Link to="/rfx" className="text-blue-700 hover:underline">Back to RFx</Link>
      </div>
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">ID</dt>
            <dd className="text-sm">{data.id}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Type</dt>
            <dd className="text-sm">{data.type || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Status</dt>
            <dd className="text-sm">{data.status || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Deadline</dt>
            <dd className="text-sm">{deadline}</dd>
          </div>
        </dl>
      </div>
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold">Sections</h2>
        {Array.isArray(data.sections) && data.sections.length ? (
          <div className="space-y-4">
            {data.sections.map((s) => (
              <div key={s.id}>
                <div className="font-medium">{s.title}</div>
                {Array.isArray(s.questions) && s.questions.length ? (
                  <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                    {s.questions.map((q) => (
                      <li key={q.id} className="py-0.5">
                        <span className="text-slate-900">{q.prompt}</span>
                        <span className="ml-2 text-slate-500">[{q.qType}{q.required ? ", required" : ""}]</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-slate-500">No questions</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500">No sections</div>
        )}
      </div>
    </div>
  );
}
