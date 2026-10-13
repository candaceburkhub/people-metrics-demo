// Small UTC date helpers. All dates in this project are ISO strings (YYYY-MM-DD)
// and all periods are YYYY-MM, so there is no timezone drift between systems.

export type ISODate = string;
export type Period = string; // YYYY-MM

const DAY = 86_400_000;

export const toDate = (s: ISODate): Date => new Date(`${s}T00:00:00Z`);
export const iso = (d: Date): ISODate => d.toISOString().slice(0, 10);

export const addDays = (s: ISODate, n: number): ISODate =>
  iso(new Date(toDate(s).getTime() + n * DAY));

export const diffDays = (from: ISODate, to: ISODate): number =>
  Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY);

export const periodOf = (s: ISODate): Period => s.slice(0, 7);

export const monthStart = (p: Period): ISODate => `${p}-01`;

export const monthEnd = (p: Period): ISODate => {
  const [y, m] = p.split("-").map(Number);
  return iso(new Date(Date.UTC(y, m, 0)));
};

export const addMonths = (p: Period, n: number): Period => {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export const monthsBetween = (a: Period, b: Period): number => {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
};

export const periodRange = (from: Period, to: Period): Period[] => {
  const out: Period[] = [];
  for (let p = from; p <= to; p = addMonths(p, 1)) out.push(p);
  return out;
};

export const isWeekend = (s: ISODate): boolean => {
  const d = toDate(s).getUTCDay();
  return d === 0 || d === 6;
};

export const addBusinessDays = (s: ISODate, n: number): ISODate => {
  let cur = s;
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    if (!isWeekend(cur)) left--;
  }
  return cur;
};

export const businessDaysBetween = (from: ISODate, to: ISODate): number => {
  if (to <= from) return 0;
  let cur = from;
  let n = 0;
  while (cur < to) {
    cur = addDays(cur, 1);
    if (!isWeekend(cur)) n++;
  }
  return n;
};

export const inRange = (s: ISODate, start: ISODate, end: ISODate): boolean => s >= start && s <= end;

export const monthLabel = (p: Period): string => {
  const [y, m] = p.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};
