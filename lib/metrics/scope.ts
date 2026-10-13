// Access scopes. The same metrics layer serves two audiences, and this file is
// the only place that decides what each is allowed to see.
//
//   hr          everything, including restricted detail (compensation, performance,
//               employee relations) and groups of any size
//   leadership  aggregates only. Restricted metrics are refused. Groups smaller
//               than MIN_GROUP_SIZE are hidden. Small event counts are masked.
//
// When no identity is presented the MCP server falls back to leadership, the
// least privileged scope.

import { MIN_GROUP_SIZE, type MetricDefinition } from "./definitions";
import { formatValue } from "./format";
import type { Group } from "./engine";

export type Scope = "hr" | "leadership";

export class ScopeError extends Error {}

export interface GroupOut {
  key: string;
  value: number | null;
  display: string;
  numerator: number | null;
  denominator: number | null;
  n: number | null;
  suppressed?: boolean;
  smallGroup?: boolean;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function assertCanSee(def: MetricDefinition, scope: Scope): void {
  if (!def.audiences.includes(scope)) {
    throw new ScopeError(`${def.name} is not available in the ${scope} scope. It contains ${def.restricted ? "restricted" : "HR-only"} detail.`);
  }
}

export function scopeGroups(groups: Group[], def: MetricDefinition, scope: Scope, countMetric: boolean): { groups: GroupOut[]; note?: string } {
  if (scope === "hr") {
    return {
      groups: groups.map((g) => ({
        key: g.key,
        value: g.value,
        display: formatValue(def.unit, g.value),
        numerator: r1(g.numerator),
        denominator: r1(g.denominator),
        n: g.n,
        smallGroup: g.n < MIN_GROUP_SIZE ? true : undefined,
      })),
      note: groups.some((g) => g.n < MIN_GROUP_SIZE) ? `Groups under ${MIN_GROUP_SIZE} are flagged. Leadership would not see them.` : undefined,
    };
  }

  const hide = new Set(groups.filter((g) => g.n < MIN_GROUP_SIZE).map((g) => g.key));
  // Complementary suppression: with a single hidden cell in a count, subtraction from the total would reveal it.
  if (countMetric && hide.size === 1) {
    const smallestVisible = [...groups].filter((g) => !hide.has(g.key)).sort((a, b) => a.n - b.n)[0];
    if (smallestVisible) hide.add(smallestVisible.key);
  }
  const out = groups.map<GroupOut>((g) =>
    hide.has(g.key)
      ? { key: g.key, value: null, display: `Hidden (fewer than ${MIN_GROUP_SIZE})`, numerator: null, denominator: null, n: null, suppressed: true }
      : { key: g.key, value: g.value, display: formatValue(def.unit, g.value), numerator: r1(g.numerator), denominator: r1(g.denominator), n: g.n },
  );
  return { groups: out, note: hide.size ? `Groups with fewer than ${MIN_GROUP_SIZE} people are hidden so no individual can be identified.` : undefined };
}

/** Small event counts (1 to 4) are masked in the leadership scope. */
export function maskSmallCount(v: number | string | null, scope: Scope): { value: number | string | null; masked: boolean } {
  if (scope === "leadership" && typeof v === "number" && v > 0 && v < MIN_GROUP_SIZE) return { value: null, masked: true };
  return { value: v, masked: false };
}

export const ROW_COUNT_KEYS = new Set(["reached", "advanced", "due", "completed", "reviews"]);
