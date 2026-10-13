// The metrics engine. Every metric is the same shape: a function that turns the
// dataset and a time window into records (num, den, dimensions), and one shared
// reducer that turns records into a value, a breakdown and a trend. Because every
// consumer goes through compute(), the HR view, the leadership view and the MCP
// tools cannot disagree about a number.

import { addDays, addMonths, diffDays, monthEnd, monthStart, periodOf, type ISODate, type Period } from "../dates";
import type { Dataset, OnboardingTask, Person, Job, Application } from "../types";
import type { OpsBenchmark } from "../api-types";
import { METRIC_BY_ID, type Dim, type MetricId, type Unit, type WindowKind } from "./definitions";

// ---------- windows ----------

export interface Win {
  kind: WindowKind;
  start: ISODate;
  end: ISODate;
  months: number;
  period: Period;
}

export function windowFor(kind: WindowKind, period: Period): Win {
  switch (kind) {
    case "month":
      return { kind, start: monthStart(period), end: monthEnd(period), months: 1, period };
    case "quarter":
      return { kind, start: monthStart(addMonths(period, -2)), end: monthEnd(period), months: 3, period };
    case "t12m":
      return { kind, start: monthStart(addMonths(period, -11)), end: monthEnd(period), months: 12, period };
    case "asof":
      return { kind, start: monthEnd(period), end: monthEnd(period), months: 1, period };
  }
}

// ---------- records ----------

export type Dims = Partial<Record<Dim, string>>;
export interface Rec {
  dims: Dims;
  num: number;
  den: number;
  meta?: Record<string, number | string | boolean | null>;
}

export interface Extra {
  key: string;
  label: string;
  value: number | string | null;
  unit: Unit | "text";
  restricted?: boolean;
  rows?: Record<string, string | number | null>[];
}

interface Index {
  personById: Map<string, Person>;
  jobById: Map<string, Job>;
  appById: Map<string, Application>;
  sourceByCandidate: Map<string, string>;
  tasksByEmployee: Map<string, OnboardingTask[]>;
  benchByKey: Map<string, OpsBenchmark>;
}

const indexCache = new WeakMap<Dataset, Index>();
function indexOf(ds: Dataset): Index {
  let ix = indexCache.get(ds);
  if (ix) return ix;
  const tasksByEmployee = new Map<string, OnboardingTask[]>();
  for (const t of ds.tasks) {
    const list = tasksByEmployee.get(t.employeeId) ?? [];
    list.push(t);
    tasksByEmployee.set(t.employeeId, list);
  }
  ix = {
    personById: new Map(ds.people.map((p) => [p.id, p])),
    jobById: new Map(ds.jobs.map((j) => [j.id, j])),
    appById: new Map(ds.applications.map((a) => [a.id, a])),
    sourceByCandidate: new Map(ds.applications.map((a) => [a.candidateId, a.source])),
    tasksByEmployee,
    benchByKey: new Map(ds.benchmarks.map((b) => [`${b.department}|${b.level}`, b])),
  };
  indexCache.set(ds, ix);
  return ix;
}

export const FUNNEL = ["Applied", "Recruiter Screen", "Hiring Manager Screen", "Onsite", "Offer", "Hired"];
// ^ Map these to your own Ashby interview plan stages when going live.

const isEmployee = (p: Person) => p.workerType === "employee";
const activeAt = (p: Person, date: ISODate) => p.startDate <= date && (!p.endDate || p.endDate > date);
const inWin = (d: ISODate | null | undefined, w: Win): d is ISODate => !!d && d >= w.start && d <= w.end;
const personDims = (p: Person): Dims => ({ department: p.department ?? "Unassigned", location: p.location, level: p.level, worker_type: p.workerType });
const unknownPersonDims: Dims = { department: "Unassigned", location: "Unknown", level: "Unknown", worker_type: "employee" };

function activeFraction(p: Person, w: Win): number {
  const from = p.startDate > w.start ? p.startDate : w.start;
  const to = p.endDate && p.endDate < w.end ? p.endDate : w.end;
  if (to < from) return 0;
  return (diffDays(from, to) + 1) / (diffDays(w.start, w.end) + 1);
}

