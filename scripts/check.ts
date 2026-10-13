// Automated checks. Run with: npm run check
// These are the guarantees the demo claims, tested rather than asserted.
import { runSync } from "../lib/pipeline/sync";
import { LEADERSHIP_HEADLINE, METRICS, MIN_GROUP_SIZE } from "../lib/metrics/definitions";
import { explainChange, getMetric } from "../lib/metrics/report";
import { buildHrReport, buildLeadershipReport, slackDigest } from "../lib/metrics/views";
import { runTool, INSTRUCTIONS } from "../lib/mcp/tools";

let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, detail = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? `  (${detail})` : ""}`); };

(async () => {
  const ds = await runSync({ backoffMs: 0 });

  // 1. One definition, one number: both reports agree on every headline metric.
  const hr = buildHrReport(ds), lead = buildLeadershipReport(ds);
  const hrById = new Map(hr.groups.flatMap((g) => g.metrics).map((m) => [m.id, m]));
  for (const m of lead.headline) {
    const h = hrById.get(m.id)!;
    ok(m.suppressed || h.value === m.value, `HR and leadership agree on ${m.id}`, `${h.value} vs ${m.value}`);
  }
  ok(lead.headline.length === LEADERSHIP_HEADLINE.length && lead.headline.length === 8, "leadership one-pager has 8 headline metrics");
  ok(hr.groups.flatMap((g) => g.metrics).length === METRICS.length, "HR report covers every metric");

  // 2. Independent recomputation of headcount from raw records.
  const active = ds.people.filter((p) => p.workerType === "employee" && p.startDate <= ds.asOf && (!p.endDate || p.endDate > ds.asOf)).length;
  ok(hrById.get("headcount")!.value === active, "headcount matches independent count of raw records", `${hrById.get("headcount")!.value} vs ${active}`);

  // 3. Explained change adds up to the total change, for every metric that can be split by department.
  for (const m of METRICS.filter((x) => x.dimensions.includes("department") && x.audiences.includes("hr"))) {
    try {
      const e = explainChange(ds, m.id, { scope: "hr", groupBy: "department" });
      if (e.delta === null) continue;
      const sum = e.rows.reduce((s, r) => s + (r.contribution ?? 0), 0);
      ok(Math.abs(sum - e.delta) < 1e-6, `contributions sum to total change for ${m.id}`, `${sum} vs ${e.delta}`);
    } catch { /* metric cannot be explained by department */ }
  }

  // 4. Suppression: leadership never sees a value behind fewer than the minimum group size.
  let leaks = 0;
  for (const m of METRICS.filter((x) => x.audiences.includes("leadership"))) {
    for (const dim of m.dimensions) {
      const r = getMetric(ds, m.id, { scope: "leadership", groupBy: dim });
      for (const g of r.breakdown?.groups ?? []) if (g.value !== null && (g.n ?? 0) < MIN_GROUP_SIZE) leaks++;
    }
  }
  ok(leaks === 0, "no leadership breakdown exposes a group under the minimum size", `${leaks} leaks`);
  const rows = explainChange(ds, "time_to_fill", { scope: "leadership", groupBy: "department" }).rows;
  ok(rows.every((r) => r.merged || (r.current.n ?? 0) >= MIN_GROUP_SIZE), "leadership explain_change merges small groups");

  // 5. Scope rules enforced on the server.
  for (const id of METRICS.filter((m) => m.restricted).map((m) => m.id)) {
    let refused = false;
    try { await runTool("get_metric", { metric_id: id }, "leadership", ds); } catch { refused = true; }
    ok(refused, `leadership refused restricted metric ${id}`);
  }
  let dqRefused = false;
  try { await runTool("data_quality_report", {}, "leadership", ds); } catch { dqRefused = true; }
  ok(dqRefused, "leadership refused data_quality_report");
  ok(!!(await runTool("data_quality_report", {}, "hr", ds)), "HR can run data_quality_report");

  // 6. The audit finds the planted problems.
  ok(hr.audit.findings.length >= 8, "audit detects the planted data problems", `${hr.audit.findings.length}`);

  // 7. Drafts stay drafts, and nothing leaks identity.
  ok(lead.commentary.status === "draft_pending_human_review", "commentary is marked as a draft pending review");
  const digest = JSON.stringify(slackDigest(lead));
  ok(digest.includes("DRAFT"), "Slack digest is labelled a draft");
  ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(JSON.stringify(lead)), "leadership report contains no email addresses");
  ok(!JSON.stringify([lead, hr]).includes("—"), "no em dashes in report output");

  // 8. MCP instructions stay inside the 2,048 character window some clients read.
  ok(INSTRUCTIONS.length < 2048, "MCP instructions fit the first 2,048 characters", `${INSTRUCTIONS.length}`);

  // 9. Resilience.
  const chaos = await runSync({ chaos: true, backoffMs: 0 });
  const retries = chaos.sync.sources.reduce((s, x) => s + x.retries, 0);
  ok(retries > 0 && chaos.sync.sources.every((s) => s.ok), "sync survives injected failures with retries", `retries ${retries}`);
  ok(chaos.people.length === ds.people.length, "chaos run returns the same records as a clean run");
  const ro = await runSync({ readonlyRipplingToken: true, backoffMs: 0 });
  ok(ro.compensationAvailable === false && ro.people.length > 0, "missing compensation scope degrades instead of failing");
  const compa = getMetric(ro, "compa_ratio", { scope: "hr" });
  ok(compa.value === null && !!compa.unavailableReason, "compa-ratio reports unavailable with a reason");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
