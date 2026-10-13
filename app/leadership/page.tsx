import { getDataset } from "@/lib/pipeline/sync";
import { buildLeadershipReport } from "@/lib/metrics/views";
import { Bars, Tile } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LeadershipPage() {
  const ds = await getDataset();
  const r = buildLeadershipReport(ds);
  const h = r.headcountVsPlan;
  const maxStage = Math.max(...h.candidatesByStage.map((s) => s.candidates), 1);
  return (
    <main>
      <h1>People metrics, {r.period}</h1>
      <p className="sub">The weekly or monthly leadership view. Same numbers as the HR report, aggregates only. As of {r.asOf}.</p>

      <div className="draft">
        <div className="small muted"><b>DRAFT, pending People Ops review.</b> Written from the numbers below. A person edits it before it is sent.</div>
        <div style={{ marginTop: 8 }}>{r.commentary.paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>
      </div>

      <h2>Headcount against plan</h2>
      <div className="grid g3">
        <div className="card tile hero">
          <div className="label"><span>Headcount</span></div>
          <div className="value">{h.actual}{h.planned !== null ? <span className="muted" style={{ fontSize: 20 }}> / {h.planned}</span> : null}</div>
          <div className="meta">{h.attainmentPct !== null ? `${h.attainmentPct}% of plan` : "No plan for this month"}{h.gap !== null ? ` · ${h.gap >= 0 ? "+" : ""}${h.gap} vs plan` : ""}</div>
          <div className="meta">Hires: {h.hires ?? "fewer than 5"} · Exits: {h.exits ?? "fewer than 5"} · Open requisitions: {h.openRequisitions}</div>
        </div>
        <div className="card">
          <h3>Active candidates by stage</h3>
          <div className="bars">
            {h.candidatesByStage.map((s) => (
              <div className="bar" key={s.stage}><span className="lbl">{s.stage}</span><span className="track"><span className="fill" style={{ display: "block", width: `${Math.max(2, (s.candidates / maxStage) * 100)}%` }} /></span><span className="val">{s.candidates}</span></div>
            ))}
          </div>
          <details><summary>Table view</summary><table><tbody>{h.candidatesByStage.map((s) => <tr key={s.stage}><td>{s.stage}</td><td className="num">{s.candidates}</td></tr>)}</tbody></table></details>
        </div>
      </div>

      <h2>Headline metrics</h2>
      <div className="grid g4">
        {r.headline.map((m) => <Tile key={m.id} m={m} />)}
      </div>

      <h2>Detail</h2>
      <div className="grid g2">
        {r.panels.map((p) => (
          <div className="card" key={p.name}>
            <h3>{p.name} <span className="small muted">· {p.cadence}</span></h3>
            {p.metrics.map((m) => (
              <div key={m.id} style={{ marginTop: 12 }}>
                <Tile m={m} />
                <Bars m={m} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 24 }}>{r.privacyNote} Targets are illustrative. Definitions {r.definitionsVersion}.</p>
    </main>
  );
}