const jobDims = (job: Job | undefined, source?: string): Dims => ({
  department: job?.department ?? "Unassigned",
  level: job?.level ?? "Unknown",
  location: job?.location ?? "Unknown",
  source: source ?? "Unknown",
});

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);
const round1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

// ---------- the 16 metric implementations ----------

interface Impl {
  records: (ds: Dataset, w: Win, ix: Index, ctx: { groupBy?: Dim }) => Rec[];
  scale: (w: Win) => number;
  countOnly?: boolean;
  extras?: (ds: Dataset, w: Win, recs: Rec[], ix: Index) => Extra[];
  unavailable?: (ds: Dataset) => string | null;
}

const IMPL: Record<MetricId, Impl> = {
  headcount: {
    countOnly: true,
    scale: () => 1,
    records: (ds, w, _ix, ctx) =>
      ds.people.filter((p) => (ctx.groupBy === "worker_type" || isEmployee(p)) && activeAt(p, w.end)).map((p) => ({ dims: personDims(p), num: 1, den: 0 })),
    extras: (ds, w) => {
      const count = (date: ISODate) => ds.people.filter((p) => isEmployee(p) && activeAt(p, date)).length;
      const now = count(w.end);
      const prev = count(monthEnd(addMonths(w.period, -1)));
      const yearAgo = count(monthEnd(addMonths(w.period, -12)));
      const ms = monthStart(w.period);
      const hires = ds.people.filter((p) => isEmployee(p) && p.startDate >= ms && p.startDate <= w.end).length;
      const exits = ds.people.filter((p) => isEmployee(p) && p.endDate && p.endDate >= ms && p.endDate <= w.end).length;
      const contractors = ds.people.filter((p) => p.workerType === "contractor" && activeAt(p, w.end)).length;
      return [
        { key: "hires", label: "Hires in the month", value: hires, unit: "count" },
        { key: "exits", label: "Exits in the month", value: exits, unit: "count" },
        { key: "net_change_1m", label: "Net change vs prior month", value: now - prev, unit: "count" },
        { key: "growth_12m", label: "Growth vs 12 months ago", value: yearAgo > 0 ? round1(((now - yearAgo) / yearAgo) * 100) : null, unit: "pct" },
        { key: "contractors", label: "Active contractors (not in headline)", value: contractors, unit: "count" },
      ];
    },
  },

  turnover: {
    scale: (w) => (100 * 12) / w.months,
    records: (ds, w) =>
      ds.people
        .filter(isEmployee)
        .map((p) => ({ p, f: activeFraction(p, w) }))
        .filter((x) => x.f > 0)
        .map(({ p, f }) => ({
          dims: personDims(p),
          num: inWin(p.endDate, w) ? 1 : 0,
          den: f,
          meta: { exitType: p.exitType ?? (inWin(p.endDate, w) ? "unclassified" : null) },
        })),
    extras: (_ds, w, recs) => {
      const avgHc = sum(recs.map((r) => r.den));
      const count = (t: string) => recs.filter((r) => r.num === 1 && r.meta?.exitType === t).length;
      const ann = (100 * 12) / w.months;
      return [
        { key: "separations", label: "Separations in the window", value: sum(recs.map((r) => r.num)), unit: "count" },
        { key: "avg_headcount", label: "Average headcount", value: round1(avgHc), unit: "count" },
        { key: "voluntary_rate", label: "Voluntary turnover (annualized)", value: avgHc ? round1((count("voluntary") / avgHc) * ann) : null, unit: "pct" },
        { key: "involuntary_rate", label: "Involuntary turnover (annualized)", value: avgHc ? round1((count("involuntary") / avgHc) * ann) : null, unit: "pct" },
        { key: "voluntary_count", label: "Voluntary separations", value: count("voluntary"), unit: "count" },
        { key: "involuntary_count", label: "Involuntary separations", value: count("involuntary"), unit: "count" },
        { key: "unclassified_count", label: "Separations with no reason code", value: count("unclassified"), unit: "count" },
      ];
    },
  },

  early_attrition: {
    scale: () => 100,
    records: (ds, w) =>
      ds.people
        .filter((p) => isEmployee(p) && inWin(p.startDate, w) && addDays(p.startDate, 90) <= ds.asOf)
        .map((p) => ({ dims: personDims(p), num: p.endDate && diffDays(p.startDate, p.endDate) <= 90 ? 1 : 0, den: 1 })),
    extras: (ds, w, recs) => [
      { key: "left_early", label: "Hires who left within 90 days", value: sum(recs.map((r) => r.num)), unit: "count" },
      {
        key: "immature",
        label: "Recent hires not yet counted (90 days incomplete)",
        value: ds.people.filter((p) => isEmployee(p) && inWin(p.startDate, w) && addDays(p.startDate, 90) > ds.asOf).length,
        unit: "count",
      },
    ],
  },

  regrettable_loss: {
    scale: () => 100,
    records: (ds, w) =>
      ds.people
        .filter((p) => isEmployee(p) && inWin(p.endDate, w) && p.regrettable !== null)
        .map((p) => ({ dims: personDims(p), num: p.regrettable ? 1 : 0, den: 1 })),
    extras: (ds, w, recs) => {
      const all = ds.people.filter((p) => isEmployee(p) && inWin(p.endDate, w));
      return [
        { key: "regrettable", label: "Regrettable departures", value: sum(recs.map((r) => r.num)), unit: "count" },
        { key: "departures", label: "All departures in the window", value: all.length, unit: "count" },
        { key: "no_input", label: "Departures with no manager input", value: all.filter((p) => p.regrettable === null).length, unit: "count" },
      ];
    },
  },

  time_to_fill: {
    scale: () => 1,
    records: (ds, w, ix) =>
      ds.offers
        .filter((o) => o.status === "accepted" && inWin(o.decidedAt, w))
        .flatMap((o) => {
          const job = ix.jobById.get(o.jobId);
          if (!job || !o.decidedAt) return [];
          return [{ dims: jobDims(job, ix.appById.get(o.applicationId)?.source), num: diffDays(job.openedAt, o.decidedAt), den: 1 }];
        }),
    extras: (_ds, _w, recs) => [
      { key: "median_days", label: "Median days to fill", value: median(recs.map((r) => r.num)), unit: "days" },
      { key: "fills", label: "Offers accepted", value: recs.length, unit: "count" },
    ],
  },

  offer_acceptance: {
    scale: () => 100,
    records: (ds, w, ix) =>
      ds.offers
        .filter((o) => inWin(o.extendedAt, w) && o.status !== "pending")
        .map((o) => ({ dims: jobDims(ix.jobById.get(o.jobId), ix.appById.get(o.applicationId)?.source), num: o.status === "accepted" ? 1 : 0, den: 1 })),
    extras: (ds, w, recs) => [
      { key: "extended", label: "Offers extended in the month (all)", value: ds.offers.filter((o) => inWin(o.extendedAt, w)).length, unit: "count" },
      { key: "accepted", label: "Offers accepted", value: sum(recs.map((r) => r.num)), unit: "count" },
      { key: "declined", label: "Offers declined or rescinded", value: recs.length - sum(recs.map((r) => r.num)), unit: "count" },
      { key: "pending", label: "Offers still pending", value: ds.offers.filter((o) => inWin(o.extendedAt, w) && o.status === "pending").length, unit: "count" },
    ],
  },

  pipeline_conversion: {
    scale: () => 100,
    records: (ds, w, ix) =>
      ds.applications
        .filter((a) => inWin(a.createdAt, w))
        .map((a) => ({
          dims: jobDims(ix.jobById.get(a.jobId), a.source),
          num: a.stages["Offer"] ? 1 : 0,
          den: 1,
          meta: { idx: Math.max(...Object.keys(a.stages).map((s) => FUNNEL.indexOf(s))) },
        })),
    extras: (_ds, _w, recs) => {
      const reached = (k: number) => recs.filter((r) => (r.meta?.idx as number) >= k).length;
      const rows = FUNNEL.slice(1).map((stage, i) => ({
        from: FUNNEL[i],
        to: stage,
        reached: reached(i),
        advanced: reached(i + 1),
        rate_pct: round1(pct(reached(i + 1), reached(i))),
      }));
      return [{ key: "stage_rates", label: "Stage to stage conversion", value: null, unit: "pct", rows }];
    },
  },

  cost_per_hire: {
    scale: () => 1,
    records: (ds, w) => {
      const from = periodOf(w.start);
      const to = periodOf(w.end);
      const hires = ds.people.filter((p) => isEmployee(p) && inWin(p.startDate, w)).map((): Rec => ({ dims: {}, num: 0, den: 1 }));
      const costs = ds.costs.filter((c) => c.month >= from && c.month <= to).map((c): Rec => ({ dims: {}, num: c.amount, den: 0, meta: { category: c.category } }));
      return [...hires, ...costs];
    },
    extras: (_ds, _w, recs) => {
      const cats = ["tools", "agency_fees", "referral_bonuses", "recruiter_time"];
      return [
        { key: "total_spend", label: "Recruiting spend in the window", value: sum(recs.map((r) => r.num)), unit: "usd" },
        { key: "hires", label: "Hires in the window", value: sum(recs.map((r) => r.den)), unit: "count" },
        {
          key: "by_category",
          label: "Spend by category",
          value: null,
          unit: "usd",
          rows: cats.map((c) => ({ category: c, amount: sum(recs.filter((r) => r.meta?.category === c).map((r) => r.num)) })),
        },
      ];
    },
  },

  quality_of_hire: {
    scale: () => 100,
    records: (ds, w, ix) =>
      ds.reviews
        .filter((r) => r.type === "new_hire_6m" && r.submittedDate && r.rating !== null && inWin(r.dueDate, w))
        .flatMap((r) => {
          const p = ix.personById.get(r.employeeId);
          if (!p) return [];
          return [{ dims: { ...personDims(p), source: (p.candidateId && ix.sourceByCandidate.get(p.candidateId)) || "Unknown" }, num: (r.rating ?? 0) >= 3 ? 1 : 0, den: 1 }];
        }),
    extras: (ds, w) => {
      const cohort = ds.people.filter((p) => isEmployee(p) && inWin(addDays(p.startDate, 365), w));
      const retained = cohort.filter((p) => !p.endDate || p.endDate >= addDays(p.startDate, 365)).length;
      return [
        { key: "retention_12m", label: "12 month retention of the same period's cohort", value: round1(pct(retained, cohort.length)), unit: "pct" },
        { key: "cohort_12m", label: "Hires reaching 12 months in the window", value: cohort.length, unit: "count" },
      ];
    },
  },

  day_one_readiness: {
    scale: () => 100,
    records: (ds, w, ix) =>
      ds.people
        .filter((p) => isEmployee(p) && inWin(p.startDate, w))
        .flatMap((p) => {
          const tasks = (ix.tasksByEmployee.get(p.id) ?? []).filter((t) => t.type !== "i9");
          if (tasks.length < 3) return [];
          const ready = tasks.every((t) => t.completedDate !== null && t.completedDate <= p.startDate);
          const late = tasks.filter((t) => t.completedDate === null || t.completedDate > p.startDate).map((t) => t.type).join(",");
          return [{ dims: personDims(p), num: ready ? 1 : 0, den: 1, meta: { late } }];
        }),
    extras: (ds, w, recs) => {
      const hires = ds.people.filter((p) => isEmployee(p) && inWin(p.startDate, w));
      const lateCount = (t: string) => recs.filter((r) => String(r.meta?.late ?? "").split(",").includes(t)).length;
      return [
        { key: "not_ready", label: "Hires not ready on day one", value: recs.length - sum(recs.map((r) => r.num)), unit: "count" },
        { key: "late_equipment", label: "Late equipment", value: lateCount("equipment"), unit: "count" },
        { key: "late_accounts", label: "Late accounts", value: lateCount("accounts"), unit: "count" },
        { key: "late_paperwork", label: "Late paperwork", value: lateCount("paperwork"), unit: "count" },
        { key: "no_records", label: "Hires excluded for missing task records", value: hires.length - recs.length, unit: "count" },
      ];
    },
  },

  checkin_completion: {
    scale: () => 100,
    records: (ds, w, ix) =>
      ds.checkIns
        .filter((c) => inWin(c.dueDate, w) && c.dueDate <= ds.asOf)
        .map((c) => {
          const p = ix.personById.get(c.employeeId);
          return { dims: { ...(p ? personDims(p) : unknownPersonDims), milestone: String(c.milestone) }, num: c.completedDate ? 1 : 0, den: 1, meta: { score: c.score } };
        }),
    extras: (_ds, _w, recs) => {
      const scores = recs.map((r) => r.meta?.score).filter((s): s is number => typeof s === "number");
      const rows = ["30", "90", "180"].map((m) => {
        const rs = recs.filter((r) => r.dims.milestone === m);
        const ss = rs.map((r) => r.meta?.score).filter((s): s is number => typeof s === "number");
        return { milestone: `${m} day`, due: rs.length, completed: sum(rs.map((r) => r.num)), avg_score: ss.length ? round1(sum(ss) / ss.length) : null };
      });
      return [
        { key: "avg_score", label: "Average check-in score (1 to 5)", value: scores.length ? round1(sum(scores) / scores.length) : null, unit: "score" },
        { key: "by_milestone", label: "By milestone", value: null, unit: "text", rows },
      ];
    },
  },

  enps: {
    scale: () => 100,
    records: (ds, w) =>
      ds.pulse
        .filter((s) => inWin(s.closeDate, w))
        .flatMap((s) =>
          s.responses.map((r) => ({
            dims: { department: r.department },
            num: r.score >= 9 ? 1 : r.score <= 6 ? -1 : 0,
            den: 1,
          })),
        ),
    extras: (ds, w, recs) => {
      const surveys = ds.pulse.filter((s) => inWin(s.closeDate, w));
      const invited = sum(surveys.map((s) => s.invited));
      return [
        { key: "response_rate", label: "Response rate", value: round1(pct(recs.length, invited)), unit: "pct" },
        { key: "responses", label: "Responses", value: recs.length, unit: "count" },
        { key: "invited", label: "Invited", value: invited, unit: "count" },
        { key: "promoters", label: "Promoters", value: recs.filter((r) => r.num === 1).length, unit: "count" },
        { key: "detractors", label: "Detractors", value: recs.filter((r) => r.num === -1).length, unit: "count" },
      ];
    },
  },

  review_completion: {
    scale: () => 100,
    records: (ds, w, ix) =>
      ds.reviews
        .filter((r) => r.type === "cycle" && inWin(r.dueDate, w) && r.dueDate <= ds.asOf)
        .map((r) => {
          const p = ix.personById.get(r.employeeId);
          return { dims: p ? personDims(p) : unknownPersonDims, num: r.submittedDate ? 1 : 0, den: 1 };
        }),
    extras: (ds, w) => {
      const rated = ds.reviews.filter((r) => r.type === "cycle" && inWin(r.dueDate, w) && r.dueDate <= ds.asOf && r.rating !== null);
      const rows = [1, 2, 3, 4, 5].map((k) => ({ rating: k, reviews: rated.filter((r) => r.rating === k).length, share_pct: round1(pct(rated.filter((r) => r.rating === k).length, rated.length)) }));
      return [
        { key: "submitted", label: "Reviews submitted", value: rated.length, unit: "count", restricted: true },
        { key: "rating_spread", label: "Rating spread", value: null, unit: "pct", restricted: true, rows },
      ];
    },
  },

  compa_ratio: {
    scale: () => 1,
    unavailable: (ds) => (ds.compensationAvailable ? null : "The Rippling token has no compensation scope, so pay metrics cannot be computed."),
    records: (ds, w, ix) =>
      ds.people
        .filter((p) => isEmployee(p) && activeAt(p, w.end) && p.salary !== null && p.department)
        .flatMap((p) => {
          const b = ix.benchByKey.get(`${p.department}|${p.level}`);
          if (!b || p.salary === null) return [];
          return [{ dims: personDims(p), num: p.salary / b.mid, den: 1, meta: { pos: (p.salary - b.min) / (b.max - b.min), below: p.salary < b.min, above: p.salary > b.max } }];
        }),
    extras: (ds, _w, recs) => {
      const b = ds.benchmarks[0];
      return [
        { key: "range_position", label: "Average position in pay range (0 is minimum, 1 is maximum)", value: recs.length ? Math.round((sum(recs.map((r) => Number(r.meta?.pos))) / recs.length) * 100) / 100 : null, unit: "ratio" },
        { key: "below_range", label: "Share below range minimum", value: round1(pct(recs.filter((r) => r.meta?.below).length, recs.length)), unit: "pct" },
        { key: "above_range", label: "Share above range maximum", value: round1(pct(recs.filter((r) => r.meta?.above).length, recs.length)), unit: "pct" },
        { key: "benchmark_source", label: "Benchmark source", value: b ? `${b.source}, ${b.sizeBand}` : null, unit: "text" },
      ];
    },
  },

  people_cost: {
    scale: (w) => 12 / w.months,
    records: (ds, w) => {
      const from = periodOf(w.start);
      const to = periodOf(w.end);
      const pay = ds.payroll.filter((m) => m.month >= from && m.month <= to).map((m): Rec => ({ dims: {}, num: m.salary + m.benefits + m.taxes, den: 0 }));
      const recruiting = ds.costs.filter((c) => c.month >= from && c.month <= to).map((c): Rec => ({ dims: {}, num: c.amount, den: 0 }));
      const headcount = ds.people
        .filter(isEmployee)
        .map((p) => activeFraction(p, w))
        .filter((f) => f > 0)
        .map((f): Rec => ({ dims: {}, num: 0, den: f }));
      return [...pay, ...recruiting, ...headcount];
    },
    extras: (_ds, _w, recs) => [
      { key: "total_cost", label: "People costs in the window", value: Math.round(sum(recs.map((r) => r.num))), unit: "usd" },
      { key: "avg_headcount", label: "Average headcount", value: round1(sum(recs.map((r) => r.den))), unit: "count" },
    ],
  },

  compliance: {
    scale: () => 100,
    records: (ds, w, ix) =>
      ds.people
        .filter((p) => isEmployee(p) && inWin(p.startDate, w))
        .flatMap((p) => {
          const t = (ix.tasksByEmployee.get(p.id) ?? []).find((x) => x.type === "i9");
          if (!t) return [];
          return [{ dims: personDims(p), num: t.completedDate && t.completedDate <= t.dueDate ? 1 : 0, den: 1 }];
        }),
    extras: (ds, w, recs) => {
      const active = new Set(ds.people.filter((p) => isEmployee(p) && activeAt(p, w.end)).map((p) => p.id));
      const yearAgo = addDays(w.end, -365);
      const rows = ds.training.filter((t) => t.dueDate > yearAgo && t.dueDate <= w.end && active.has(t.employeeId));
      const done = rows.filter((t) => t.completedDate && t.completedDate <= w.end).length;
      const closed = ds.erCases.filter((c) => inWin(c.closedDate, w));
      const open = ds.erCases.filter((c) => c.openedDate <= w.end && (!c.closedDate || c.closedDate > w.end)).length;
      return [
        { key: "i9_on_time", label: "I-9s completed on time", value: sum(recs.map((r) => r.num)), unit: "count" },
        { key: "training_completion", label: "Required training completion (trailing year of due dates)", value: round1(pct(done, rows.length)), unit: "pct" },
        { key: "er_days_to_close", label: "ER case days to close (average)", value: closed.length ? round1(sum(closed.map((c) => diffDays(c.openedDate, c.closedDate as ISODate))) / closed.length) : null, unit: "days", restricted: true },
        { key: "er_cases_closed", label: "ER cases closed in the window", value: closed.length, unit: "count", restricted: true },
        { key: "er_cases_open", label: "ER cases open at window end", value: open, unit: "count", restricted: true },
      ];
    },
  },
};

