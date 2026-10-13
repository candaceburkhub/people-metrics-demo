// MCP tools over the metrics layer.
//
// Design choices, borrowed from how Rippling describes building its own MCP server:
//   - Few tools (five), because every tool definition costs the model context on every request.
//   - Descriptions are the product. They say when to use the tool, what comes back, and what the
//     limits are, because the model reads them fresh every time.
//   - A compact action header up front (INSTRUCTIONS), because some clients only read the first
//     couple of thousand characters when deciding whether a server is relevant.
//   - Permissions are enforced on the server, per request, never left to the model.
//
// The tool logic is plain functions (runTool) so it can be tested without a transport.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { getDataset } from "../pipeline/sync";
import { runAudit } from "../metrics/audit";
import { DEFINITIONS_OWNER, DEFINITIONS_VERSION, METRICS, METRIC_BY_ID, MIN_GROUP_SIZE, isMetricId, type Dim, type MetricId, type WindowKind } from "../metrics/definitions";
import { explainChange, getMetric } from "../metrics/report";
import { buildLeadershipReport } from "../metrics/views";
import { ScopeError, type Scope } from "../metrics/scope";
import type { Dataset } from "../types";

export const INSTRUCTIONS = `People metrics MCP. SYNTHETIC DEMO DATA. Sources: Rippling, Ashby, finance, survey.
FLOW: list_metrics > get_metric(metric_id, period?, group_by?) > explain_change(metric_id, group_by) | leadership_summary | data_quality_report (HR only)
RULES
- Never compute or estimate a metric yourself. Call get_metric. Quote value, n and period, and the numerator and denominator for rates.
- For "why did X change", call explain_change with group_by=department first. Contributions add up to the total change.
- Periods are YYYY-MM. Default is the latest closed month. Quarterly metrics use a rolling 3 months.
- If n is under 15, say the trend matters more than the single month.
- leadership_summary returns a DRAFT. Always say it needs human review before it is sent anywhere.
SCOPE
- No token means leadership scope. Aggregates only, groups under ${MIN_GROUP_SIZE} are hidden, restricted metrics (quality of hire, review completion) are refused.
- HR scope needs a bearer token. If a result is hidden or refused, say so. Do not try to work around it.
DEFINITIONS
- One definition per metric lives in the shared definitions file. Its version is in every result. Use list_metrics to explain what a metric means.`;

const dims = ["department", "location", "level", "worker_type", "source", "milestone"] as const;
const ids = METRICS.map((m) => m.id) as [MetricId, ...MetricId[]];
const period = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM")
  .optional()
  .describe("Month as YYYY-MM. Defaults to the latest closed month.");

export const schemas = {
  list_metrics: z.object({
    group: z.string().optional().describe("Optional group name, for example Hiring or Retention."),
  }),
  get_metric: z.object({
    metric_id: z.enum(ids).describe("Metric id from list_metrics."),
    period,
    window: z.enum(["month", "quarter", "t12m"]).optional().describe("Override the metric's default window. Most callers should omit this."),
    group_by: z.enum(dims).optional().describe("Split by a dimension the metric supports. list_metrics shows which."),
    filter_dimension: z.enum(dims).optional().describe("Restrict to one slice, used together with filter_value."),
    filter_value: z.string().optional().describe("The value of filter_dimension to keep, for example Engineering."),
  }),
  explain_change: z.object({
    metric_id: z.enum(ids),
    group_by: z.enum(dims).describe("Dimension to attribute the change to. Start with department."),
    period,
    compare_to: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe("Period to compare against. Defaults to the prior month, or prior quarter for quarterly metrics."),
  }),
  data_quality_report: z.object({}),
  leadership_summary: z.object({ period }),
};

type Args<K extends keyof typeof schemas> = z.infer<(typeof schemas)[K]>;

