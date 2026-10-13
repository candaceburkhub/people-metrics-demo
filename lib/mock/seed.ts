// Synthetic company generator. Everything here is invented and deterministic
// (seeded PRNG), so every deploy, every route and every MCP call sees the same
// numbers. Nothing in this file is real SuperAnnotate, Elegen or Tribe data.
//
// The generated world has a few deliberate stories so the demo has something to
// explain, plus a handful of deliberate data quality problems for the audit:
//   - Engineering time to fill rises sharply for offers accepted in Aug and Sep 2026
//   - Offer acceptance dips in Engineering in Sep 2026
//   - Day-one readiness slips for remote hires (equipment) in Aug and Sep 2026
//   - eNPS drifts down over the last two surveys, mostly in Engineering
//   - A few records are broken on purpose (missing reasons, IDs, drifted start dates)

import {
  addBusinessDays,
  addDays,
  addMonths,
  diffDays,
  isWeekend,
  monthEnd,
  monthsBetween,
  monthStart,
  periodOf,
  type ISODate,
} from "../dates";
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
  RipplingDepartment,
  RipplingEmployee,
  RipplingOnboardingTask,
} from "../api-types";

export const AS_OF: ISODate = "2026-09-30";
export const AS_OF_PERIOD = "2026-09";
export { ATS_GO_LIVE } from "../config";
import { ATS_GO_LIVE } from "../config";

export const STAGES = ["Applied", "Recruiter Screen", "Hiring Manager Screen", "Onsite", "Offer", "Hired"] as const;

export interface MockDb {
  rippling: {
    departments: RipplingDepartment[];
    employees: RipplingEmployee[];
    compensations: RipplingCompensation[];
    onboardingTasks: RipplingOnboardingTask[];
  };
  ashby: {
    jobs: AshbyJob[];
    applications: AshbyApplication[];
    offers: AshbyOffer[];
  };
  ops: {
    checkIns: OpsCheckIn[];
    pulse: OpsPulseSurvey[];
    reviews: OpsReview[];
    training: OpsTraining[];
    erCases: OpsErCase[];
    recruitingCosts: OpsRecruitingCost[];
    payroll: OpsPayrollMonth[];
    plan: OpsPlan[];
    benchmarks: OpsBenchmark[];
  };
}

const DEPTS = [
  ["Engineering", 0.34],
  ["Product", 0.08],
  ["Sales", 0.18],
  ["Customer Success", 0.12],
  ["Marketing", 0.07],
  ["Operations", 0.09],
  ["Finance", 0.07],
  ["People", 0.05],
] as const;
const LOCS = [
  ["Remote US", 0.5],
  ["New York", 0.22],
  ["Austin", 0.18],
  ["London", 0.1],
] as const;
const LEVELS = [
  ["L1", 0.25],
  ["L2", 0.3],
  ["L3", 0.25],
  ["L4", 0.14],
  ["L5", 0.06],
] as const;
const SOURCES = [
  ["Referral", 0.25],
  ["LinkedIn", 0.2],
  ["Inbound", 0.2],
  ["Sourced", 0.25],
  ["Agency", 0.1],
] as const;
const SOURCE_MULT: Record<string, number> = { Referral: 1.6, Agency: 1.2, LinkedIn: 0.9, Inbound: 0.75, Sourced: 1.0 };
const TTF_BASE: Record<string, number> = {
  Engineering: 50,
  Product: 46,
  Sales: 33,
  "Customer Success": 31,
  Marketing: 37,
  Operations: 35,
  Finance: 41,
  People: 39,
};
const DEPT_PAY: Record<string, number> = {
  Engineering: 1.3,
  Product: 1.25,
  Sales: 1.0,
  "Customer Success": 0.85,
  Marketing: 0.95,
  Operations: 0.9,
  Finance: 1.0,
  People: 0.95,
};
const LEVEL_PAY = [1.0, 1.25, 1.55, 1.95, 2.45];
const TITLES: Record<string, string[]> = {
  Engineering: ["Software Engineer I", "Software Engineer II", "Senior Software Engineer", "Staff Engineer", "Principal Engineer"],
  Product: ["Associate Product Manager", "Product Manager", "Senior Product Manager", "Group Product Manager", "Director of Product"],
  Sales: ["Sales Development Rep", "Account Executive", "Senior Account Executive", "Sales Manager", "Director of Sales"],
  "Customer Success": ["Support Specialist", "Customer Success Manager", "Senior CSM", "CS Manager", "Director of CS"],
  Marketing: ["Marketing Coordinator", "Marketing Manager", "Senior Marketing Manager", "Marketing Lead", "Director of Marketing"],
  Operations: ["Operations Associate", "Operations Analyst", "Senior Operations Analyst", "Operations Manager", "Director of Operations"],
  Finance: ["Finance Associate", "Accountant", "Senior Accountant", "Finance Manager", "Controller"],
  People: ["People Coordinator", "People Partner", "Senior People Partner", "People Manager", "Director of People"],
};
const FIRST = ["Avery", "Jordan", "Maya", "Noah", "Priya", "Liam", "Sofia", "Marcus", "Elena", "Dev", "Hannah", "Omar", "Chloe", "Kenji", "Isabel", "Tariq", "Nora", "Mateo", "Zoe", "Ibrahim", "Grace", "Luca", "Amara", "Felix", "Rina", "Callum", "Leila", "Andre", "Maren", "Santiago", "Talia", "Wes", "Imani", "Hugo", "Yara", "Dmitri", "Esme", "Rohan", "Beth", "Julian"];
const LAST = ["Ng", "Patel", "Okafor", "Silva", "Brandt", "Kim", "Moreau", "Haddad", "Fischer", "Lopez", "Nakamura", "Reyes", "Andersson", "Cohen", "Mbeki", "Rossi", "Walker", "Ito", "Duarte", "Novak", "Hale", "Quinn", "Sato", "Baptiste", "Lindgren", "Varga", "Osei", "Park", "Dubois", "Turner"];