/** Multiplier applied to num/den for this metric and window (100 for percentages, 12/months for annualized). */
export const scaleOf = (id: MetricId, w: Win): number => IMPL[id].scale(w);
export const isCountMetric = (id: MetricId): boolean => !!IMPL[id].countOnly;

// ---------- reduction ----------

export interface Group {
  key: string;
  value: number | null;
  numerator: number;
  denominator: number;
  n: number;
}

export interface Computed {
  value: number | null;
  numerator: number;
  denominator: number;
  n: number;
  window: Win;
  groups?: Group[];
  extras: Extra[];
  unavailable?: string;
}

function reduce(impl: Impl, recs: Rec[], w: Win) {
  const numerator = sum(recs.map((r) => r.num));
  const denominator = sum(recs.map((r) => r.den));
  const value = impl.countOnly ? numerator : denominator > 0 ? (numerator / denominator) * impl.scale(w) : null;
  return { value, numerator, denominator, n: recs.length };
}

export interface ComputeOptions {
  period: Period;
  window?: WindowKind;
  groupBy?: Dim;
  filter?: Dims;
  withExtras?: boolean;
}

export function compute(ds: Dataset, id: MetricId, opts: ComputeOptions): Computed {
  const def = METRIC_BY_ID[id];
  const impl = IMPL[id];
  const w = windowFor(opts.window ?? def.window, opts.period);
  if (opts.groupBy && !def.dimensions.includes(opts.groupBy)) {
    throw new Error(`${def.name} cannot be broken down by ${opts.groupBy}. Supported: ${def.dimensions.length ? def.dimensions.join(", ") : "none"}.`);
  }
  for (const k of Object.keys(opts.filter ?? {})) {
    if (!def.dimensions.includes(k as Dim)) throw new Error(`${def.name} cannot be filtered by ${k}. Supported: ${def.dimensions.length ? def.dimensions.join(", ") : "none"}.`);
  }
  const unavailable = impl.unavailable?.(ds);
  if (unavailable) return { value: null, numerator: 0, denominator: 0, n: 0, window: w, extras: [], unavailable };

  const ix = indexOf(ds);
  let recs = impl.records(ds, w, ix, { groupBy: opts.groupBy });
  const filter = opts.filter;
  if (filter) recs = recs.filter((r) => Object.entries(filter).every(([k, v]) => r.dims[k as Dim] === v));

  const total = reduce(impl, recs, w);
  let groups: Group[] | undefined;
  if (opts.groupBy) {
    const by = new Map<string, Rec[]>();
    for (const r of recs) {
      const key = r.dims[opts.groupBy] ?? "Unassigned";
      by.set(key, [...(by.get(key) ?? []), r]);
    }
    groups = [...by.entries()]
      .map(([key, rs]) => ({ key, ...reduce(impl, rs, w) }))
      .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  }
  const extras = opts.withExtras === false ? [] : (impl.extras?.(ds, w, recs, ix) ?? []);
  return { ...total, window: w, groups, extras };
}

// ---------- trend ----------

export interface TrendPoint {
  period: Period;
  value: number | null;
  n: number;
}

export function trend(ds: Dataset, id: MetricId, period: Period, filter?: Dims): TrendPoint[] {
  const def = METRIC_BY_ID[id];
  const steps = def.cadence === "quarterly" ? [4, 3, 2, 1, 0].map((i) => i * 3) : [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  return steps.map((back) => {
    const p = addMonths(period, -back);
    const c = compute(ds, id, { period: p, filter, withExtras: false });
    return { period: p, value: c.value, n: c.n };
  });
}

// ---------- status against target ----------

export type Status = "on_track" | "watch" | "off_track" | "no_target";

export function statusFor(id: MetricId, value: number | null): Status {
  const t = METRIC_BY_ID[id].target;
  if (!t || value === null) return "no_target";
  if (t.direction === "max") return value <= t.value ? "on_track" : value <= t.warn ? "watch" : "off_track";
  return value >= t.value ? "on_track" : value >= t.warn ? "watch" : "off_track";
}