export async function runTool(name: keyof typeof schemas, rawArgs: unknown, scope: Scope, dsOverride?: Dataset): Promise<unknown> {
  const ds = dsOverride ?? (await getDataset());
  const args = schemas[name].parse(rawArgs ?? {}) as Record<string, unknown>;

  switch (name) {
    case "list_metrics": {
      const a = args as Args<"list_metrics">;
      return {
        definitionsVersion: DEFINITIONS_VERSION,
        owner: DEFINITIONS_OWNER,
        scope,
        latestPeriod: ds.latestPeriod,
        metrics: METRICS.filter((m) => !a.group || m.group.toLowerCase() === a.group.toLowerCase()).map((m) => ({
          id: m.id,
          name: m.name,
          group: m.group,
          summary: m.summary,
          formula: m.formula,
          numerator: m.numerator,
          denominator: m.denominator,
          sources: m.sources,
          window: m.windowLabel,
          cadence: m.cadence,
          unit: m.unit,
          dimensions: m.dimensions,
          target: m.target ? { value: m.target.value, direction: m.target.direction, note: m.target.note } : null,
          availableInYourScope: m.audiences.includes(scope),
        })),
      };
    }
    case "get_metric": {
      const a = args as Args<"get_metric">;
      if (!!a.filter_dimension !== !!a.filter_value) throw new Error("filter_dimension and filter_value must be given together.");
      return getMetric(ds, a.metric_id, {
        scope,
        period: a.period,
        window: a.window as WindowKind | undefined,
        groupBy: a.group_by as Dim | undefined,
        filter: a.filter_dimension && a.filter_value ? { [a.filter_dimension]: a.filter_value } : undefined,
      });
    }
    case "explain_change": {
      const a = args as Args<"explain_change">;
      return explainChange(ds, a.metric_id, { scope, groupBy: a.group_by as Dim, period: a.period, compareTo: a.compare_to });
    }
    case "data_quality_report": {
      if (scope !== "hr") throw new ScopeError("The data quality report points at individual records, so it needs the HR scope.");
      return runAudit(ds);
    }
    case "leadership_summary": {
      const a = args as Args<"leadership_summary">;
      const r = buildLeadershipReport(ds, a.period);
      return {
        period: r.period,
        asOf: r.asOf,
        definitionsVersion: r.definitionsVersion,
        reviewStatus: r.commentary.status,
        headcountVsPlan: r.headcountVsPlan,
        headline: r.headline.map((m) => ({ id: m.id, name: m.name, display: m.display, status: m.status, target: m.target?.display ?? null, change: m.change?.display ?? null, n: m.n })),
        commentary: r.commentary,
        privacyNote: r.privacyNote,
      };
    }
  }
}

const text = (payload: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

async function respond(name: keyof typeof schemas, args: unknown, scope: Scope) {
  try {
    return text(await runTool(name, args, scope));
  } catch (err) {
    if (err instanceof ScopeError) return text(`Refused. ${err.message}`, true);
    if (err instanceof z.ZodError) return text(`Invalid arguments. ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, true);
    return text(err instanceof Error ? err.message : String(err), true);
  }
}

export const scopeFromAuth = (authInfo?: { scopes?: string[] }): Scope => (authInfo?.scopes?.includes("hr") ? "hr" : "leadership");

export function registerTools(server: McpServer): void {
  const ro = { readOnlyHint: true, openWorldHint: false } as const;
  type Ctx = { http?: { authInfo?: { scopes?: string[] } } };
  const scopeOf = (ctx: unknown) => scopeFromAuth((ctx as Ctx)?.http?.authInfo);

  server.registerTool(
    "list_metrics",
    {
      title: "List metric definitions",
      description:
        "Lists the people metrics with their single shared definition: formula, numerator, denominator, source system, window, target, and which dimensions can split them. Use first when you need a metric id or are asked what a number means. Small and fast, under 10 ms.",
      inputSchema: schemas.list_metrics,
      annotations: ro,
    },
    async (args, ctx) => respond("list_metrics", args, scopeOf(ctx)),
  );

  server.registerTool(
    "get_metric",
    {
      title: "Get a people metric",
      description:
        "Returns one metric computed from Rippling, Ashby and finance data using the shared definitions: value, numerator and denominator, n, status against target, 12 point trend (5 for quarterly metrics), previous period, and an optional breakdown by group_by. Use for any question about a number and never estimate one yourself. Typically under 20 ms. Leadership scope hides groups under 5 and refuses restricted metrics.",
      inputSchema: schemas.get_metric,
      annotations: ro,
    },
    async (args, ctx) => respond("get_metric", args, scopeOf(ctx)),
  );

  server.registerTool(
    "explain_change",
    {
      title: "Explain why a metric changed",
      description:
        "Attributes the change in a metric between two periods to groups along one dimension (start with department). Each row shows current and previous values with counts, and a contribution in the metric's units. Contributions add up to the total change. Use for 'why did X go up or down'. Typically under 20 ms. Leadership scope merges groups under 5 into one row.",
      inputSchema: schemas.explain_change,
      annotations: ro,
    },
    async (args, ctx) => respond("explain_change", args, scopeOf(ctx)),
  );

  server.registerTool(
    "data_quality_report",
    {
      title: "Data quality audit and sync status",
      description:
        "HR scope only. Lists records that quietly break the metrics (missing reason codes, missing ATS to HRIS IDs, drifted start dates, failed or partial syncs) with counts, which metrics each affects, the fix, and example record IDs. Also reports the last sync per source. Use before trusting a surprising number. Typically under 10 ms.",
      inputSchema: schemas.data_quality_report,
      annotations: ro,
    },
    async (args, ctx) => respond("data_quality_report", args, scopeOf(ctx)),
  );

  server.registerTool(
    "leadership_summary",
    {
      title: "Leadership one-pager with draft commentary",
      description:
        "Returns what leadership sees: headcount against plan, the eight headline metrics with targets and status, and a DRAFT commentary written from those numbers. The draft is always pending human review and must not be presented as final. Safe to share, because it is built from leadership-scope numbers only. Typically under 100 ms.",
      inputSchema: schemas.leadership_summary,
      annotations: ro,
    },
    async (args, ctx) => respond("leadership_summary", args, scopeOf(ctx)),
  );
}

export { isMetricId, METRIC_BY_ID };
