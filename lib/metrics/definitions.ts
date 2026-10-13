// THE source of truth for what every metric means.
//
// Most reporting arguments come from two people counting differently, so each
// metric is defined exactly once, here: numerator, denominator, source system,
// owner, who may see it, and the target it is judged against. The HR view, the
// leadership view, the MCP tools and the data quality audit all read this file.
// Changing a definition means changing it here and bumping DEFINITIONS_VERSION.

export type Audience = "hr" | "leadership";
export type WindowKind = "month" | "quarter" | "t12m" | "asof";
export type Unit = "count" | "pct" | "days" | "usd" | "ratio" | "score" | "nps";
export type Dim = "department" | "location" | "level" | "worker_type" | "source" | "milestone";

export type MetricId =
  | "headcount"
  | "turnover"
  | "early_attrition"
  | "regrettable_loss"
  | "time_to_fill"
  | "offer_acceptance"
  | "pipeline_conversion"
  | "cost_per_hire"
  | "quality_of_hire"
  | "day_one_readiness"
  | "checkin_completion"
  | "enps"
  | "review_completion"
  | "compa_ratio"
  | "people_cost"
  | "compliance";

export interface Target {
  value: number;
  direction: "min" | "max";
  /** Beyond this value the metric is off track. Between value and warn it is on watch. */
  warn: number;
  note: string;
}

export interface MetricDefinition {
  id: MetricId;
  name: string;
  /** Short form used in sentences, for example in drafted commentary. */
  short?: string;
  group: "Headcount" | "Retention" | "Hiring" | "Onboarding" | "Engagement" | "Performance" | "Pay" | "Cost" | "Compliance";
  summary: string;
  formula: string;
  numerator: string;
  denominator: string;
  sources: string[];
  owner: string;
  /** Who can see this metric at all. */
  audiences: Audience[];
  /** Restricted detail (compensation, performance, employee relations) stays in the HR scope. */
  restricted: boolean;
  cadence: "monthly" | "quarterly";
  window: WindowKind;
  windowLabel: string;
  unit: Unit;
  dimensions: Dim[];
  target?: Target;
  /** What People Ops would do first if the metric goes off track. Used in drafted commentary. */
  ifOffTrack?: string;
  notes: string[];
}

export const DEFINITIONS_VERSION = "2026-10-12.1";
export const DEFINITIONS_OWNER = "People Operations";
/** Groups smaller than this are hidden from the leadership scope. */
export const MIN_GROUP_SIZE = 5;

const OWNER = DEFINITIONS_OWNER;
const BOTH: Audience[] = ["hr", "leadership"];