export const BENCHMARK_SOURCE = "Synthetic demo survey (not real data)";
export const BENCHMARK_SIZE_BAND = "201-500 employees";

export const benchmarkMid = (dept: string, level: string): number =>
  Math.round((70_000 * (DEPT_PAY[dept] ?? 1) * LEVEL_PAY[Number(level.slice(1)) - 1]) / 500) * 500;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cached: MockDb | null = null;
export function getMockDb(): MockDb {
  if (!cached) cached = build();
  return cached;
}

interface Bundle {
  employeeId: string | null;
  job: AshbyJob;
  apps: AshbyApplication[];
  offers: AshbyOffer[];
}

function build(): MockDb {
  const rng = mulberry32(20261012);
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const chance = (p: number) => rng() < p;
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
  const weighted = <T,>(items: readonly (readonly [T, number])[]): T => {
    let r = rng() * items.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of items) {
      r -= w;
      if (r <= 0) return v;
    }
    return items[items.length - 1][0];
  };
  const clampDate = (d: ISODate, max: ISODate = AS_OF) => (d > max ? max : d);

  let empSeq = 1000;
  let candSeq = 5000;
  let appSeq = 20000;
  let offerSeq = 900;
  let jobSeq = 100;
  const reqSeq: Record<string, number> = {};
  const usedEmails = new Set<string>();

  const makeName = () => {
    const first = pick(FIRST);
    const last = pick(LAST);
    let email = `${first}.${last}`.toLowerCase();
    let n = 1;
    while (usedEmails.has(email)) email = `${first}.${last}${++n}`.toLowerCase();
    usedEmails.add(email);
    return { first, last, email: `${email}@demo-company.test` };
  };

  const employees: RipplingEmployee[] = [];
  const salary = new Map<string, number>();
  const hireMeta = new Map<string, { source: string; acceptedDate: ISODate }>();
  const bundles: Bundle[] = [];

  const newEmployee = (o: {
    start: ISODate;
    type: "EMPLOYEE" | "CONTRACTOR";
    dept: string;
    level: string;
    candidateId: string | null;
    requisitionId: string | null;
    salaryFactor?: number;
  }): RipplingEmployee => {
    const { first, last, email } = makeName();
    const id = `emp_${++empSeq}`;
    const li = Number(o.level.slice(1)) - 1;
    const e: RipplingEmployee = {
      id,
      workEmail: email,
      firstName: first,
      lastName: last,
      department: o.dept,
      title: TITLES[o.dept][li],
      workLocation: weighted(LOCS),
      employmentType: o.type,
      startDate: o.start,
      endDate: null,
      terminationReason: null,
      customFields: { ashby_candidate_id: o.candidateId, requisition_id: o.requisitionId, level: o.level, regrettable_loss: null },
    };
    if (o.type === "EMPLOYEE") {
      const f = o.salaryFactor ?? 0.86 + rng() * 0.28;
      salary.set(id, Math.round((benchmarkMid(o.dept, o.level) * f) / 100) * 100);
    }
    employees.push(e);
    return e;
  };

  // ---------- 1. People who were already here before the ATS go-live ----------
  for (let i = 0; i < 190; i++) {
    const t = Math.sqrt(rng());
    const startMs = Date.UTC(2017, 0, 1) + t * (Date.UTC(2024, 8, 30) - Date.UTC(2017, 0, 1));
    const start = new Date(startMs).toISOString().slice(0, 10);
    newEmployee({ start: isWeekend(start) ? addDays(start, 2) : start, type: "EMPLOYEE", dept: weighted(DEPTS), level: weighted(LEVELS), candidateId: null, requisitionId: null });
  }
  for (let i = 0; i < 22; i++) {
    const start = new Date(Date.UTC(2023, 5, 1) + rng() * (Date.UTC(2026, 7, 1) - Date.UTC(2023, 5, 1))).toISOString().slice(0, 10);
    const e = newEmployee({ start, type: "CONTRACTOR", dept: weighted(DEPTS), level: pick(["L2", "L3", "L4"]), candidateId: null, requisitionId: null });
    if (i < 8) {
      e.endDate = clampDate(addDays(start, int(120, 480)));
      e.terminationReason = "END_OF_CONTRACT";
    }
  }

  // ---------- 2. Hires, with the requisition, applicants and offers behind each ----------
  const recentEngSalary = (dept: string, level: string, start: ISODate) =>
    dept === "Engineering" && (level === "L4" || level === "L5") && start >= "2026-04-01" ? 0.88 + rng() * 0.1 : undefined;

  const makeApplicants = (job: AshbyJob, count: number, closeBy: ISODate, hired: { cand: string; source: string; extended: ISODate; accepted: ISODate } | null, declined: { cand: string; source: string; extended: ISODate } | null): AshbyApplication[] => {
    const apps: AshbyApplication[] = [];
    const spanDays = Math.max(6, diffDays(job.openedAt, closeBy) - 8);
    const stageHistory = (created: ISODate, reached: number, lastCap: ISODate) => {
      const hist = [{ stage: STAGES[0] as string, enteredAt: created }];
      let cur = created;
      for (let k = 1; k <= reached; k++) {
        const next = addDays(cur, int(2, 8));
        // never run past the cap, and never move backwards in time
        cur = next > lastCap ? (cur > lastCap ? cur : lastCap) : next;
        hist.push({ stage: STAGES[k], enteredAt: cur });
      }
      return hist;
    };
    const cap = addDays(closeBy, -1) > AS_OF ? AS_OF : addDays(closeBy, -1);
    for (let i = 0; i < count; i++) {
      const source = weighted(SOURCES);
      let reached = 0;
      const bases = [0.35, 0.55, 0.5];
      for (let k = 0; k < 3; k++) {
        if (rng() < Math.min(0.9, bases[k] * SOURCE_MULT[source])) reached++;
        else break;
      }
      const created = clampDate(addDays(job.openedAt, 1 + int(0, spanDays)), cap);
      apps.push({
        id: `app_${++appSeq}`,
        candidateId: `cand_${++candSeq}`,
        jobId: job.id,
        source,
        status: "Rejected",
        createdAt: created,
        currentStage: STAGES[reached],
        stageHistory: stageHistory(created, reached, cap),
      });
    }
    if (declined) {
      const latest = addDays(declined.extended, -8);
      const created = latest > job.openedAt ? addDays(job.openedAt, int(0, diffDays(job.openedAt, latest))) : job.openedAt;
      const hist = stageHistory(created, 3, addDays(declined.extended, -1));
      hist.push({ stage: "Offer", enteredAt: declined.extended });
      apps.push({ id: `app_${++appSeq}`, candidateId: declined.cand, jobId: job.id, source: declined.source, status: "Archived", createdAt: created, currentStage: "Offer", stageHistory: hist });
    }
    if (hired) {
      const created = clampDate(addDays(job.openedAt, 1 + int(0, Math.max(1, spanDays - 6))), cap);
      const hist = stageHistory(created, 3, addDays(hired.extended, -1));
      hist.push({ stage: "Offer", enteredAt: hired.extended }, { stage: "Hired", enteredAt: hired.accepted });
      apps.push({ id: `app_${++appSeq}`, candidateId: hired.cand, jobId: job.id, source: hired.source, status: "Hired", createdAt: created, currentStage: "Hired", stageHistory: hist });
    }
    return apps;
  };

  const hireMonths: string[] = [];
  for (let p = "2024-10"; p <= "2026-11"; p = addMonths(p, 1)) hireMonths.push(p);

  for (const p of hireMonths) {
    const n = int(6, 11);
    for (let i = 0; i < n; i++) {
      let start = addDays(monthStart(p), int(0, 27));
      while (isWeekend(start)) start = addDays(start, 1);
      if (periodOf(start) !== p) continue;
      const accepted = addDays(start, -int(14, 35));
      if (accepted > AS_OF) continue;

      const dept = weighted(DEPTS);
      const level = weighted(LEVELS);
      const source = weighted(SOURCES);
      const acceptedMonth = periodOf(accepted);
      const levelAdj = level === "L4" ? 12 : level === "L5" ? 20 : 0;
      let storyAdj = 0;
      if (dept === "Engineering" && acceptedMonth === "2026-09") storyAdj = 24;
      else if (dept === "Engineering" && acceptedMonth === "2026-08") storyAdj = 8;
      else if (dept === "Product" && acceptedMonth === "2026-09") storyAdj = 12;
      const ttf = Math.max(14, Math.round(TTF_BASE[dept] + (rng() + rng() - 1) * 16 + levelAdj + storyAdj));
      const opened = addDays(accepted, -ttf);

      const year = opened.slice(0, 4);
      reqSeq[year] = (reqSeq[year] ?? 0) + 1;
      const requisitionId = `REQ-${year}-${String(reqSeq[year]).padStart(4, "0")}`;
      const job: AshbyJob = {
        id: `job_${++jobSeq}`,
        title: TITLES[dept][Number(level.slice(1)) - 1],
        department: dept,
        level,
        location: weighted(LOCS),
        requisitionId,
        openedAt: opened,
        closedAt: accepted,
        status: "Closed",
      };

      const extended = addDays(accepted, -int(1, 5));
      const candId = `cand_${++candSeq}`;
      const declineChance = dept === "Engineering" && acceptedMonth === "2026-09" ? 0.4 : 0.15;
      let declined: { cand: string; source: string; extended: ISODate } | null = null;
      const offers: AshbyOffer[] = [];
      const jobStartProposed = start;
      if (chance(declineChance)) {
        const dExt = addDays(accepted, -int(12, 30));
        if (dExt > opened) {
          declined = { cand: `cand_${++candSeq}`, source: weighted(SOURCES), extended: dExt };
        }
      }
      const apps = makeApplicants(job, int(24, 56), accepted, { cand: candId, source, extended, accepted }, declined);
      const hiredApp = apps.find((a) => a.candidateId === candId)!;
      if (declined) {
        const dApp = apps.find((a) => a.candidateId === declined!.cand)!;
        offers.push({
          id: `offer_${++offerSeq}`,
          applicationId: dApp.id,
          candidateId: declined.cand,
          jobId: job.id,
          status: "Declined",
          extendedAt: declined.extended,
          decidedAt: clampDate(addDays(declined.extended, int(2, 6)), addDays(accepted, -1)),
          proposedStartDate: addDays(jobStartProposed, int(-7, 14)),
        });
      }
      offers.push({
        id: `offer_${++offerSeq}`,
        applicationId: hiredApp.id,
        candidateId: candId,
        jobId: job.id,
        status: "Accepted",
        extendedAt: extended,
        decidedAt: accepted,
        proposedStartDate: start,
      });

      let employeeId: string | null = null;
      if (start <= AS_OF) {
        const e = newEmployee({ start, type: "EMPLOYEE", dept, level, candidateId: candId, requisitionId, salaryFactor: recentEngSalary(dept, level, start) });
        employeeId = e.id;
        hireMeta.set(e.id, { source, acceptedDate: accepted });
      }
      bundles.push({ employeeId, job, apps, offers });
    }
  }

  // Open requisitions with live pipelines and a few pending offers
  const openJobs: AshbyJob[] = [];
  const openApps: AshbyApplication[] = [];
  const openOffers: AshbyOffer[] = [];
  for (let i = 0; i < 14; i++) {
    const dept = weighted(DEPTS);
    const level = weighted(LEVELS);
    const opened = addDays("2026-07-20", int(0, 66));
    const year = opened.slice(0, 4);
    reqSeq[year] = (reqSeq[year] ?? 0) + 1;
    const job: AshbyJob = {
      id: `job_${++jobSeq}`,
      title: TITLES[dept][Number(level.slice(1)) - 1],
      department: dept,
      level,
      location: weighted(LOCS),
      requisitionId: `REQ-${year}-${String(reqSeq[year]).padStart(4, "0")}`,
      openedAt: opened,
      closedAt: null,
      status: "Open",
    };
    openJobs.push(job);
    const count = int(10, 32);
    for (let k = 0; k < count; k++) {
      const source = weighted(SOURCES);
      let reached = 0;
      const bases = [0.35, 0.55, 0.5, 0.3];
      for (let s = 0; s < 4; s++) {
        if (rng() < Math.min(0.9, bases[s] * SOURCE_MULT[source])) reached++;
        else break;
      }
      const created = clampDate(addDays(opened, int(1, Math.max(2, diffDays(opened, AS_OF) - 1))));
      const hist = [{ stage: "Applied", enteredAt: created }];
      let cur = created;
      for (let s = 1; s <= reached; s++) {
        cur = clampDate(addDays(cur, int(2, 6)));
        hist.push({ stage: STAGES[s], enteredAt: cur });
      }
      const app: AshbyApplication = {
        id: `app_${++appSeq}`,
        candidateId: `cand_${++candSeq}`,
        jobId: job.id,
        source,
        status: "Active",
        createdAt: created,
        currentStage: STAGES[reached],
        stageHistory: hist,
      };
      openApps.push(app);
      if (reached === 4 && i % 3 === 0) {
        openOffers.push({
          id: `offer_${++offerSeq}`,
          applicationId: app.id,
          candidateId: app.candidateId,
          jobId: job.id,
          status: "Pending",
          extendedAt: cur,
          decidedAt: null,
          proposedStartDate: addDays(AS_OF, int(20, 45)),
        });
      }
    }
  }

  // ---------- 3. Exits ----------
  const realEmployees = () => employees.filter((e) => e.employmentType === "EMPLOYEE");
  for (let p = "2024-10"; p <= AS_OF_PERIOD; p = addMonths(p, 1)) {
    const mEnd = monthEnd(p);
    const active = realEmployees().filter((e) => e.startDate <= addDays(mEnd, -7) && e.endDate === null && e.startDate <= AS_OF);
    const expected = active.length * 0.0125;
    const exits = Math.floor(expected) + (rng() < expected - Math.floor(expected) ? 1 : 0);
    for (let i = 0; i < exits; i++) {
      const pool = realEmployees().filter((e) => e.endDate === null && e.startDate <= addDays(mEnd, -7) && e.startDate <= AS_OF);
      const weights = pool.map((e) => {
        const tenure = diffDays(e.startDate, mEnd);
        return tenure <= 120 && e.startDate >= ATS_GO_LIVE ? 3 : tenure <= 365 ? 1.6 : 1;
      });
      let r = rng() * weights.reduce((a, b) => a + b, 0);
      let chosen = pool[pool.length - 1];
      for (let k = 0; k < pool.length; k++) {
        r -= weights[k];
        if (r <= 0) {
          chosen = pool[k];
          break;
        }
      }
      const earliest = chosen.startDate > monthStart(p) ? addDays(chosen.startDate, 7) : monthStart(p);
      if (earliest > mEnd) continue;
      const span = diffDays(earliest, mEnd);
      let exitDate = addDays(earliest, int(0, span));
      while (isWeekend(exitDate)) exitDate = addDays(exitDate, -1);
      if (exitDate < earliest) exitDate = earliest;
      if (exitDate > AS_OF) continue;
      const voluntary = chance(0.68);
      chosen.endDate = exitDate;
      chosen.terminationReason = voluntary
        ? weighted([["RESIGNATION", 0.88], ["RETIREMENT", 0.12]] as const)
        : weighted([["PERFORMANCE", 0.45], ["LAYOFF", 0.35], ["CONDUCT", 0.2]] as const);
      chosen.customFields.regrettable_loss = chance(voluntary ? 0.55 : 0.05);
    }
  }

  // ---------- 4. Deliberate data quality problems, so the audit has something real to find ----------
  const postGoLive = employees.filter((e) => e.employmentType === "EMPLOYEE" && e.startDate >= ATS_GO_LIVE && e.startDate <= AS_OF);
  const takeFrom = <T,>(arr: T[], n: number): T[] => {
    const copy = [...arr];
    const out: T[] = [];
    while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
    return out;
  };
  const used = new Set<string>();
  const claim = (arr: RipplingEmployee[], n: number) => {
    const picked = takeFrom(arr.filter((e) => !used.has(e.id)), n);
    picked.forEach((e) => used.add(e.id));
    return picked;
  };
  // 3 hires missing a requisition id
  claim(postGoLive, 3).forEach((e) => (e.customFields.requisition_id = null));
  // 5 hires that bypassed the ATS entirely: no candidate id, no ATS records
  const bypass = claim(postGoLive, 5);
  bypass.forEach((e) => {
    e.customFields.ashby_candidate_id = null;
    e.customFields.requisition_id = null;
    const idx = bundles.findIndex((b) => b.employeeId === e.id);
    if (idx >= 0) bundles.splice(idx, 1);
  });
  // 2 hired in Ashby, start date passed, never created in Rippling
  const dropped = claim(postGoLive.filter((e) => e.startDate >= "2026-06-01" && e.startDate <= "2026-08-31"), 2);
  const droppedIds = new Set(dropped.map((e) => e.id));
  // 3 start dates that drifted between Ashby and Rippling
  claim(postGoLive.filter((e) => e.startDate <= "2026-09-15" && e.startDate >= "2025-01-01" && (!e.endDate || e.endDate > addDays(e.startDate, 14))), 3).forEach((e) => {
    e.startDate = addDays(e.startDate, int(5, 9));
  });
  // 2 active people with no department
  claim(employees.filter((e) => e.employmentType === "EMPLOYEE" && e.endDate === null), 2).forEach((e) => (e.department = null));
  // exits in the last 12 months with missing reason, and voluntary exits with no manager input
  const recentExits = employees.filter((e) => e.endDate && e.endDate >= "2025-10-01" && e.employmentType === "EMPLOYEE");
  takeFrom(recentExits, 3).forEach((e) => (e.terminationReason = null));
  takeFrom(recentExits.filter((e) => e.terminationReason === "RESIGNATION"), 4).forEach((e) => (e.customFields.regrettable_loss = null));

  const finalEmployees = employees.filter((e) => !droppedIds.has(e.id));

  // ---------- 5. Compensation and benchmarks ----------
  const compensations: RipplingCompensation[] = finalEmployees
    .filter((e) => e.employmentType === "EMPLOYEE")
    .map((e) => ({ employeeId: e.id, annualBaseSalary: salary.get(e.id)!, currency: "USD" as const, effectiveDate: e.startDate }));

  const benchmarks: OpsBenchmark[] = [];
  for (const [dept] of DEPTS) {
    for (const [level] of LEVELS) {
      const mid = benchmarkMid(dept, level);
      benchmarks.push({ department: dept, level, min: Math.round(mid * 0.8), mid, max: Math.round(mid * 1.2), source: BENCHMARK_SOURCE, sizeBand: BENCHMARK_SIZE_BAND });
    }
  }

  // ---------- 6. Onboarding tasks, check-ins, reviews, training ----------
  const tasks: RipplingOnboardingTask[] = [];
  const checkIns: OpsCheckIn[] = [];
  const reviews: OpsReview[] = [];
  const training: OpsTraining[] = [];
  const hires = finalEmployees.filter((e) => e.employmentType === "EMPLOYEE" && e.startDate >= ATS_GO_LIVE);
  const noTaskRecords = new Set(takeFrom(hires.filter((e) => e.startDate >= "2026-01-01"), 2).map((e) => e.id));
  let taskSeq = 0;
  for (const e of hires) {
    if (noTaskRecords.has(e.id)) continue;
    const remote = e.workLocation === "Remote US" || e.workLocation === "London";
    const lateWindow = e.startDate >= "2026-08-01";
    for (const type of ["ACCOUNTS", "EQUIPMENT", "PAPERWORK"] as const) {
      const lateP = type === "EQUIPMENT" ? (remote && lateWindow ? 0.38 : 0.1) : type === "ACCOUNTS" ? 0.05 : 0.07;
      const completed = chance(lateP) ? addDays(e.startDate, int(1, 4)) : addDays(e.startDate, -int(0, 4));
      tasks.push({ id: `task_${++taskSeq}`, employeeId: e.id, type, dueDate: e.startDate, completedDate: completed > AS_OF ? null : completed });
    }
    const i9Due = addBusinessDays(e.startDate, 3);
    const i9Late = chance(lateWindow ? 0.1 : 0.05);
    const i9Done = i9Late ? addBusinessDays(e.startDate, int(4, 7)) : addBusinessDays(e.startDate, int(0, 3));
    tasks.push({ id: `task_${++taskSeq}`, employeeId: e.id, type: "I9", dueDate: i9Due, completedDate: i9Done > AS_OF ? null : i9Done });

    for (const m of [30, 90, 180] as const) {
      const due = addDays(e.startDate, m);
      if (e.endDate && e.endDate < due) continue;
      if (due > addDays(AS_OF, 30)) continue;
      const done = due <= AS_OF && chance(0.92);
      const completed = done ? clampDate(addDays(due, int(-3, 10))) : null;
      checkIns.push({
        employeeId: e.id,
        milestone: m,
        dueDate: due,
        completedDate: completed,
        score: completed ? Math.round((3.1 + rng() * 1.8) * 10) / 10 : null,
      });
    }

    const sixMonth = addDays(e.startDate, 183);
    if (sixMonth <= AS_OF && (!e.endDate || e.endDate >= sixMonth)) {
      const meta = hireMeta.get(e.id);
      const srcBoost: Record<string, number> = { Referral: 0.06, Agency: -0.06, Sourced: 0, LinkedIn: -0.02, Inbound: -0.04 };
      const goodP = 0.86 + (srcBoost[meta?.source ?? "Sourced"] ?? 0) + (e.department === "Engineering" ? -0.03 : 0);
      const submitted = chance(0.94);
      const rating = chance(goodP) ? weighted([[3, 0.6], [4, 0.3], [5, 0.1]] as const) : weighted([[1, 0.3], [2, 0.7]] as const);
      const subDate = clampDate(addDays(sixMonth, int(0, 12)));
      reviews.push({ employeeId: e.id, cycle: "new-hire-6m", type: "new_hire_6m", dueDate: sixMonth, submittedDate: submitted ? subDate : null, rating: submitted ? rating : null });
    }
  }

  const cycles: { cycle: string; due: ISODate; submitP: number }[] = [
    { cycle: "2025-H1", due: "2025-07-31", submitP: 0.97 },
    { cycle: "2025-H2", due: "2026-01-31", submitP: 0.96 },
    { cycle: "2026-H1", due: "2026-07-31", submitP: 0.91 },
  ];
  for (const c of cycles) {
    for (const e of finalEmployees) {
      if (e.employmentType !== "EMPLOYEE") continue;
      if (e.startDate > addDays(c.due, -90)) continue;
      if (e.endDate && e.endDate < c.due) continue;
      const ok = chance(c.submitP);
      reviews.push({
        employeeId: e.id,
        cycle: c.cycle,
        type: "cycle",
        dueDate: c.due,
        submittedDate: ok ? clampDate(addDays(c.due, int(-14, 12))) : null,
        rating: ok ? weighted([[1, 0.03], [2, 0.12], [3, 0.52], [4, 0.25], [5, 0.08]] as const) : null,
      });
    }
  }

  const courseRounds: { course: string; due: ISODate }[] = [
    { course: "Security Awareness", due: "2025-06-30" },
    { course: "Harassment Prevention", due: "2025-06-30" },
    { course: "Security Awareness", due: "2026-06-30" },
    { course: "Harassment Prevention", due: "2026-06-30" },
  ];
  for (const r of courseRounds) {
    for (const e of finalEmployees) {
      if (e.employmentType !== "EMPLOYEE" || e.startDate > r.due || (e.endDate && e.endDate < r.due)) continue;
      const ok = chance(0.95);
      training.push({ employeeId: e.id, course: r.course, dueDate: r.due, completedDate: ok ? clampDate(addDays(r.due, int(-25, 6))) : null });
    }
  }
  for (const e of finalEmployees.filter((x) => x.employmentType === "EMPLOYEE" && x.startDate > "2026-06-01")) {
    for (const course of ["Security Awareness", "Harassment Prevention"]) {
      const due = addDays(e.startDate, 30);
      const ok = due <= AS_OF ? chance(0.88) : chance(0.3);
      const done = clampDate(addDays(e.startDate, int(2, 40)));
      training.push({ employeeId: e.id, course, dueDate: due, completedDate: ok && done <= AS_OF ? done : null });
    }
  }

  // ---------- 7. Case log, pulse surveys ----------
  const erCases: OpsErCase[] = [];
  for (let i = 0; i < 42; i++) {
    const opened = addDays("2024-10-15", int(0, 700));
    const open = i >= 38;
    const duration = i === 3 || i === 20 ? int(70, 95) : int(8, 52);
    erCases.push({
      id: `er_${100 + i}`,
      openedDate: open ? addDays("2026-09-30", -int(5, 40)) : opened,
      closedDate: open ? null : clampDate(addDays(opened, duration)),
      category: pick(["Conduct", "Accommodation", "Compensation", "Policy", "Other"]),
    });
  }

  const hcAt = (date: ISODate) =>
    finalEmployees.filter((e) => e.employmentType === "EMPLOYEE" && e.startDate <= date && (!e.endDate || e.endDate > date));
  const surveys = [
    ["2024-12-15", 14],
    ["2025-03-15", 17],
    ["2025-06-15", 21],
    ["2025-09-15", 24],
    ["2025-12-15", 27],
    ["2026-03-15", 26],
    ["2026-06-15", 24],
    ["2026-09-15", 19],
  ] as const;
  const pulse: OpsPulseSurvey[] = surveys.map(([close, target], idx) => {
    const active = hcAt(close);
    const invited = active.length;
    const n = Math.round(invited * (0.66 + rng() * 0.18));
    const responses: { department: string; score: number }[] = [];
    for (let i = 0; i < n; i++) {
      const dept = pick(active).department ?? "Operations";
      const engDrop = dept === "Engineering" && idx >= 6 ? 0.1 : 0;
      const pd = 0.2 + engDrop;
      const pp = 0.2 + target / 100 - engDrop;
      const r = rng();
      const score = r < pp ? pick([9, 10]) : r < pp + pd ? int(0, 6) : pick([7, 8]);
      responses.push({ department: dept, score });
    }
    return { id: `pulse_${close.slice(0, 7)}`, closeDate: close, invited, responses };
  });

  // ---------- 8. Finance: recruiting costs, payroll, plan ----------
  const recruitingCosts: OpsRecruitingCost[] = [];
  for (let p = "2024-10"; p <= AS_OF_PERIOD; p = addMonths(p, 1)) {
    recruitingCosts.push({ month: p, category: "tools", amount: 9500 });
    recruitingCosts.push({ month: p, category: "recruiter_time", amount: 13500 });
    let agency = 0;
    let referral = 0;
    for (const e of finalEmployees) {
      if (e.employmentType !== "EMPLOYEE" || e.startDate < ATS_GO_LIVE) continue;
      const meta = hireMeta.get(e.id);
      if (!meta) continue;
      if (meta.source === "Agency" && periodOf(e.startDate) === p) agency += Math.round((salary.get(e.id)! * 0.2) / 100) * 100;
      if (meta.source === "Referral" && addMonths(periodOf(e.startDate), 3) === p) referral += 2500;
    }
    recruitingCosts.push({ month: p, category: "agency_fees", amount: agency });
    recruitingCosts.push({ month: p, category: "referral_bonuses", amount: referral });
  }

  const payroll: OpsPayrollMonth[] = [];
  const plan: OpsPlan[] = [];
  for (let p = "2024-10"; p <= AS_OF_PERIOD; p = addMonths(p, 1)) {
    const s = monthStart(p);
    const e = monthEnd(p);
    const days = diffDays(s, e) + 1;
    let sal = 0;
    for (const emp of finalEmployees) {
      if (emp.employmentType !== "EMPLOYEE") continue;
      const from = emp.startDate > s ? emp.startDate : s;
      const to = emp.endDate && emp.endDate < e ? emp.endDate : e;
      if (to < from) continue;
      sal += (salary.get(emp.id)! / 12) * ((diffDays(from, to) + 1) / days);
    }
    payroll.push({ month: p, salary: Math.round(sal), benefits: Math.round(sal * 0.14), taxes: Math.round(sal * 0.08) });
    // The plan was on track until early 2026, then hiring fell a little behind it.
    const offset = p >= "2026-02" ? monthsBetween("2026-01", p) : int(-2, 2);
    plan.push({ month: p, plannedHeadcount: hcAt(e).length + offset });
  }

  // ---------- 9. Assemble ----------
  const jobs = [...bundles.map((b) => b.job), ...openJobs];
  const applications = [...bundles.flatMap((b) => b.apps), ...openApps];
  const offers = [...bundles.flatMap((b) => b.offers), ...openOffers];

  return {
    rippling: {
      departments: DEPTS.map(([name], i) => ({ id: `dept_${i + 1}`, name })),
      employees: finalEmployees,
      compensations,
      onboardingTasks: tasks,
    },
    ashby: { jobs, applications, offers },
    ops: {
      checkIns,
      pulse,
      reviews,
      training,
      erCases,
      recruitingCosts,
      payroll,
      plan,
      benchmarks,
    },
  };
}
