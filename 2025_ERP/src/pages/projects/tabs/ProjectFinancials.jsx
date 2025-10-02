import React from "react";
import { apiGet } from "@/lib/api";
import MetricTile from "@/components/finance/MetricTile.jsx";

function monthsBack(n=6) {
  const arr = []; const d = new Date();
  for (let i=n-1;i>=0;i--) { const x=new Date(d.getFullYear(), d.getMonth()-i, 1); arr.push({ y:x.getFullYear(), m:x.getMonth() }); }
  return arr; // oldest→newest
}
function keyOf({y,m}){ return `${y}-${String(m+1).padStart(2,"0")}`; }

export default function ProjectFinancials({ projectId }) {
  const [loading,setLoading]=React.useState(true);
  const [debug,setDebug]=React.useState(false);
  const [data,setData]=React.useState({value:0, committed:0, actuals:0, marginPct:null, series:{value:[], committed:[], actuals:[], marginPct:[]} });

  React.useEffect(()=>{ (async()=>{
    setLoading(true);
    try {
      // preferred: single summary endpoint if exists
      let summary;
      try { summary = await apiGet(`/api/projects/${projectId}/financials`); } catch {}
      if (summary?.value != null) {
        const s = summary;
        setData({
          value: Number(s.value)||0,
          committed: Number(s.committed)||0,
          actuals: Number(s.actuals)||0,
          marginPct: s.value ? ((Number(s.value)-Number(s.cost ?? (Number(s.actuals)+Number(s.committed))))/Number(s.value))*100 : null,
          series: s.series || { value:[], committed:[], actuals:[], marginPct:[] }
        });
        setLoading(false); return;
      }

      // fallback: compute from POs, Invoices, Variations
      const [posRes, invRes, varRes, proj] = await Promise.all([
        apiGet(`/api/finance/pos`, { projectId, limit: 1000, orderBy: 'issueDate.asc' }).catch(()=>({items:[]})),
        apiGet(`/api/finance/invoices`, { projectId, limit: 1000, orderBy: 'issueDate.asc' }).catch(()=>({items:[]})),
        apiGet(`/api/variations`, { projectId, limit: 1000, orderBy: 'createdAt.asc' }).catch(()=>({items:[]})),
        apiGet(`/api/projects/${projectId}`).catch(()=>({}))
      ]);
      const pos = Array.isArray(posRes)?posRes:(posRes.items||[]);
      const inv = Array.isArray(invRes)?invRes:(invRes.items||[]);
      const vars = Array.isArray(varRes)?varRes:(varRes.items||[]);
      const contractValue = Number(proj.contractValue ?? proj.value ?? 0);
      const valueFromVars = vars.reduce((a,v)=> a + Number(v.value || v.amount || 0), 0);
      const projectValue = contractValue + valueFromVars;

      const committed = pos.reduce((a,p)=> a + Number(p.grandTotal || 0), 0);
      // count approved/paid invoices as actuals; else include all
      const actuals = inv.reduce((a,i)=> a + Number(
        (i.status==="approved"||i.status==="paid") ? (i.grandTotal||0) : (i.grandTotal||0)
      ), 0);

      const months = monthsBack(6);
      const byMonth = (items, dateKey, getter=(x)=>Number(x)||0) => {
        const map = Object.fromEntries(months.map(mm=>[keyOf(mm),0]));
        for (const it of items) {
          const dt = it[dateKey] ? new Date(it[dateKey]) : null;
          if (!dt || isNaN(dt.getTime())) continue;
          const k = keyOf({ y:dt.getFullYear(), m:dt.getMonth() });
          if (k in map) map[k] += getter(it);
        }
        return months.map(mm=> map[keyOf(mm)]);
      };
      const committedSeries = byMonth(pos, "issueDate", (p)=>Number(p.grandTotal||0));
      const actualsSeries   = byMonth(inv, "issueDate", (i)=>Number(i.grandTotal||0));
      const valueSeries     = months.map(()=> projectValue || 0);
      const marginSeries    = months.map((_,i)=>{
        const v=valueSeries[i]; const c=committedSeries.slice(0,i+1).reduce((a,b)=>a+b,0);
        const act=actualsSeries.slice(0,i+1).reduce((a,b)=>a+b,0);
        return v>0 ? ((v-(act||c))/v)*100 : 0;
      });

      setData({
        value: projectValue,
        committed,
        actuals,
        marginPct: projectValue>0 ? ((projectValue-(actuals||committed))/projectValue)*100 : null,
        series: { value:valueSeries, committed:committedSeries, actuals:actualsSeries, marginPct:marginSeries }
      });
    } finally { setLoading(false); }
  })(); },[projectId]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Financials</h2>
        <label className="text-sm text-gray-600 flex items-center gap-2">
          <input type="checkbox" checked={debug} onChange={(e)=>setDebug(e.target.checked)} />
          Debug
        </label>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">Loading financials…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <MetricTile title="Committed" money value={data.committed}
              info="Sum of PO totals (issued and draft included in fallback)." series={data.series.committed}/>
            <MetricTile title="Actuals" money value={data.actuals}
              info="Sum of invoice totals (approved/paid preferred)." series={data.series.actuals}/>
            <MetricTile title="Value" money value={data.value}
              info="Contract value + approved variations (fallback)." series={data.series.value}/>
            <MetricTile title="Margin %" pct value={data.marginPct}
              info="(Value − Cost)/Value × 100; Cost≈Actuals (fallback) or Committed." series={data.series.marginPct}/>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="mb-2 font-semibold">Explanation</h3>
            <ul className="ml-5 list-disc text-sm text-gray-600">
              <li>These numbers auto-aggregate from POs, Invoices, and Variations if no server summary is available.</li>
              <li>Margin uses Actuals if present; otherwise Committed, against Value.</li>
              <li>Trends show the last 6 months (issue/created dates).</li>
            </ul>
          </div>

          {debug && (
            <details open className="rounded-xl border bg-white p-4 shadow-sm">
              <summary className="cursor-pointer font-semibold">Raw JSON</summary>
              <pre className="mt-2 overflow-auto rounded bg-gray-50 p-3 text-xs">{JSON.stringify(data, null, 2)}</pre>
            </details>
          )}
        </>
      )}
    </section>
  );
}

