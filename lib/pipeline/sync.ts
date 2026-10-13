// The ingestion pipeline: pull every source, normalise through the adapters,
// and return one Dataset plus a report of how the pull went (calls, retries,
// records, warnings, failures). The sync report is itself surfaced in the HR view
// and through MCP, because "is the data fresh and complete" is the first question
// anyone should ask of a number.

import type {
  AshbyApplication,
  AshbyJob,
  AshbyOffer,
  OpsBenchmark,
  OpsCheckIn,
  OpsErCase,
  OpsPayrollMonth,
  OpsPlan,
  OpsPulseSurvey,
  OpsRecruitingCost,
  OpsReview,
  OpsTraining,
  RipplingCompensation,
  RipplingEmployee,
  RipplingOnboardingTask,
} from "../api-types";
import { AS_OF } from "../mock/seed";
import { DEMO_TOKENS, mockFetch } from "../mock/handlers";
import { ApiError, newStats, paginateCursor, paginateLinks, type HttpConfig, type Stats } from "../clients/http";
import { mapApplication, mapEmployee, mapJob, mapOffer, mapTask } from "../clients/adapters";
import { addMonths, iso, monthEnd, periodOf } from "../dates";
import type { Dataset, SourceReport } from "../types";

export interface SyncOptions {
  mode?: "mock" | "live";
  /** Use the read-only demo Rippling token to see the missing-scope path. */
  readonlyRipplingToken?: boolean;
  /** Make the mock APIs fail every few requests to exercise retries. */
  chaos?: boolean;
  backoffMs?: number;
  maxRetries?: number;
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Live mode needs ${name} to be set. See .env.example.`);
  return v;
}

export async function runSync(opts: SyncOptions = {}): Promise<Dataset> {
  const mode = opts.mode ?? (process.env.DATA_MODE === "live" ? "live" : "mock");
  const startedAt = new Date().toISOString();
  const maxRetries = opts.maxRetries ?? 4;
  const backoffMs = opts.backoffMs ?? Number(process.env.PIPELINE_BACKOFF_MS ?? (mode === "mock" ? 5 : 400));
  const chaosHeader: Record<string, string> = opts.chaos ? { "x-mock-chaos": "1" } : {};
  const fetchImpl = mode === "mock" ? mockFetch : fetch;

  const asOf = mode === "mock" ? AS_OF : monthEnd(addMonths(periodOf(iso(new Date())), -1));

  const make = (name: string, baseUrl: string, headers: Record<string, string>): HttpConfig => ({
    name,
    baseUrl,
    headers: { ...headers, ...(mode === "mock" ? chaosHeader : {}) },
    fetchImpl,
    maxRetries,
    backoffMs,
    stats: newStats(),
  });

  const ripplingCfg =
    mode === "mock"
      ? make("rippling", "http://mock.local/api/mock/rippling", {
          authorization: `Bearer ${opts.readonlyRipplingToken ? DEMO_TOKENS.ripplingReadonly : (process.env.RIPPLING_API_TOKEN ?? DEMO_TOKENS.rippling)}`,
        })
      : make("rippling", need("RIPPLING_BASE_URL"), { authorization: `Bearer ${need("RIPPLING_API_TOKEN")}` });
  const ashbyCfg =
    mode === "mock"
      ? make("ashby", "http://mock.local/api/mock/ashby", { authorization: `Basic ${Buffer.from(`${DEMO_TOKENS.ashbyKey}:`).toString("base64")}` })
      : make("ashby", need("ASHBY_BASE_URL"), { authorization: `Basic ${Buffer.from(`${need("ASHBY_API_KEY")}:`).toString("base64")}` });
  const opsCfg =
    mode === "mock"
      ? make("ops", "http://mock.local/api/mock/ops", { authorization: `Bearer ${DEMO_TOKENS.ops}` })
      : make("ops", need("OPS_BASE_URL"), { authorization: `Bearer ${need("OPS_API_TOKEN")}` });

  const reports: SourceReport[] = [];
  const timed = async <T,>(cfg: HttpConfig, fallback: T, fn: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    let result = fallback;
    let ok = true;
    try {
      result = await fn();
    } catch (err) {
      ok = false;
      cfg.stats.errors.push(err instanceof Error ? err.message : String(err));
    }
    const s: Stats = cfg.stats;
    reports.push({ source: cfg.name, calls: s.calls, retries: s.retries, records: s.records, ms: Date.now() - t0, ok, warnings: s.warnings, errors: s.errors });
    return result;
  };

  let compensationAvailable = true;

  const [rippling, ashby, ops] = await Promise.all([
    timed(
      ripplingCfg,
      { employees: [] as RipplingEmployee[], comp: [] as RipplingCompensation[], tasks: [] as RipplingOnboardingTask[] },
      async () => {
        const employees = await paginateLinks<RipplingEmployee>(ripplingCfg, "/employees/include_terminated");
        let comp: RipplingCompensation[] = [];
        try {
          comp = await paginateLinks<RipplingCompensation>(ripplingCfg, "/compensations");
        } catch (err) {
          if (err instanceof ApiError && err.status === 403) {
            compensationAvailable = false;
            ripplingCfg.stats.warnings.push("Token lacks the compensation scope. Compa-ratio and people cost are unavailable until it is granted.");
          } else throw err;
        }
        const tasks = await paginateLinks<RipplingOnboardingTask>(ripplingCfg, "/onboarding_tasks");
        return { employees, comp, tasks };
      },
    ),
    timed(ashbyCfg, { jobs: [] as AshbyJob[], apps: [] as AshbyApplication[], offers: [] as AshbyOffer[] }, async () => {
      const [jobs, apps, offers] = await Promise.all([
        paginateCursor<AshbyJob>(ashbyCfg, "job.list"),
        paginateCursor<AshbyApplication>(ashbyCfg, "application.list"),
        paginateCursor<AshbyOffer>(ashbyCfg, "offer.list"),
      ]);
      return { jobs, apps, offers };
    }),
    timed(
      opsCfg,
      {
        checkIns: [] as OpsCheckIn[],
        pulse: [] as OpsPulseSurvey[],
        reviews: [] as OpsReview[],
        training: [] as OpsTraining[],
        erCases: [] as OpsErCase[],
        costs: [] as OpsRecruitingCost[],
        payroll: [] as OpsPayrollMonth[],
        plan: [] as OpsPlan[],
        benchmarks: [] as OpsBenchmark[],
      },
      async () => {
        const [checkIns, pulse, reviews, training, erCases, costs, payroll, plan, benchmarks] = await Promise.all([
          paginateLinks<OpsCheckIn>(opsCfg, "/survey/check_ins"),
          paginateLinks<OpsPulseSurvey>(opsCfg, "/survey/pulse"),
          paginateLinks<OpsReview>(opsCfg, "/performance/reviews"),
          paginateLinks<OpsTraining>(opsCfg, "/lms/training"),
          paginateLinks<OpsErCase>(opsCfg, "/er/cases"),
          paginateLinks<OpsRecruitingCost>(opsCfg, "/finance/recruiting_costs"),
          paginateLinks<OpsPayrollMonth>(opsCfg, "/finance/payroll"),
          paginateLinks<OpsPlan>(opsCfg, "/finance/plan"),
          paginateLinks<OpsBenchmark>(opsCfg, "/comp/benchmarks"),
        ]);
        return { checkIns, pulse, reviews, training, erCases, costs, payroll, plan, benchmarks };
      },
    ),
  ]);

  const salaryById = new Map(rippling.comp.map((c) => [c.employeeId, c.annualBaseSalary]));
  const warnings = reports.flatMap((r) => r.warnings);
  for (const r of reports) if (!r.ok) warnings.push(`${r.source} sync failed: ${r.errors[0] ?? "unknown error"}`);

  return {
    asOf,
    latestPeriod: periodOf(asOf),
    people: rippling.employees.map((e) => mapEmployee(e, salaryById)),
    tasks: rippling.tasks.map(mapTask),
    jobs: ashby.jobs.map(mapJob),
    applications: ashby.apps.map(mapApplication),
    offers: ashby.offers.map(mapOffer),
    checkIns: ops.checkIns,
    reviews: ops.reviews,
    training: ops.training,
    erCases: ops.erCases,
    pulse: ops.pulse,
    costs: ops.costs,
    payroll: ops.payroll,
    plan: ops.plan,
    benchmarks: ops.benchmarks,
    compensationAvailable,
    sync: { startedAt, finishedAt: new Date().toISOString(), mode, asOf, sources: reports.sort((a, b) => a.source.localeCompare(b.source)), warnings },
  };
}

// Module-level cache that survives dev reloads. Same data for every request on an instance,
// so the HR view, the leadership view and the MCP tools can never disagree with each other.
const g = globalThis as unknown as { __peopleDataset?: { at: number; ds: Promise<Dataset> } };

export function getDataset(ttlMs = 5 * 60_000): Promise<Dataset> {
  const now = Date.now();
  if (!g.__peopleDataset || now - g.__peopleDataset.at > ttlMs) {
    const ds = runSync().catch((err) => {
      delete g.__peopleDataset;
      throw err;
    });
    g.__peopleDataset = { at: now, ds };
  }
  return g.__peopleDataset.ds;
}
