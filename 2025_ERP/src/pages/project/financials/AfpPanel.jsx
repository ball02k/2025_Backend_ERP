import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet } from "@/lib/api";

export default function AfpPanel() {
  const { id: projectIdParam } = useParams();
  const projectId = Number(projectIdParam);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet("/api/afp", { projectId });
        if (!cancelled) setRows(data?.items ?? []);
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load AFPs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) return <div className="text-sm text-gray-500">Loading AFP…</div>;
  if (err) return <div className="text-sm text-red-600">{String(err)}</div>;

  return (
    <div className="space-y-3 p-4">
      <h3 className="text-base font-semibold">Applications for Payment</h3>
      {rows.length === 0 ? (
        <div className="text-sm text-gray-500">No AFPs yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Period</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-left">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.period ?? "-"}</td>
                  <td className="px-3 py-2">{r.status ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{r.value ?? "-"}</td>
                  <td className="px-3 py-2">{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

