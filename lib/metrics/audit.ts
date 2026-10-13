// Data quality audit. A metric is only as trustworthy as the records behind it, so
// this checks the specific things that quietly break the metrics: missing reason
// codes, missing IDs that join the ATS to the HRIS, drifted dates, broken syncs.
// It is the "audit and continuously optimize our setup" part of the build, and it
// is HR-only because it points at individual records.

import { ATS_GO_LIVE } from "../config";
import { addMonths, diffDays, monthStart } from "../dates";
import type { Dataset, Person, SyncReport } from "../types";
import type { MetricId } from "./definitions";

export interface AuditFinding {
  id: string;
  title: string;
  severity: "high" | "medium" | "low";
  count: number;
  population: number;
  pct: number | null;
  whyItMatters: string;
  affects: MetricId[];
  fix: string;
  /** Record IDs only. No names or emails. */
  examples: string[];
}

export interface AuditReport {
  asOf: string;
  summary: { high: number; medium: number; low: number; findings: number };
  findings: AuditFinding[];
  sync: SyncReport;
}

const isEmployee = (p: Person) => p.workerType === "employee";

export function runAudit(ds: Dataset): AuditReport {
  const emp = ds.people.filter(isEmployee);
  const t12Start = monthStart(addMonths(ds.latestPeriod, -11));
  const hires = emp.filter((p) => p.startDate >= ATS_GO_LIVE && p.startDate <= ds.asOf);
  const recentHires = hires.filter((p) => p.startDate >= t12Start);
  const exits12 = emp.filter((p) => p.endDate && p.endDate >= t12Start && p.endDate <= ds.asOf);
  const findings: AuditFinding[] = [];

  const add = (f: Omit<AuditFinding, "pct" | "examples" | "count"> & { items: string[] }) => {
    if (f.items.length === 0) return;
    findings.push({
      id: f.id,
      title: f.title,
      severity: f.severity,
      count: f.items.length,
      population: f.population,
      pct: f.population > 0 ? Math.round((f.items.length / f.population) * 1000) / 10 : null,
      whyItMatters: f.whyItMatters,
      affects: f.affects,
      fix: f.fix,
      examples: f.items.slice(0, 5),
    });
  };

  add({
    id: "missing_exit_reason",
    title: "Departures with no termination reason code",
    severity: "high",
    population: exits12.length,
    items: exits12.filter((p) => p.exitReason === "unknown").map((p) => p.id),
    whyItMatters: "Without a reason code a departure cannot be split voluntary or involuntary, so the turnover split understates both.",
    affects: ["turnover", "regrettable_loss"],
    fix: "Make the termination reason a required field in the Rippling offboarding workflow, then backfill these records.",
  });

  add({
    id: "missing_manager_input",
    title: "Voluntary exits with no manager regrettable flag",
    severity: "medium",
    population: exits12.filter((p) => p.exitType === "voluntary").length,
    items: exits12.filter((p) => p.exitType === "voluntary" && p.regrettable === null).map((p) => p.id),
    whyItMatters: "Regrettable loss is left out of the denominator for these exits, so the rate rests on fewer departures than actually happened.",
    affects: ["regrettable_loss"],
    fix: "Add the manager question to the exit task and block closure of the offboarding workflow until it is answered.",
  });

  add({
    id: "missing_candidate_id",
    title: "Hires with no Ashby candidate ID",
    severity: "high",
    population: hires.length,
    items: hires.filter((p) => !p.candidateId).map((p) => p.id),
    whyItMatters: "The shared ID is how hires join to the ATS. Without it these hires drop out of time to fill, cost per hire and quality of hire by source.",
    affects: ["time_to_fill", "quality_of_hire", "cost_per_hire"],
    fix: "Write the Ashby candidate ID into Rippling at hire creation, and add a check that rejects a new hire without one.",
  });

  add({
    id: "missing_requisition",
    title: "Hires with no requisition ID",
    severity: "medium",
    population: hires.length,
    items: hires.filter((p) => p.candidateId && !p.requisitionId).map((p) => p.id),
    whyItMatters: "A hire that cannot be traced to a requisition cannot be checked against headcount plan.",
    affects: ["headcount", "time_to_fill"],
    fix: "Require a requisition ID on the Rippling hire record, populated automatically from the Ashby job.",
  });

  const appHired = ds.applications.filter((a) => a.status === "hired");
  const candidatesInHris = new Set(ds.people.map((p) => p.candidateId).filter(Boolean));
  const acceptedByCandidate = new Map(ds.offers.filter((o) => o.status === "accepted").map((o) => [o.candidateId, o]));
  add({
    id: "ats_hire_not_in_hris",
    title: "Hired in Ashby, start date passed, no Rippling record",
    severity: "high",
    population: appHired.filter((a) => (acceptedByCandidate.get(a.candidateId)?.proposedStartDate ?? "9999") <= ds.asOf).length,
    items: appHired
      .filter((a) => (acceptedByCandidate.get(a.candidateId)?.proposedStartDate ?? "9999") <= ds.asOf && !candidatesInHris.has(a.candidateId))
      .map((a) => a.candidateId),
    whyItMatters: "These people may be working without being in the HRIS, which breaks headcount, payroll alignment and compliance tasks.",
    affects: ["headcount", "turnover", "day_one_readiness", "compliance"],
    fix: "Review each one this week. Then add the offer-accepted to Rippling hire sync, with a nightly reconciliation that alerts on any gap.",
  });

  add({
    id: "start_date_drift",
    title: "Start date differs between Ashby and Rippling by more than 3 days",
    severity: "medium",
    population: hires.filter((p) => p.candidateId).length,
    items: hires
      .filter((p) => {
        const o = p.candidateId ? acceptedByCandidate.get(p.candidateId) : undefined;
        return !!o && Math.abs(diffDays(o.proposedStartDate, p.startDate)) > 3;
      })
      .map((p) => p.id),
    whyItMatters: "Day-one readiness, 90 day attrition and I-9 deadlines are all measured from start date, so a drifted date shifts every one of them.",
    affects: ["day_one_readiness", "early_attrition", "compliance"],
    fix: "Treat Rippling as the source of truth for start date, push changes back to Ashby, and alert when the two disagree.",
  });

  add({
    id: "missing_department",
    title: "Active employees with no department",
    severity: "medium",
    population: emp.filter((p) => !p.endDate).length,
    items: emp.filter((p) => !p.endDate && !p.department).map((p) => p.id),
    whyItMatters: "These people land in 'Unassigned' in every department breakdown and can push other groups under the small-group threshold.",
    affects: ["headcount", "turnover", "compa_ratio"],
    fix: "Make department required in Rippling and fix these records.",
  });

  add({
    id: "missing_onboarding_tasks",
    title: "Recent hires with no onboarding task records",
    severity: "medium",
    population: recentHires.length,
    items: recentHires.filter((p) => !ds.tasks.some((t) => t.employeeId === p.id)).map((p) => p.id),
    whyItMatters: "They are excluded from day-one readiness and I-9 timeliness, so those rates look better than reality.",
    affects: ["day_one_readiness", "compliance"],
    fix: "Check that the onboarding workflow triggers for every hire path, including manual and rehire paths.",
  });

  for (const src of ds.sync.sources) {
    if (!src.ok) {
      findings.push({ id: `sync_failed_${src.source}`, title: `${src.source} sync failed`, severity: "high", count: 1, population: 1, pct: 100, whyItMatters: "Metrics that depend on this source are missing or stale.", affects: [], fix: src.errors[0] ?? "Check credentials and the source status.", examples: [] });
    }
    for (const w of src.warnings) {
      findings.push({ id: `sync_warning_${src.source}`, title: `${src.source}: ${w}`, severity: "high", count: 1, population: 1, pct: 100, whyItMatters: "Some metrics cannot be computed until this is fixed.", affects: ["compa_ratio"], fix: "Grant the missing scope to the API token, or approve the app.", examples: [] });
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
  const summary = {
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    findings: findings.length,
  };
  return { asOf: ds.asOf, summary, findings, sync: ds.sync };
}
