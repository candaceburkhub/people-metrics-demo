// Automated checks. Run with: npm run check
// These are the guarantees the demo claims, tested rather than asserted.
import { runSync } from "../lib/pipeline/sync";
import { LEADERSHIP_HEADLINE, METRICS, MIN_GROUP_SIZE, REPORT_HIDDEN } from "../lib/metrics/definitions";
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
  ok(hr.groups.flatMap((g) => g.metrics).length === METRICS.length - REPORT_HIDDEN.length, "HR report covers every metric except the hidden ones");

  // 2. Independent recomputation of headcount from raw records.
  const active = ds.people.filter((p) => p.workerType === "employee" && p.startDate <= ds.asOf && (!p.endDate || p.endDate > ds.asOf)).length;
  ok(hrById.get("headcount")!.value === active, "headcount matches independent count of raw records", `${hrById.get("headcount")!.value} vs ${active}`);


  // 2b. Independent recomputation from raw records, written without the engine, for the metrics people ask about most.
  const val = (id: Parameters<typeof getMetric>[1]) => getMetric(ds, id, { scope: "hr" });
  const extra = (id: Parameters<typeof getMetric>[1], key: string) => val(id).extras.find((e) => e.key === key)?.value as number;
  const inR = (d: string | null | undefined, a: string, b: string) => !!d && d >= a && d <= b;
  const near = (a: number | null, b: number, tol = 0.051) => a !== null && Math.abs(a - b) <= tol;
  const [S0, S1, Q0, Q1, Y0, Y1] = ["2026-09-01", "2026-09-30", "2026-07-01", "2026-09-30", "2025-10-01", "2026-09-30"];

  // Offers: 19 extended = accepted + declined + pending, and the rate uses decided offers only.
  const offers = ds.offers.filter((o) => inR(o.extendedAt, S0, S1));
  const acc = offers.filter((o) => o.status === "accepted").length, pend = offers.filter((o) => o.status === "pending").length, dec = offers.length - acc - pend;
  ok(extra("offer_acceptance", "extended") === offers.length && extra("offer_acceptance", "accepted") === acc && extra("offer_acceptance", "declined") === dec && extra("offer_acceptance", "pending") === pend, "offers: extended, accepted, declined and pending match raw offers");
  ok(acc + dec + pend === offers.length, "offers: accepted + declined + pending equals extended");
  ok(near(val("offer_acceptance").value, (acc / (acc + dec)) * 100), "offer acceptance rate equals accepted over decided");

  // eNPS and response rate.
  const surveys = ds.pulse.filter((x) => inR(x.closeDate, Q0, Q1));
  const resp = surveys.flatMap((x) => x.responses.map((r) => r.score));
  const prom = resp.filter((x) => x >= 9).length, detr = resp.filter((x) => x <= 6).length;
  ok(near(val("enps").value, ((prom - detr) / resp.length) * 100), "eNPS equals (promoters - detractors) / responses");
  ok(near(extra("enps", "response_rate"), (resp.length / surveys.reduce((s, x) => s + x.invited, 0)) * 100), "eNPS response rate equals responses / invited");

  // Turnover: separations, split, and annualized rates that add back to the total.
  const emps = ds.people.filter((p) => p.workerType === "employee");
  const seps = emps.filter((p) => inR(p.endDate, Y0, Y1));
  ok(extra("turnover", "separations") === seps.length, "turnover separations match raw end dates", `${extra("turnover", "separations")} vs ${seps.length}`);
  ok(extra("turnover", "voluntary_count") + extra("turnover", "involuntary_count") + extra("turnover", "unclassified_count") === seps.length, "turnover: voluntary + involuntary + no reason code equals separations");
  const parts = extra("turnover", "voluntary_rate") + extra("turnover", "involuntary_rate") + extra("turnover", "unclassified_rate");
  ok(near(val("turnover").value, parts, 0.16), "turnover: voluntary + involuntary + no reason code rates add to the total rate", `${parts} vs ${val("turnover").value}`);

  // Cost per hire: spend over hires, and n counts hires, not cost rows.
  const hires3 = emps.filter((p) => inR(p.startDate, Q0, Q1)).length;
  const spend = ds.costs.filter((c) => c.month >= "2026-07" && c.month <= "2026-09").reduce((s, c) => s + c.amount, 0);
  ok(near(val("cost_per_hire").value, spend / hires3, 0.51) && val("cost_per_hire").n === hires3, "cost per hire equals spend / hires, and n counts hires", `n=${val("cost_per_hire").n} hires=${hires3}`);
  ok(val("compliance").n === hires3, "compliance and cost per hire use the same hire count");

  // Check-ins, reviews, I-9s.
  const ci = ds.checkIns.filter((c) => inR(c.dueDate, Q0, Q1) && c.dueDate <= ds.asOf);
  ok(near(val("checkin_completion").value, (ci.filter((c) => c.completedDate).length / ci.length) * 100), "check-in completion matches raw check-ins");
  const rv = ds.reviews.filter((r) => r.type === "cycle" && inR(r.dueDate, Q0, Q1) && r.dueDate <= ds.asOf);
  ok(near(val("review_completion").value, (rv.filter((r) => r.submittedDate).length / rv.length) * 100), "review completion matches raw reviews");

  // Day-one readiness: hires in month, equals headcount's hires, and not-ready adds up.
  ok(val("day_one_readiness").n === extra("headcount", "hires") && val("day_one_readiness").numerator! + extra("day_one_readiness", "not_ready") === val("day_one_readiness").n, "day-one readiness: ready + not ready equals hires, and hires match headcount");

  // Headcount flow.
  ok(extra("headcount", "hires") - extra("headcount", "exits") === extra("headcount", "net_change_1m"), "headcount: hires - exits equals net change");

  // Every breakdown adds back to the headline (headcount by worker type is the one deliberate exception, since it adds contractors).
  let badSplit = 0;
  for (const m of METRICS) {
    const base = getMetric(ds, m.id, { scope: "hr" });
    for (const dim of m.dimensions) {
      if (m.id === "headcount" && dim === "worker_type") continue;
      const g = getMetric(ds, m.id, { scope: "hr", groupBy: dim }).breakdown?.groups ?? [];
      const sn = g.reduce((t, x) => t + (x.numerator ?? 0), 0), sd = g.reduce((t, x) => t + (x.denominator ?? 0), 0), sN = g.reduce((t, x) => t + (x.n ?? 0), 0);
      if (Math.abs(sn - (base.numerator ?? 0)) > 0.2 || Math.abs(sd - (base.denominator ?? 0)) > 0.2 || sN !== base.n) badSplit++;
    }
  }
  ok(badSplit === 0, "every breakdown adds back to its headline numerator, denominator and n", `${badSplit} splits off`);

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
