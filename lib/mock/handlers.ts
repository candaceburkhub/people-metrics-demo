// Mock source-system APIs. One handler serves all three fake vendors so the same
// code backs the public /api/mock routes and the in-process transport the demo
// uses by default.
//
// Behaviours worth noticing, because real APIs do all of them:
//   - auth (bearer for Rippling and the ops sources, basic auth for Ashby)
//   - token scopes (the read-only Rippling token cannot read compensation: 403)
//   - pagination (next_link for Rippling and ops, cursors for Ashby)
//   - transient failures (set MOCK_CHAOS=1 or send x-mock-chaos: 1 to get 429s and 503s)

import { getMockDb } from "./seed";

export type MockSource = "rippling" | "ashby" | "ops";

export const DEMO_TOKENS = {
  rippling: "demo-rippling-token",
  ripplingReadonly: "demo-rippling-readonly-token",
  ashbyKey: "demo-ashby-key",
  ops: "demo-ops-token",
} as const;

const PAGE_MAX = 100;
let requestCounter = 0;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function chaos(req: Request): Response | null {
  const on = process.env.MOCK_CHAOS === "1" || req.headers.get("x-mock-chaos") === "1";
  if (!on) return null;
  requestCounter++;
  if (requestCounter % 9 === 0) return json({ error: "rate limited" }, 429, { "retry-after": "0" });
  if (requestCounter % 14 === 0) return json({ error: "upstream unavailable" }, 503);
  return null;
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}

function pageLink<T>(req: Request, rows: T[]) {
  const url = new URL(req.url);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(url.searchParams.get("limit") ?? PAGE_MAX)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  const results = rows.slice(offset, offset + limit);
  let next_link: string | null = null;
  if (offset + limit < rows.length) {
    const next = new URL(url.toString());
    next.searchParams.set("limit", String(limit));
    next.searchParams.set("offset", String(offset + limit));
    next_link = next.toString();
  }
  return { results, next_link };
}

export async function handleMock(source: MockSource, path: string[], req: Request): Promise<Response> {
  const failure = chaos(req);
  if (failure) return failure;
  const db = getMockDb();
  const route = path.join("/");

  if (source === "rippling") {
    const token = bearer(req);
    if (token !== DEMO_TOKENS.rippling && token !== DEMO_TOKENS.ripplingReadonly) return json({ error: "invalid or missing token" }, 401);
    if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
    switch (route) {
      case "employees":
        return json(pageLink(req, db.rippling.employees.filter((e) => !e.endDate)));
      case "employees/include_terminated":
        return json(pageLink(req, db.rippling.employees));
      case "departments":
        return json(pageLink(req, db.rippling.departments));
      case "compensations":
        if (token !== DEMO_TOKENS.rippling) return json({ error: "token is missing scope compensation:read" }, 403);
        return json(pageLink(req, db.rippling.compensations));
      case "onboarding_tasks":
        return json(pageLink(req, db.rippling.onboardingTasks));
      default:
        return json({ error: `unknown route ${route}` }, 404);
    }
  }

  if (source === "ashby") {
    const basic = (req.headers.get("authorization") ?? "").toLowerCase().startsWith("basic ")
      ? Buffer.from((req.headers.get("authorization") ?? "").slice(6), "base64").toString("utf8").split(":")[0]
      : null;
    if (basic !== DEMO_TOKENS.ashbyKey) return json({ success: false, errors: ["invalid or missing API key"] }, 401);
    if (req.method !== "POST") return json({ success: false, errors: ["Ashby endpoints are POST"] }, 405);
    const body = (await req.json().catch(() => ({}))) as { limit?: number; cursor?: string };
    const rows =
      route === "job.list" ? db.ashby.jobs : route === "application.list" ? db.ashby.applications : route === "offer.list" ? db.ashby.offers : null;
    if (!rows) return json({ success: false, errors: [`unknown endpoint ${route}`] }, 404);
    const limit = Math.min(PAGE_MAX, Math.max(1, body.limit ?? PAGE_MAX));
    const offset = body.cursor ? Number(Buffer.from(body.cursor, "base64").toString("utf8")) : 0;
    const results = rows.slice(offset, offset + limit);
    const more = offset + limit < rows.length;
    return json({
      success: true,
      results,
      moreDataAvailable: more,
      nextCursor: more ? Buffer.from(String(offset + limit)).toString("base64") : null,
    });
  }

  // other sources (survey, performance, LMS, case log, finance, comp benchmarks)
  if (bearer(req) !== DEMO_TOKENS.ops) return json({ error: "invalid or missing token" }, 401);
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
  switch (route) {
    case "survey/check_ins":
      return json(pageLink(req, db.ops.checkIns));
    case "survey/pulse":
      return json(pageLink(req, db.ops.pulse));
    case "performance/reviews":
      return json(pageLink(req, db.ops.reviews));
    case "lms/training":
      return json(pageLink(req, db.ops.training));
    case "er/cases":
      return json(pageLink(req, db.ops.erCases));
    case "finance/recruiting_costs":
      return json(pageLink(req, db.ops.recruitingCosts));
    case "finance/payroll":
      return json(pageLink(req, db.ops.payroll));
    case "finance/plan":
      return json(pageLink(req, db.ops.plan));
    case "comp/benchmarks":
      return json(pageLink(req, db.ops.benchmarks));
    default:
      return json({ error: `unknown route ${route}` }, 404);
  }
}

/** A fetch() that never leaves the process. Same Request/Response objects, no network. */
export const mockFetch: typeof fetch = async (input, init) => {
  const req = new Request(input as RequestInfo, init);
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // api, mock, <source>, ...path
  const idx = parts.indexOf("mock");
  const source = parts[idx + 1] as MockSource;
  return handleMock(source, parts.slice(idx + 2), req);
};
