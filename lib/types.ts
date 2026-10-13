// The internal model. Everything downstream of the adapters (metrics, views, MCP)
// speaks only these types, so a vendor schema change is a one-file fix.
// Deliberate data minimisation: no names, emails or free text enter the model.

import type { ISODate, Period } from "./dates";
import type {
  OpsBenchmark,
  OpsCheckIn,
  OpsErCase,
  OpsPayrollMonth,
  OpsPlan,
  OpsPulseSurvey,
  OpsRecruitingCost,
  OpsReview,
  OpsTraining,
} from "./api-types";

export type ExitReason = "resignation" | "retirement" | "performance" | "layoff" | "conduct" | "end_of_contract" | "unknown";
export type ExitType = "voluntary" | "involuntary";

export interface Person {
  id: string;
  department: string | null;
  location: string;
  level: string;
  title: string;
  workerType: "employee" | "contractor";
  startDate: ISODate;
  endDate: ISODate | null;
  exitReason: ExitReason | null;
  exitType: ExitType | null;
  regrettable: boolean | null;
  candidateId: string | null;
  requisitionId: string | null;
  salary: number | null;
}

export interface OnboardingTask {
  id: string;
  employeeId: string;
  type: "accounts" | "equipment" | "paperwork" | "i9";
  dueDate: ISODate;
  completedDate: ISODate | null;
}

export interface Job {
  id: string;
  requisitionId: string;
  department: string;
  level: string;
  location: string;
  openedAt: ISODate;
  closedAt: ISODate | null;
  status: "open" | "closed";
}

export interface Application {
  id: string;
  candidateId: string;
  jobId: string;
  source: string;
  status: "active" | "hired" | "rejected" | "archived";
  createdAt: ISODate;
  currentStage: string;
  stages: Record<string, ISODate>;
}

export interface Offer {
  id: string;
  applicationId: string;
  candidateId: string;
  jobId: string;
  status: "pending" | "accepted" | "declined" | "rescinded";
  extendedAt: ISODate;
  decidedAt: ISODate | null;
  proposedStartDate: ISODate;
}

export interface SourceReport {
  source: string;
  calls: number;
  retries: number;
  records: number;
  ms: number;
  ok: boolean;
  warnings: string[];
  errors: string[];
}

export interface SyncReport {
  startedAt: string;
  finishedAt: string;
  mode: "mock" | "live";
  asOf: ISODate;
  sources: SourceReport[];
  warnings: string[];
}

export interface Dataset {
  asOf: ISODate;
  latestPeriod: Period;
  people: Person[];
  tasks: OnboardingTask[];
  jobs: Job[];
  applications: Application[];
  offers: Offer[];
  checkIns: OpsCheckIn[];
  reviews: OpsReview[];
  training: OpsTraining[];
  erCases: OpsErCase[];
  pulse: OpsPulseSurvey[];
  costs: OpsRecruitingCost[];
  payroll: OpsPayrollMonth[];
  plan: OpsPlan[];
  benchmarks: OpsBenchmark[];
  /** True when the compensation scope was missing, so pay metrics cannot be computed. */
  compensationAvailable: boolean;
  sync: SyncReport;
}
