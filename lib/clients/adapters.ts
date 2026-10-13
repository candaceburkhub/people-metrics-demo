// The only place that knows vendor field names. Going live means checking these
// mappings against the real API docs and changing this file, nothing else.

import type { AshbyApplication, AshbyJob, AshbyOffer, RipplingEmployee, RipplingOnboardingTask } from "../api-types";
import type { Application, ExitReason, ExitType, Job, Offer, OnboardingTask, Person } from "../types";

const EXIT_MAP: Record<string, { reason: ExitReason; type: ExitType | null }> = {
  RESIGNATION: { reason: "resignation", type: "voluntary" },
  RETIREMENT: { reason: "retirement", type: "voluntary" },
  PERFORMANCE: { reason: "performance", type: "involuntary" },
  LAYOFF: { reason: "layoff", type: "involuntary" },
  CONDUCT: { reason: "conduct", type: "involuntary" },
  END_OF_CONTRACT: { reason: "end_of_contract", type: null },
};

export function mapEmployee(e: RipplingEmployee, salaryById: Map<string, number>): Person {
  const exit = e.endDate ? (e.terminationReason ? (EXIT_MAP[e.terminationReason] ?? { reason: "unknown" as const, type: null }) : { reason: "unknown" as const, type: null }) : null;
  return {
    id: e.id,
    department: e.department,
    location: e.workLocation,
    level: e.customFields.level,
    title: e.title,
    workerType: e.employmentType === "EMPLOYEE" ? "employee" : "contractor",
    startDate: e.startDate,
    endDate: e.endDate,
    exitReason: exit ? exit.reason : null,
    exitType: exit ? exit.type : null,
    regrettable: e.customFields.regrettable_loss,
    candidateId: e.customFields.ashby_candidate_id,
    requisitionId: e.customFields.requisition_id,
    salary: salaryById.get(e.id) ?? null,
  };
}

export const mapTask = (t: RipplingOnboardingTask): OnboardingTask => ({
  id: t.id,
  employeeId: t.employeeId,
  type: t.type.toLowerCase() as OnboardingTask["type"],
  dueDate: t.dueDate,
  completedDate: t.completedDate,
});

export const mapJob = (j: AshbyJob): Job => ({
  id: j.id,
  requisitionId: j.requisitionId,
  department: j.department,
  level: j.level,
  location: j.location,
  openedAt: j.openedAt,
  closedAt: j.closedAt,
  status: j.status === "Open" ? "open" : "closed",
});

export const mapApplication = (a: AshbyApplication): Application => ({
  id: a.id,
  candidateId: a.candidateId,
  jobId: a.jobId,
  source: a.source,
  status: a.status.toLowerCase() as Application["status"],
  createdAt: a.createdAt,
  currentStage: a.currentStage,
  stages: Object.fromEntries(a.stageHistory.map((s) => [s.stage, s.enteredAt])),
});

export const mapOffer = (o: AshbyOffer): Offer => ({
  id: o.id,
  applicationId: o.applicationId,
  candidateId: o.candidateId,
  jobId: o.jobId,
  status: o.status.toLowerCase() as Offer["status"],
  extendedAt: o.extendedAt,
  decidedAt: o.decidedAt,
  proposedStartDate: o.proposedStartDate,
});
