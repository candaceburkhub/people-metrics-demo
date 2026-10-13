import type { MetricResult } from "@/lib/metrics/report";
import { Sparkline } from "./Sparkline";

const ICON = { on_track: "✓", watch: "!", off_track: "▲", no_target: "" } as const;
const LABEL = { on_track: "On track", watch: "Watch", off_track: "Off track", no_target: "No target" } as const;

export function Status({ s }: { s: MetricResult["status"] }) {
  if (s === "no_target") return null;
  return <span className={`badge ${s}`}><span aria-hidden>{ICON[s]}</span>{LABEL[s]}</span>;
}

export function Tile({ m, hero = false, short }: { m: MetricResult; hero?: boolean; short?: string }) {
  const pts = m.trend.map((t) => ({ label: t.period, value: t.value, display: t.display }));
  return (
    <div className={`card tile s-${m.status}${hero ? " hero" : ""}`}>
      <div className="label"><span>{short ?? m.name}</span><Status s={m.status} /></div>
      <div className="value">{m.display}</div>
      <div className="meta">
        {m.change ? <span className={`delta ${m.change.direction}`}>{m.change.direction === "up" ? "↑" : m.change.direction === "down" ? "↓" : "→"} {m.change.display} vs {m.previous?.period}</span> : "No prior period"}
        {m.target ? ` · target ${m.target.display}` : ""}
      </div>
      <Sparkline points={pts} target={m.target?.value} name={m.name} />
      <div className="meta">{m.n !== null ? `n=${m.n}` : ""}{m.n !== null ? " · " : ""}{m.window.label}</div>
      {m.unavailableReason && <div className="meta">{m.unavailableReason}</div>}
    </div>
  );
}

/** Horizontal bars with a table twin. Values are read from the metric's own breakdown. */
export function Bars({ m }: { m: MetricResult }) {
  const b = m.breakdown;
  if (!b || b.groups.length === 0) return null;
  const max = Math.max(...b.groups.map((g) => g.value ?? 0), 0.0001);
  return (
    <div>
      <div className="small muted" style={{ marginTop: 8 }}>By {b.dim.replace("_", " ")}</div>
      <div className="bars">
        {b.groups.map((g) => (
          <div key={g.key} className={`bar${g.suppressed ? " hidden" : ""}${g.smallGroup ? " small" : ""}`} title={`${g.key}: ${g.display}${g.n !== null ? ` (n=${g.n})` : ""}`}>
            <span className="lbl">{g.key}</span>
            <span className="track"><span className="fill" style={{ display: "block", width: `${Math.max(2, ((g.value ?? 0) / max) * 100)}%` }} /></span>
            <span className="val">{g.suppressed ? "Hidden" : g.display}</span>
          </div>
        ))}
      </div>
      {b.note && <div className="small muted" style={{ marginTop: 6 }}>{b.note}</div>}
      <details>
        <summary>Table view</summary>
        <div className="tablewrap"><table>
          <thead><tr><th>{b.dim.replace("_", " ")}</th><th className="num">Value</th><th className="num">n</th><th className="num">Num</th><th className="num">Den</th></tr></thead>
          <tbody>{b.groups.map((g) => <tr key={g.key}><td>{g.key}</td><td className="num">{g.display}</td><td className="num">{g.n ?? "-"}</td><td className="num">{g.numerator ?? "-"}</td><td className="num">{g.denominator ?? "-"}</td></tr>)}</tbody>
        </table></div>
      </details>
    </div>
  );
}
