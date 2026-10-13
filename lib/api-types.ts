// Payload shapes returned by the (mock) source systems.
//
// These approximate the documented Rippling platform API and the Ashby API.
// They are NOT copied from the vendors. Before going live, check every field
// name against developer.rippling.com and developers.ashbyhq.com, and change
// only the adapters in lib/clients/adapters.ts. Nothing downstream sees these types.

import type { ISODate } from "./dates";

// ---------- Rippling (HRIS) ----------

export interface RipplingEmployee {
  id: string;
  workEmail: string;
  firstName: string;
  lastName: string;
  department: string | null;
  title: string;
  workLocation: string;
  employmentType: "EMPLOYEE" | "CONTRACTOR";
  startDate: ISODate;
  endDate: ISODate | null;
  terminationReason: string | null;
  customFields: {
    ashby_candidate_id: string | null;
    requisition_id: string | null;
    level: string;
    regrettable_loss: boolean | null;
  };
}

export interface RipplingCompensation {
  employeeId: string;
  annualBaseSalary: number;
  currency: "USD";
  effectiveDate: ISODate;
}

export interface RipplingOnboardingTask {
  id: string;
  employeeId: string;
  type: "ACCOUNTS" | "EQUIPMENT" | "PAPERWORK" | "I9";
  dueDate: ISODate;
  completedDate: ISODate | null;
}

export interface RipplingDepartment {
  id: string;
  name: string;
}

export interface RipplingPage<T> {
  results: T[];
  next_link: string | null;
}

// ---------- Ashby (ATS) ----------

export interface AshbyJob {
  id: string;
  title: string;
  department: string;
  level: string;
  location: string;
  requisitionId: string;
  openedAt: ISODate; // requisition approved
  closedAt: ISODate | null;
  status: "Open" | "Closed";
}

export interface AshbyApplication {
  id: string;
  candidateId: string;
  jobId: string;
  source: string;
  status: "Active" | "Hired" | "Rejected" | "Archived";
  createdAt: ISODate;
  currentStage: string;
  stageHistory: { stage: string; enteredAt: ISODate }[];
}

export interface AshbyOffer {
  id: string;
  applicationId: string;
  candidateId: string;
  jobId: string;
  status: "Pending" | "Accepted" | "Declined" | "Rescinded";
  extendedAt: ISODate;
  decidedAt: ISODate | null;
  proposedStartDate: ISODate;
}

export interface AshbyListResponse<T> {
  success: boolean;
  results: T[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  errors?: string[];
}

// ---------- Other sources (survey, performance, LMS, case log, finance, comp benchmarks) ----------

export interface OpsCheckIn {
  employeeId: string;
  milestone: 30 | 90 | 180;
  dueDate: ISODate;
  completedDate: ISODate | null;
  score: number | null;
}

export interface OpsPulseSurvey {
  id: string;
  closeDate: ISODate;
  invited: number;
  responses: { department: string; score: number }[];
}

export interface OpsReview {
  employeeId: string;
  cycle: string;
  type: "cycle" | "new_hire_6m";
  dueDate: ISODate;
  submittedDate: ISODate | null;
  rating: number | null;
}

export interface OpsTraining {
  employeeId: string;
  course: string;
  dueDate: ISODate;
  completedDate: ISODate | null;
}

export interface OpsErCase {
  id: string;
  openedDate: ISODate;
  closedDate: ISODate | null;
  category: string;
}

export interface OpsRecruitingCost {
  month: string;
  category: "tools" | "agency_fees" | "referral_bonuses" | "recruiter_time";
  amount: number;
}

export interface OpsPayrollMonth {
  month: string;
  salary: number;
  benefits: number;
  taxes: number;
}

export interface OpsPlan {
  month: string;
  plannedHeadcount: number;
}

export interface OpsBenchmark {
  department: string;
  level: string;
  min: number;
  mid: number;
  max: number;
  source: string;
  sizeBand: string;
}
