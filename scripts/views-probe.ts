import { runSync } from "../lib/pipeline/sync";
import { buildHrReport, buildLeadershipReport, slackDigest } from "../lib/metrics/views";
import { explainChange, getMetric } from "../lib/metrics/report";
(async () => {
  const ds = await runSync();
  const hr = buildHrReport(ds);
  console.log("HR groups:", hr.groups.map(g => `${g.group}(${g.metrics.length})`).join(" "));
  console.log("Audit:", hr.audit.summary);
  for (const f of hr.audit.findings) console.log(` - [${f.severity}] ${f.title}: ${f.count}/${f.population}`);
  const l = buildLeadershipReport(ds);
  console.log("\nLEADERSHIP vs plan:", l.headcountVsPlan);
  console.log("headline:", l.headline.map(m => `${m.id}=${m.display}[${m.status}]`).join(" | "));
  console.log("\nCOMMENTARY (" + l.commentary.status + ")\n" + l.commentary.paragraphs.join("\n\n"));
  console.log("\nbasis:", l.commentary.basis);
  // scope tests
  try { getMetric(ds, "quality_of_hire", { scope: "leadership" }); console.log("FAIL: leadership saw restricted metric"); } catch (e) { console.log("scope ok:", (e as Error).message); }
  const g = getMetric(ds, "headcount", { scope: "leadership", groupBy: "department" });
  console.log("leadership headcount by dept:", g.breakdown?.groups.map(x => `${x.key}:${x.display}`).join(" | "));
  const g2 = getMetric(ds, "headcount", { scope: "hr", groupBy: "department" });
  console.log("hr headcount by dept:", g2.breakdown?.groups.map(x => `${x.key}:${x.display}`).join(" | "));
  const ex = explainChange(ds, "time_to_fill", { scope: "leadership", groupBy: "department" });
  console.log("\nexplain TTF leadership:", ex.current.display, "from", ex.previous.display, ex.rows.map(r => `${r.key}:${r.contributionDisplay}`).join(" | "));
  const exh = explainChange(ds, "time_to_fill", { scope: "hr", groupBy: "department" });
  console.log("explain TTF hr:", exh.rows.map(r => `${r.key}:${r.contributionDisplay}(n=${r.current.n}/${r.previous.n})`).join(" | "));
  const sum = exh.rows.reduce((s, r) => s + (r.contribution ?? 0), 0);
  console.log("contributions sum", sum.toFixed(3), "delta", exh.delta?.toFixed(3));
  console.log("\nslack text:", slackDigest(l).text);
})();
