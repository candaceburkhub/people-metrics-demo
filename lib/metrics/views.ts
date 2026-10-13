// Report builders. Both views, the MCP summary tool and the Slack digest are all
// assembled here from getMetric(), so they share one set of numbers by construction.

import type { Period } from "../dates";
import type { Dataset } from "../types";
import { runAudit, type AuditReport } from "./audit";
import {
  DEFINITIONS_VERSION,
  LEADERSHIP_HEADLINE,
  LEADERSHIP_PANELS,
  METRICS,
  METRIC_BY_ID,
  MIN_GROUP_SIZE,
  REPORT_HIDDEN,
  type Dim,
  type MetricId,
} from "./definitions";
import { explainChange, getMetric, type ChangeExplanation, type MetricResult } from "./report";
import type { Status } from "./engine";

const cache = new WeakMap<Dataset, Map<string, unknown>>();
function memo<T>(ds: Dataset, key: string, build: () => T): T {
  let m = cache.get(ds);
  if (!m) cache.set(ds, (m = new Map()));
  if (!m.has(key)) m.set(key, build());
  return m.get(key) as T;
}

const shortName = (id: MetricId) => METRIC_BY_ID[id].short ?? METRIC_BY_ID[id].name;
const joinList = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`);
// Leaves names like "eNPS" alone, because their lower-case first letter is deliberate.
const capitalize = (s: string) => (s.length > 1 && s[1] === s[1].toUpperCase() && s[1] !== s[1].toLowerCase() ? s : s.charAt(0).toUpperCase() + s.slice(1));

// ---------- HR view ----------

export interface Mover {
  id: MetricId;
  name: string;
  status: Status;
  explanation: ChangeExplanation;
}

export interface HrReport {
  period: Period;
  asOf: string;
  definitionsVersion: string;
  groups: { group: string; metrics: MetricResult[] }[];
  /** HR-scope detail on why off-track metrics moved. Small groups are visible here, so this never goes to leadership. */
  movers: Mover[];
  audit: AuditReport;
}

export function buildHrReport(ds: Dataset, period?: Period): HrReport {
  const p = period ?? ds.latestPeriod;
  return memo(ds, `hr:${p}`, () => {
    const order = [...new Set(METRICS.map((m) => m.group))];
    const groups = order.map((group) => ({
      group,
      metrics: METRICS.filter((m) => m.group === group && !REPORT_HIDDEN.includes(m.id)).map((m) => {
        const groupBy: Dim | undefined = m.dimensions.includes("department") ? "department" : m.dimensions[0];
        return getMetric(ds, m.id, { scope: "hr", period: p, groupBy });
      }),
    }));
    const movers: Mover[] = [];
    for (const g of groups) {
      for (const m of g.metrics) {
        if ((m.status === "off_track" || m.status === "watch") && METRIC_BY_ID[m.id].dimensions.includes("department") && m.change) {
          try {
            movers.push({ id: m.id, name: m.name, status: m.status, explanation: explainChange(ds, m.id, { scope: "hr", groupBy: "department", period: p }) });
          } catch {
            /* skip metrics that cannot be explained */
          }
        }
      }
    }
    movers.sort((a, b) => (a.status === b.status ? 0 : a.status === "off_track" ? -1 : 1));
    return { period: p, asOf: ds.asOf, definitionsVersion: DEFINITIONS_VERSION, groups, movers, audit: runAudit(ds) };
  });
}

// ---------- leadership view ----------

export interface HeadcountVsPlan {
  actual: number;
  planned: number | null;
  gap: number | null;
  attainmentPct: number | null;
  /** Null when fewer than 5, because small counts are hidden from leadership. */
  hires: number | null;
  exits: number | null;
  openRequisitions: number;
  candidatesByStage: { stage: string; candidates: number }[];
}

export interface Commentary {
  status: "draft_pending_human_review";
  paragraphs: string[];
  basis: string[];
}

export interface LeadershipReport {
  period: Period;
  asOf: string;
  scope: "leadership";
  definitionsVersion: string;
  headcountVsPlan: HeadcountVsPlan;
  headline: MetricResult[];
  panels: { name: string; cadence: "Monthly" | "Quarterly"; metrics: MetricResult[] }[];
  commentary: Commentary;
  privacyNote: string;
}

function headcountVsPlan(ds: Dataset, period: Period): HeadcountVsPlan {
  const hc = getMetric(ds, "headcount", { scope: "leadership", period });
  const actual = hc.value ?? 0;
  const planned = ds.plan.find((p) => p.month === period)?.plannedHeadcount ?? null;
  const extra = (key: string) => {
    const v = hc.extras.find((e) => e.key === key)?.value;
    return typeof v === "number" ? v : null;
  };
  const openJobs = ds.jobs.filter((j) => j.status === "open");
  const openIds = new Set(openJobs.map((j) => j.id));
  const stages = ["Applied", "Recruiter Screen", "Hiring Manager Screen", "Onsite", "Offer"];
  const active = ds.applications.filter((a) => a.status === "active" && openIds.has(a.jobId));
  return {
    actual,
    planned,
    gap: planned === null ? null : actual - planned,
    attainmentPct: planned ? Math.round((actual / planned) * 1000) / 10 : null,
    hires: extra("hires"),
    exits: extra("exits"),
    openRequisitions: openJobs.length,
    candidatesByStage: stages.map((stage) => ({ stage, candidates: active.filter((a) => a.currentStage === stage).length })),
  };
}

const countText = (v: number | null) => (v === null ? "fewer than five" : String(v));

/**
 * Drafted commentary. It is built only from leadership-scope numbers, so it is safe to send,
 * and it is always labelled a draft because a person reviews it before it goes anywhere.
 */
function drafted(ds: Dataset, period: Period, results: MetricResult[], hvp: HeadcountVsPlan): Commentary {
  const paragraphs: string[] = [];
  const basis: string[] = [];

  if (hvp.planned !== null) {
    const gapText = hvp.gap === 0 ? "on plan" : hvp.gap! < 0 ? `${Math.abs(hvp.gap!)} below plan` : `${hvp.gap} above plan`;
    paragraphs.push(
      `Headcount closed the month at ${hvp.actual}, ${gapText} (${hvp.attainmentPct}% of the ${hvp.planned} planned). We added ${countText(hvp.hires)} and lost ${countText(hvp.exits)}, and ${hvp.openRequisitions} requisitions are open.`,
    );
    basis.push(`headcount ${hvp.actual} vs plan ${hvp.planned}`);
  }

  const rank: Record<Status, number> = { off_track: 0, watch: 1, on_track: 2, no_target: 3 };
  const flagged = results
    .filter((r) => r.value !== null && (r.status === "off_track" || r.status === "watch"))
    .sort((a, b) => rank[a.status] - rank[b.status])
    .slice(0, 3);

  const lines: string[] = [];
  const actions: string[] = [];
  for (const r of flagged) {
    const def = METRIC_BY_ID[r.id];
    const per = def.cadence === "quarterly" ? "quarter" : "month";
    const move = r.change && r.change.direction !== "flat" ? `, ${r.change.direction} ${r.change.display.replace(/^[+-]/, "")} on the prior ${per}` : "";
    let line = `${capitalize(shortName(r.id))} is ${r.display} against a target of ${r.target?.display}${move}.`;
    if (def.dimensions.includes("department") && r.change && r.change.delta !== 0) {
      try {
        const why = explainChange(ds, r.id, { scope: "leadership", groupBy: "department", period });
        const total = why.delta ?? 0;
        const drivers = why.rows.filter((row) => !row.merged && row.contribution !== null && Math.sign(row.contribution) === Math.sign(total)).slice(0, 2);
        const totalAbs = why.rows.reduce((s, row) => s + Math.abs(row.contribution ?? 0), 0);
        const share = drivers.reduce((s, d) => s + Math.abs(d.contribution ?? 0), 0) / (totalAbs || 1);
        // Only name drivers when they clearly dominate the movement. Otherwise say nothing, because
        // small-group noise is easy to mistake for a cause.
        if (drivers.length && share >= 0.6) line += ` ${joinList(drivers.map((d) => `${d.key} (n=${d.current.n})`))} account${drivers.length === 1 ? "s" : ""} for most of the movement.`;
      } catch {
        /* a breakdown is nice to have, not required */
      }
    }
    lines.push(line);
    if (def.ifOffTrack) actions.push(def.ifOffTrack.replace(/^I'd /, "").replace(/\.$/, ""));
    basis.push(`${r.id} ${r.display} (target ${r.target?.display}, n=${r.n})`);
  }
  if (lines.length) paragraphs.push(lines.join(" "));
  if (actions.length) paragraphs.push(`What I would do next is ${joinList(actions)}.`);

  const small = flagged.filter((r) => r.n !== null && r.n < 15 && METRIC_BY_ID[r.id].cadence === "monthly");
  if (small.length) {
    const lo = Math.min(...small.map((r) => r.n as number));
    const hi = Math.max(...small.map((r) => r.n as number));
    paragraphs.push(
      `One caution. ${capitalize(joinList(small.map((r) => shortName(r.id).toLowerCase())))} rest${small.length === 1 ? "s" : ""} on ${lo === hi ? lo : `${lo} to ${hi}`} records this month, so the trend is more reliable than any single month.`,
    );
  }
  if (!flagged.length) paragraphs.push("Every metric with a target is on track this period.");
  return { status: "draft_pending_human_review", paragraphs, basis };
}

export function buildLeadershipReport(ds: Dataset, period?: Period): LeadershipReport {
  const p = period ?? ds.latestPeriod;
  return memo(ds, `leadership:${p}`, () => {
    const headline = LEADERSHIP_HEADLINE.map((id) => getMetric(ds, id, { scope: "leadership", period: p }));
    const panels = LEADERSHIP_PANELS.map((panel) => ({
      name: panel.name,
      cadence: panel.cadence,
      metrics: panel.metrics.map((id) => {
        const groupBy: Dim | undefined = id === "compa_ratio" ? "level" : id === "pipeline_conversion" ? "source" : undefined;
        return getMetric(ds, id, { scope: "leadership", period: p, groupBy });
      }),
    }));
    const hvp = headcountVsPlan(ds, p);
    const all = [...new Map([...headline, ...panels.flatMap((x) => x.metrics)].map((m) => [m.id, m])).values()];
    return {
      period: p,
      asOf: ds.asOf,
      scope: "leadership" as const,
      definitionsVersion: DEFINITIONS_VERSION,
      headcountVsPlan: hvp,
      headline,
      panels,
      commentary: drafted(ds, p, all, hvp),
      privacyNote: `Aggregates only. Groups with fewer than ${MIN_GROUP_SIZE} people are hidden, and compensation, performance and employee relations detail stays in the HR view.`,
    };
  });
}

// ---------- Slack digest ----------

export function slackDigest(r: LeadershipReport): { text: string; blocks: unknown[] } {
  const lines = r.headline.map((m) => {
    const flag = m.status === "off_track" ? " (off track)" : m.status === "watch" ? " (watch)" : "";
    return `*${m.name}*: ${m.display}${flag}`;
  });
  return {
    text: `DRAFT for People Ops review. People metrics for ${r.period}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `People metrics, ${r.period} (draft for review)` } },
      { type: "section", text: { type: "mrkdwn", text: r.commentary.paragraphs.join("\n\n") } },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
      { type: "context", elements: [{ type: "mrkdwn", text: `Synthetic demo data. Definitions ${r.definitionsVersion}. ${r.privacyNote}` }] },
    ],
  };
}