export const METRICS: MetricDefinition[] = [
  {
    id: "headcount",
    name: "Headcount and growth",
    group: "Headcount",
    summary: "Active W-2 employees at period end.",
    formula: "Employees with a start date on or before period end and no end date, or an end date after period end.",
    numerator: "Active employees at period end",
    denominator: "None (a count)",
    sources: ["Rippling"],
    owner: OWNER,
    audiences: BOTH,
    restricted: false,
    cadence: "monthly",
    window: "asof",
    windowLabel: "As of month end",
    unit: "count",
    dimensions: ["department", "location", "level", "worker_type"],
    notes: ["Headline counts W-2 employees. The worker_type split shows contractors alongside, and contractors are excluded from every rate."],
  },
  {
    id: "turnover",
    name: "Turnover rate",
    group: "Retention",
    summary: "Separations over the trailing 12 months as a share of average headcount.",
    formula: "Separations in the window ÷ average daily headcount in the window, annualized. Split voluntary and involuntary.",
    numerator: "Employee separations in the window",
    denominator: "Average headcount over the window",
    sources: ["Rippling termination records with reason codes"],
    owner: OWNER,
    audiences: BOTH,
    restricted: false,
    cadence: "monthly",
    window: "t12m",
    windowLabel: "Trailing 12 months",
    unit: "pct",
    dimensions: ["department", "location", "level"],
    target: { value: 15, direction: "max", warn: 18, note: "Illustrative target. Set from your own history before using it." },
    ifOffTrack: "I'd review exit reasons by department and the first 90 days of the newest cohorts this week.",
    notes: ["At a few hundred people one resignation moves a single month several points, so read the trailing view and the counts."],
  },
  {
    id: "early_attrition",
    name: "Early attrition (90 day)",
    group: "Retention",
    summary: "New hires who leave within 90 days of starting.",
    formula: "Hires in the window who left within 90 days of their start date ÷ hires in the window. Only hires whose 90 days have fully elapsed are counted.",
    numerator: "Hires who left within 90 days",
    denominator: "Hires in the window with a completed 90 day period",
    sources: ["Rippling hire and termination dates"],
    owner: OWNER,
    audiences: BOTH,
    restricted: false,
    cadence: "monthly",
    window: "t12m",
    windowLabel: "Hires in trailing 12 months with 90 days elapsed",
    unit: "pct",
    dimensions: ["department", "location", "level"],
    target: { value: 6, direction: "max", warn: 9, note: "Illustrative target." },
    ifOffTrack: "I'd sit in on the 30 day check-ins for the affected teams and compare what was promised in the offer process against the role.",
    notes: ["Recent hires are excluded until their 90 days are complete, so the newest cohort never makes this look better than it is."],
  },
  {
    id: "regrettable_loss",
    name: "Regrettable loss",
    group: "Retention",
    summary: "Share of departures that managers said they wanted to keep.",
    formula: "Departures flagged regrettable by the manager at exit ÷ departures with manager input.",
    numerator: "Regrettable departures",
    denominator: "Departures with manager input",
    sources: ["Rippling termination records", "Manager input at exit (custom field)"],
    owner: OWNER,
    audiences: BOTH,
    restricted: false,
    cadence: "monthly",
    window: "t12m",
    windowLabel: "Trailing 12 months",
    unit: "pct",
    dimensions: ["department", "location", "level"],
    target: { value: 35, direction: "max", warn: 45, note: "Illustrative target." },
    ifOffTrack: "I'd run stay conversations with the highest-risk teams and check pay position for the roles we are losing.",
    notes: ["Departures with no manager input are left out of the denominator and reported separately, because treating them as 'not regrettable' would flatter the number."],
  },
  {
    id: "time_to_fill",
    name: "Time to fill",
    group: "Hiring",
    summary: "Days from approved requisition to accepted offer.",
    formula: "Average of (accepted offer date minus requisition approval date) for offers accepted in the month.",
    numerator: "Sum of days to fill",
    denominator: "Offers accepted in the month",
    sources: ["Ashby"],
    owner: OWNER,
    audiences: BOTH,
    restricted: false,
    cadence: "monthly",
    window: "month",
    windowLabel: "Offers accepted in the month",
    unit: "days",
    dimensions: ["department", "level", "location", "source"],
    target: { value: 45, direction: "max", warn: 52, note: "Illustrative target." },
    ifOffTrack: "I'd review requisition scoping and the sourcing mix with the hiring managers holding the slowest reqs.",
    notes: ["Measured at offer acceptance, not start date, so notice periods do not inflate it."],
  },
  {
    id: "offer_acceptance",
    name: "Offer acceptance rate",
    group: "Hiring",
    summary: "Offers accepted out of offers decided.",
    formula: "Offers accepted ÷ offers extended in the month that have a decision. Pending offers are reported separately.",
    numerator: "Offers accepted",
    denominator: "Offers extended in the month and decided",
    sources: ["Ashby"],
    owner: OWNER,
    audiences: BOTH,
    restricted: false,
    cadence: "monthly",
    window: "month",
    windowLabel: "Decided offers extended in the month",
    unit: "pct",
    dimensions: ["department", "level", "location", "source"],
    target: { value: 85, direction: "min", warn: 78, note: "Illustrative target." },
    ifOffTrack: "I'd check offer competitiveness for the affected roles and debrief the declined candidates this week.",
    notes: ["A single decline moves a month by several points, so the count sits beside the rate."],
  },
  {
    id: "pipeline_conversion",
    name: "Pipeline conversion",
    group: "Hiring",
    summary: "Share of applicants who reach the offer stage, with stage-to-stage rates by source.",
    formula: "Applications created in the window that reached the Offer stage ÷ applications created in the window. Stage-to-stage rates are in the detail.",
    numerator: "Applications that reached Offer",
    denominator: "Applications created in the window",
    sources: ["Ashby"],
    owner: OWNER,
    audiences: BOTH,
    restricted: false,
    cadence: "monthly",
    window: "quarter",
    windowLabel: "Applications created, rolling 3 months",
    unit: "pct",
    dimensions: ["department", "level", "location", "source"],
    notes: ["Recent applications are still moving through the funnel, so the newest window understates final conversion."],
  },
  {
    id: "cost_per_hire",
    name: "Cost per hire",
    group: "Hiring",
    summary: "Recruiting spend per hire.",
    formula: "Tools + agency fees + referral bonuses + recruiter time in the window ÷ employees who started in the window.",
    numerator: "Recruiting costs in the window",
    denominator: "Hires (start dates) in the window",
    sources: ["Finance", "Rippling start dates"],
    owner: OWNER,
    audiences: BOTH,
    restricted: false,
    cadence: "monthly",
    window: "quarter",
    windowLabel: "Rolling 3 months",
    unit: "usd",
    dimensions: [],
    target: { value: 5000, direction: "max", warn: 6500, note: "Illustrative target." },
    ifOffTrack: "I'd look at agency use and the tool stack before touching referral bonuses.",
    notes: ["Costs are not allocated to departments in the source data, so there is no breakdown."],
  },
  {
    id: "quality_of_hire",
    name: "Quality of hire",
    group: "Hiring",
    summary: "New hires rated meeting expectations or above at 6 months.",
    formula: "New hires whose 6 month review is 3 or higher ÷ new hires with a submitted 6 month review. 12 month retention is reported alongside.",
    numerator: "6 month reviews rated meets expectations or above",
    denominator: "Submitted 6 month reviews",
    sources: ["Performance tool", "Ashby (source)", "Rippling"],
    owner: OWNER,
    audiences: ["hr"],
    restricted: true,
    cadence: "monthly",
    window: "t12m",
    windowLabel: "6 month reviews due in trailing 12 months",
    unit: "pct",
    dimensions: ["department", "level", "location", "source"],
    target: { value: 85, direction: "min", warn: 78, note: "Illustrative target." },
    notes: ["Built from performance ratings, so it stays in the HR scope."],
  },
  {
    id: "day_one_readiness",
    name: "Day-one readiness",
    group: "Onboarding",
    summary: "New hires with accounts, equipment and paperwork complete by their first day.",
    formula: "Hires with accounts, equipment and paperwork all complete on or before the start date ÷ hires starting in the month.",
    numerator: "Hires fully ready on day one",
    denominator: "Hires starting in the month with onboarding task records",
    sources: ["Rippling onboarding workflow tasks"],
    owner: OWNER,
    audiences: BOTH,
    restricted: false,
    cadence: "monthly",
    window: "month",
    windowLabel: "Hires starting in the month",
    unit: "pct",
    dimensions: ["department", "location", "level"],
    target: { value: 95, direction: "min", warn: 88, note: "Illustrative target." },
    ifOffTrack: "I'd trace the late tasks to their owners and fix the ordering of the workflow, starting with equipment for remote hires.",
    notes: ["Hires with no task records are excluded and flagged in the data quality audit."],
  },
  {
    id: "checkin_completion",
    name: "Check-in completion and scores",
    short: "Check-in completion",
    group: "Onboarding",
    summary: "Completed 30, 90 and 180 day check-ins out of those due, with average scores.",
    formula: "Check-ins completed ÷ check-ins due in the window. Average score alongside.",
    numerator: "Completed check-ins",
    denominator: "Check-ins due in the window",
    sources: ["Survey forms"],
    owner: OWNER,
    audiences: BOTH,
    restricted: false,
    cadence: "monthly",
    window: "quarter",
    windowLabel: "Check-ins due, rolling 3 months",
    unit: "pct",
    dimensions: ["department", "location", "level", "milestone"],
    target: { value: 90, direction: "min", warn: 80, note: "Illustrative target." },
    ifOffTrack: "I'd remind managers of overdue check-ins and see which milestone is slipping.",
    notes: [],
  },
  {
    id: "enps",
    name: "eNPS and response rate",
    short: "eNPS",
    group: "Engagement",
    summary: "Percent promoters minus percent detractors from the quarterly pulse survey.",
    formula: "(Promoters minus detractors) ÷ responses × 100. Promoters score 9 or 10, detractors 0 to 6. Response rate is responses ÷ invited.",
    numerator: "Promoters minus detractors",
    denominator: "Survey responses",
    sources: ["Pulse survey"],
    owner: OWNER,
    audiences: BOTH,
    restricted: false,
    cadence: "quarterly",
    window: "quarter",
    windowLabel: "Surveys closed in the quarter",
    unit: "nps",
    dimensions: ["department"],
    target: { value: 20, direction: "min", warn: 10, note: "Illustrative target." },
    ifOffTrack: "I'd read the comment themes for the lowest-scoring team and agree two visible actions with its leader.",
    notes: ["Employees answer one question, how likely they are to recommend working here, on a 0 to 10 scale. A score of 9 or 10 is a promoter, 7 or 8 is passive and left out of the math, and 0 to 6 is a detractor.", "Responses are anonymous. Department groups under five responses are hidden from leadership."],
  },
  {
    id: "review_completion",
    name: "Review completion and rating spread",
    short: "Review completion",
    group: "Performance",
    summary: "Performance reviews submitted out of those due, with the share at each rating.",
    formula: "Reviews submitted ÷ reviews due in the window.",
    numerator: "Reviews submitted",
    denominator: "Reviews due in the window",
    sources: ["Performance tool"],
    owner: OWNER,
    audiences: ["hr"],
    restricted: true,
    cadence: "quarterly",
    window: "quarter",
    windowLabel: "Reviews due, rolling 3 months",
    unit: "pct",
    dimensions: ["department", "location", "level"],
    target: { value: 95, direction: "min", warn: 90, note: "Illustrative target." },
    notes: ["Performance detail stays in the HR scope."],
  },
  {
    id: "compa_ratio",
    name: "Compa-ratio and range position",
    group: "Pay",
    summary: "Average of salary divided by the market midpoint for the role and level.",
    formula: "Mean of (base salary ÷ market midpoint for department and level) across active employees.",
    numerator: "Sum of individual compa-ratios",
    denominator: "Active employees with salary and a benchmark",
    sources: ["Rippling compensation", "Comp benchmark source"],
    owner: OWNER,
    audiences: BOTH,
    restricted: false,
    cadence: "quarterly",
    window: "asof",
    windowLabel: "As of period end",
    unit: "ratio",
    dimensions: ["department", "level", "location"],
    notes: [
      "Benchmarks in this demo come from a synthetic survey in the 201 to 500 employee band. A real report names its survey and size band.",
      "Leadership sees aggregates only. Individual pay never leaves the HR scope.",
    ],
  },
  {
    id: "people_cost",
    name: "People cost per employee",
    group: "Cost",
    summary: "Salary, benefits, taxes and recruiting costs per average employee, annualized.",
    formula: "(Salary + benefits + taxes + recruiting costs in the window) ÷ average headcount, scaled to a year.",
    numerator: "People costs in the window",
    denominator: "Average headcount in the window",
    sources: ["Payroll and finance", "Rippling"],
    owner: OWNER,
    audiences: BOTH,
    restricted: false,
    cadence: "quarterly",
    window: "quarter",
    windowLabel: "Rolling 3 months, annualized",
    unit: "usd",
    dimensions: [],
    notes: ["Costs are not allocated to departments in the source data, so there is no breakdown."],
  },
  {
    id: "compliance",
    name: "I-9, training and ER case time",
    short: "I-9 timeliness",
    group: "Compliance",
    summary: "I-9s completed within 3 business days of start, with training completion and employee relations case time alongside.",
    formula: "Headline: I-9s completed within 3 business days of start ÷ hires in the window. Training completion and ER days to close are in the detail.",
    numerator: "I-9s completed within 3 business days",
    denominator: "Hires starting in the window with an I-9 task",
    sources: ["Rippling", "LMS", "Case log"],
    owner: OWNER,
    audiences: BOTH,
    restricted: false,
    cadence: "quarterly",
    window: "quarter",
    windowLabel: "Hires starting, rolling 3 months",
    unit: "pct",
    dimensions: ["department", "location"],
    target: { value: 98, direction: "min", warn: 95, note: "Illustrative target." },
    ifOffTrack: "I'd audit the I-9 task owner and due-date rules in the onboarding workflow before the next start date.",
    notes: ["ER case time is restricted detail and appears only in the HR scope."],
  },
];

