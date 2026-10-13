import { getDataset } from "@/lib/pipeline/sync";
import { buildHrReport } from "@/lib/metrics/views";
import { Bars, Status, Tile } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HrPage() {
  const ds = await getDataset();
  const r = buildHrReport(ds);
  const high = r.audit.findings.filter((f) => f.severity === "high").length;
  return (
    <main>
      {(() => { const [y, m] = r.period.split("-").map(Number); return (<>
        <h1>HR Overview</h1>
        <p className="period">Reporting period <b>{new Date(Date.UTC(y, m - 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</b> · Updated {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" })}</p>
      </>); })()}
      <div className="toc">
        {r.groups.map((g) => <a key={g.group} href={`#${g.group.replace(/\W+/g, "-")}`}>{g.group}</a>)}
        <a href="#movers">Why Metrics Moved</a><a href="#quality">Data Quality{high ? ` (${high} high)` : ""}</a><a href="#sync">Sync</a>
      </div>

      {r.groups.map((g) => (
        <section key={g.group} id={g.group.replace(/\W+/g, "-")}>
          <h2>{g.group}</h2>
          <div className="grid gcols" style={{ "--cols": Math.min(g.metrics.length, 4) } as React.CSSProperties}>
            {g.metrics.map((m) => (
              <div key={m.id} className={`card mcard s-${m.status}`}>
                <Tile m={m} />
                <Bars m={m} />
                {m.extras.length > 0 && (
                  <details>
                    <summary>Detail ({m.extras.length})</summary>
                    <div className="tablewrap"><table><tbody>
                      {m.extras.map((e) => (
                        <tr key={e.key}><td>{e.label}</td><td className="num">{e.display}</td></tr>
                      ))}
                    </tbody></table></div>
                  </details>
                )}
                <details>
                  <summary>Definition</summary>
                  <p className="small">{m.definition.summary}</p>
                  <p className="small"><b>Formula:</b> {m.definition.formula}<br /><b>Numerator:</b> {m.definition.numerator}<br /><b>Denominator:</b> {m.definition.denominator}<br /><b>Sources:</b> {m.definition.sources.join(", ")} · <b>Owner:</b> {m.definition.owner}</p>
                  {m.numerator !== null && <p className="small">This period: {m.numerator} of {m.denominator}.</p>}
                  {m.notes.map((n, i) => <p key={i} className="small muted">{n}</p>)}
                </details>
              </div>
            ))}
          </div>
        </section>
      ))}

      <h2 id="movers">Why the Flagged Metrics Moved</h2>
      <p className="small muted">Contributions add up to the total change. Small groups are shown here because this is the HR scope.</p>
      <div className="grid g2">
        {r.movers.map((mv) => (
          <div key={mv.id} className={`card mover ${mv.status}`}>
            <h3>{mv.name} <Status s={mv.status} /></h3>
            <div className="small muted">{mv.explanation.compareTo} {mv.explanation.previous.display} → {mv.explanation.period} {mv.explanation.current.display} ({mv.explanation.deltaDisplay}), by {mv.explanation.groupBy}</div>
            <div className="tablewrap"><table>
              <thead><tr><th>Group</th><th className="num">Now (n)</th><th className="num">Before (n)</th><th className="num">Contribution</th></tr></thead>
              <tbody>{mv.explanation.rows.slice(0, 6).map((row) => (
                <tr key={row.key}><td>{row.key}</td><td className="num">{row.current.display} ({row.current.n ?? "-"})</td><td className="num">{row.previous.display} ({row.previous.n ?? "-"})</td><td className="num">{row.contributionDisplay}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
        ))}
        {r.movers.length === 0 && <div className="card">Nothing is flagged this period.</div>}
      </div>

      <h2 id="quality">Data Quality Audit</h2>
      <p className="small muted">Records that quietly break the metrics. Record IDs only, no names.</p>
      <div className="card tablewrap"><table>
        <thead><tr><th>Severity</th><th>Finding</th><th className="num">Count</th><th>Affects</th><th>Fix</th></tr></thead>
        <tbody>{r.audit.findings.map((f) => (
          <tr key={f.id}>
            <td><span className={`sev ${f.severity}`}>{f.severity}</span></td>
            <td><b>{f.title}</b><div className="small muted">{f.whyItMatters}</div>{f.examples.length > 0 && <div className="small mono">e.g. {f.examples.join(", ")}</div>}</td>
            <td className="num">{f.count}{f.pct !== null ? ` of ${f.population} (${f.pct}%)` : ""}</td>
            <td className="small">{f.affects.join(", ") || "-"}</td>
            <td className="small">{f.fix}</td>
          </tr>
        ))}</tbody>
      </table></div>

      <h2 id="sync">Last Sync</h2>
      <div className="card tablewrap"><table>
        <thead><tr><th>Source</th><th>Status</th><th className="num">Calls</th><th className="num">Retries</th><th className="num">Records</th><th className="num">ms</th><th>Notes</th></tr></thead>
        <tbody>{r.audit.sync.sources.map((s) => (
          <tr key={s.source}><td>{s.source}</td><td>{s.ok ? <span className="badge on_track">✓ OK</span> : <span className="badge off_track">▲ Failed</span>}</td><td className="num">{s.calls}</td><td className="num">{s.retries}</td><td className="num">{s.records}</td><td className="num">{s.ms}</td><td className="small">{[...s.warnings, ...s.errors].join("; ") || "-"}</td></tr>
        ))}</tbody>
      </table></div>
      <p className="small muted">Mode: {r.audit.sync.mode}. Finished {r.audit.sync.finishedAt}.</p>
    </main>
  );
}
