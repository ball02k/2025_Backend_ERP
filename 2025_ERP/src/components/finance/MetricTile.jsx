import React from "react";
import { toGBP, toPct } from "@/lib/format";

function Spark({ points = [], ariaLabel }) {
  if (!points.length) return <div className="h-10" aria-hidden="true"/>;
  const max = Math.max(...points, 1), min = Math.min(...points, 0);
  const norm = (v)=> (max===min?50:((v-min)/(max-min))*80+10);
  const d = points.map((v,i)=> `${(i/(points.length-1))*100},${100-norm(v)}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" className="h-10 w-full" role="img" aria-label={ariaLabel}>
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

export default function MetricTile({ title, value, money=false, pct=false, info, series=[] }) {
  const v = pct ? toPct(value) : money ? toGBP(value) : (value ?? "—");
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm" aria-live="polite">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
        {info && <span className="text-xs text-gray-500" title={info} aria-label={info}>ⓘ</span>}
      </div>
      <div className="mt-1 text-2xl font-semibold">{v}</div>
      <div className="mt-2 text-gray-400"><Spark points={series} ariaLabel={`${title} trend`} /></div>
    </div>
  );
}

