"use client";
import { useState } from "react";

export interface SparkPoint { label: string; value: number | null; display: string }

export function Sparkline({ points, target, name }: { points: SparkPoint[]; target?: number | null; name: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 200, H = 44, PAD = 6;
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (vals.length < 2) return <div className="small muted">Not enough data for a trend</div>;
  const all = target != null ? [...vals, target] : vals;
  const lo = Math.min(...all), hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2);
  const segs: string[] = [];
  let cur = "";
  points.forEach((p, i) => {
    if (p.value === null) { if (cur) segs.push(cur); cur = ""; return; }
    cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  let last = points.length - 1;
  while (last > 0 && points[last].value === null) last--;
  const hp = hover !== null ? points[hover] : null;
  return (
    <div className="spark" role="img" aria-label={`${name} trend, latest ${points[last].display}`}>
      {hp && <div className="tip" style={{ left: `${(x(hover!) / W) * 100}%` }}>{hp.label}: {hp.display}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        {target != null && <line x1={PAD} x2={W - PAD} y1={y(target)} y2={y(target)} stroke="var(--muted)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        {segs.map((d, i) => <path key={i} d={d} fill="none" stroke="var(--s1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
        {points[last].value !== null && <circle cx={x(last)} cy={y(points[last].value!)} r="4" fill="var(--s1)" stroke="var(--surface)" strokeWidth="2" />}
        {hover !== null && points[hover].value !== null && <circle cx={x(hover)} cy={y(points[hover].value!)} r="4" fill="var(--s1)" stroke="var(--surface)" strokeWidth="2" />}
        {points.map((_, i) => <rect key={i} x={x(i) - (W / points.length) / 2} y={0} width={W / points.length} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />)}
      </svg>
    </div>
  );
}
