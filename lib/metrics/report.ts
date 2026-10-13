// The public face of the metrics layer. getMetric() and explainChange() are what
// the HR view, the leadership view and the MCP tools all call.

import { addMonths, type ISODate, type Period } from "../dates";
import type { Dataset } from "../types";
import { compute, isCountMetric, scaleOf, statusFor, trend, windowFor, type Dims, type Extra, type Status } from "./engine";
import {
  DEFINITIONS_OWNER,
  DEFINITIONS_VERSION,
  METRIC_BY_ID,
  MIN_GROUP_SIZE,
  type Dim,
  type MetricId,
  type Unit,
  type WindowKind,
} from "./definitions";
import { formatDelta, formatValue } from "./format";
import { assertCanSee, maskSmallCount, ROW_COUNT_KEYS, scopeGroups, type GroupOut, type Scope } from "./scope";

export interface ExtraOut {
  key: string;
  label: string;
  value: number | string | null;
  display: string;
  unit: Unit | "text";
  rows?: Record<string, string | number | null>[];
  masked?: boolean;
}

export interface TrendOut {
  period: Period;
  value: number | null;
  display: string;
  n: number | null;
}

export interface MetricResult {
  id: MetricId;
  name: string;
  group: string;
  unit: Unit;
  scope: Scope;
  period: Period;
  window: { kind: WindowKind; label: string; start: ISODate; end: ISODate };
  value: number | null;
  display: string;
  numerator: number | null;
  denominator: number | null;
  n: number | null;
  suppressed: boolean;
  status: Status;
  target: { value: number; direction: "min" | "max"; warn: number; display: string; note: string } | null;
  trend: TrendOut[];
  previous: { period: Period; value: number | null; display: string } | null;
  change: { delta: number; display: string; direction: "up" | "down" | "flat" } | null;
  breakdown?: { dim: Dim; groups: GroupOut[]; note?: string };
  extras: ExtraOut[];
  unavailableReason?: string;
  definition: { version: string; owner: string; summary: string; formula: string; numerator: string; denominator: string; sources: string[] };
  asOf: ISODate;
  notes: string[];
}

export interface MetricQuery {
  scope: Scope;
  period?: Period;
  window?: WindowKind;
  groupBy?: Dim;
  filter?: Dims;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

function scopeExtras(extras: Extra[], scope: Scope): ExtraOut[] {
  const out: ExtraOut[] = [];
  for (const e of extras) {
    if (scope === "leadership" && e.restricted) continue;
    const m = e.unit === "count" ? maskSmallCount(e.value, scope) : { value: e.value, masked: false };
    out.push({
      key: e.key,
      label: e.label,
      value: m.value,
      display: m.masked ? `Hidden (fewer than ${MIN_GROUP_SIZE})` : formatValue(e.unit, m.value),
      unit: e.unit,
      masked: m.masked || undefined,
      rows: e.rows?.map((row) =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k, ROW_COUNT_KEYS.has(k) && typeof v === "number" ? (maskSmallCount(v, scope).value as number | null) : v])),
      ),
    });
  }
  return out;
}

