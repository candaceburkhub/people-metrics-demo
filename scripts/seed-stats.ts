import { getMockDb, AS_OF } from "../lib/mock/seed";
const t0 = Date.now();
const db = getMockDb();
const ms = Date.now() - t0;
const emp = db.rippling.employees;
const active = emp.filter((e) => e.employmentType === "EMPLOYEE" && !e.endDate);
console.log({ ms, asOf: AS_OF,
  employees: emp.length, activeEmployees: active.length,
  contractors: emp.filter((e) => e.employmentType === "CONTRACTOR").length,
  terminated: emp.filter((e) => e.endDate).length,
  jobs: db.ashby.jobs.length, applications: db.ashby.applications.length, offers: db.ashby.offers.length,
  tasks: db.rippling.onboardingTasks.length, checkIns: db.ops.checkIns.length, reviews: db.ops.reviews.length, training: db.ops.training.length });
console.log("plan tail", db.ops.plan.slice(-3));
console.log("by month hires", Object.entries(emp.filter(e=>e.startDate>="2025-10-01"&&e.employmentType==="EMPLOYEE").reduce((a:any,e)=>{const k=e.startDate.slice(0,7);a[k]=(a[k]||0)+1;return a},{})).join(" | "));