export const METRIC_BY_ID: Record<MetricId, MetricDefinition> = Object.fromEntries(METRICS.map((m) => [m.id, m])) as Record<MetricId, MetricDefinition>;

export const isMetricId = (s: string): s is MetricId => s in METRIC_BY_ID;

/** The headline tiles on the leadership one-pager, in reading order. */
export const LEADERSHIP_HEADLINE: MetricId[] = [
  "headcount",
  "time_to_fill",
  "offer_acceptance",
  "turnover",
  "regrettable_loss",
  "day_one_readiness",
  "enps",
  "compliance",
];

/** Leadership panels from the reference doc, with their cadence. */
/** Still defined and served by the MCP tools, but not shown on either report page. */
export const REPORT_HIDDEN: MetricId[] = ["pipeline_conversion"];

export const LEADERSHIP_PANELS: { name: string; cadence: "Monthly" | "Quarterly"; metrics: MetricId[] }[] = [
  { name: "Headcount", cadence: "Monthly", metrics: ["headcount"] },
  { name: "Hiring", cadence: "Monthly", metrics: ["time_to_fill", "offer_acceptance"] },
  { name: "Retention", cadence: "Monthly", metrics: ["turnover", "early_attrition", "regrettable_loss"] },
  { name: "Onboarding", cadence: "Monthly", metrics: ["day_one_readiness", "checkin_completion"] },
  { name: "Engagement", cadence: "Quarterly", metrics: ["enps"] },
  { name: "Pay", cadence: "Quarterly", metrics: ["compa_ratio"] },
  { name: "Cost and compliance", cadence: "Quarterly", metrics: ["people_cost", "compliance"] },
];