export function getMetric(ds: Dataset, id: MetricId, q: MetricQuery): MetricResult {
  const def = METRIC_BY_ID[id];
  assertCanSee(def, q.scope);
  const period = q.period ?? ds.latestPeriod;
  const c = compute(ds, id, { period, window: q.window, groupBy: q.groupBy, filter: q.filter });
  const hide = q.scope === "leadership" && !c.unavailable && c.n < MIN_GROUP_SIZE;

  const step = def.cadence === "quarterly" ? -3 : -1;
  const prevPeriod = addMonths(period, step);
  const prev = compute(ds, id, { period: prevPeriod, window: q.window, filter: q.filter, withExtras: false });
  const prevHidden = q.scope === "leadership" && prev.n < MIN_GROUP_SIZE;
  const prevValue = prevHidden ? null : prev.value;

  const value = hide ? null : c.value;
  const delta = value !== null && prevValue !== null ? value - prevValue : null;
  const tr = trend(ds, id, period, q.filter).map<TrendOut>((p) => {
    const h = q.scope === "leadership" && p.n < MIN_GROUP_SIZE;
    const v = h ? null : p.value;
    return { period: p.period, value: v, display: h ? "Hidden" : formatValue(def.unit, v), n: h ? null : p.n };
  });

  const grouped = c.groups ? scopeGroups(c.groups, def, q.scope, isCountMetric(id)) : null;
  const w = windowFor(q.window ?? def.window, period);
  const notes = [...def.notes];
  if (hide) notes.push(`Hidden in the leadership scope because fewer than ${MIN_GROUP_SIZE} records sit behind it.`);

  return {
    id,
    name: def.name,
    group: def.group,
    unit: def.unit,
    scope: q.scope,
    period,
    window: { kind: w.kind, label: def.windowLabel, start: w.start, end: w.end },
    value,
    display: hide ? `Hidden (fewer than ${MIN_GROUP_SIZE})` : formatValue(def.unit, value),
    numerator: hide || c.unavailable ? null : r1(c.numerator),
    denominator: hide || c.unavailable ? null : r1(c.denominator),
    n: hide ? null : c.n,
    suppressed: hide,
    status: hide ? "no_target" : statusFor(id, value),
    target: def.target ? { ...def.target, display: formatValue(def.unit, def.target.value) } : null,
    trend: tr,
    previous: { period: prevPeriod, value: prevValue, display: prevHidden ? "Hidden" : formatValue(def.unit, prevValue) },
    change: delta === null ? null : { delta, display: formatDelta(def.unit, delta), direction: Math.abs(delta) < 1e-9 ? "flat" : delta > 0 ? "up" : "down" },
    breakdown: q.groupBy && grouped ? { dim: q.groupBy, groups: grouped.groups, note: grouped.note } : undefined,
    extras: hide ? [] : scopeExtras(c.extras, q.scope),
    unavailableReason: c.unavailable,
    definition: { version: DEFINITIONS_VERSION, owner: DEFINITIONS_OWNER, summary: def.summary, formula: def.formula, numerator: def.numerator, denominator: def.denominator, sources: def.sources },
    asOf: ds.asOf,
    notes,
  };
}

// ---------- why did it change ----------

export interface ChangeRow {
  key: string;
  current: { display: string; n: number | null };
  previous: { display: string; n: number | null };
  delta: number | null;
  deltaDisplay: string;
  /** This group's share of the total movement, in the metric's own units. Contributions sum to the total change. */
  contribution: number | null;
  contributionDisplay: string;
  merged?: boolean;
}

export interface ChangeExplanation {
  id: MetricId;
  name: string;
  groupBy: Dim;
  period: Period;
  compareTo: Period;
  current: { value: number | null; display: string };
  previous: { value: number | null; display: string };
  delta: number | null;
  deltaDisplay: string;
  rows: ChangeRow[];
  note: string;
}

export function explainChange(ds: Dataset, id: MetricId, o: { scope: Scope; groupBy: Dim; period?: Period; compareTo?: Period; window?: WindowKind }): ChangeExplanation {
  const def = METRIC_BY_ID[id];
  assertCanSee(def, o.scope);
  const period = o.period ?? ds.latestPeriod;
  const compareTo = o.compareTo ?? addMonths(period, def.cadence === "quarterly" ? -3 : -1);
  const cur = compute(ds, id, { period, window: o.window, groupBy: o.groupBy, withExtras: false });
  const prev = compute(ds, id, { period: compareTo, window: o.window, groupBy: o.groupBy, withExtras: false });
  if (cur.unavailable) throw new Error(cur.unavailable);

  const count = isCountMetric(id);
  const sc = scaleOf(id, cur.window);
  const sp = scaleOf(id, prev.window);
  const keys = [...new Set([...(cur.groups ?? []).map((g) => g.key), ...(prev.groups ?? []).map((g) => g.key)])];
  const find = (gs: typeof cur.groups, k: string) => gs?.find((g) => g.key === k);

  type Raw = { key: string; cn: number; pn: number; cv: number | null; pv: number | null; contrib: number; cnum: number; cden: number; pnum: number; pden: number };
  let raws: Raw[] = keys.map((key) => {
    const c = find(cur.groups, key);
    const p = find(prev.groups, key);
    const contrib = count
      ? (c?.numerator ?? 0) - (p?.numerator ?? 0)
      : (cur.denominator > 0 ? ((c?.numerator ?? 0) / cur.denominator) * sc : 0) - (prev.denominator > 0 ? ((p?.numerator ?? 0) / prev.denominator) * sp : 0);
    return { key, cn: c?.n ?? 0, pn: p?.n ?? 0, cv: c?.value ?? null, pv: p?.value ?? null, contrib, cnum: c?.numerator ?? 0, cden: c?.denominator ?? 0, pnum: p?.numerator ?? 0, pden: p?.denominator ?? 0 };
  });

  let rows: ChangeRow[];
  const fmtC = (x: number) => formatDelta(def.unit, x);
  if (o.scope === "leadership") {
    const small = raws.filter((r) => Math.min(r.cn, r.pn) < MIN_GROUP_SIZE);
    let merge = small;
    if (small.length === 1) {
      const next = raws.filter((r) => !small.includes(r)).sort((a, b) => Math.min(a.cn, a.pn) - Math.min(b.cn, b.pn))[0];
      if (next) merge = [...small, next];
    }
    const keep = raws.filter((r) => !merge.includes(r));
    rows = keep.map((r) => ({
      key: r.key,
      current: { display: formatValue(def.unit, r.cv), n: r.cn },
      previous: { display: formatValue(def.unit, r.pv), n: r.pn },
      delta: r.cv !== null && r.pv !== null ? r.cv - r.pv : null,
      deltaDisplay: r.cv !== null && r.pv !== null ? formatDelta(def.unit, r.cv - r.pv) : "n/a",
      contribution: r.contrib,
      contributionDisplay: fmtC(r.contrib),
    }));
    if (merge.length) {
      const total = merge.reduce((s, r) => s + r.contrib, 0);
      rows.push({
        key: `Other (groups under ${MIN_GROUP_SIZE})`,
        current: { display: "Hidden", n: null },
        previous: { display: "Hidden", n: null },
        delta: null,
        deltaDisplay: "n/a",
        contribution: total,
        contributionDisplay: fmtC(total),
        merged: true,
      });
    }
  } else {
    rows = raws.map((r) => ({
      key: r.key,
      current: { display: formatValue(def.unit, r.cv), n: r.cn },
      previous: { display: formatValue(def.unit, r.pv), n: r.pn },
      delta: r.cv !== null && r.pv !== null ? r.cv - r.pv : null,
      deltaDisplay: r.cv !== null && r.pv !== null ? formatDelta(def.unit, r.cv - r.pv) : "n/a",
      contribution: r.contrib,
      contributionDisplay: fmtC(r.contrib),
    }));
  }
  rows.sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0));
  raws = [];

  const delta = cur.value !== null && prev.value !== null ? cur.value - prev.value : null;
  return {
    id,
    name: def.name,
    groupBy: o.groupBy,
    period,
    compareTo,
    current: { value: cur.value, display: formatValue(def.unit, cur.value) },
    previous: { value: prev.value, display: formatValue(def.unit, prev.value) },
    delta,
    deltaDisplay: delta === null ? "n/a" : formatDelta(def.unit, delta),
    rows,
    note: `Contributions add up to the total change. A group's contribution reflects both how much its own value moved and how many records it holds. Counts sit beside values because small groups swing easily.`,
  };
}
